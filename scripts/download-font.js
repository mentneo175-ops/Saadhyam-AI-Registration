const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const fontDir = path.join(__dirname, '..', 'assets', 'fonts');
if (!fs.existsSync(fontDir)) fs.mkdirSync(fontDir, { recursive: true });

const dest = path.join(fontDir, 'DancingScript-Bold.ttf');

// Direct raw CDN link for Dancing Script Bold
const url = 'https://fonts.gstatic.com/s/dancingscript/v25/If2cXTr6YS-zF4S-kcSWSVi_sxjsohD9F50Ruu7BMSo3Sup5.woff2';

// We need TTF not woff2 — use a different source
const ttfUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/dancingscript/DancingScript%5Bwght%5D.ttf';

function download(url, dest, cb) {
  const mod = url.startsWith('https') ? https : http;
  const file = fs.createWriteStream(dest);
  mod.get(url, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      file.close();
      fs.unlinkSync(dest);
      return download(res.headers.location, dest, cb);
    }
    res.pipe(file);
    file.on('finish', () => { file.close(); cb(null); });
  }).on('error', (err) => {
    fs.unlinkSync(dest);
    cb(err);
  });
}

download(ttfUrl, dest, (err) => {
  if (err) {
    console.error('Download failed:', err.message);
    process.exit(1);
  }
  const size = fs.statSync(dest).size;
  console.log('Font downloaded:', dest, '(' + size + ' bytes)');
});
