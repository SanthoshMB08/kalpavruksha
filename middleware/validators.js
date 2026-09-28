const { body } = require('express-validator');
const {
  MARITAL_STATUS_OPTIONS, YES_NO_OPTIONS, RELIGION_OPTIONS, CASTE_OPTIONS_BY_RELIGION,
  CHILDREN_OPTIONS, EDUCATION_OPTIONS, EMPLOYED_IN_OPTIONS, OCCUPATION_CATEGORY_OPTIONS,
  INCOME_BAND_OPTIONS, FAMILY_TYPE_OPTIONS, FAMILY_VALUES_OPTIONS, FAMILY_STATUS_OPTIONS,
  EATING_HABIT_OPTIONS, SMOKING_HABIT_OPTIONS, DRINKING_HABIT_OPTIONS, MOTHER_TONGUE_OPTIONS,
  INDIA_STATES, COUNTRIES, COUNTRY_CODES, values
} = require('../utils/profileOptions');

// Letters, spaces, and a few common name punctuation marks only — no digits.
const NAME_PATTERN = /^[A-Za-z][A-Za-z\s.'-]{3,50}$/;
const MOBILE_PATTERN = /^[6-9][0-9]{9}$/;
const TEXT_WORD_PATTERN = /^[A-Za-z][A-Za-z\s.'-]{1,50}$/;
const ALL_CASTES = Object.values(CASTE_OPTIONS_BY_RELIGION).flat();
const COUNTRY_CODE_VALUES = [...new Set(COUNTRY_CODES.map((c) => c.code))];

function nameField(field, label, { optional = false } = {}) {
  let chain = body(field).trim();
  chain = optional ? chain.optional({ checkFalsy: true }) : chain.notEmpty().withMessage(`${label} is required.`);
  return chain.matches(NAME_PATTERN).withMessage(`${label} should contain letters only (no numbers or symbols).`);
}

function mobileField(field, label, { optional = false } = {}) {
  let chain = body(field).trim();
  chain = optional ? chain.optional({ checkFalsy: true }) : chain.notEmpty().withMessage(`${label} is required.`);
  return chain.matches(MOBILE_PATTERN).withMessage(`${label} must be exactly 10 digits, numbers only.`);
}

function textField(field, label, { optional = false } = {}) {
  let chain = body(field).trim();
  chain = optional ? chain.optional({ checkFalsy: true }) : chain.notEmpty().withMessage(`${label} is required.`);
  return chain.matches(TEXT_WORD_PATTERN).withMessage(`${label} should contain letters only.`);
}

const OCCUPATION_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9 ]{0,146}[A-Za-z0-9])?$/;
function occupationField(field, label, { optional = false } = {}) {
  let chain = body(field).trim();
  chain = optional ? chain.optional({ checkFalsy: true }) : chain.notEmpty().withMessage(`${label} is required.`);
  return chain.matches(OCCUPATION_PATTERN).withMessage(`${label} looks invalid.`);
}

function moneyField(field, label, { optional = false } = {}) {
  let chain = body(field);
  chain = optional ? chain.optional({ checkFalsy: true }) : chain.notEmpty().withMessage(`${label} is required.`);
  return chain.isFloat({ min: 0 }).withMessage(`${label} must be a positive number.`);
}

function intField(field, label, { optional = false, min = 0 } = {}) {
  let chain = body(field);
  chain = optional ? chain.optional({ checkFalsy: true }) : chain.notEmpty().withMessage(`${label} is required.`);
  return chain.isInt({ min }).withMessage(`${label} must be a whole number.`);
}

function genderField(field = 'gender', { optional = false } = {}) {
  let chain = body(field);
  chain = optional ? chain.optional({ checkFalsy: true }) : chain.notEmpty().withMessage('Gender is required.');
  return chain.isIn(['male', 'female']).withMessage('Gender must be Male or Female.');
}

function dobField(field = 'date_of_birth', { optional = false, minAge = 18 } = {}) {
  let chain = body(field);
  chain = optional ? chain.optional({ checkFalsy: true }) : chain.notEmpty().withMessage('Date of birth is required.');
  return chain.isISO8601().withMessage('Enter a valid date of birth.').custom((value) => {
    if (!value) return true;
    const dob = new Date(value);
    const age = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < minAge) throw new Error(`Age must be at least ${minAge} years.`);
    if (age > 50) throw new Error('Enter a valid date of birth.');
    return true;
  });
}

// A field whose value must be one of a fixed list (a <select>). Since the
// value always comes from a dropdown Home rendered from the same list,
// failing this check means tampering, not a typo — so the message can be blunt.
function inListField(field, label, allowedValues, { optional = false } = {}) {
  let chain = body(field);
  chain = optional ? chain.optional({ checkFalsy: true }) : chain.notEmpty().withMessage(`${label} is required.`);
  return chain.isIn(allowedValues).withMessage(`${label} is invalid.`);
}

