const path = require('path');
const sharp = require('sharp');
const { getTranslator } = require('./i18n');
const PDFDocument = require('pdfkit');
const { getFile } = require('./storage');
const { MARITAL_STATUS_OPTIONS, RELIGION_OPTIONS, EMPLOYED_IN_OPTIONS } = require('./profileOptions');

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
  const labelText=doc.t(label);
  const height=Math.max(doc.font('KK-Bold').fontSize(10).heightOfString(labelText,{width:145}),doc.font('KK-Regular').heightOfString(String(value),{width:360}));
  if(doc.y+height>doc.page.height-55)doc.addPage();
  const startY = doc.y;
  doc.font('KK-Bold').fontSize(10).fillColor(TEAL).text(doc.t(label), 40, startY, { width: 150 });
  doc.font('KK-Regular').fontSize(10).fillColor(INK).text(String(value), 195, startY, { width: 360 });
  doc.y=startY+height+7;
  doc.x=40;
}

function sectionTitle(doc, title) {
  if(doc.y>doc.page.height-80)doc.addPage();
  doc.x=40;
  doc.moveDown(0.6);
  doc.font('KK-Bold').fontSize(13).fillColor(GOLD).text(doc.t(title), { underline: false });
  doc.moveTo(40, doc.y + 2).lineTo(555, doc.y + 2).strokeColor(GOLD).lineWidth(1).stroke();
  doc.moveDown(0.5);
}

