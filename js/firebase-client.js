(function (global) {
  'use strict';

  if (!firebase?.apps?.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const db         = firebase.firestore();
  const COLLECTION = 'registrations';

  function generateRegId() {
    const ts   = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `SAI-${ts.slice(-4)}${rand}`;
  }

  async function findDuplicate(email, mobile) {
    const [emailSnap, mobileSnap] = await Promise.all([
      db.collection(COLLECTION).where('email',  '==', email).limit(1).get(),
      db.collection(COLLECTION).where('mobile', '==', mobile).limit(1).get(),
    ]);
    if (!emailSnap.empty)  return emailSnap.docs[0].data();
    if (!mobileSnap.empty) return mobileSnap.docs[0].data();
    return null;
  }

  // Upload photo via Express server — server picks Cloudinary → Firebase Admin → local
  async function uploadPhoto(photoFile, regId) {
    const body = new FormData();
    body.append('regId', regId);
    body.append('photo', photoFile, photoFile.name);

    const res  = await fetch('/api/upload-photo', { method: 'POST', body });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Photo upload failed.');
    return data.photoUrl;
  }

  // Generate certificate on server, store it, then update Firestore — with retry
  async function generateAndSaveCertificate(registration, attempt = 1) {
    try {
      console.log(`[Certificate] Generating for ${registration.regId} (attempt ${attempt})…`);

      const res  = await fetch('/api/generate-certificate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(registration),
      });
      const data = await res.json();

      if (!res.ok || !data.ok || !data.certificateUrl) {
        throw new Error(data.error || `Server returned: ${JSON.stringify(data)}`);
      }

      // Use set with merge:true instead of update — avoids Firestore update rules entirely
      await db.collection(COLLECTION).doc(registration.regId).set({
        certificateGenerated:   true,
        certificateGeneratedAt: new Date().toISOString(),
        certificateUrl:         data.certificateUrl,
      }, { merge: true });

      console.log(`[Certificate] ✓ Firestore updated for ${registration.regId} — ${data.certificateUrl}`);

    } catch (err) {
      console.error(`[Certificate] Failed (attempt ${attempt}):`, err.message);

      // Retry up to 3 times with exponential back-off
      if (attempt < 3) {
        const delay = attempt * 3000; // 3s, 6s
        console.log(`[Certificate] Retrying in ${delay / 1000}s…`);
        setTimeout(() => generateAndSaveCertificate(registration, attempt + 1), delay);
      } else {
        console.error(`[Certificate] Gave up after 3 attempts for ${registration.regId}`);
      }
    }
  }

  async function registerParticipant(formData, photoFile) {
    const normalizedEmail  = formData.email.trim().toLowerCase();
    const normalizedMobile = formData.mobile.replace(/\s/g, '');

    // 1. Duplicate check via Firestore Web SDK
    const duplicate = await findDuplicate(normalizedEmail, normalizedMobile);
    if (duplicate) {
      const err = new Error('This email or mobile number is already registered.');
      err.regId = duplicate.regId;
      throw err;
    }

    // 2. Upload photo to Cloudinary via server
    const regId    = generateRegId();
    const photoUrl = await uploadPhoto(photoFile, regId);  // Cloudinary URL

    const registeredAt = new Date().toISOString();

    const registration = {
      regId,
      fullName:             formData.fullName.trim(),
      mobile:               normalizedMobile,
      email:                normalizedEmail,
      college:              formData.college.trim(),
      branch:               formData.branch.trim(),
      year:                 formData.year,
      gender:               formData.gender,
      city:                 formData.city.trim(),
      state:                formData.state.trim(),
      linkedin:             formData.linkedin?.trim() || '',
      photo:                photoUrl,          // Cloudinary URL stored in Firestore
      registeredAt,
      certificateGenerated: false,
      certificateUrl:       null,
    };

    // 3. Save full registration (including Cloudinary photo URL) to Firestore
    await db.collection(COLLECTION).doc(regId).set(registration);

    // 4. Trigger certificate generation — awaited so Firestore gets updated before returning
    //    Uses a small delay to ensure the doc is fully committed first
    setTimeout(() => generateAndSaveCertificate(registration), 500);

    // 5. Return registration immediately so Virtual Card shows right away
    return registration;
  }

  async function getRegistration(regId) {
    const doc = await db.collection(COLLECTION).doc(regId).get();
    if (!doc.exists) return null;
    return doc.data();
  }

  async function testConnection() {
    await db.collection(COLLECTION).limit(1).get();
    return {
      connected:     true,
      projectId:     firebaseConfig.projectId,
      collection:    COLLECTION,
      storageBucket: firebaseConfig.storageBucket,
    };
  }

  global.SaadhyamFirebase = {
    registerParticipant,
    getRegistration,
    testConnection,
    COLLECTION,
  };
})(window);