// For a select+"Other" pair: the select must be a known value, and if it's
// specifically "other", the companion free-text field becomes required.
function otherTextField(otherField, selectField, otherValue, label) {
  return body(otherField)
    .if(body(selectField).equals(otherValue))
    .trim()
    .notEmpty()
    .withMessage(`Please specify ${label}.`)
    .matches(/^[A-Za-z0-9][A-Za-z0-9\s.,'&()/-]{0,98}$/)
    .withMessage(`${label} looks invalid.`);
}

// Full validator set for the admin/super-admin "add profile" form.
const profileValidators = [
  nameField('full_name', 'Full name'),
  genderField('gender'),
  inListField('marital_status', 'Marital status', values(MARITAL_STATUS_OPTIONS)),
  inListField('willing_other_caste', 'Willing to marry other caste', values(YES_NO_OPTIONS)),

  inListField('phone_country_code', 'Country code', COUNTRY_CODE_VALUES, { optional: true }),
  mobileField('phone_number', 'Phone number'),

  inListField('religion', 'Religion', values(RELIGION_OPTIONS)),
  otherTextField('religion_other', 'religion', 'other', 'your religion'),
  // Caste is only collected for hindu/muslim/christian — anything else must
  // leave it blank (enforced client-side by disabling the field, and here by
  // just not requiring it — an unexpected value still has to be a real one).
  body('caste').optional({ checkFalsy: true }).trim().isIn(ALL_CASTES).withMessage('Caste is invalid.'),
  otherTextField('caste_other', 'caste', 'Other', 'your caste'),
  textField('subcaste', 'Sub-caste', { optional: true }),

  inListField('has_children', 'Children', values(CHILDREN_OPTIONS), { optional: true }),
  intField('number_of_children', 'Number of children', { optional: true }),

  dobField('date_of_birth'),
  textField('birth_place', 'Birth place', { optional: true }),

  body('education').optional({ checkFalsy: true }).trim().isIn(EDUCATION_OPTIONS).withMessage('Education is invalid.'),
  inListField('employed_in', 'Employed In', values(EMPLOYED_IN_OPTIONS)),
  otherTextField('employed_in_other', 'employed_in', 'other', 'where you are employed'),
  body('occupation').optional({ checkFalsy: true }).trim().isIn(OCCUPATION_CATEGORY_OPTIONS).withMessage('Occupation is invalid.'),
  otherTextField('occupation_other', 'occupation', 'Other', 'your occupation'),
  body('company_name').optional({ checkFalsy: true }).trim().isLength({ max: 150 }).withMessage('Company name looks too long.'),
  body('designation').optional({ checkFalsy: true }).trim().isLength({ max: 150 }).withMessage('Designation looks too long.'),
  body('annual_income_band').trim().isIn(INCOME_BAND_OPTIONS).withMessage('Annual income is required.'),

  body('rashi').trim().notEmpty().withMessage('Rashi is required.'),
  body('nakshatra').trim().notEmpty().withMessage('Nakshatra is required.'),
  inListField('has_dosh', 'Have Dosh', values(YES_NO_OPTIONS), { optional: true }),

  body('family_type').optional({ checkFalsy: true }).trim().isIn(FAMILY_TYPE_OPTIONS).withMessage('Family type is invalid.'),
  body('family_values').optional({ checkFalsy: true }).trim().isIn(FAMILY_VALUES_OPTIONS).withMessage('Family values is invalid.'),
  body('family_status').optional({ checkFalsy: true }).trim().isIn(FAMILY_STATUS_OPTIONS).withMessage('Family status is invalid.'),
  nameField('father_name', "Father's name"),
  occupationField('father_occupation', "Father's occupation"),
  nameField('mother_name', "Mother's name"),
  occupationField('mother_occupation', "Mother's occupation"),
  intField('num_brothers', 'Number of brothers', { optional: true }),
  intField('married_brothers', 'Married brothers', { optional: true }),
  intField('num_sisters', 'Number of sisters', { optional: true }),
  intField('married_sisters', 'Married sisters', { optional: true }),

  body('country').trim().isIn(COUNTRIES).withMessage('Country is invalid.'),
  body('state').optional({ checkFalsy: true }).trim().isIn(INDIA_STATES).withMessage('State is invalid.'),
  textField('city', 'City'),
  body('address').trim().notEmpty().withMessage('Address is required.'),

  body('eating_habit').optional({ checkFalsy: true }).trim().isIn(EATING_HABIT_OPTIONS).withMessage('Eating habit is invalid.'),
  body('smoking_habit').optional({ checkFalsy: true }).trim().isIn(SMOKING_HABIT_OPTIONS).withMessage('Smoking habit is invalid.'),
  body('drinking_habit').optional({ checkFalsy: true }).trim().isIn(DRINKING_HABIT_OPTIONS).withMessage('Drinking habit is invalid.'),
  body('mother_tongue').optional({ checkFalsy: true }).trim().isIn(MOTHER_TONGUE_OPTIONS).withMessage('Mother tongue is invalid.'),
  otherTextField('mother_tongue_other', 'mother_tongue', 'Other', 'your mother tongue'),

  body('assets').trim().notEmpty().withMessage('Assets is required.')
];

// Looser set for editing — every field optional so a partial edit still validates,
// but whatever IS submitted must still pass the same format rules.
const profileEditValidators = [
  nameField('full_name', 'Full name', { optional: true }),
  inListField('marital_status', 'Marital status', values(MARITAL_STATUS_OPTIONS), { optional: true }),
  inListField('willing_other_caste', 'Willing to marry other caste', values(YES_NO_OPTIONS), { optional: true }),
  mobileField('phone_number', 'Phone number', { optional: true }),
  inListField('phone_country_code', 'Country code', COUNTRY_CODE_VALUES, { optional: true }),
  body('religion').optional({ checkFalsy: true }).trim().isIn(values(RELIGION_OPTIONS)).withMessage('Religion is invalid.'),
  otherTextField('religion_other', 'religion', 'other', 'your religion'),
  body('caste').optional({ checkFalsy: true }).trim().isIn(ALL_CASTES).withMessage('Caste is invalid.'),
  otherTextField('caste_other', 'caste', 'Other', 'your caste'),
  textField('subcaste', 'Sub-caste', { optional: true }),
  inListField('has_children', 'Children', values(CHILDREN_OPTIONS), { optional: true }),
  intField('number_of_children', 'Number of children', { optional: true }),
  dobField('date_of_birth', { optional: true }),
  textField('birth_place', 'Birth place', { optional: true }),
  body('education').optional({ checkFalsy: true }).trim().isIn(EDUCATION_OPTIONS).withMessage('Education is invalid.'),
  body('employed_in').optional({ checkFalsy: true }).trim().isIn(values(EMPLOYED_IN_OPTIONS)).withMessage('Employed In is invalid.'),
  otherTextField('employed_in_other', 'employed_in', 'other', 'where you are employed'),
  body('occupation').optional({ checkFalsy: true }).trim().isIn(OCCUPATION_CATEGORY_OPTIONS).withMessage('Occupation is invalid.'),
  otherTextField('occupation_other', 'occupation', 'Other', 'your occupation'),
  body('annual_income_band').optional({ checkFalsy: true }).trim().isIn(INCOME_BAND_OPTIONS).withMessage('Annual income is invalid.'),
  body('has_dosh').optional({ checkFalsy: true }).trim().isIn(values(YES_NO_OPTIONS)).withMessage('Have Dosh is invalid.'),
  body('family_type').optional({ checkFalsy: true }).trim().isIn(FAMILY_TYPE_OPTIONS).withMessage('Family type is invalid.'),
  body('family_values').optional({ checkFalsy: true }).trim().isIn(FAMILY_VALUES_OPTIONS).withMessage('Family values is invalid.'),
  body('family_status').optional({ checkFalsy: true }).trim().isIn(FAMILY_STATUS_OPTIONS).withMessage('Family status is invalid.'),
  nameField('father_name', "Father's name", { optional: true }),
  nameField('mother_name', "Mother's name", { optional: true }),
  intField('num_brothers', 'Number of brothers', { optional: true }),
  intField('married_brothers', 'Married brothers', { optional: true }),
  intField('num_sisters', 'Number of sisters', { optional: true }),
  intField('married_sisters', 'Married sisters', { optional: true }),
  body('country').optional({ checkFalsy: true }).trim().isIn(COUNTRIES).withMessage('Country is invalid.'),
  body('state').optional({ checkFalsy: true }).trim().isIn(INDIA_STATES).withMessage('State is invalid.'),
  textField('city', 'City', { optional: true }),
  body('eating_habit').optional({ checkFalsy: true }).trim().isIn(EATING_HABIT_OPTIONS).withMessage('Eating habit is invalid.'),
  body('smoking_habit').optional({ checkFalsy: true }).trim().isIn(SMOKING_HABIT_OPTIONS).withMessage('Smoking habit is invalid.'),
  body('drinking_habit').optional({ checkFalsy: true }).trim().isIn(DRINKING_HABIT_OPTIONS).withMessage('Drinking habit is invalid.'),
  body('mother_tongue').optional({ checkFalsy: true }).trim().isIn(MOTHER_TONGUE_OPTIONS).withMessage('Mother tongue is invalid.'),
  otherTextField('mother_tongue_other', 'mother_tongue', 'Other', 'your mother tongue')
];

// User creation (admin direct-create, super-admin sub-admin create, self-register).
const userCreateValidators = [
  nameField('name', 'Name'),
  mobileField('mobile_number', 'Mobile number'),
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters.')
];

const memberCreateValidators = [...userCreateValidators, genderField('gender')];

const passwordChangeValidators = [
  body('password')
    .isLength({ min: 8 })
    .matches(/[A-Z]/)
    .matches(/[a-z]/)
    .matches(/[0-9]/)
    .withMessage('Password must be 8+ characters with uppercase, lowercase, and a number.')
];

module.exports = {
  nameField,
  mobileField,
  textField,
  moneyField,
  intField,
  genderField,
  dobField,
  inListField,
  otherTextField,
  profileValidators,
  profileEditValidators,
  userCreateValidators,
  memberCreateValidators,
  passwordChangeValidators
};