// Streams a PDF for the given full profile record directly to `res`.
async function streamProfilePdf(res, profile) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  doc.t = getTranslator(res.locals.currentLang || 'en');
  doc.registerFont('KK-Regular',path.join(__dirname,'../public/fonts/NotoSansKannada.ttf'),'Regular');
  doc.registerFont('KK-Bold',path.join(__dirname,'../public/fonts/NotoSansKannada.ttf'),'Bold');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${profile.full_name.replace(/[^a-z0-9]/gi, '_')}_profile.pdf"`);
  doc.pipe(res);

  const religionDisplay = profile.religion === 'other' ? (profile.religion_other || 'Other') : labelFor(RELIGION_OPTIONS, profile.religion);
  const casteDisplay = profile.caste === 'Other' ? (profile.caste_other || 'Other') : profile.caste;
  const employedInDisplay = profile.employed_in === 'other' ? (profile.employed_in_other || 'Others') : labelFor(EMPLOYED_IN_OPTIONS, profile.employed_in);
  const occupationDisplay = profile.occupation === 'Other' ? (profile.occupation_other || 'Other') : profile.occupation;
  const motherTongueDisplay = profile.mother_tongue === 'Other' ? (profile.mother_tongue_other || 'Other') : (profile.mother_tongue || profile.language);
  const statusLabel = labelFor(MARITAL_STATUS_OPTIONS, profile.marital_status);

  doc.font('KK-Bold').fontSize(18).fillColor(TEAL).text(doc.t('Kalpavruksha Kalyana'), { align: 'center' });
  doc.font('KK-Regular').fontSize(10).fillColor(GOLD).text(doc.t('Matrimony Profile'), { align: 'center' });
  doc.moveDown(1);

  const topY = doc.y;
  if (profile.image_name) {
    const file = await getFile('profiles', profile.image_name);
    const photoBuffer = await sharp(file.buffer).png().toBuffer();
    doc.image(photoBuffer, 40, topY, { width: 130, height: 150, fit: [130, 150] });
  }

  const infoX = 190;
  doc.font('KK-Bold').fontSize(16).fillColor(INK).text(`${profile.full_name}, ${Math.round(profile.age)}`, infoX, topY);
  doc.font('KK-Regular').fontSize(10).fillColor(INK)
    .text(doc.t(occupationDisplay || ''), infoX, doc.y + 4)
    .text(`${profile.city || ''}${profile.state ? ', ' + profile.state : ''}`, infoX)
    .text(doc.t('Gender')+': '+doc.t(profile.gender === 'male' ? 'Male (Groom)' : 'Female (Bride)'), infoX)
    .text(doc.t('Status')+': '+doc.t(statusLabel), infoX);

  doc.y = topY + 160;

  sectionTitle(doc, 'Personal Details');
  row(doc, 'Willing to Marry Other Caste', profile.willing_other_caste === 'yes' ? doc.t('Yes') : profile.willing_other_caste === 'no' ? doc.t('No') : null);
  row(doc, 'Religion', doc.t(religionDisplay));
  row(doc, 'Caste / Sub-caste', casteDisplay ? doc.t(casteDisplay)+' / '+(profile.subcaste || '-') : null);
  row(doc, 'Date of Birth', profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString(res.locals.currentLang === 'kn' ? 'kn-IN' : 'en-IN') : '');
  if (profile.time_of_birth) row(doc, 'Time of Birth', profile.time_of_birth);
  if (profile.birth_place) row(doc, 'Birth Place', profile.birth_place);
  row(doc, 'Rashi / Nakshatra', [profile.rashi,profile.nakshatra].filter(Boolean).map(value=>doc.t(value)).join(' / '));
  if (profile.has_dosh) row(doc, 'Have Dosh', profile.has_dosh === 'yes' ? doc.t('Yes') : doc.t('No'));
  row(doc, 'Mother Tongue', doc.t(motherTongueDisplay));
  row(doc, 'Phone', `${profile.phone_country_code || '+91'} ${profile.phone_number}`);
  row(doc, 'Address', `${profile.address || ''}, ${profile.city || ''}, ${profile.state || ''}${profile.country && profile.country !== 'India' ? ', ' + profile.country : ''}`);

  sectionTitle(doc, 'Education & Occupation');
  row(doc, 'Education', doc.t(profile.education));
  row(doc, 'Employed In', doc.t(employedInDisplay));
  row(doc, 'Occupation', doc.t(occupationDisplay));
  row(doc, 'Company', profile.company_name);
  row(doc, 'Designation', profile.designation);
  row(doc, 'Annual Income', doc.t(profile.annual_income_band) || money(profile.annual_salary));

  sectionTitle(doc, 'Family Details');
  row(doc, 'Family Type', doc.t(profile.family_type));
  row(doc, 'Family Values', doc.t(profile.family_values));
  row(doc, 'Family Status', doc.t(profile.family_status));
  row(doc, 'Father', [profile.father_name, doc.t(profile.father_occupation), money(profile.father_salary)].filter(Boolean).join(' - '));
  row(doc, 'Mother', [profile.mother_name, doc.t(profile.mother_occupation), money(profile.mother_salary)].filter(Boolean).join(' - '));
  if (profile.num_brothers || profile.num_sisters) {
    row(doc, 'Siblings', doc.t('{brothers} brother(s) ({marriedBrothers} married), {sisters} sister(s) ({marriedSisters} married)',{brothers:profile.num_brothers||0,marriedBrothers:profile.married_brothers||0,sisters:profile.num_sisters||0,marriedSisters:profile.married_sisters||0}));
  } else if (profile.total_siblings) {
    row(doc, 'Siblings', doc.t('{total} total ({male} male, {female} female)',{total:profile.total_siblings,male:profile.male_siblings||0,female:profile.female_siblings||0}));
  }

  if (profile.eating_habit || profile.smoking_habit || profile.drinking_habit) {
    sectionTitle(doc, 'Habits & Hobbies');
    row(doc, 'Eating Habit', doc.t(profile.eating_habit));
    row(doc, 'Smoking Habit', doc.t(profile.smoking_habit));
    row(doc, 'Drinking Habit', doc.t(profile.drinking_habit));
  }

  sectionTitle(doc, 'Assets & Liabilities');
  row(doc, 'Assets', profile.assets);
  if (profile.loans) row(doc, 'Loans', profile.loans);

  const pages=doc.bufferedPageRange();
  for(let page=pages.start;page<pages.start+pages.count;page++){
    doc.switchToPage(page);
    doc.font('KK-Regular').fontSize(8).fillColor('#75634f').text(doc.t('Generated on {date}',{date:new Date().toLocaleDateString(res.locals.currentLang==='kn'?'kn-IN':'en-IN')})+' - '+doc.t('Kalpavruksha Kalyana'),40,doc.page.height-28,{align:'center',width:515,lineBreak:false});
  }

  doc.end();
}

module.exports = { streamProfilePdf };
