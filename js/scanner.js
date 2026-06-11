(function () {
  'use strict';

  const modal     = document.getElementById('scanner-modal');
  const toggleBtn = document.getElementById('scanner-toggle');
  const closeBtn  = document.getElementById('scanner-close');
  const backdrop  = document.getElementById('scanner-backdrop');
  const resultEl  = document.getElementById('scan-result');
  const readerId  = 'qr-reader';

  let html5QrCode = null;
  let isScanning  = false;
  let scanLocked  = false;

  function openModal() {
    modal.classList.remove('hidden');
    resultEl.classList.add('hidden');
    resultEl.innerHTML = '';
    scanLocked = false;
    startScanner();
  }

  function closeModal() {
    stopScanner();
    modal.classList.add('hidden');
    resultEl.classList.add('hidden');
    resultEl.innerHTML = '';
    scanLocked = false;
  }

  async function startScanner() {
    if (isScanning) return;

    resultEl.classList.add('hidden');
    resultEl.innerHTML = '';
    scanLocked = false;

    // Destroy and recreate instance to avoid stale state
    if (html5QrCode) {
      try { await html5QrCode.stop(); } catch { /* ignore */ }
      html5QrCode = null;
    }
    html5QrCode = new Html5Qrcode(readerId, { verbose: false });

    const successCb = onScanSuccess;
    const errorCb   = () => {};

    // Try with back camera + high FPS first
    const configs = [
      // 1. Environment (back) camera, high FPS
      {
        camera: { facingMode: 'environment' },
        config: {
          fps: 25,
          qrbox: { width: 250, height: 250 },
          disableFlip: false,
        },
      },
      // 2. Any camera (front or back), medium FPS
      {
        camera: { facingMode: 'user' },
        config: {
          fps: 25,
          qrbox: { width: 250, height: 250 },
          disableFlip: false,
        },
      },
      // 3. No facingMode constraint at all
      {
        camera: true,
        config: {
          fps: 20,
          qrbox: { width: 250, height: 250 },
        },
      },
    ];

    for (const attempt of configs) {
      try {
        isScanning = true;
        await html5QrCode.start(attempt.camera, attempt.config, successCb, errorCb);
        return; // started successfully
      } catch (err) {
        isScanning = false;
        console.warn('[Scanner] Attempt failed:', err.message || err);
        // Recreate instance before next attempt
        try { await html5QrCode.stop(); } catch { /* ignore */ }
        html5QrCode = new Html5Qrcode(readerId, { verbose: false });
      }
    }

    // All attempts failed — show helpful message with instructions
    resultEl.classList.remove('hidden');
    resultEl.innerHTML = `
      <div style="text-align:center;padding:8px 0;">
        <p class="scan-result-error" style="margin-bottom:10px;">
          Camera not available.
        </p>
        <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.6;">
          To allow camera access in Edge:<br>
          Click the 🔒 lock icon in the address bar<br>
          → <strong>Permissions for this site</strong><br>
          → Set <strong>Camera</strong> to <strong>Allow</strong><br>
          then refresh and try again.
        </p>
        <button class="scan-another-btn" id="scan-retry-btn" style="margin-top:12px;">
          Try Again
        </button>
      </div>
    `;
    document.getElementById('scan-retry-btn').addEventListener('click', () => {
      resultEl.classList.add('hidden');
      startScanner();
    });
  }

  async function stopScanner() {
    if (!html5QrCode || !isScanning) return;
    try { await html5QrCode.stop(); } catch { /* already stopped */ }
    isScanning = false;
  }

  function showResult(type, html) {
    resultEl.classList.remove('hidden', 'verified');
    if (type === 'verified') resultEl.classList.add('verified');
    resultEl.innerHTML = html + `
      <button class="scan-another-btn" id="scan-another-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" stroke-linecap="round"/>
          <rect x="7" y="7" width="10" height="10" rx="1"/>
        </svg>
        Scan Another
      </button>
    `;
    document.getElementById('scan-another-btn').addEventListener('click', startScanner);
  }

  async function onScanSuccess(decodedText) {
    if (scanLocked) return;
    scanLocked = true;

    await stopScanner();

    const regId = (decodedText || '').trim();
    if (!regId) {
      showResult('error', `<p class="scan-result-error">Invalid QR code.</p>`);
      return;
    }

    resultEl.classList.remove('hidden', 'verified');
    resultEl.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;">Verifying…</p>`;

    try {
      let found = false;

      if (window.SaadhyamFirebase) {
        const r = await SaadhyamFirebase.getRegistration(regId);
        if (r) found = true;
      }

      if (!found) {
        const res = await fetch(`/api/registration/${encodeURIComponent(regId)}`);
        if (res.ok) found = true;
      }

      if (found) {
        showResult('verified', `
          <div class="scan-verified-popup">
            <div class="scan-verified-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="48" height="48">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <p class="scan-verified-title">Registration Verified</p>
            <p class="scan-verified-id">${regId}</p>
          </div>
        `);
      } else {
        showResult('error', `<p class="scan-result-error" style="text-align:center;">Registration not found for <strong>${regId}</strong>.</p>`);
      }
    } catch {
      showResult('error', `<p class="scan-result-error" style="text-align:center;">Could not verify. Check your connection.</p>`);
    }
  }

  toggleBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
  });
})();

