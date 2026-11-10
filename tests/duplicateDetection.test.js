const path = require('path');
const request = require('supertest');
const app = require('../app');
const { pool, applySchema, resetTables, closePool } = require('./helpers/db');
const { getCsrfToken, loginAs } = require('./helpers/auth');

const TEST_IMAGE = path.join(__dirname, '..', 'public', 'assets', 'image_8ead9b73.png');

beforeAll(async () => {
  await applySchema();
});

beforeEach(async () => {
  await resetTables();
});

afterAll(async () => {
  await closePool();
});

async function loginAsSuperAdmin() {
  const agent = request.agent(app);
  await loginAs(agent, '/portal/super-secure-login', process.env.SUPERADMIN_USERNAME, process.env.SUPERADMIN_PASSWORD);
  return agent;
}

const baseProfileFields = {
  gender: 'female',
  religion: 'hindu',
  marital_status: 'never_married',
  willing_other_caste: 'no',
  employed_in: 'private',
  annual_income_band: 'Prefer Not to Say',
  country: 'India',
  password: 'ProfilePass123',
  confirm_password: 'ProfilePass123',
  caste: 'Lingayat',
  subcaste: 'Test',
  date_of_birth: '1998-01-01',
  mother_tongue: 'Kannada',
  occupation: 'Engineering',
  annual_salary: '800000',
  father_name: 'John',
  father_occupation: 'Business',
  father_salary: '1000000',
  mother_name: 'Mary',
  mother_occupation: 'Teacher',
  mother_salary: '500000',
  address: '123 Street',
  city: 'Bengaluru',
  state: 'Karnataka',
  assets: 'Flat',
  rashi: 'Simha',
  nakshatra: 'Magha'
};

function submitProfile(agent, token, overrides) {
  const req = agent.post('/portal/admin-dashboard/profiles').field('_csrf', token);
  const fields = { ...baseProfileFields, ...overrides };
  Object.entries(fields).forEach(([key, value]) => req.field(key, value));
  return req.attach('profile_image', TEST_IMAGE);
}

describe('Duplicate profile detection', () => {
  it('hard-blocks a new profile with a phone number that already exists', async () => {
    const superAgent = await loginAsSuperAdmin();
    const token1 = await getCsrfToken(superAgent, '/portal/admin-dashboard/profiles/new');
    await submitProfile(superAgent, token1, { full_name: 'First Person', phone_number: '9111111111' });

    const token2 = await getCsrfToken(superAgent, '/portal/admin-dashboard/profiles/new');
    const res = await submitProfile(superAgent, token2, { full_name: 'Second Person', phone_number: '9111111111' });

    expect(res.text).toMatch(/phone number already exists/i);
    const result = await pool.query('SELECT COUNT(*) AS count FROM profiles WHERE phone_number = ?', ['9111111111']);
    expect(Number(result[0][0].count)).toBe(1); // only the first one was created
  });

  it('warns (but does not block) on matching name + date of birth, and allows override', async () => {
    const superAgent = await loginAsSuperAdmin();
    const token1 = await getCsrfToken(superAgent, '/portal/admin-dashboard/profiles/new');
    await submitProfile(superAgent, token1, {
      full_name: 'Coincidental Name',
      date_of_birth: '1997-05-05',
      phone_number: '9222222222'
    });

    // Same name + DOB, different phone — should warn, not create yet
    const token2 = await getCsrfToken(superAgent, '/portal/admin-dashboard/profiles/new');
    const warnRes = await submitProfile(superAgent, token2, {
      full_name: 'Coincidental Name',
      date_of_birth: '1997-05-05',
      phone_number: '9333333333'
    });
    expect(warnRes.text).toMatch(/same name and date of birth/i);
    let result = await pool.query('SELECT COUNT(*) AS count FROM profiles WHERE phone_number = ?', ['9333333333']);
    expect(Number(result[0][0].count)).toBe(0);

    // Resubmitting with confirm_duplicate=1 should go through
    const token3 = await getCsrfToken(superAgent, '/portal/admin-dashboard/profiles/new');
    await submitProfile(superAgent, token3, {
      full_name: 'Coincidental Name',
      date_of_birth: '1997-05-05',
      phone_number: '9333333333',
      confirm_duplicate: '1'
    });
    result = await pool.query('SELECT COUNT(*) AS count FROM profiles WHERE phone_number = ?', ['9333333333']);
    expect(Number(result[0][0].count)).toBe(1);
  });

  it('does not warn when name and DOB are both different', async () => {
    const superAgent = await loginAsSuperAdmin();
    const token1 = await getCsrfToken(superAgent, '/portal/admin-dashboard/profiles/new');
    await submitProfile(superAgent, token1, { full_name: 'Unique Person One', phone_number: '9444444444' });

    const token2 = await getCsrfToken(superAgent, '/portal/admin-dashboard/profiles/new');
    const res = await submitProfile(superAgent, token2, {
      full_name: 'Unique Person Two',
      date_of_birth: '2001-03-03',
      phone_number: '9555555555'
    });
    expect(res.text).not.toMatch(/already exists/i);
    const result = await pool.query('SELECT COUNT(*) AS count FROM profiles WHERE phone_number = ?', ['9555555555']);
    expect(Number(result[0][0].count)).toBe(1);
  });
});
