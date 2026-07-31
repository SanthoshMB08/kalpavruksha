const pool = require('../config/db');
const { normalizePagination, buildPageMeta } = require('../utils/pagination');

const PUBLIC_FIELDS = `
  id, full_name, gender, image_name, image_name_2, caste, subcaste, language, occupation,
  date_of_birth, marital_status,
  DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) AS age
`;

const FULL_FIELDS = `
  id, full_name, gender, image_name, image_name_2, religion, caste, subcaste, date_of_birth,
  time_of_birth, language, occupation, annual_salary, father_name, father_occupation,
  father_salary, mother_name, mother_occupation, mother_salary, total_siblings,
  male_siblings, female_siblings, phone_number, address, city, state, assets,
  loans, rashi, nakshatra, jathaka_pdf_name, biodata_pdf_name, marital_status, created_by, created_at,
  DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) AS age
`;

// Every column a controller is allowed to touch via updateFields(). id,
// created_by, created_at are never updatable this way.
const UPDATABLE_COLUMNS = [
  'full_name', 'gender', 'image_name', 'image_name_2', 'religion', 'caste', 'subcaste',
  'date_of_birth', 'time_of_birth', 'language', 'occupation', 'annual_salary',
  'father_name', 'father_occupation', 'father_salary', 'mother_name', 'mother_occupation',
  'mother_salary', 'total_siblings', 'male_siblings', 'female_siblings', 'phone_number',
  'address', 'city', 'state', 'assets', 'loans', 'rashi', 'nakshatra',
  'jathaka_pdf_name', 'biodata_pdf_name', 'marital_status'
];

