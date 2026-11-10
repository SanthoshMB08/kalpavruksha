const request = require('supertest');
const bcrypt = require('bcrypt');
const express = require('express');
const { body } = require('express-validator');

jest.mock('../config/db', () => ({ query: jest.fn(async () => [[]]), pool: { query: jest.fn(async () => ({ rows: [] })) } }));
jest.mock('express-mysql-session', () => () => require('express-session').MemoryStore);
jest.mock('../models/User', () => ({
  findByUsername: jest.fn(), findById: jest.fn(), findMemberById: jest.fn(), updateStatus: jest.fn(),
  clearFailedLogins: jest.fn(), registerFailedLogin: jest.fn(async () => ({ locked: false, remaining: 4 })),
  listPending: jest.fn(async () => ({ rows: [], page: 1, perPage: 24, total: 0, totalPages: 1 })),
  listApprovedUsers: jest.fn(async () => ({ rows: [], page: 1, perPage: 24, total: 0, totalPages: 1 }))
}));
jest.mock('../utils/storage', () => ({
  uploadFile: jest.fn(async () => 'safe-file.png'),
  uploadFiles: jest.fn(async (_bucket, files) => files.map(() => 'safe-file.png')),
  deleteFile: jest.fn(async () => {}),
  getPublicUrl: jest.fn(() => '/uploads/profiles/safe.png')
}));

const app = require('../app');
const User = require('../models/User');
const storage = require('../utils/storage');
const { safeRedirect, validPassword } = require('../utils/security');
const { parseProfileAssets, uploadProfileAssets, parseAdImage, uploadAdImage } = require('../middleware/upload');
const { userCreateValidators } = require('../middleware/validators');
const { validationResult } = require('express-validator');
const { getCsrfToken, extractCsrfToken } = require('./helpers/auth');

let user;
let sequence = 0;
beforeEach(async () => {
  jest.clearAllMocks();
  storage.uploadFiles.mockImplementation(async (bucket, files) => {
    const filenames = [];
    try {
      for (const file of files) filenames.push(await storage.uploadFile(bucket, file));
      return filenames;
    } catch (error) {
      await Promise.allSettled(filenames.map(filename => storage.deleteFile(bucket, filename)));
      throw error;
    }
  });
  user = { id: '42', name: 'Test Member', username: 'security_' + (++sequence), role: 'user', status: 'approved', gender: 'male',
    password: await bcrypt.hash('Passw0rd123', 4), deleted_at: null, failed_login_attempts: 0 };
  User.findByUsername.mockImplementation(async () => user);
  User.findById.mockImplementation(async () => user);
  User.findMemberById.mockImplementation(async () => user);
});

async function login(agent, route = '/login') {
  const csrf = await getCsrfToken(agent, route);
  return agent.post(route).type('form').send({ username: user.username, password: 'Passw0rd123', _csrf: csrf });
}

