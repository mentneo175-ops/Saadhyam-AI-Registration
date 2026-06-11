(function () {
  'use strict';

  const form             = document.getElementById('registration-form');
  const formSection      = document.getElementById('form-section');
  const idSection        = document.getElementById('id-section');
  const photoInput       = document.getElementById('photo');
  const photoUploadArea  = document.getElementById('photo-upload-area');
  const photoPreviewArea = document.getElementById('photo-preview-area');
  const photoPreview     = document.getElementById('photo-preview');
  const submitBtn        = document.getElementById('submit-btn');
  const newRegistrationBtn = document.getElementById('new-registration-btn');
  const cardFlip         = document.getElementById('card-flip');
  const cardHint         = document.getElementById('card-hint');
  const cardSideLabel    = document.getElementById('card-side-label');
  const actionOverlay    = document.getElementById('action-overlay');
  const overlayDismiss   = document.getElementById('overlay-dismiss-btn');

  let photoFile           = null;
  let photoLocalDataUrl   = null;
  let currentRegistration = null;
  let qrInstance          = null;
  let flipTimeout         = null;
  const FLIP_DURATION     = 850;

  // ── Toast ───────────────────────────────────────────────────────────────────
  function showToast(message, type = 'error') {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.style.cssText = [
        'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
        'padding:12px 24px', 'border-radius:10px', 'font-size:0.9rem', 'font-weight:500',
        'z-index:9999', 'max-width:90vw', 'text-align:center',
        'box-shadow:0 4px 24px rgba(0,0,0,0.3)', 'transition:opacity 0.3s',
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.style.background = type === 'error' ? '#ef4444' : '#10b981';
    toast.style.color = '#fff';
    toast.style.opacity = '1';
    toast.textContent = message;
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
  }

  // ── Validators ──────────────────────────────────────────────────────────────
  const validators = {
    fullName: (v) => v.trim().length >= 2 || 'Please enter your full name (at least 2 characters).',
    mobile:   (v) => /^[6-9]\d{9}$/.test(v.replace(/\s/g, '')) || 'Enter a valid 10-digit Indian mobile number.',
    email:    (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Enter a valid email address.',
    college:  (v) => v.trim().length >= 2 || 'Please enter your college name.',
    branch:   (v) => v.trim().length >= 2 || 'Please enter your branch.',
    year:     (v) => v !== '' || 'Please select your year of study.',
    gender:   (v) => v !== '' || 'Please select your gender.',
    city:     (v) => v.trim().length >= 2 || 'Please enter your city.',
    state:    (v) => v.trim().length >= 2 || 'Please enter your state.',
    linkedin: (v) => {
      if (!v.trim()) return true;
      try {
        const url = new URL(v);
        return url.hostname.includes('linkedin.com') || 'Enter a valid LinkedIn profile URL.';
      } catch { return 'Enter a valid LinkedIn profile URL.'; }
    },
    photo: () => photoFile !== null || 'Please upload your photo.',
  };

  function showError(field, message) {
    const el    = document.querySelector(`.error-msg[data-for="${field}"]`);
    const input = document.getElementById(field);
    if (el) el.textContent = message === true ? '' : message;
    if (input && input.tagName !== 'DIV') input.classList.toggle('invalid', message !== true);
    return message === true;
  }

  function validateField(name) {
    const input = document.getElementById(name);
    if (!input || !validators[name]) return true;
    const value = input.type === 'file' ? (photoFile ? 'ok' : '') : input.value;
    return showError(name, validators[name](value));
  }

  function validateForm() {
    let valid = true;
    Object.keys(validators).forEach((field) => { if (!validateField(field)) valid = false; });
    return valid;
  }

  // ── QR ──────────────────────────────────────────────────────────────────────
  function generateQrCode(data) {
    const container = document.getElementById('qr-code');
    container.innerHTML = '';
    const back = container.closest('.card-back');
    if (back) back.style.visibility = 'visible';
    qrInstance = new QRCode(container, {
      text: data.regId,
      width: 160, height: 160,
      colorDark: '#1a1030', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.L,
    });
    if (back) back.style.visibility = '';
  }

  // ── Populate card ───────────────────────────────────────────────────────────
  function populateIdCard(data, photoSrc) {
    const idPhoto = document.getElementById('id-photo');
    idPhoto.crossOrigin = 'anonymous';
    idPhoto.src = photoSrc || data.photo;
    if (photoSrc && photoSrc !== data.photo && data.photo) {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { idPhoto.src = data.photo; };
      img.src = data.photo;
    }
    document.getElementById('id-name').textContent       = data.fullName;
    document.getElementById('id-college').textContent    = data.college;
    document.getElementById('id-branch').textContent     = data.branch;
    document.getElementById('id-year').textContent       = data.year;
    document.getElementById('id-gender').textContent     = data.gender;
    document.getElementById('id-location').textContent   = `${data.city}, ${data.state}`;
    document.getElementById('id-linkedin').textContent   = data.linkedin || '—';
    document.getElementById('id-email').textContent      = data.email;
    document.getElementById('id-mobile').textContent     = data.mobile;
    document.getElementById('id-reg-number').textContent = data.regId;
    document.getElementById('qr-reg-id').textContent     = data.regId;
    document.getElementById('qr-name').textContent       = data.fullName;
    document.getElementById('qr-college').textContent    = data.college;
    document.getElementById('qr-branch-year').textContent = `${data.branch} · ${data.year}`;
    document.getElementById('qr-contact').textContent    = `${data.email} · ${data.mobile}`;
    document.getElementById('qr-location').textContent   = `${data.city}, ${data.state}`;
    generateQrCode(data);
  }

  // ── Download — stitches front (ID) + back (QR) side by side ─────────────────
  async function downloadIdCard(name) {
    try {
      const scale      = 2;
      const cardFlipEl = document.getElementById('card-flip');
      const wasFlipped = cardFlipEl.classList.contains('flipped');
      cardFlipEl.classList.remove('flipped', 'flipping');

      // ── Capture front face normally ──────────────────────────────────────────
      const frontEl     = document.querySelector('.card-front .virtual-id-card');
      const frontCanvas = await html2canvas(frontEl, {
        scale, backgroundColor: '#0b0b14', useCORS: true, logging: false,
      });

      // ── Capture back face via a clean clone (no 3D transform context) ────────
      const backEl    = document.querySelector('.card-back .virtual-id-card');
      const backClone = backEl.cloneNode(true);

      const host = document.createElement('div');
      host.style.cssText = [
        'position:fixed', 'top:0', 'left:0',
        `width:${frontEl.offsetWidth}px`,
        'z-index:9999', 'opacity:0.01', 'pointer-events:none',
        'transform:none', 'perspective:none',
      ].join(';');

      backClone.style.cssText = 'transform:none;backface-visibility:visible;position:relative;opacity:1;';
      host.appendChild(backClone);
      document.body.appendChild(host);

      await new Promise((r) => setTimeout(r, 150));

      const backCanvas = await html2canvas(backClone, {
        scale, backgroundColor: '#0b0b14', useCORS: true, logging: false,
      });

      document.body.removeChild(host);
      if (wasFlipped) cardFlipEl.classList.add('flipped');

      // ── Stitch front + back vertically ───────────────────────────────────────
      const gap = 16 * scale;
      const w   = Math.max(frontCanvas.width, backCanvas.width);
      const h   = frontCanvas.height + gap + backCanvas.height;
      const out = document.createElement('canvas');
      out.width  = w;
      out.height = h;
      const ctx  = out.getContext('2d');
      ctx.fillStyle = '#0b0b14';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(frontCanvas, 0, 0);
      ctx.drawImage(backCanvas,  0, frontCanvas.height + gap);

      const link     = document.createElement('a');
      link.download  = `Saadhyam_AI_ID_${(name || 'participant').replace(/\s+/g, '_')}.png`;
      link.href      = out.toDataURL('image/png');
      link.click();

    } catch (err) {
      console.error('[Download]', err);
    }
  }

  // ── Show / hide ─────────────────────────────────────────────────────────────
  function showIdSection() {
    formSection.classList.add('hidden');
    idSection.classList.remove('hidden');
    cardFlip.classList.remove('flipped', 'flipping');
    if (cardHint)      cardHint.classList.remove('is-qr');
    if (cardSideLabel) cardSideLabel.textContent = 'Virtual ID';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    actionOverlay.classList.remove('hidden');
  }

  function updateLinkedInBtn(registration) {
    const btn = document.getElementById('linkedin-share-btn');
    if (!btn) return;

    const eventName = 'Saadhyam AI Event';
    const text = [
      `🎉 I am thrilled to share that I have successfully registered for the ${eventName} powered by Saadhyam AI!`,
      ``,
      `This is a remarkable opportunity to connect with AI enthusiasts, industry leaders, and fellow learners who are passionate about turning possibilities into growth.`,
      ``,
      `📌 Event: ${eventName}`,
      `🏫 College: ${registration.college || ''}`,
      `🔬 Branch: ${registration.branch || ''}`,
      ``,
      `A heartfelt thank you to Saadhyam AI and our certified partner Ment Neo for making this event possible. I look forward to the learning, networking, and growth that lies ahead! 🚀`,
      ``,
      `#SaadhyamAI #AI #ArtificialIntelligence #EventRegistration #MentNeo #TurnPossibilitiesIntoGrowth #Learning #Technology #Innovation`,
    ].join('\n');

    // LinkedIn feed share URL — opens post composer with pre-filled text
    const encoded = encodeURIComponent(text);
    btn.href = `https://www.linkedin.com/feed/?shareActive=true&text=${encoded}`;
  }

  function dismissOverlay() { actionOverlay.classList.add('hidden'); }

  overlayDismiss.addEventListener('click', dismissOverlay);

  function resetForm() {
    form.reset();
    photoFile = null; photoLocalDataUrl = null; currentRegistration = null;
    photoPreview.classList.add('hidden');
    photoPreviewArea.classList.remove('hidden');
    Object.keys(validators).forEach((f) => showError(f, true));
    cardFlip.classList.remove('flipped', 'flipping');
    if (cardHint)      cardHint.classList.remove('is-qr');
    if (cardSideLabel) cardSideLabel.textContent = 'Virtual ID';
    idSection.classList.add('hidden');
    actionOverlay.classList.add('hidden');
    formSection.classList.remove('hidden');
    document.getElementById('qr-code').innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.querySelector('.btn-text').classList.toggle('hidden', loading);
    submitBtn.querySelector('.btn-loader').classList.toggle('hidden', !loading);
  }

  // ── Photo handling ──────────────────────────────────────────────────────────
  function handlePhotoFile(file) {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
      showError('photo', 'Only JPG, PNG, or WebP images are allowed.'); return;
    }
    if (file.size > 5 * 1024 * 1024) { showError('photo', 'Photo must be under 5 MB.'); return; }
    photoFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      photoLocalDataUrl = e.target.result;
      photoPreview.src  = photoLocalDataUrl;
      photoPreview.classList.remove('hidden');
      photoPreviewArea.classList.add('hidden');
      showError('photo', true);
    };
    reader.readAsDataURL(file);
  }

  photoInput.addEventListener('change', (e) => handlePhotoFile(e.target.files[0]));
  photoUploadArea.addEventListener('dragover',  (e) => { e.preventDefault(); photoUploadArea.classList.add('dragover'); });
  photoUploadArea.addEventListener('dragleave', ()  => { photoUploadArea.classList.remove('dragover'); });
  photoUploadArea.addEventListener('drop', (e) => {
    e.preventDefault(); photoUploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) { const dt = new DataTransfer(); dt.items.add(file); photoInput.files = dt.files; handlePhotoFile(file); }
  });

  Object.keys(validators).forEach((field) => {
    const input = document.getElementById(field);
    if (input && input.type !== 'file') {
      input.addEventListener('blur',  () => validateField(field));
      input.addEventListener('input', () => { if (input.classList.contains('invalid')) validateField(field); });
    }
  });

  // ── Form submit ─────────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);

    try {
      // Show card instantly with local photo
      const optimisticData = {
        regId: '…',
        fullName: document.getElementById('fullName').value.trim(),
        mobile:   document.getElementById('mobile').value.replace(/\s/g, ''),
        email:    document.getElementById('email').value.trim(),
        college:  document.getElementById('college').value.trim(),
        branch:   document.getElementById('branch').value.trim(),
        year:     document.getElementById('year').value,
        gender:   document.getElementById('gender').value,
        city:     document.getElementById('city').value.trim(),
        state:    document.getElementById('state').value.trim(),
        linkedin: document.getElementById('linkedin').value.trim(),
        photo:    photoLocalDataUrl,
        registeredAt: new Date().toISOString(),
      };
      populateIdCard(optimisticData, photoLocalDataUrl);
      showIdSection();
      setLoading(false);
      updateLinkedInBtn(optimisticData);

      // Complete registration in background
      const registration = await SaadhyamFirebase.registerParticipant({ ...optimisticData }, photoFile);
      currentRegistration = registration;

      document.getElementById('id-reg-number').textContent = registration.regId;
      document.getElementById('qr-reg-id').textContent     = registration.regId;

      // Update LinkedIn share button with real registration data
      updateLinkedInBtn(registration);

      const cloudImg = new Image(); cloudImg.crossOrigin = 'anonymous';
      cloudImg.onload = () => { document.getElementById('id-photo').src = registration.photo; };
      cloudImg.src = registration.photo;

      generateQrCode(registration);

      // ✅ Auto-download the card (front + back stitched) after QR is ready
      await new Promise((r) => setTimeout(r, 600)); // allow QR to render
      downloadIdCard(registration.fullName);

    } catch (err) {
      setLoading(false);
      if (!idSection.classList.contains('hidden')) {
        idSection.classList.add('hidden');
        formSection.classList.remove('hidden');
      }
      showToast(err.message || 'Registration failed. Please try again.');
    }
  });

  // ── Card flip ───────────────────────────────────────────────────────────────
  function toggleCardFlip() {
    if (cardFlip.classList.contains('flipping')) return;
    cardFlip.classList.add('flipping');
    cardFlip.classList.toggle('flipped');
    const isQr = cardFlip.classList.contains('flipped');
    if (cardHint)      cardHint.classList.toggle('is-qr', isQr);
    if (cardSideLabel) cardSideLabel.textContent = isQr ? 'QR Code' : 'Virtual ID';
    clearTimeout(flipTimeout);
    flipTimeout = setTimeout(() => cardFlip.classList.remove('flipping'), FLIP_DURATION);
  }

  cardFlip.addEventListener('click', toggleCardFlip);
  cardFlip.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCardFlip(); }
  });

  newRegistrationBtn.addEventListener('click', resetForm);
})();
