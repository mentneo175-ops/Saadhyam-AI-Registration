# Deployment Guide — Saadhyam AI Registration

## ⚠️ Safety Checklist Before Every Deploy

- [ ] `.env` is in `.gitignore` — never commit it
- [ ] `config/serviceAccountKey.json` is in `.gitignore`
- [ ] Set all environment variables on the hosting platform (not in code)
- [ ] Cloudinary credentials are set as env vars on the platform
- [ ] Test locally with `node server.js` before pushing

---

## 🚀 Deploy to Render.com (Recommended — Free, Node.js)

### First-time setup

1. **Push code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/saadhyam-registration.git
   git push -u origin main
   ```

2. **Create a Render account** at https://render.com

3. **New Web Service** → Connect your GitHub repo

4. **Configure the service:**
   | Setting | Value |
   |---|---|
   | Runtime | Node |
   | Build Command | `npm install && node scripts/download-font.js` |
   | Start Command | `node server.js` |
   | Instance Type | Free |

5. **Add Environment Variables** (in Render dashboard → Environment tab):
   ```
   PORT=10000
   NODE_ENV=production
   FIREBASE_PROJECT_ID=saadhyam-registration-form
   FIREBASE_STORAGE_BUCKET=saadhyam-registration-form.firebasestorage.app
   FIREBASE_API_KEY=<your key>
   FIREBASE_AUTH_DOMAIN=saadhyam-registration-form.firebaseapp.com
   FIREBASE_MESSAGING_SENDER_ID=<your id>
   FIREBASE_APP_ID=<your app id>
   FIREBASE_MEASUREMENT_ID=<your measurement id>
   FIREBASE_COLLECTION=registrations
   CLOUDINARY_CLOUD_NAME=<your cloud name>
   CLOUDINARY_API_KEY=<your api key>
   CLOUDINARY_API_SECRET=<your api secret>
   CLOUDINARY_FOLDER=saadhyam-ai/registrations
   EVENT_NAME=Saadhyam AI Event
   CERTIFICATE_DELAY_HOURS=48
   ```

6. Click **Deploy** — Render gives you a URL like `https://saadhyam-registration.onrender.com`

---

## 🔄 Future Deployments

Every time you push to `main`, Render auto-deploys:

```bash
# Make your changes, then:
git add .
git commit -m "Your change description"
git push origin main
# Render auto-deploys within 2-3 minutes
```

To deploy manually (without git push):
- Go to Render dashboard → your service → **Manual Deploy** → Deploy latest commit

---

## 🌐 After Deployment

### Update firebase-config.js
After getting your Render URL, update the frontend Firebase config if needed.

### Deploy Firestore rules
```bash
# Install Firebase CLI (one time)
npm install -g firebase-tools

# Login
firebase login

# Deploy only rules
firebase deploy --only firestore:rules

# Deploy storage rules
firebase deploy --only storage
```

### Update CORS for Cloudinary (if needed)
Cloudinary uploads go server-side, so no CORS config needed.

---

## 🛡️ Production Security Notes

1. **Never commit `.env`** — always use platform env vars
2. **Firestore rules** — currently `allow update: if true` for certificate fields — consider restricting after launch
3. **Rate limiting** — consider adding `express-rate-limit` for `/api/register` in production
4. **HTTPS** — Render provides HTTPS automatically (required for camera/scanner on mobile)

---

## 🔧 Local Development

```bash
# Install dependencies
npm install

# Download fonts
node scripts/download-font.js

# Start server
npm start
# Opens http://localhost:3000
```