describe('Session and authorization protections', () => {
  it('re-renders direct user creation validation errors without a server error', async () => {
    user.role = 'admin';
    const agent = request.agent(app);
    await login(agent, '/portal/admin-login');
    const usersPage = await agent.get('/portal/admin-dashboard/users');
    const csrf = extractCsrfToken(usersPage.text);
    expect(usersPage.text).toContain('data-password-strength-input');
    expect(usersPage.text).toContain('data-password-rule="bytes"');
    expect(usersPage.text).toContain('No more than 72 UTF-8 bytes');
    const response = await agent.post('/portal/admin-dashboard/users/create-direct')
      .type('form')
      .send({ _csrf: csrf, name: '', mobile_number: '', username: '', password: '', gender: '' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Name is required.');
  });

  it('does not serve legacy private-document folders from public static storage', async () => {
    expect((await request(app).get('/uploads/biodata/legacy.pdf')).status).toBe(404);
    expect((await request(app).get('/uploads/jathaka/legacy.pdf')).status).toBe(404);
  });

  it('requires admin authorization to serve private document routes', async () => {
    const response = await request(app).get('/portal/admin-dashboard/private-files/biodata/legacy.pdf');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/portal/admin-login');
  });

  it.each([
    ['user', '/login'], ['admin', '/portal/admin-login'], ['superadmin', '/portal/super-secure-login']
  ])('rotates session IDs for %s login and invalidates the anonymous ID', async (role, route) => {
    user.role = role;
    const agent = request.agent(app);
    const initial = await agent.get(route);
    const oldCookie = initial.headers['set-cookie'].find(value => value.startsWith('kalpavruksha_sid=')).split(';')[0];
    const token = initial.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const response = await agent.post(route).type('form').send({ username: 'member', password: 'Passw0rd123', _csrf: token });
    expect(response.status).toBe(302);
    const newCookie = response.headers['set-cookie'].find(value => value.startsWith('kalpavruksha_sid=')).split(';')[0];
    expect(newCookie).not.toBe(oldCookie);
    expect((await request(app).get('/my-profile').set('Cookie', oldCookie)).headers.location).toBe('/login');
  });

  it.each(['deleted', 'rejected', 'password reset'])('revokes an existing session after account is %s', async change => {
    const agent = request.agent(app);
    await login(agent);
    if (change === 'deleted') user.deleted_at = new Date();
    if (change === 'rejected') user.status = 'rejected';
    if (change === 'password reset') user.password = await bcrypt.hash('NewPassw0rd1', 4);
    const response = await agent.get('/my-profile');
    expect(response.headers.location).toBe('/login');
  });

  it('applies staff demotion to an existing session', async () => {
    user.role = 'superadmin';
    const agent = request.agent(app);
    await login(agent, '/portal/super-secure-login');
    user.role = 'user';
    expect((await agent.get('/portal/super-secure-dashboard')).headers.location).toBe('/portal/super-secure-login');
  });

  it('fails closed when the account lookup fails', async () => {
    const agent = request.agent(app);
    await login(agent);
    User.findById.mockRejectedValueOnce(new Error('private database detail'));
    const response = await agent.get('/my-profile');
    expect(response.status).toBe(500);
    expect(response.text).not.toContain('private database detail');
  });

  it('requires CSRF-protected POST logout and clears cookies', async () => {
    const agent = request.agent(app);
    await login(agent);
    expect((await agent.get('/logout')).status).toBe(404);
    expect((await agent.get('/my-profile')).status).toBe(200);
    expect((await agent.post('/logout')).status).toBe(403);
    const csrf = await getCsrfToken(agent, '/my-profile');
    const response = await agent.post('/logout').type('form').send({ _csrf: csrf });
    expect(response.status).toBe(302);
    expect(response.headers['set-cookie'].some(cookie => cookie.startsWith('kalpavruksha_sid=;'))).toBe(true);
    expect((await agent.get('/my-profile')).headers.location).toBe('/login');
  });

  it('does not cache login pages or authenticated pages', async () => {
    const agent = request.agent(app);
    expect((await agent.get('/login')).headers['cache-control']).toContain('no-store');
    await login(agent);
    expect((await agent.get('/my-profile')).headers['cache-control']).toContain('no-store');
  });

  it('rejects a CSRF token copied from a different session', async () => {
    const token = await getCsrfToken(request.agent(app), '/login');
    const other = request.agent(app);
    await other.get('/login');
    expect((await other.post('/login').type('form').send({ username: 'member', password: 'Passw0rd123', _csrf: token })).status).toBe(403);
  });
});

describe('Redirect and request validation', () => {
  const req = { protocol: 'https', get: () => 'example.com' };
  it.each(['https://evil.example/phish', '//evil.example', '/\\evil.example', '/%2f%2fevil.example',
    'javascript:alert(1)', 'https://example.com@evil.example', 'http://example.com/path', '/bad\npath', '/%zz'])('blocks unsafe return target %s', target => {
    expect(safeRedirect(req, target)).toBe('/');
  });
  it('preserves same-origin return paths and queries', () => {
    expect(safeRedirect(req, 'https://example.com/dashboard?page=2')).toBe('/dashboard?page=2');
  });
  it('blocks external language redirects', async () => {
    expect((await request(app).get('/lang/en').set('Referer', 'https://evil.example')).headers.location).toBe('/');
  });
  it('returns to the explicit local page after changing language', async () => {
    const response = await request(app)
      .get('/lang/kn?next=%2Fprivacy%3Fsection%3Dcookies')
      .set('Referer', 'https://evil.example');
    expect(response.headers.location).toBe('/privacy?section=cookies');
  });
  it('puts an explicit return path in rendered language links', async () => {
    const response = await request(app).get('/login?from=member');
    expect(response.text).toContain('/lang/kn?next=%2Flogin%3Ffrom%3Dmember');
  });
  it.each([{}, { username: ['member'], password: 'Passw0rd123' }, { username: 'member', password: {} },
    { username: 'member', password: 'x'.repeat(73) }])('rejects malformed credentials before database lookup: %j', async credentials => {
    const agent = request.agent(app);
    const csrf = await getCsrfToken(agent, '/login');
    expect((await agent.post('/login').send({ ...credentials, _csrf: csrf })).status).toBe(400);
    expect(User.findByUsername).not.toHaveBeenCalled();
  });
  it('enforces a request body ceiling', async () => {
    expect((await request(app).post('/login').send({ username: 'x'.repeat(70 * 1024) })).status).toBe(413);
  });
  it('bounds bcrypt passwords in UTF-8 bytes', () => {
    expect(validPassword('Aa1' + 'é'.repeat(35))).toBe(false);
    expect(validPassword('Aa1' + 'x'.repeat(69))).toBe(true);
    expect(validPassword(['Passw0rd123'])).toBe(false);
  });
  it('enforces password validation for admin-created accounts', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.post('/', userCreateValidators, (req, res) => res.json(validationResult(req).array()));
    const response = await request(testApp).post('/').send({ name: 'Test Person', mobile_number: '9000000000', username: 'person' });
    expect(response.body.some(error => error.path === 'password')).toBe(true);
  });
});

describe('Upload boundaries', () => {
  function uploadApp(parse, persist, validators = []) {
    const testApp = express();
    testApp.post('/', parse, validators, persist, (req, res) => res.sendStatus(204));
    testApp.use((err, req, res, next) => res.status(400).json({ code: err.code }));
    return testApp;
  }
  it('never writes an upload whose CSRF token is missing', async () => {
    user.role = 'admin';
    const agent = request.agent(app);
    await login(agent, '/portal/admin-login');
    const response = await agent.post('/portal/admin-dashboard/profiles/1/photos')
      .attach('profile_image', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { filename: 'photo.png', contentType: 'image/png' });
    expect(response.status).toBe(403);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
  it.each([
    ['photo.jpg.html', 'image/jpeg', Buffer.from([255, 216, 255])],
    ['photo.jpg', 'image/jpeg', Buffer.from('<script>alert(1)</script>')],
    ['photo.png', 'image/jpeg', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])]
  ])('rejects spoofed image %s (%s)', async (filename, contentType, buffer) => {
    const response = await request(uploadApp(parseAdImage, uploadAdImage)).post('/').attach('ad_image', buffer, { filename, contentType });
    expect(response.status).toBe(400);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
  it('validates the entire batch before any write', async () => {
    const response = await request(uploadApp(parseProfileAssets, uploadProfileAssets)).post('/')
      .attach('profile_image', Buffer.from([255, 216, 255]), { filename: 'ok.jpg', contentType: 'image/jpeg' })
      .attach('biodata_pdf', Buffer.from('not a pdf'), { filename: 'fake.pdf', contentType: 'application/pdf' });
    expect(response.status).toBe(400);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
  it('does not store files when form validation fails', async () => {
    await request(uploadApp(parseProfileAssets, uploadProfileAssets, [body('full_name').notEmpty()])).post('/')
      .attach('profile_image', Buffer.from([255, 216, 255]), { filename: 'ok.jpg', contentType: 'image/jpeg' });
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
  it('accepts a matching PDF signature', async () => {
    const response = await request(uploadApp(parseProfileAssets, uploadProfileAssets)).post('/')
      .attach('biodata_pdf', Buffer.from('%PDF-1.7\n%%EOF'), { filename: 'document.pdf', contentType: 'application/pdf' });
    expect(response.status).toBe(204);
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
  });
  it('rejects too many multipart fields', async () => {
    let pending = request(uploadApp(parseAdImage, uploadAdImage)).post('/');
    for (let i = 0; i < 101; i++) pending = pending.field('field' + i, 'value');
    expect((await pending).status).toBe(400);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
  it('cleans up a partial storage failure', async () => {
    storage.uploadFile.mockResolvedValueOnce('first.jpg').mockRejectedValueOnce(new Error('storage failed'));
    const response = await request(uploadApp(parseProfileAssets, uploadProfileAssets)).post('/')
      .attach('profile_image', Buffer.from([255, 216, 255]), { filename: 'first.jpg', contentType: 'image/jpeg' })
      .attach('profile_image_2', Buffer.from([255, 216, 255]), { filename: 'second.jpg', contentType: 'image/jpeg' });
    expect(response.status).toBe(400);
    expect(storage.deleteFile).toHaveBeenCalledWith('profiles', 'first.jpg');
  });
});

describe('Rate limits and proxy trust', () => {
  it('keeps HTTP 429 and ignores spoofed forwarded IPs', async () => {
    const agent = request.agent(app);
    let response;
    for (let i = 0; i < 11; i++) {
      const csrf = await getCsrfToken(agent, '/login');
      response = await agent.post('/login').set('X-Forwarded-For', '203.0.113.' + i).type('form')
        .send({ username: 'rate-victim', password: 'wrong', _csrf: csrf });
    }
    expect(response.status).toBe(429);
    expect(response.headers.location).toBeUndefined();
    expect(response.headers['retry-after']).toBeDefined();
  });
  it('limits contact spam and retains a 429 response', async () => {
    const agent = request.agent(app);
    let response;
    for (let i = 0; i < 11; i++) {
      const csrf = await getCsrfToken(agent, '/login');
      response = await agent.post('/contact').type('form').send({ name: 'Visitor', mobile: '9000000000', message: 'Hi', _csrf: csrf });
    }
    expect(response.status).toBe(429);
    expect(response.headers.location).toBeUndefined();
  });
});

describe('Route error containment', () => {
  it('contains a rejected async controller without leaking database errors', async () => {
    user.role = 'admin';
    const agent = request.agent(app);
    await login(agent, '/portal/admin-login');
    const csrf = await getCsrfToken(agent, '/portal/admin-login');
    User.updateStatus.mockRejectedValueOnce(new Error('private SQL details'));
    const response = await agent.post('/portal/admin-dashboard/users/1/approve').type('form').send({ _csrf: csrf });
    expect(response.status).toBe(500);
    expect(response.text).not.toContain('private SQL details');
  });
  it.each(['abc', '-1', '9223372036854775808'])('rejects invalid database identifier %s', async id => {
    expect((await request(app).get('/profile/' + id + '/modal')).status).toBe(400);
  });
});
