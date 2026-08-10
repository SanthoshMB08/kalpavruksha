const express = require('express');
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

describe('Error handler flash fallback', () => {
  it('handles thrown errors without crashing when flash is unavailable', async () => {
    const flashTestApp = express();
    flashTestApp.use((req, res, next) => {
      req.flash = app.buildFlashHandler(req);
      next();
    });
    flashTestApp.get('/__test-flash-fallback', (req, res, next) => {
      next(new Error('boom'));
    });
    flashTestApp.use((err, req, res, next) => {
      const flash = app.buildFlashHandler(req);
      flash('error', err.message || 'Something went wrong.');
      res.status(204).end();
    });

    const res = await request(flashTestApp).get('/__test-flash-fallback');
    expect(res.status).toBe(204);
  });
});

describe('CSRF protection', () => {
  it('rejects a login POST with no CSRF token', async () => {
    await createUser(pool, { username: 'csrfvictim', password: 'Passw0rd1' });
    const agent = request.agent(app);
    await agent.get('/login'); // establishes the session/CSRF cookie, but we deliberately don't use the token
    const res = await agent.post('/login').type('form').send({ username: 'csrfvictim', password: 'Passw0rd1' });
    // CSRF failures redirect back with a flash error rather than logging in
    expect(res.status).toBe(302);
    expect(res.headers.location).not.toMatch(/dashboard/);
  });

  it('accepts a login POST with a valid CSRF token', async () => {
    await createUser(pool, { username: 'csrfvalid', password: 'Passw0rd1' });
    const agent = request.agent(app);
    const res = await loginAs(agent, '/login', 'csrfvalid', 'Passw0rd1');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });
});

describe('Member registration', () => {
  it('registers a new member and lands them on pending-approval', async () => {
    const agent = request.agent(app);
    const token = await getCsrfToken(agent, '/register');
    const res = await agent.post('/register').type('form').send({
      name: 'New Member',
      mobile_number: '7000000123',
      gender: 'male',
      username: 'newmember1',
      password: 'Passw0rd1',
      terms: 'on',
      privacy: 'on',
      _csrf: token
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/pending-approval');
  });

  it('rejects registration without accepting terms/privacy', async () => {
    const agent = request.agent(app);
    const token = await getCsrfToken(agent, '/register');
    const res = await agent.post('/register').type('form').send({
      name: 'No Terms',
      mobile_number: '7000000124',
      gender: 'male',
      username: 'noterms1',
      password: 'Passw0rd1',
      _csrf: token
    });
    expect(res.text).toMatch(/Terms.*Conditions/);
  });
});

describe('Member login', () => {
  it('logs in an approved member and redirects to the dashboard', async () => {
    await createUser(pool, { username: 'approveduser', password: 'Passw0rd1', status: 'approved' });
    const agent = request.agent(app);
    const res = await loginAs(agent, '/login', 'approveduser', 'Passw0rd1');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  it('redirects a pending member to pending-approval instead of the dashboard', async () => {
    await createUser(pool, { username: 'pendinguser', password: 'Passw0rd1', status: 'pending' });
    const agent = request.agent(app);
    const res = await loginAs(agent, '/login', 'pendinguser', 'Passw0rd1');
    expect(res.headers.location).toBe('/pending-approval');
  });

  it('rejects a wrong password with a generic error (no user enumeration)', async () => {
    await createUser(pool, { username: 'wrongpassuser', password: 'Passw0rd1' });
    const agent = request.agent(app);
    const token = await getCsrfToken(agent, '/login');
    const res = await agent.post('/login').type('form').send({ username: 'wrongpassuser', password: 'nope', _csrf: token });
    expect(res.text).toMatch(/Invalid username or password/);
  });
});

describe('Account lockout (user + admin only, Super Admin exempt)', () => {
  it('locks a member account after 5 failed attempts, and even the correct password is then rejected', async () => {
    await createUser(pool, { username: 'lockoutmember', password: 'Passw0rd1' });
    const agent = request.agent(app);

    let lastText;
    for (let i = 0; i < 5; i++) {
      const token = await getCsrfToken(agent, '/login');
      const res = await agent.post('/login').type('form').send({ username: 'lockoutmember', password: 'wrong', _csrf: token });
      lastText = res.text;
    }
    expect(lastText).toMatch(/now locked/i);

    const token = await getCsrfToken(agent, '/login');
    const res = await agent.post('/login').type('form').send({ username: 'lockoutmember', password: 'Passw0rd1', _csrf: token });
    expect(res.text).toMatch(/temporarily locked/i);
    expect(res.status).toBe(200); // re-rendered login page, not a redirect to /dashboard
  });

  it('never locks Super Admin, no matter how many failed attempts', async () => {
    const superAgent = request.agent(app);
    for (let i = 0; i < 7; i++) {
      const token = await getCsrfToken(superAgent, '/portal/super-secure-login');
      await superAgent.post('/portal/super-secure-login').type('form').send({ username: 'superadmin', password: 'wrong', _csrf: token });
    }
    // Correct password still works immediately after — proves no lockout was applied
    const token = await getCsrfToken(superAgent, '/portal/super-secure-login');
    const res = await superAgent
      .post('/portal/super-secure-login')
      .type('form')
      .send({ username: 'superadmin', password: process.env.SUPERADMIN_PASSWORD, _csrf: token });
    expect(res.headers.location).toBe('/portal/super-secure-dashboard');
  });

  it('lets a Super Admin unlock a locked member account immediately', async () => {
    const member = await createUser(pool, { username: 'unlockme', password: 'Passw0rd1' });
    const memberAgent = request.agent(app);
    for (let i = 0; i < 5; i++) {
      const token = await getCsrfToken(memberAgent, '/login');
      await memberAgent.post('/login').type('form').send({ username: 'unlockme', password: 'wrong', _csrf: token });
    }

    const superAgent = request.agent(app);
    await loginAs(superAgent, '/portal/super-secure-login', 'superadmin', process.env.SUPERADMIN_PASSWORD);
    const token = await getCsrfToken(superAgent, '/portal/admin-dashboard/users');
    await superAgent.post(`/portal/admin-dashboard/users/${member.id}/unlock`).type('form').send({ _csrf: token });

    const result = await pool.query('SELECT locked_until, failed_login_attempts FROM users WHERE id = $1', [member.id]);
    expect(result.rows[0].locked_until).toBeNull();
    expect(result.rows[0].failed_login_attempts).toBe(0);

    const retryAgent = request.agent(app);
    const res = await loginAs(retryAgent, '/login', 'unlockme', 'Passw0rd1');
    expect(res.headers.location).toBe('/dashboard');
  });
});

describe('Rate limiting', () => {
  it('returns 429 after 10 login attempts for the same IP+username within the window', async () => {
    await createUser(pool, { username: 'ratelimited', password: 'Passw0rd1' });
    const agent = request.agent(app);
    let lastStatus;
    for (let i = 0; i < 11; i++) {
      const token = await getCsrfToken(agent, '/login');
      const res = await agent.post('/login').type('form').send({ username: 'ratelimited', password: 'wrong', _csrf: token });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
