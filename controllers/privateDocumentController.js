const fs = require('fs');
const db = require('../config/db');
const storage = require('../utils/storage');

const DOCUMENT_COLUMNS = Object.freeze({
  biodata: 'biodata_pdf_name',
  jathaka: 'jathaka_pdf_name'
});

exports.serve = async (req, res, next) => {
  const { bucket, filename } = req.params;
  const column = DOCUMENT_COLUMNS[bucket];
  if (!column || !/^[a-f0-9-]+\.pdf$/i.test(filename)) return res.sendStatus(404);

  try {
    const [references] = await db.query(
      `SELECT id FROM profiles WHERE ${column} = ? LIMIT 1`,
      [filename]
    );
    if (!references.length) return res.sendStatus(404);

    const filePath = storage.getPrivateFilePath(bucket, filename);
    await fs.promises.access(filePath, fs.constants.R_OK);
    res.set({
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Disposition': 'inline',
      'Content-Type': 'application/pdf',
      'X-Content-Type-Options': 'nosniff'
    });
    res.sendFile(filePath, error => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    if (error.code === 'ENOENT') return res.sendStatus(404);
    next(error);
  }
};
