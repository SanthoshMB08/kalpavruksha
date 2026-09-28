// Single source of truth for every fixed-choice field on the profile form.
// { value, label } pairs — `value` is what's stored/validated, `label` is
// what the dropdown shows.

const MARITAL_STATUS_OPTIONS = [
  { value: 'never_married', label: 'Never Married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'awaiting_divorce', label: 'Awaiting Divorce' },
  { value: 'annulled', label: 'Annulled Marriage' },
  { value: 'separated', label: 'Separated' },
  { value: 'married', label: 'Married' }
];

const YES_NO_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' }
];

const RELIGION_OPTIONS = [
  { value: 'hindu', label: 'Hindu' },
  { value: 'muslim', label: 'Muslim' },
  { value: 'christian', label: 'Christian' },
  { value: 'sikh', label: 'Sikh' },
  { value: 'jain', label: 'Jain' },
  { value: 'buddhist', label: 'Buddhist' },
  { value: 'parsi', label: 'Parsi (Zoroastrian)' },
  { value: 'jewish', label: 'Jewish' },
  { value: 'bahai', label: "Bahá'í" },
  { value: 'tribal', label: 'Tribal Religion' },
  { value: 'spiritual_not_religious', label: 'Spiritual - Not Religious' },
  { value: 'no_religion', label: 'No Religion' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer Not to Say' }
];

// Only these three religions have a caste list right now — caste is
// disabled entirely for any other religion (client asked to add more later).
const CASTE_OPTIONS_BY_RELIGION = {
  hindu: [
    'Agrawal', 'Arya Vysya', 'Balija', 'Baniya', 'Besta', 'Billava', 'Brahmin', 'Bunts', 'Chamar',
    'Chettiar', 'Devanga', 'Gavara', 'Goud', 'Gowda', 'Gupta', 'Jat', 'Kamma', 'Kapu', 'Kayastha',
    'Khandelwal', 'Koli', 'Konkani', 'Kshatriya', 'Kurmi', 'Kuruba', 'Lingayat', 'Madiga', 'Maratha',
    'Mudaliar', 'Nadar', 'Nair', 'Nayaka', 'OBC', 'Padmashali', 'Patel', 'Rajput', 'Reddy',
    'Scheduled Caste', 'Scheduled Tribe', 'Sonar', 'Thakur', 'Tulu', 'Vaishya', 'Vanniyar', 'Velama',
    'Vishwakarma', 'Vokkaliga', 'Yadav', 'Other'
  ],
  muslim: ['Sunni', 'Shia', 'Ahmadiyya', 'Ibadi', 'Sufi', 'Other'],
  christian: ['Roman Catholic', 'Orthodox', 'Protestant', 'Other']
};

const CHILDREN_OPTIONS = [
  { value: 'no', label: 'No' },
  { value: 'yes_living_with_me', label: 'Yes – Living with Me' },
  { value: 'yes_not_living_with_me', label: 'Yes – Not Living with Me' }
];

const EDUCATION_OPTIONS = [
  'Below SSLC', 'SSLC', 'PUC', 'Diploma', 'ITI', 'Polytechnic', 'B.A.', 'B.Com.', 'B.Sc.', 'BCA', 'BBA',
  'B.E.', 'B.Tech.', 'B.Arch.', 'B.Plan.', 'B.Des.', 'B.Ed.', 'B.Lib.I.Sc.', 'B.P.Ed.', 'BFA', 'BSW',
  'BHM', 'B.Pharm.', 'BDS', 'BAMS', 'BHMS', 'BUMS', 'BPT', 'B.Sc Nursing', 'MBBS', 'LLB', 'B.V.Sc.',
  'CA (Chartered Accountant)', 'CS (Company Secretary)', 'M.A.', 'M.Com.', 'M.Sc.', 'MCA', 'MBA',
  'M.Tech.', 'M.E.', 'M.Arch.', 'M.Plan.', 'M.Des.', 'M.Ed.', 'M.Lib.I.Sc.', 'MFA', 'MSW', 'MHM',
  'M.Pharm.', 'MDS', 'MD', 'MS (Medical)', 'M.Ch.', 'DM', 'MPT', 'M.Sc Nursing', 'LLM', 'MVSc',
  'CMA (Cost & Management Accountant)', 'Other'
];

const EMPLOYED_IN_OPTIONS = [
  { value: 'government', label: 'Government' },
  { value: 'private', label: 'Private' },
  { value: 'mnc', label: 'MNC' },
  { value: 'defence', label: 'Defence' },
  { value: 'business', label: 'Business' },
  { value: 'banking', label: 'Banking' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'self_employed', label: 'Self Employed' },
  { value: 'homemaker', label: 'Homemaker' },
  { value: 'not_working', label: 'Not Working' },
  { value: 'other', label: 'Others' }
];

const OCCUPATION_CATEGORY_OPTIONS = [
  'Government & Administration', 'Information Technology (IT)', 'Engineering', 'Medical & Healthcare',
  'Education', 'Business & Finance', 'Business & Entrepreneurship', 'Legal', 'Sales & Marketing',
  'Media & Creative', 'Hospitality', 'Aviation & Shipping', 'Agriculture', 'Skilled Trades',
  'Service Sector', 'Other'
];

const INCOME_BAND_OPTIONS = [
  'Below ₹1,00,000', '₹1,00,000 – ₹2,00,000', '₹2,00,001 – ₹3,00,000', '₹3,00,001 – ₹5,00,000',
  '₹5,00,001 – ₹7,50,000', '₹7,50,001 – ₹10,00,000', '₹10,00,001 – ₹12,00,000',
  '₹12,00,001 – ₹15,00,000', '₹15,00,001 – ₹20,00,000', '₹20,00,001 – ₹25,00,000',
  '₹25,00,001 – ₹35,00,000', '₹35,00,001 – ₹50,00,000', '₹50,00,001 – ₹75,00,000',
  '₹75,00,001 – ₹1,00,00,000', 'Above ₹1,00,00,000', 'No Income', 'Prefer Not to Say'
];

const FAMILY_TYPE_OPTIONS = ['Joint Family', 'Nuclear Family', 'Extended Family', 'Single Parent Family', 'Living Independently', 'Other'];
const FAMILY_VALUES_OPTIONS = ['Traditional', 'Moderate', 'Liberal', 'Orthodox', 'Modern'];
const FAMILY_STATUS_OPTIONS = ['Lower Middle Class', 'Middle Class', 'Upper Middle Class', 'Affluent', 'Rich / Wealthy', 'High Net Worth', 'Prefer Not to Say'];

const EATING_HABIT_OPTIONS = ['Vegetarian', 'Eggetarian', 'Non-Vegetarian', 'Vegan'];
const SMOKING_HABIT_OPTIONS = ['Never', 'Occasionally', 'Regularly', 'Prefer Not to Say'];
const DRINKING_HABIT_OPTIONS = ['Never', 'Occasionally', 'Socially', 'Regularly', 'Prefer Not to Say'];

const MOTHER_TONGUE_OPTIONS = [
  'Kannada', 'English', 'Hindi', 'Konkani', 'Malayalam', 'Manipuri', 'Marathi', 'Nepali', 'Odia',
  'Punjabi', 'Sanskrit', 'Santali', 'Sindhi', 'Tamil', 'Telugu', 'Urdu', 'Other'
];

const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

// Common country list — India first as the default. Not exhaustive of
// every territory on Earth, but covers where this diaspora community
// realistically lives/searches from.
const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'United Arab Emirates',
  'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'Singapore', 'Malaysia', 'New Zealand',
  'Germany', 'France', 'Netherlands', 'Ireland', 'South Africa', 'Japan', 'Other'
];

