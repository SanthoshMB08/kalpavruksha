jest.mock('basic-ftp', () => ({ Client: jest.fn() }));
jest.mock('../utils/logger', () => ({ error: jest.fn() }));

const { Client } = require('basic-ftp');
const logger = require('../utils/logger');
const driver = require('../utils/storage/hostingerFtpDriver');
const fs = require('fs');
const os = require('os');
const path = require('path');

let client;
let originalEnv;

function configureFtp() {
  process.env.HOSTINGER_FTP_HOST = 'ftp.example.com';
  process.env.HOSTINGER_FTP_PORT = '21';
  process.env.HOSTINGER_FTP_USER = 'ftp-user';
  process.env.HOSTINGER_FTP_PASSWORD = 'ftp-password';
  process.env.HOSTINGER_FTP_PUBLIC_URL = 'https://example.com';
  process.env.HOSTINGER_FTP_ROOT = '.';
  process.env.HOSTINGER_FTP_SECURE = 'true';
}

beforeEach(() => {
  originalEnv = { ...process.env };
  configureFtp();
  client = {
    ftp: {},
    access: jest.fn().mockResolvedValue(),
    ensureDir: jest.fn().mockResolvedValue(),
    uploadFrom: jest.fn().mockResolvedValue(),
    remove: jest.fn().mockResolvedValue(),
    close: jest.fn()
  };
  Client.mockImplementation(() => client);
  jest.clearAllMocks();
  Client.mockImplementation(() => client);
});

afterEach(() => {
  process.env = originalEnv;
  jest.dontMock('../utils/storage/hostingerFtpDriver');
  jest.dontMock('../utils/storage/localDriver');
  jest.dontMock('../utils/storage/privateLocalDriver');
  jest.resetModules();
});

