const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const GOLD = '#b8860b';
const TEAL = '#0a3835';
const INK = '#1c2725';

function money(v) {
  const n = Number(v || 0);
  return `Rs. ${n.toLocaleString('en-IN')}`;
}

function row(doc, label, value) {
  if (value === null || value === undefined || value === '') return;
  const startY = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(TEAL).text(label, 40, startY, { width: 150 });
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(String(value), 195, startY, { width: 360 });
  doc.moveDown(0.35);
}

function sectionTitle(doc, title) {
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(GOLD).text(title, { underline: false });
  doc.moveTo(40, doc.y + 2).lineTo(555, doc.y + 2).strokeColor(GOLD).lineWidth(1).stroke();
  doc.moveDown(0.5);
}

// Streams a PDF for the given full profile record directly to `res`.
// `uploadsDir` is the absolute path to public/uploads (so the photo can be embedded).
function streamProfilePdf(res, profile, uploadsDir) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${profile.full_name.replace(/[^a-z0-9]/gi, '_')}_profile.pdf"`);
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(18).fillColor(TEAL).text('Kalpavruksha Kalyana', { align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor(GOLD).text('Matrimony Profile', { align: 'center' });
  doc.moveDown(1);

  const photoPath = profile.image_name ? path.join(uploadsDir, 'profiles', profile.image_name) : null;
  const topY = doc.y;
  if (photoPath && fs.existsSync(photoPath)) {
    try {
      doc.image(photoPath, 40, topY, { width: 130, height: 150, fit: [130, 150] });
    } catch (e) { /* corrupt/unsupported image — skip silently */ }
  }

  const infoX = 190;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(`${profile.full_name}, ${Math.round(profile.age)}`, infoX, topY);
  doc.font('Helvetica').fontSize(10).fillColor(INK)
    .text(`${profile.occupation || ''}`, infoX, doc.y + 4)
    .text(`${profile.city || ''}${profile.state ? ', ' + profile.state : ''}`, infoX)
    .text(`Gender: ${profile.gender === 'male' ? 'Male (Groom)' : 'Female (Bride)'}`, infoX)
    .text(`Status: ${profile.marital_status === 'married' ? 'Married' : 'Unmarried'}`, infoX);

  doc.y = topY + 160;

  sectionTitle(doc, 'Personal Details');
  row(doc, 'Religion', profile.religion);
  row(doc, 'Caste / Sub-caste', `${profile.caste || ''} / ${profile.subcaste || ''}`);
  row(doc, 'Date of Birth', profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString('en-IN') : '');
  if (profile.time_of_birth) row(doc, 'Time of Birth', profile.time_of_birth);
  row(doc, 'Rashi / Nakshatra', `${profile.rashi || ''} / ${profile.nakshatra || ''}`);
  row(doc, 'Language', profile.language);
  row(doc, 'Annual Salary', money(profile.annual_salary));
  row(doc, 'Phone', profile.phone_number);
  row(doc, 'Address', profile.address);

  sectionTitle(doc, 'Family Details');
  row(doc, 'Father', `${profile.father_name || ''} - ${profile.father_occupation || ''} (${money(profile.father_salary)})`);
  row(doc, 'Mother', `${profile.mother_name || ''} - ${profile.mother_occupation || ''} (${money(profile.mother_salary)})`);
  row(doc, 'Siblings', `${profile.total_siblings || 0} total (${profile.male_siblings || 0} male, ${profile.female_siblings || 0} female)`);

  sectionTitle(doc, 'Assets & Liabilities');
  row(doc, 'Assets', profile.assets);
  if (profile.loans) row(doc, 'Loans', profile.loans);

  doc.moveDown(1);
  doc.font('Helvetica').fontSize(8).fillColor('#8a7156')
    .text(`Generated on ${new Date().toLocaleDateString('en-IN')} — Kalpavruksha Kalyana`, 40, doc.page.height - 50, { align: 'center', width: 515 });

  doc.end();
}

module.exports = { streamProfilePdf };
