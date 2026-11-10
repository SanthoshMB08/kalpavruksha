require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const { query, pool } = require('../config/db');
const privateStorage = require('../utils/storage/privateLocalDriver');

const PUBLIC_UPLOAD_ROOT = path.resolve(__dirname, '../public/uploads');

async function copyDocument(bucket, filename) {
  const destination = privateStorage.getFilePath(bucket, filename);
  const sourceRoot = path.resolve(PUBLIC_UPLOAD_ROOT, privateStorage.BUCKETS[bucket]);
  const source = path.resolve(sourceRoot, filename);
  const relative = path.relative(sourceRoot, source);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid source document path.');

  const contents = await fs.readFile(source);
  if (contents.length < 8 || !/^%PDF-[12]\.\d/.test(contents.toString('ascii', 0, 8))) {
    throw new Error('Source file is not a valid PDF.');
  }

  try {
    const existing = await fs.readFile(destination);
    if (!existing.equals(contents)) throw new Error('Private destination already contains different content.');
    return 'already-present';
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await privateStorage.uploadBuffer(bucket, filename, contents);
  return 'copied';
}

async function main() {
  const [profiles] = await query(
    `SELECT biodata_pdf_name, jathaka_pdf_name FROM profiles
     WHERE biodata_pdf_name IS NOT NULL OR jathaka_pdf_name IS NOT NULL`
  );
  const documents = new Map();
  for (const profile of profiles) {
    if (profile.biodata_pdf_name) documents.set(`biodata:${profile.biodata_pdf_name}`, {
      bucket: 'biodata', filename: profile.biodata_pdf_name
    });
    if (profile.jathaka_pdf_name) documents.set(`jathaka:${profile.jathaka_pdf_name}`, {
      bucket: 'jathaka', filename: profile.jathaka_pdf_name
    });
  }

  let copied = 0;
  let existing = 0;
  let failed = 0;
  for (const document of documents.values()) {
    try {
      const result = await copyDocument(document.bucket, document.filename);
      if (result === 'copied') copied++;
      else existing++;
      console.log(`[${result}] ${document.bucket}/${document.filename}`);
    } catch (error) {
      failed++;
      console.error(`[failed] ${document.bucket}/${document.filename}: ${error.message}`);
    }
  }
  console.log(`Finished private-document copy. Copied: ${copied}; already present: ${existing}; failed: ${failed}.`);
  if (failed) process.exitCode = 1;
}

main()
  .catch(error => {
    console.error('Private-document migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
