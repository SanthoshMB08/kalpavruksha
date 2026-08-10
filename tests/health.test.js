const request = require('supertest');
const app = require('../app');
const { pool: appPool } = require('../config/db');
const { applySchema, resetTables, closePool } = require('./helpers/db');

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

describe('GET /health', () => {
  it('returns 200 with a real database check when the DB is reachable', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });
});
