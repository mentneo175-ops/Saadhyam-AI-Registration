const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

const LOGO_PATH    = path.join(__dirname, '..', 'assets', 'logo.png');
const MENTNEO_LOGO = path.join(__dirname, '..', 'assets', 'mentneologo.png');
const SCRIPT_FONT  = path.join(__dirname, '..', 'assets', 'fonts', 'DancingScript-Bold.ttf');
const SIGNATURE    = path.join(__dirname, '..', 'assets', 'signature.png');

const OUTER_BG = '#0d1b2a';
const TEAL     = '#1a7a6e';
const WHITE    = '#ffffff';
const DARK     = '#0d1b2a';
const MID      = '#2d3748';
const GREY     = '#6b7280';
const LIGHT    = '#9ca3af';

function drawCornerTriangles(doc, x0, y0, cw, ch) {
  const S = 85;
  // Top-left teal
  doc.polygon([x0, y0], [x0 + S, y0], [x0, y0 + S]).fill(TEAL);
  // Top-right navy + teal
  doc.polygon([x0+cw, y0], [x0+cw-S*1.4, y0], [x0+cw, y0+S*1.4]).fill(OUTER_BG);
  doc.polygon([x0+cw, y0], [x0+cw-S*0.72, y0], [x0+cw, y0+S*0.72]).fill(TEAL);
  // Bottom-left teal
  doc.polygon([x0, y0+ch], [x0+S*0.62, y0+ch], [x0, y0+ch-S*0.62]).fill(TEAL);
  // Bottom-right navy + teal
  doc.polygon([x0+cw, y0+ch], [x0+cw-S*1.4, y0+ch], [x0+cw, y0+ch-S*1.4]).fill(OUTER_BG);
  doc.polygon([x0+cw, y0+ch], [x0+cw-S*0.72, y0+ch], [x0+cw, y0+ch-S*0.72]).fill(TEAL);
}

function drawMedal(doc, cx, cy) {
  const R = 18, R2 = R * 0.68;
  doc.circle(cx, cy, R).lineWidth(2).strokeColor(TEAL).stroke();
  doc.circle(cx, cy, R2).lineWidth(1.2).strokeColor(TEAL).stroke();
  const pts = 8, or = R2*0.82, ir = R2*0.42;
  let started = false;
  doc.save();
  for (let i = 0; i < pts*2; i++) {
    const ang = (Math.PI/pts)*i - Math.PI/2;
    const r   = i%2===0 ? or : ir;
    const px  = cx + r*Math.cos(ang);
    const py  = cy + r*Math.sin(ang);
    if (!started) { doc.moveTo(px,py); started=true; } else doc.lineTo(px,py);
  }
  doc.closePath().lineWidth(1).strokeColor(TEAL).stroke();
  doc.restore();
  const rw=6, ry=cy+R, rh=26;
  doc.save();
  doc.moveTo(cx-rw,ry).lineTo(cx-rw,ry+rh).lineTo(cx,ry+rh-6).lineTo(cx,ry)
    .closePath().lineWidth(1.2).strokeColor(TEAL).stroke();
  doc.restore();
  doc.save();
  doc.moveTo(cx+rw,ry).lineTo(cx+rw,ry+rh).lineTo(cx,ry+rh-6).lineTo(cx,ry)
    .closePath().lineWidth(1.2).strokeColor(TEAL).stroke();
  doc.restore();
}

