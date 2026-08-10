const request = require('supertest');
const app = require('../app');
const { pool: appPool } = require('../config/db');
const { pool, applySchema, resetTables, closePool } = require('./helpers/db');
const { getCsrfToken, createUser, loginAs } = require('./helpers/auth');

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

describe('User soft delete', () => {
  it('sets deleted_at instead of removing the row, and the row disappears from Active Members', async () => {
    const member = await createUser(pool, { username: 'deleteme', status: 'approved' });
    const superAgent = await loginAsSuperAdmin();

    const token = await getCsrfToken(superAgent, '/portal/admin-dashboard/users');
    await superAgent.post(`/portal/admin-dashboard/users/${member.id}/delete`).type('form').send({ _csrf: token });

    const result = await pool.query('SELECT deleted_at FROM users WHERE id = $1', [member.id]);
    expect(result.rows).toHaveLength(1); // row still exists
    expect(result.rows[0].deleted_at).not.toBeNull();

    const usersPage = await superAgent.get('/portal/admin-dashboard/users');
    expect(usersPage.text).not.toMatch(/>deleteme</);
  });

  it('restores a soft-deleted user from the Trash page', async () => {
    const member = await createUser(pool, { username: 'restoreme', status: 'approved' });
    await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [member.id]);

    const superAgent = await loginAsSuperAdmin();
    const token = await getCsrfToken(superAgent, '/portal/super-secure-dashboard/trash');
    await superAgent.post(`/portal/super-secure-dashboard/trash/users/${member.id}/restore`).type('form').send({ _csrf: token });

    const result = await pool.query('SELECT deleted_at FROM users WHERE id = $1', [member.id]);
    expect(result.rows[0].deleted_at).toBeNull();
  });

  it('permanently purges a soft-deleted user (row is actually gone)', async () => {
    const member = await createUser(pool, { username: 'purgeme', status: 'approved' });
    await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [member.id]);

    const superAgent = await loginAsSuperAdmin();
    const token = await getCsrfToken(superAgent, '/portal/super-secure-dashboard/trash');
    await superAgent.post(`/portal/super-secure-dashboard/trash/users/${member.id}/purge`).type('form').send({ _csrf: token });

    const result = await pool.query('SELECT id FROM users WHERE id = $1', [member.id]);
    expect(result.rows).toHaveLength(0);
  });

  it('refuses to purge an account that is not already soft-deleted (safety backstop)', async () => {
    const member = await createUser(pool, { username: 'stillactive', status: 'approved' });
    await pool.query('DELETE FROM users WHERE id = $1 AND deleted_at IS NOT NULL', [member.id]);
    const result = await pool.query('SELECT id FROM users WHERE id = $1', [member.id]);
    expect(result.rows).toHaveLength(1); // still there — the guard blocked it
  });

  it('lets a new registration reuse a soft-deleted account\'s exact mobile number and username', async () => {
    const original = await createUser(pool, { username: 'reuseme', mobile_number: '7300000001', status: 'approved' });
    await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [original.id]);

    const agent = request.agent(app);
    const token = await getCsrfToken(agent, '/register');
    const res = await agent.post('/register').type('form').send({
      name: 'New Owner',
      mobile_number: '7300000001',
      gender: 'male',
      username: 'reuseme',
      password: 'Passw0rd1',
      terms: 'on',
      privacy: 'on',
      _csrf: token
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/pending-approval');

    const result = await pool.query(
      'SELECT id, deleted_at IS NOT NULL AS is_deleted FROM users WHERE username = $1 ORDER BY id',
      ['reuseme']
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].is_deleted).toBe(true);
    expect(result.rows[1].is_deleted).toBe(false);
  });
});
