jest.mock('../config/db', () => ({ query: jest.fn() }));

const db = require('../config/db');
const Profile = require('../models/Profile');
const { normalizePagination, MAX_PAGE } = require('../utils/pagination');
const { EventEmitter } = require('events');
const { uploadCapacity } = require('../middleware/upload');

describe('capacity safeguards', () => {
  beforeEach(() => {
    db.query.mockReset();
  });

  it('coalesces dashboard filter scans and invalidates cached options after a profile write', async () => {
    const filterRows = [[
      { religion: 'Hindu', subcaste: 'Lingayat', language: 'Kannada' }
    ], []];
    db.query.mockImplementation(async sql => sql.startsWith('SELECT DISTINCT')
      ? filterRows
      : [{ insertId: 7 }, []]);

    const [first, concurrent] = await Promise.all([
      Profile.filterOptionIndex(),
      Profile.filterOptionIndex()
    ]);
    expect(first).toEqual({ religion: ['Hindu'], subcaste: ['Lingayat'], language: ['Kannada'] });
    expect(concurrent).toEqual(first);
    expect(db.query).toHaveBeenCalledTimes(1);

    await Profile.create({});
    await Profile.filterOptionIndex();
    expect(db.query.mock.calls.filter(([sql]) => sql.startsWith('SELECT DISTINCT'))).toHaveLength(2);
  });

  it('caps unsafe and excessively deep page numbers', () => {
    expect(normalizePagination({ page: '90071992547409930' }).page).toBe(1);
    expect(normalizePagination({ page: String(MAX_PAGE + 1) }).page).toBe(MAX_PAGE);
  });

  it('rejects excess concurrent uploads and frees capacity when a response closes', () => {
    const responses = [];
    const admitted = jest.fn();
    function response() {
      const res = new EventEmitter();
      res.set = jest.fn(() => res);
      res.status = jest.fn(() => res);
      res.type = jest.fn(() => res);
      res.send = jest.fn(() => res);
      responses.push(res);
      return res;
    }

    uploadCapacity({}, response(), admitted);
    uploadCapacity({}, response(), admitted);
    const rejected = response();
    uploadCapacity({}, rejected, admitted);

    expect(admitted).toHaveBeenCalledTimes(2);
    expect(rejected.status).toHaveBeenCalledWith(503);
    expect(rejected.set).toHaveBeenCalledWith('Retry-After', '30');

    responses[0].emit('close');
    uploadCapacity({}, response(), admitted);
    expect(admitted).toHaveBeenCalledTimes(3);

    responses[1].emit('finish');
    responses[2].emit('close');
  });
});
