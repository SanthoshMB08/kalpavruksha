const request = require('supertest');
const app = require('../app');
const { pool: appPool } = require('../config/db');
const { pool, applySchema, resetTables, closePool } = require('./helpers/db');
const { loginAs, createUser } = require('./helpers/auth');

beforeAll(async () => {
  await applySchema();
});

beforeEach(async () => {
  await resetTables();
});

afterAll(async () => {
  await closePool();
  await appPool.end();
});

async function loginAsSuperAdmin() {
  const agent = request.agent(app);
  await loginAs(agent, '/portal/super-secure-login', process.env.SUPERADMIN_USERNAME, process.env.SUPERADMIN_PASSWORD);
  return agent;
}

async function seedApprovedMembers(count) {
  for (let i = 0; i < count; i++) {
    await createUser(pool, { username: `pagmember${i}`, mobile_number: `61${String(i).padStart(8, '0')}`, status: 'approved' });
  }
}

async function seedPendingUsers(count) {
  for (let i = 0; i < count; i++) {
    await createUser(pool, { username: `pagpending${i}`, mobile_number: `62${String(i).padStart(8, '0')}`, status: 'pending' });
  }
}

async function seedMaleProfiles(count) {
  for (let i = 0; i < count; i++) {
    await pool.query(
      `INSERT INTO profiles (
        full_name, gender, image_name, religion, caste, subcaste, date_of_birth, language,
        occupation, annual_salary, father_name, father_occupation, father_salary,
        mother_name, mother_occupation, mother_salary, phone_number, address, city, state,
        assets, rashi, nakshatra
      ) VALUES ($1,'male','x.png','Hindu','Test','Test','1995-01-01','Kannada','Eng',500000,
        'F','B',100000,'M','T',100000,$2,'addr','Blr','KA','flat','Simha','Magha')`,
      [`Search Target ${i}`, `63${String(i).padStart(8, '0')}`]
    );
  }
}

describe('Pagination', () => {
  it('splits the Active Members list into pages of 24, with an accurate total', async () => {
    await seedApprovedMembers(30);
    const superAgent = await loginAsSuperAdmin();

    const page1 = await superAgent.get('/portal/admin-dashboard/users');
    expect(page1.text).toMatch(/Page 1 of 2/);
    expect((page1.text.match(/data-label="Name"/g) || []).length).toBeGreaterThanOrEqual(24);

    const page2 = await superAgent.get('/portal/admin-dashboard/users?page=2');
    expect(page2.text).toMatch(/Page 2 of 2/);
  });

  it('paginates Pending Approvals independently from Active Members on the same page', async () => {
    await seedApprovedMembers(30);
    await seedPendingUsers(30);
    const superAgent = await loginAsSuperAdmin();

    const res = await superAgent.get('/portal/admin-dashboard/users?pendingPage=2');
    expect(res.text).toMatch(/pendingPage=1/);
    const totalNameCells = (res.text.match(/data-label="Name"/g) || []).length;
    // page 2 of pending (6 rows) + page 1 of members (24 rows) = 30
    expect(totalNameCells).toBe(30);
  });

  it('reports an accurate total count on the member-facing search page even when results span multiple pages', async () => {
    await seedMaleProfiles(30);
    await createUser(pool, { username: 'searchermember', password: 'Passw0rd1', gender: 'female', status: 'approved' });

    const agent = request.agent(app);
    await loginAs(agent, '/login', 'searchermember', 'Passw0rd1');

    const res = await agent.get('/dashboard');
    expect(res.text).toMatch(/30 profile\(s\) found/);
    expect(res.text).toMatch(/Page 1 of 2/);
  });

  it('excludes soft-deleted profiles from both the count and the results', async () => {
    await seedMaleProfiles(5);
    await pool.query("UPDATE profiles SET deleted_at = NOW() WHERE full_name = 'Search Target 0'");
    await createUser(pool, { username: 'searchermember2', password: 'Passw0rd1', gender: 'female', status: 'approved' });

    const agent = request.agent(app);
    await loginAs(agent, '/login', 'searchermember2', 'Passw0rd1');
    const res = await agent.get('/dashboard');

    expect(res.text).toMatch(/4 profile\(s\) found/);
    expect(res.text).not.toMatch(/Search Target 0/);
  });
});
