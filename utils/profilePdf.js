const PDFDocument = require('pdfkit');
const { getPublicUrl } = require('./storage');
const { MARITAL_STATUS_OPTIONS, RELIGION_OPTIONS, EMPLOYED_IN_OPTIONS } = require('./profileOptions');

// Downloads a file from a public URL into a Buffer. Used to pull the profile
// photo out of Supabase Storage so it can be embedded in the generated PDF.
async function fetchAsBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

const GOLD = '#b8860b';
const TEAL = '#0a3835';
const INK = '#1c2725';

function money(v) {
  if (!v) return null;
  const n = Number(v);
  return `Rs. ${n.toLocaleString('en-IN')}`;
}

function labelFor(list, value) {
  const found = list.find((o) => o.value === value);
  return found ? found.label : value;
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
// The profile photo is fetched from its Supabase Storage public URL.
async function streamProfilePdf(res, profile) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${profile.full_name.replace(/[^a-z0-9]/gi, '_')}_profile.pdf"`);
  doc.pipe(res);

  const religionDisplay = profile.religion === 'other' ? (profile.religion_other || 'Other') : labelFor(RELIGION_OPTIONS, profile.religion);
  const casteDisplay = profile.caste === 'Other' ? (profile.caste_other || 'Other') : profile.caste;
  const employedInDisplay = profile.employed_in === 'other' ? (profile.employed_in_other || 'Others') : labelFor(EMPLOYED_IN_OPTIONS, profile.employed_in);
  const occupationDisplay = profile.occupation === 'Other' ? (profile.occupation_other || 'Other') : profile.occupation;
  const motherTongueDisplay = profile.mother_tongue === 'Other' ? (profile.mother_tongue_other || 'Other') : (profile.mother_tongue || profile.language);
  const statusLabel = labelFor(MARITAL_STATUS_OPTIONS, profile.marital_status);

  doc.font('Helvetica-Bold').fontSize(18).fillColor(TEAL).text('Kalpavruksha Kalyana', { align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor(GOLD).text('Matrimony Profile', { align: 'center' });
  doc.moveDown(1);

  const photoUrl = profile.image_name ? getPublicUrl('profiles', profile.image_name) : null;
  const topY = doc.y;
  if (photoUrl) {
    try {
      const photoBuffer = await fetchAsBuffer(photoUrl);
      doc.image(photoBuffer, 40, topY, { width: 130, height: 150, fit: [130, 150] });
    } catch { /* missing/corrupt/unsupported image — skip silently */ }
  }

  const infoX = 190;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(`${profile.full_name}, ${Math.round(profile.age)}`, infoX, topY);
  doc.font('Helvetica').fontSize(10).fillColor(INK)
    .text(`${occupationDisplay || ''}`, infoX, doc.y + 4)
    .text(`${profile.city || ''}${profile.state ? ', ' + profile.state : ''}`, infoX)
    .text(`Gender: ${profile.gender === 'male' ? 'Male (Groom)' : 'Female (Bride)'}`, infoX)
    .text(`Status: ${statusLabel}`, infoX);

  doc.y = topY + 160;

  sectionTitle(doc, 'Personal Details');
  row(doc, 'Willing to Marry Other Caste', profile.willing_other_caste === 'yes' ? 'Yes' : profile.willing_other_caste === 'no' ? 'No' : null);
  row(doc, 'Religion', religionDisplay);
  row(doc, 'Caste / Sub-caste', casteDisplay ? `${casteDisplay} / ${profile.subcaste || '-'}` : null);
  row(doc, 'Date of Birth', profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString('en-IN') : '');
  if (profile.time_of_birth) row(doc, 'Time of Birth', profile.time_of_birth);
  if (profile.birth_place) row(doc, 'Birth Place', profile.birth_place);
  row(doc, 'Rashi / Nakshatra', `${profile.rashi || ''} / ${profile.nakshatra || ''}`);
  if (profile.has_dosh) row(doc, 'Have Dosh', profile.has_dosh === 'yes' ? 'Yes' : 'No');
  row(doc, 'Mother Tongue', motherTongueDisplay);
  row(doc, 'Phone', `${profile.phone_country_code || '+91'} ${profile.phone_number}`);
  row(doc, 'Address', `${profile.address || ''}, ${profile.city || ''}, ${profile.state || ''}${profile.country && profile.country !== 'India' ? ', ' + profile.country : ''}`);

  sectionTitle(doc, 'Education & Occupation');
  row(doc, 'Education', profile.education);
  row(doc, 'Employed In', employedInDisplay);
  row(doc, 'Occupation', occupationDisplay);
  row(doc, 'Company', profile.company_name);
  row(doc, 'Designation', profile.designation);
  row(doc, 'Annual Income', profile.annual_income_band || money(profile.annual_salary));

  sectionTitle(doc, 'Family Details');
  row(doc, 'Family Type', profile.family_type);
  row(doc, 'Family Values', profile.family_values);
  row(doc, 'Family Status', profile.family_status);
  row(doc, 'Father', [profile.father_name, profile.father_occupation, money(profile.father_salary)].filter(Boolean).join(' - '));
  row(doc, 'Mother', [profile.mother_name, profile.mother_occupation, money(profile.mother_salary)].filter(Boolean).join(' - '));
  if (profile.num_brothers || profile.num_sisters) {
    row(doc, 'Siblings', `${profile.num_brothers || 0} brother(s) (${profile.married_brothers || 0} married), ${profile.num_sisters || 0} sister(s) (${profile.married_sisters || 0} married)`);
  } else if (profile.total_siblings) {
    row(doc, 'Siblings', `${profile.total_siblings} total (${profile.male_siblings || 0} male, ${profile.female_siblings || 0} female)`);
  }

  if (profile.eating_habit || profile.smoking_habit || profile.drinking_habit) {
    sectionTitle(doc, 'Habits & Hobbies');
    row(doc, 'Eating Habit', profile.eating_habit);
    row(doc, 'Smoking Habit', profile.smoking_habit);
    row(doc, 'Drinking Habit', profile.drinking_habit);
  }

  sectionTitle(doc, 'Assets & Liabilities');
  row(doc, 'Assets', profile.assets);
  if (profile.loans) row(doc, 'Loans', profile.loans);

  doc.moveDown(1);
  doc.font('Helvetica').fontSize(8).fillColor('#8a7156')
    .text(`Generated on ${new Date().toLocaleDateString('en-IN')} — Kalpavruksha Kalyana`, 40, doc.page.height - 50, { align: 'center', width: 515 });

  doc.end();
}

module.exports = { streamProfilePdf };
