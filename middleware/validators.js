const { body } = require('express-validator');

// Letters, spaces, and a few common name punctuation marks only — no digits.
const NAME_PATTERN = /^[A-Za-z][A-Za-z\s.'-]{3,50}$/;
const MOBILE_PATTERN = /^[6-9][0-9]{9}$/;
const TEXT_WORD_PATTERN = /^[A-Za-z][A-Za-z\s.'-]{1,50}$/;

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


const OCCUPATION_PATTERN = /^[A-Za-z0-9]{1,148}$/;
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

// Full validator set for the admin/super-admin "add profile" form.
const profileValidators = [
  nameField('full_name', 'Full name'),
  genderField('gender'),
  textField('religion', 'Religion'),
  textField('caste', 'Caste'),
  textField('subcaste', 'Sub-caste'),
  textField('language', 'Language'),
  dobField('date_of_birth'),
  occupationField('occupation', 'Occupation'),
  moneyField('annual_salary', 'Annual salary'),
  mobileField('phone_number', 'Phone number'),
  body('address').trim().notEmpty().withMessage('Address is required.'),
  textField('city', 'City'),
  textField('state', 'State'),
  nameField('father_name', "Father's name"),
  occupationField('father_occupation', "Father's occupation"),
  moneyField('father_salary', "Father's salary"),
  nameField('mother_name', "Mother's name"),
  occupationField('mother_occupation', "Mother's occupation"),
  moneyField('mother_salary', "Mother's salary"),
  intField('total_siblings', 'Total siblings', { optional: true }),
  intField('male_siblings', 'Male siblings', { optional: true }),
  intField('female_siblings', 'Female siblings', { optional: true }),
  body('assets').trim().notEmpty().withMessage('Assets is required.'),
  body('rashi').trim().notEmpty().withMessage('Rashi is required.'),
  body('nakshatra').trim().notEmpty().withMessage('Nakshatra is required.')
];

// Looser set for editing — every field optional so a partial edit still validates,
// but whatever IS submitted must still pass the same format rules.
const profileEditValidators = [
  nameField('full_name', 'Full name', { optional: true }),
  textField('religion', 'Religion', { optional: true }),
  textField('caste', 'Caste', { optional: true }),
  textField('subcaste', 'Sub-caste', { optional: true }),
  textField('language', 'Language', { optional: true }),
  dobField('date_of_birth', { optional: true }),
  moneyField('annual_salary', 'Annual salary', { optional: true }),
  mobileField('phone_number', 'Phone number', { optional: true }),
  textField('city', 'City', { optional: true }),
  textField('state', 'State', { optional: true }),
  nameField('father_name', "Father's name", { optional: true }),
  moneyField('father_salary', "Father's salary", { optional: true }),
  nameField('mother_name', "Mother's name", { optional: true }),
  moneyField('mother_salary', "Mother's salary", { optional: true }),
  intField('total_siblings', 'Total siblings', { optional: true }),
  intField('male_siblings', 'Male siblings', { optional: true }),
  intField('female_siblings', 'Female siblings', { optional: true })
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
  profileValidators,
  profileEditValidators,
  userCreateValidators,
  memberCreateValidators,
  passwordChangeValidators
};
