const pool = require('../config/db');

const PUBLIC_FIELDS = `
  id, full_name, gender, image_name, caste, subcaste, language, occupation,
  annual_salary, date_of_birth,
  DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) AS age
`;

const FULL_FIELDS = `
  id, full_name, gender, image_name, religion, caste, subcaste, date_of_birth,
  time_of_birth, language, occupation, annual_salary, father_name, father_occupation,
  father_salary, mother_name, mother_occupation, mother_salary, total_siblings,
  male_siblings, female_siblings, phone_number, address, city, state, assets,
  loans, rashi, nakshatra, jathaka_pdf_name, created_at,
  DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) AS age
`;

const Profile = {
  // Regular-user search: only returns the privacy-safe field set.
  async search(filters = {}) {
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

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT ${PUBLIC_FIELDS} FROM profiles ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    return rows;
  },

  async findByIdPublic(id) {
    const [rows] = await pool.query(`SELECT ${PUBLIC_FIELDS} FROM profiles WHERE id = ?`, [id]);
    return rows[0];
  },

  async findByIdFull(id) {
    const [rows] = await pool.query(`SELECT ${FULL_FIELDS} FROM profiles WHERE id = ?`, [id]);
    return rows[0];
  },

  async listAllFull() {
    const [rows] = await pool.query(`SELECT ${FULL_FIELDS} FROM profiles ORDER BY created_at DESC`);
    return rows;
  },

  async create(data) {
    const [result] = await pool.query(
      `INSERT INTO profiles (
        full_name, gender, image_name, religion, caste, subcaste, date_of_birth,
        time_of_birth, language, occupation, annual_salary, father_name,
        father_occupation, father_salary, mother_name, mother_occupation,
        mother_salary, total_siblings, male_siblings, female_siblings,
        phone_number, address, city, state, assets, loans, rashi, nakshatra,
        jathaka_pdf_name, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      RETURNING id`,
      [
        data.full_name, data.gender, data.image_name, data.religion, data.caste,
        data.subcaste, data.date_of_birth, data.time_of_birth || null, data.language,
        data.occupation, data.annual_salary, data.father_name, data.father_occupation,
        data.father_salary, data.mother_name, data.mother_occupation, data.mother_salary,
        data.total_siblings || 0, data.male_siblings || 0, data.female_siblings || 0,
        data.phone_number, data.address, data.city, data.state, data.assets,
        data.loans || null, data.rashi, data.nakshatra, data.jathaka_pdf_name || null,
        data.created_by || null
      ]
    );
    return result.insertId;
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