function generateCertificate(registration) {
  return new Promise((resolve, reject) => {
    const W = 700, H = 530, cx = W/2;
    const doc = new PDFDocument({ size: [W, H], margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end',  ()  => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (fs.existsSync(SCRIPT_FONT)) doc.registerFont('DancingScript', SCRIPT_FONT);

    // Outer background
    doc.rect(0, 0, W, H).fill(OUTER_BG);

    // White card
    const pad = 22, cw = W-pad*2, ch = H-pad*2;
    doc.roundedRect(pad, pad, cw, ch, 3).fill(WHITE);

    // Corner triangles
    drawCornerTriangles(doc, pad, pad, cw, ch);

    // ── Logo ─────────────────────────────────────────────────────────────────
    const logoR = 20, logoY = pad + 16;
    if (fs.existsSync(LOGO_PATH)) {
      doc.save();
      doc.circle(cx, logoY+logoR, logoR).clip();
      doc.image(LOGO_PATH, cx-logoR, logoY, { width: logoR*2, height: logoR*2 });
      doc.restore();
    }

    // ── CERTIFICATE heading ───────────────────────────────────────────────────
    const headY = logoY + logoR*2 + 8;
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(40)
      .text('CERTIFICATE', 0, headY, { align: 'center', characterSpacing: 2 });

    doc.fillColor(MID).font('Helvetica').fontSize(11)
      .text('OF PARTICIPATION', 0, headY+44, { align: 'center', characterSpacing: 5 });

    // ── Teal ribbon ───────────────────────────────────────────────────────────
    const rbY=headY+64, rbH=24, rbW=290, rbX=cx-rbW/2, notch=12;
    doc.rect(rbX, rbY, rbW, rbH).fill(TEAL);
    doc.polygon([rbX,rbY],[rbX-notch,rbY+rbH/2],[rbX,rbY+rbH]).fill(TEAL);
    doc.polygon([rbX+rbW,rbY],[rbX+rbW+notch,rbY+rbH/2],[rbX+rbW,rbY+rbH]).fill(TEAL);
    doc.fillColor(WHITE).font('Helvetica').fontSize(10)
      .text('This certificate is awarded to', rbX-notch, rbY+7, { width: rbW+notch*2, align: 'center' });

    // ── Name ─────────────────────────────────────────────────────────────────
    const nameY    = rbY + rbH + 10;
    const nameFont = fs.existsSync(SCRIPT_FONT) ? 'DancingScript' : 'Helvetica-BoldOblique';
    doc.fillColor(DARK).font(nameFont).fontSize(30)
      .text(registration.fullName, 0, nameY, { align: 'center' });

    // ── Description (expanded content) ───────────────────────────────────────
    const eventName  = process.env.EVENT_NAME || 'Saadhyam AI Event';
    const issuedDate = new Date(registration.registeredAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    const descY = nameY + 38;

    // Line 1 — participation statement
    doc.fillColor(MID).font('Helvetica').fontSize(10.5)
      .text(
        `for successfully participating in  "${eventName}"`,
        80, descY, { align: 'center', width: W-160 }
      );

    // Line 2 — recognition statement
    doc.fillColor(GREY).font('Helvetica').fontSize(9.5)
      .text(
        'This certificate is presented in recognition of their dedication, enthusiasm, and commitment',
        80, descY+18, { align: 'center', width: W-160 }
      );

    doc.fillColor(GREY).font('Helvetica').fontSize(9.5)
      .text(
        'to exploring the frontiers of Artificial Intelligence and technology.',
        80, descY+32, { align: 'center', width: W-160 }
      );

    // Line 3 — date line
    doc.fillColor(LIGHT).font('Helvetica').fontSize(9)
      .text(`Issued on:  ${issuedDate}`, 0, descY+50, { align: 'center' });

    // ── Thin horizontal rule ─────────────────────────────────────────────────
    const ruleY = descY + 70;
    doc.moveTo(pad+60, ruleY).lineTo(W-pad-60, ruleY)
      .lineWidth(0.4).strokeColor('#e5e7eb').stroke();

    // ── Signature section ─────────────────────────────────────────────────────
    const sigY  = ruleY + 58;  // enough room for signature image above
    const lineL = 110;

    // Left — signature image + line + labels
    const s1cx = cx - 185;   // centre of left sig block
    const s1x  = s1cx - lineL/2;

    // Signature image — centered over the left signature line
    // Use full line width to visually center regardless of transparent padding in image
    if (fs.existsSync(SIGNATURE)) {
      const sigImgW = lineL;  // exactly match line width
      const sigImgH = 40;
      doc.image(SIGNATURE, s1x, sigY - sigImgH - 2, {
        width: sigImgW, height: sigImgH,
      });
    }

    doc.moveTo(s1x, sigY).lineTo(s1x+lineL, sigY)
      .lineWidth(0.8).strokeColor('#cccccc').stroke();
    doc.fillColor(GREY).font('Helvetica').fontSize(8.5)
      .text('Saadhyam AI', s1x, sigY+4, { width: lineL, align: 'center' });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
      .text('Event Organiser', s1x, sigY+15, { width: lineL, align: 'center' });

    // Centre — medal icon
    drawMedal(doc, cx, sigY - 8);

    // Right — Ment Neo logo in circle + labels
    const mntCx = cx + 185;
    const mntR  = 20;
    const mntLy = sigY - mntR*2 - 4;

    // Circle border
    // doc.circle(mntCx, mntLy + mntR, mntR).lineWidth(1.5).strokeColor(TEAL).stroke();
    // Dark fill behind logo
    doc.circle(mntCx, mntLy + mntR, mntR - 1.5).fill('#0d1b2a');

    // Ment Neo logo
    if (fs.existsSync(MENTNEO_LOGO)) {
      doc.save();
      doc.circle(mntCx, mntLy+mntR, mntR-3).clip();
      doc.image(MENTNEO_LOGO, mntCx-(mntR-3), mntLy+3, {
        width: (mntR-3)*2, height: (mntR-3)*2,
      });
      doc.restore();
    }

    doc.fillColor(GREY).font('Helvetica').fontSize(8.5)
      .text('Ment Neo', mntCx-35, mntLy+mntR*2+4, { width: 70, align: 'center' });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
      .text('Certified Partner', mntCx-35, mntLy+mntR*2+15, { width: 70, align: 'center' });

    // ── Certified by Ment Neo — bottom-left ───────────────────────────────────
    // doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(7)
    //   .text('✦  CERTIFIED BY MENT NEO  ✦', pad+14, pad+ch-16, { characterSpacing: 0.6 });

    doc.end();
  });
}

module.exports = { generateCertificate };