// Dial code, ISO code, display name — India default. Searchable by either
// the country name or the code itself.
const COUNTRY_CODES = [
  { code: '+91', iso: 'IN', name: 'India' },
  { code: '+1', iso: 'US', name: 'United States' },
  { code: '+1', iso: 'CA', name: 'Canada' },
  { code: '+44', iso: 'GB', name: 'United Kingdom' },
  { code: '+61', iso: 'AU', name: 'Australia' },
  { code: '+64', iso: 'NZ', name: 'New Zealand' },
  { code: '+971', iso: 'AE', name: 'United Arab Emirates' },
  { code: '+966', iso: 'SA', name: 'Saudi Arabia' },
  { code: '+974', iso: 'QA', name: 'Qatar' },
  { code: '+965', iso: 'KW', name: 'Kuwait' },
  { code: '+973', iso: 'BH', name: 'Bahrain' },
  { code: '+968', iso: 'OM', name: 'Oman' },
  { code: '+65', iso: 'SG', name: 'Singapore' },
  { code: '+60', iso: 'MY', name: 'Malaysia' },
  { code: '+49', iso: 'DE', name: 'Germany' },
  { code: '+33', iso: 'FR', name: 'France' },
  { code: '+31', iso: 'NL', name: 'Netherlands' },
  { code: '+353', iso: 'IE', name: 'Ireland' },
  { code: '+27', iso: 'ZA', name: 'South Africa' },
  { code: '+81', iso: 'JP', name: 'Japan' },
  { code: '+86', iso: 'CN', name: 'China' },
  { code: '+94', iso: 'LK', name: 'Sri Lanka' },
  { code: '+977', iso: 'NP', name: 'Nepal' },
  { code: '+880', iso: 'BD', name: 'Bangladesh' },
  { code: '+92', iso: 'PK', name: 'Pakistan' },
  { code: '+63', iso: 'PH', name: 'Philippines' },
  { code: '+66', iso: 'TH', name: 'Thailand' },
  { code: '+62', iso: 'ID', name: 'Indonesia' },
  { code: '+82', iso: 'KR', name: 'South Korea' },
  { code: '+39', iso: 'IT', name: 'Italy' },
  { code: '+34', iso: 'ES', name: 'Spain' },
  { code: '+41', iso: 'CH', name: 'Switzerland' },
  { code: '+46', iso: 'SE', name: 'Sweden' },
  { code: '+47', iso: 'NO', name: 'Norway' },
  { code: '+45', iso: 'DK', name: 'Denmark' },
  { code: '+7', iso: 'RU', name: 'Russia' },
  { code: '+20', iso: 'EG', name: 'Egypt' },
  { code: '+254', iso: 'KE', name: 'Kenya' },
  { code: '+234', iso: 'NG', name: 'Nigeria' },
  { code: '+55', iso: 'BR', name: 'Brazil' },
  { code: '+52', iso: 'MX', name: 'Mexico' }
];

function values(list) {
  return list.map((o) => (typeof o === 'string' ? o : o.value));
}

module.exports = {
  MARITAL_STATUS_OPTIONS,
  YES_NO_OPTIONS,
  RELIGION_OPTIONS,
  CASTE_OPTIONS_BY_RELIGION,
  CHILDREN_OPTIONS,
  EDUCATION_OPTIONS,
  EMPLOYED_IN_OPTIONS,
  OCCUPATION_CATEGORY_OPTIONS,
  INCOME_BAND_OPTIONS,
  FAMILY_TYPE_OPTIONS,
  FAMILY_VALUES_OPTIONS,
  FAMILY_STATUS_OPTIONS,
  EATING_HABIT_OPTIONS,
  SMOKING_HABIT_OPTIONS,
  DRINKING_HABIT_OPTIONS,
  MOTHER_TONGUE_OPTIONS,
  INDIA_STATES,
  COUNTRIES,
  COUNTRY_CODES,
  values
};