function buildWhereClause(filters = {}, { includeMarried = false } = {}) {
  const clauses = [];
  const params = [];

  if (filters.religion) {
    clauses.push('religion LIKE ?');
    params.push(`%${filters.religion}%`);
  }
  if (filters.caste) {
    clauses.push('caste LIKE ?');
    params.push(`%${filters.caste}%`);
  }
  if (filters.language) {
    clauses.push('language LIKE ?');
    params.push(`%${filters.language}%`);
  }
  if (filters.subcaste) {
    clauses.push('subcaste LIKE ?');
    params.push(`%${filters.subcaste}%`);
  }
  if (filters.gender) {
    clauses.push('gender = ?');
    params.push(filters.gender);
  }
  if (filters.keyword) {
    clauses.push('(full_name ILIKE ? OR occupation ILIKE ? OR city ILIKE ?)');
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`, `%${filters.keyword}%`);
  }
  if (filters.minAge) {
    clauses.push("DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) >= ?");
    params.push(filters.minAge);
  }
  if (filters.maxAge) {
    clauses.push("DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) <= ?");
    params.push(filters.maxAge);
  }
  if (filters.maritalStatus) {
    clauses.push('marital_status = ?');
    params.push(filters.maritalStatus);
  } else if (!includeMarried) {
    clauses.push("marital_status = 'unmarried'");
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

async function runPaginatedSearch(filters, fieldSet, opts, pagination) {
  const { where, params } = buildWhereClause(filters, opts);
  const { page, perPage, offset } = normalizePagination(pagination);

  const countSql = `SELECT COUNT(*)::int AS total FROM profiles ${where}`;
  const dataSql = `SELECT ${fieldSet} FROM profiles ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;

  const [[countRows], [rows]] = await Promise.all([
    pool.query(countSql, params),
    pool.query(dataSql, [...params, perPage, offset])
  ]);

  return { rows, ...buildPageMeta(countRows[0].total, page, perPage) };
}

const Profile = {
  // Regular-user search: privacy-safe field set, gender-locked, married profiles hidden.
  // Returns { rows, total, page, perPage, totalPages } instead of a bare array.
  async search(filters = {}, pagination = {}) {
    return runPaginatedSearch(filters, PUBLIC_FIELDS, { includeMarried: false }, pagination);
  },

  // Admin / Super Admin search: full field set, married profiles included so
  // staff can still find and manage them.
  async searchFull(filters = {}, pagination = {}) {
    return runPaginatedSearch(filters, FULL_FIELDS, { includeMarried: true }, pagination);
  },

  async findByIdPublic(id) {
    const [rows] = await pool.query(`SELECT ${PUBLIC_FIELDS} FROM profiles WHERE id = ?`, [id]);
    return rows[0];
  },

  async findByIdFull(id) {
    const [rows] = await pool.query(`SELECT ${FULL_FIELDS} FROM profiles WHERE id = ?`, [id]);
    return rows[0];
  },

  // Paginated (was: no LIMIT at all, pulled the entire table on every admin
  // page load — fine at a few hundred profiles, degrades as the member base
  // grows).
  async listAllFull(pagination = {}) {
    const { page, perPage, offset } = normalizePagination(pagination);
    const [[countRows], [rows]] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM profiles'),
      pool.query(`SELECT ${FULL_FIELDS} FROM profiles ORDER BY created_at DESC LIMIT ? OFFSET ?`, [perPage, offset])
    ]);
    return { rows, ...buildPageMeta(countRows[0].total, page, perPage) };
  },

  async create(data) {
    const [result] = await pool.query(
      `INSERT INTO profiles (
        full_name, gender, image_name, image_name_2, religion, caste, subcaste, date_of_birth,
        time_of_birth, language, occupation, annual_salary, father_name,
        father_occupation, father_salary, mother_name, mother_occupation,
        mother_salary, total_siblings, male_siblings, female_siblings,
        phone_number, address, city, state, assets, loans, rashi, nakshatra,
        jathaka_pdf_name, biodata_pdf_name, marital_status, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      RETURNING id`,
      [
        data.full_name, data.gender, data.image_name, data.image_name_2 || null, data.religion, data.caste,
        data.subcaste, data.date_of_birth, data.time_of_birth || null, data.language,
        data.occupation, data.annual_salary, data.father_name, data.father_occupation,
        data.father_salary, data.mother_name, data.mother_occupation, data.mother_salary,
        data.total_siblings || 0, data.male_siblings || 0, data.female_siblings || 0,
        data.phone_number, data.address, data.city, data.state, data.assets,
        data.loans || null, data.rashi, data.nakshatra, data.jathaka_pdf_name || null,
        data.biodata_pdf_name || null, data.marital_status || 'unmarried', data.created_by || null
      ]
    );
    return result.insertId;
  },

  // Generic, whitelisted partial update. Callers pass only the fields they
  // are permitted to change — see UPDATABLE_COLUMNS above; anything else in
  // `data` is silently ignored. Which fields a controller is allowed to pass
  // is decided by role there (e.g. Admin only passes image_name/marital_status,
  // Super Admin's full edit form can pass everything including gender and
  // jathaka_pdf_name).
  async updateFields(id, data) {
    const sets = [];
    const params = [];
    for (const key of UPDATABLE_COLUMNS) {
      if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined) {
        sets.push(`${key} = ?`);
        const val = data[key];
        params.push(val === '' && key !== 'loans' && key !== 'time_of_birth' ? null : val);
      }
    }
    if (sets.length === 0) return;
    params.push(id);
    await pool.query(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async deleteById(id) {
    await pool.query('DELETE FROM profiles WHERE id = ?', [id]);
  },

  async distinctValues(column) {
    const allowed = ['religion', 'caste', 'language'];
    if (!allowed.includes(column)) return [];
    const [rows] = await pool.query(
      `SELECT DISTINCT ${column} AS value FROM profiles WHERE ${column} IS NOT NULL AND ${column} != '' ORDER BY ${column} ASC`
    );
    return rows.map((r) => r.value);
  },

  async count() {
    const [rows] = await pool.query('SELECT COUNT(*)::int AS total FROM profiles');
    return rows[0].total;
  }
};

module.exports = Profile;