describe('Hostinger FTPS storage', () => {
  it('uploads unique public profile images over verified FTPS and closes the client', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const filename = await driver.uploadFile('profiles', { buffer: bytes, mimetype: 'image/jpeg' });

    expect(filename).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(client.access).toHaveBeenCalledWith(expect.objectContaining({
      host: 'ftp.example.com',
      port: 21,
      secure: true,
      secureOptions: expect.objectContaining({ rejectUnauthorized: true })
    }));
    expect(client.ensureDir).toHaveBeenCalledWith('uploads/profiles');
    expect(client.uploadFrom).toHaveBeenCalledWith(expect.anything(), filename);
    const uploaded = client.uploadFrom.mock.calls[0][0];
    const chunks = [];
    for await (const chunk of uploaded) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(bytes);
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('maps ads to the Hostinger advertisements folder and generates its HTTPS URL', async () => {
    const filename = await driver.uploadFile('ads', {
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      mimetype: 'image/png'
    });
    expect(client.ensureDir).toHaveBeenCalledWith('uploads/advertisements');
    expect(driver.getPublicUrl('ads', filename)).toBe(`https://example.com/uploads/advertisements/${filename}`);
  });

  it('uploads a batch through one FTPS connection with separate unique names', async () => {
    const files = [
      { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg' },
      { buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]), mimetype: 'image/jpeg' }
    ];
    const filenames = await driver.uploadFiles('profiles', files);
    expect(filenames).toHaveLength(2);
    expect(filenames[0]).not.toBe(filenames[1]);
    expect(client.access).toHaveBeenCalledTimes(1);
    expect(client.uploadFrom).toHaveBeenCalledTimes(2);
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('supports success-story image storage without accepting private document buckets', async () => {
    await driver.uploadFile('success-stories', {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimetype: 'image/jpeg'
    });
    expect(client.ensureDir).toHaveBeenCalledWith('uploads/success-stories');
    await expect(driver.uploadFile('biodata', {
      buffer: Buffer.from('%PDF-1.7'),
      mimetype: 'application/pdf'
    })).rejects.toMatchObject({ code: 'HOSTINGER_FTP_BUCKET' });
  });

  it('rejects invalid images before opening an FTP connection', async () => {
    await expect(driver.uploadFile('profiles', {
      buffer: Buffer.from('%PDF-1.7'),
      mimetype: 'application/pdf'
    })).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
    expect(Client).not.toHaveBeenCalled();
  });

  it('rejects oversized image buffers before opening an FTP connection', async () => {
    await expect(driver.uploadFile('profiles', {
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 0xff),
      mimetype: 'image/jpeg'
    })).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
    expect(Client).not.toHaveBeenCalled();
  });

  it('fails closed when the public URL is not HTTPS', async () => {
    process.env.HOSTINGER_FTP_PUBLIC_URL = 'http://example.com';
    await expect(driver.uploadFile('profiles', {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimetype: 'image/jpeg'
    })).rejects.toMatchObject({ code: 'HOSTINGER_FTP_CONFIG' });
    expect(Client).not.toHaveBeenCalled();
  });

  it('reports FTPS errors and closes the connection without retrying insecurely', async () => {
    client.access.mockRejectedValueOnce(new Error('TLS handshake failed'));
    await expect(driver.uploadFile('profiles', {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimetype: 'image/jpeg'
    })).rejects.toMatchObject({ code: 'HOSTINGER_FTPS_ERROR' });
    expect(client.access.mock.calls[0][0].secure).toBe(true);
    expect(client.close).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('routes private PDFs to their configured provider rather than public FTP', async () => {
    const publicUpload = jest.fn().mockResolvedValue('profile.webp');
    const privateUpload = jest.fn().mockResolvedValue('document.pdf');
    jest.doMock('../utils/storage/hostingerFtpDriver', () => ({
      BUCKETS: { profiles: 'profiles', ads: 'advertisements', 'success-stories': 'success-stories' },
      uploadFile: publicUpload,
      uploadBuffer: jest.fn(),
      getPublicUrl: jest.fn(),
      deleteFile: jest.fn()
    }));
    jest.doMock('../utils/storage/privateLocalDriver', () => ({
      BUCKETS: { biodata: 'biodata', jathaka: 'jathaka' },
      uploadFile: privateUpload,
      uploadBuffer: jest.fn(),
      getPublicUrl: jest.fn(),
      deleteFile: jest.fn()
    }));
    process.env.STORAGE_PROVIDER = 'hostinger-ftp';
    process.env.PRIVATE_STORAGE_PROVIDER = 'local';

    let storage;
    jest.isolateModules(() => {
      storage = require('../utils/storage');
    });
    await storage.uploadFile('biodata', { mimetype: 'application/pdf' });
    await storage.uploadFile('profiles', { mimetype: 'image/webp' });

    expect(privateUpload).toHaveBeenCalledWith('biodata', { mimetype: 'application/pdf' });
    expect(publicUpload).toHaveBeenCalledWith('profiles', { mimetype: 'image/webp' });
    expect(client.access).not.toHaveBeenCalled();
  });

  it('uses the account root without duplicating public_html and honors a configured relative root', async () => {
    process.env.HOSTINGER_FTP_ROOT = 'public_html';
    await driver.uploadFile('profiles', {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimetype: 'image/jpeg'
    });
    expect(client.ensureDir).toHaveBeenCalledWith('public_html/uploads/profiles');
  });

  it('removes a partial newly generated upload after an interrupted transfer', async () => {
    client.uploadFrom.mockRejectedValueOnce(new Error('connection interrupted'));
    await expect(driver.uploadFile('profiles', {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimetype: 'image/jpeg'
    })).rejects.toMatchObject({ code: 'HOSTINGER_FTPS_ERROR' });
    expect(client.remove).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/), true);
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('cleans completed and partial files when a later item in a batch fails', async () => {
    client.uploadFrom.mockResolvedValueOnce();
    client.uploadFrom.mockRejectedValueOnce(new Error('connection interrupted'));
    await expect(driver.uploadFiles('profiles', [
      { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg' },
      { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg' }
    ])).rejects.toMatchObject({ code: 'HOSTINGER_FTPS_ERROR' });
    expect(client.remove).toHaveBeenCalledTimes(2);
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('stores private PDFs outside the public directory and returns a protected route', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kalpavruksha-private-'));
    process.env.PRIVATE_STORAGE_DIR = root;
    try {
      jest.resetModules();
      const privateDriver = require('../utils/storage/privateLocalDriver');
      const filename = await privateDriver.uploadFile('biodata', {
        buffer: Buffer.from('%PDF-1.7'),
        mimetype: 'application/pdf'
      });
      const storedPath = privateDriver.getFilePath('biodata', filename);
      expect(path.relative(path.join(__dirname, '..', 'public'), storedPath).startsWith('..')).toBe(true);
      expect(privateDriver.getPublicUrl('biodata', filename)).toBe(
        `/portal/admin-dashboard/private-files/biodata/${filename}`
      );
      await privateDriver.deleteFile('biodata', filename);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
