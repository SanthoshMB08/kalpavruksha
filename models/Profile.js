const pool = require('../config/db');
const { normalizePagination, buildPageMeta } = require('../utils/pagination');

const PUBLIC_FIELDS = `
  id, full_name, gender, image_name, image_name_2, caste, subcaste, language, occupation,
  date_of_birth, marital_status,
  DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) AS age
`;

const FULL_FIELDS = `
  id, full_name, gender, image_name, image_name_2, religion, religion_other, caste, caste_other,
  subcaste, date_of_birth, time_of_birth, birth_place, language, occupation, occupation_other, employed_in,
  employed_in_other, company_name, designation, annual_salary, annual_income_band,
  father_name, father_occupation, father_salary, mother_name, mother_occupation, mother_salary,
  total_siblings, male_siblings, female_siblings, num_brothers, married_brothers, num_sisters, married_sisters,
  phone_number, phone_country_code, address, city, state, country, assets, loans, rashi, nakshatra, has_dosh,
  jathaka_pdf_name, biodata_pdf_name, marital_status, willing_other_caste, has_children, number_of_children,
  education, family_type, family_values, family_status, eating_habit, smoking_habit, drinking_habit,
  mother_tongue, mother_tongue_other, user_id, created_by, created_at,
  DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) AS age
`;

// Every column a controller is allowed to touch via updateFields(). id,
// created_by, created_at are never updatable this way.
const UPDATABLE_COLUMNS = [
  'full_name', 'gender', 'image_name', 'image_name_2', 'religion', 'religion_other', 'caste', 'caste_other',
  'subcaste', 'date_of_birth', 'time_of_birth', 'birth_place', 'language', 'occupation', 'occupation_other', 'employed_in',
  'employed_in_other', 'company_name', 'designation', 'annual_salary', 'annual_income_band',
  'father_name', 'father_occupation', 'father_salary', 'mother_name', 'mother_occupation', 'mother_salary',
  'total_siblings', 'male_siblings', 'female_siblings', 'num_brothers', 'married_brothers', 'num_sisters', 'married_sisters',
  'phone_number', 'phone_country_code', 'address', 'city', 'state', 'country', 'assets', 'loans', 'rashi', 'nakshatra', 'has_dosh',
  'jathaka_pdf_name', 'biodata_pdf_name', 'marital_status', 'willing_other_caste', 'has_children', 'number_of_children',
  'education', 'family_type', 'family_values', 'family_status', 'eating_habit', 'smoking_habit', 'drinking_habit',
  'mother_tongue', 'mother_tongue_other'
];

// Columns a controller is allowed to filter on, alongside language below. The
// caller decides which of them match exactly: the member-facing pickers for
// religion and caste are closed <select> lists, and matching those exactly is
// what makes the UI predictable — picking "Jat" in the dropdown must mean Jat,
// not every caste that happens to contain the substring.
//
// The comparison is case-insensitive because the option lists come from
// profileOptions (stored as slugs, e.g. 'hindu') while older rows — and the
// test seed — hold the display form ('Hindu'). None of these columns is
// indexed, so LOWER() costs nothing measurable on a search that already scans.
// Sub-caste is listed here but deliberately left out of every caller's exact
// list: it is typed, not chosen, and it is free text on the profile form, so a
// substring match is the only thing a typed value can be expected to hit.
const SELECT_FILTER_COLUMNS = ['religion', 'caste', 'subcaste'];

// Closed pickers on the member-facing search page. Everything else there is
// typed and falls through to the substring branch above.
const MEMBER_EXACT_FILTER_COLUMNS = ['religion', 'caste'];

function buildWhereClause(filters = {}, { includeMarried = false, exactFields = null } = {}) {
  // Soft-deleted profiles are never returned by a search, in any context.
  const clauses = ['deleted_at IS NULL'];
  const params = [];
  const useExact = (col) => (exactFields ? exactFields.includes(col) : false);

  for (const col of SELECT_FILTER_COLUMNS) {
    if (!filters[col]) continue;
    if (useExact(col)) {
      clauses.push(`LOWER(${col}) = LOWER(?)`);
      params.push(filters[col]);
    } else {
      // Typed, so substring — and case-insensitive, or re-typing a stored value
      // in a different case would silently return nothing.
      clauses.push(`${col} ILIKE ?`);
      params.push(`%${filters[col]}%`);
    }
  }
  if (filters.language) {
    // Always substring. The control is a dropdown of the canonical
    // mother-tongue list, but a profile whose mother tongue was "Other" stores
    // free text in this legacy column, so exact matching would hide those.
    clauses.push('language ILIKE ?');
    params.push(`%${filters.language}%`);
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
    clauses.push("marital_status != 'married'");
  }

  const where = `WHERE ${clauses.join(' AND ')}`;
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
  // The religion/caste pickers are closed dropdowns of real values, so those two
  // match exactly; sub-caste and language are typed and match as substrings.
  // Returns { rows, total, page, perPage, totalPages } instead of a bare array.
  async search(filters = {}, pagination = {}) {
    return runPaginatedSearch(
      filters,
      PUBLIC_FIELDS,
      { includeMarried: false, exactFields: MEMBER_EXACT_FILTER_COLUMNS },
      pagination
    );
  },

  // Admin / Super Admin search: full field set, married profiles included so
  // staff can still find and manage them.
  async searchFull(filters = {}, pagination = {}) {
    return runPaginatedSearch(filters, FULL_FIELDS, { includeMarried: true }, pagination);
  },

  async findByIdPublic(id) {
    const [rows] = await pool.query(`SELECT ${PUBLIC_FIELDS} FROM profiles WHERE id = ? AND deleted_at IS NULL`, [id]);
    return rows[0];
  },

  // Unfiltered by design — Super Admin's edit page and the Trash page both
  // need to be able to load a soft-deleted profile.
  async findByIdFull(id) {
    const [rows] = await pool.query(`SELECT ${FULL_FIELDS}, deleted_at FROM profiles WHERE id = ?`, [id]);
    return rows[0];
  },

  // Paginated (was: no LIMIT at all, pulled the entire table on every admin
  // page load — fine at a few hundred profiles, degrades as the member base
  // grows).
  async listAllFull(pagination = {}) {
    const { page, perPage, offset } = normalizePagination(pagination);
    const [[countRows], [rows]] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM profiles WHERE deleted_at IS NULL'),
      pool.query(
        `SELECT ${FULL_FIELDS} FROM profiles WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [perPage, offset]
      )
    ]);
    return { rows, ...buildPageMeta(countRows[0].total, page, perPage) };
  },

  // --- Duplicate detection (checked on create, before inserting) ---

  // Same phone number among active profiles is treated as a hard duplicate —
  // in practice two different people don't share a phone number here.
  async findDuplicateByPhone(phone) {
    const [rows] = await pool.query(
      'SELECT id, full_name FROM profiles WHERE phone_number = ? AND deleted_at IS NULL LIMIT 1',
      [phone]
    );
    return rows[0] || null;
  },

  // Same name + date of birth is a much weaker signal (names coincide) —
  // surfaced as a warning the admin can acknowledge and proceed past, not a
  // hard block.
  async findPossibleDuplicateByNameDob(fullName, dob) {
    const [rows] = await pool.query(
      'SELECT id, full_name FROM profiles WHERE full_name = ? AND date_of_birth = ? AND deleted_at IS NULL LIMIT 1',
      [fullName, dob]
    );
    return rows[0] || null;
  },

  async create(data) {
    const [result] = await pool.query(
      `INSERT INTO profiles (
        full_name, gender, image_name, image_name_2, religion, religion_other, caste, caste_other, subcaste,
        date_of_birth, time_of_birth, birth_place, language, occupation, occupation_other, employed_in, employed_in_other,
        company_name, designation, annual_salary, annual_income_band, father_name,
        father_occupation, father_salary, mother_name, mother_occupation,
        mother_salary, total_siblings, male_siblings, female_siblings,
        num_brothers, married_brothers, num_sisters, married_sisters,
        phone_number, phone_country_code, address, city, state, country, assets, loans, rashi, nakshatra, has_dosh,
        jathaka_pdf_name, biodata_pdf_name, marital_status, willing_other_caste, has_children, number_of_children,
        education, family_type, family_values, family_status, eating_habit, smoking_habit, drinking_habit,
        mother_tongue, mother_tongue_other, user_id, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      RETURNING id`,
      [
        data.full_name, data.gender, data.image_name, data.image_name_2 || null, data.religion, data.religion_other || null,
        data.caste || null, data.caste_other || null, data.subcaste || null,
        data.date_of_birth, data.time_of_birth || null, data.birth_place || null, data.language,
        data.occupation || null, data.occupation_other || null, data.employed_in || null, data.employed_in_other || null,
        data.company_name || null, data.designation || null,
        data.annual_salary || null, data.annual_income_band || null,
        data.father_name, data.father_occupation,
        data.father_salary || null, data.mother_name, data.mother_occupation, data.mother_salary || null,
        data.total_siblings || 0, data.male_siblings || 0, data.female_siblings || 0,
        data.num_brothers || 0, data.married_brothers || 0, data.num_sisters || 0, data.married_sisters || 0,
        data.phone_number, data.phone_country_code || '+91', data.address, data.city, data.state, data.country || 'India',
        data.assets, data.loans || null, data.rashi, data.nakshatra, data.has_dosh || null,
        data.jathaka_pdf_name || null, data.biodata_pdf_name || null, data.marital_status || 'never_married',
        data.willing_other_caste || null, data.has_children || null, data.number_of_children || null,
        data.education || null, data.family_type || null, data.family_values || null, data.family_status || null,
        data.eating_habit || null, data.smoking_habit || null, data.drinking_habit || null,
        data.mother_tongue || null, data.mother_tongue_other || null,
        data.user_id || null, data.created_by || null
      ]
    );
    return result.insertId;
  },

  // Looks up the profile linked to a given login account — used by the
  // member dashboard/profile pages if they ever need "my own profile".
  async findByUserId(userId) {
    const [rows] = await pool.query(`SELECT ${FULL_FIELDS} FROM profiles WHERE user_id = ? AND deleted_at IS NULL`, [userId]);
    return rows[0] || null;
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

  // --- Soft delete / Trash ---

  async deleteById(id) {
    await pool.query('UPDATE profiles SET deleted_at = NOW() WHERE id = ?', [id]);
  },

  async restoreById(id) {
    await pool.query('UPDATE profiles SET deleted_at = NULL WHERE id = ?', [id]);
  },

  // Only allowed on rows already soft-deleted — a real safety backstop
  // against ever hard-deleting an active profile by accident.
  async purgeById(id) {
    await pool.query('DELETE FROM profiles WHERE id = ? AND deleted_at IS NOT NULL', [id]);
  },

  async listDeleted(pagination = {}) {
    const { page, perPage, offset } = normalizePagination(pagination);
    const [[countRows], [rows]] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM profiles WHERE deleted_at IS NOT NULL'),
      pool.query(
        `SELECT id, full_name, gender, image_name, deleted_at FROM profiles
         WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ? OFFSET ?`,
        [perPage, offset]
      )
    ]);
    return { rows, ...buildPageMeta(countRows[0].total, page, perPage) };
  },

  async distinctValues(column) {
    const allowed = ['religion', 'caste', 'subcaste', 'language'];
    if (!allowed.includes(column)) return [];
    const [rows] = await pool.query(
      `SELECT DISTINCT ${column} AS value FROM profiles
       WHERE ${column} IS NOT NULL AND ${column} != '' AND deleted_at IS NULL ORDER BY ${column} ASC`
    );
    return rows.map((r) => r.value);
  },

  // The distinct values actually in use, so the search page can offer a
  // religion/language/sub-caste that the canonical option list would miss
  // (a religion slug that was retired, or the free text left behind when a
  // profile's mother tongue was recorded as "Other"). The create-profile form
  // remains the source of truth for religion and caste options; this only adds
  // to them so real data is never unreachable.
  // → { religion: [...], subcaste: [...], language: [...] }
  async filterOptionIndex() {
    const [rows] = await pool.query(
      `SELECT DISTINCT religion, subcaste, language
       FROM profiles
       WHERE deleted_at IS NULL`
    );

    const religion = new Set();
    const subcaste = new Set();
    const language = new Set();
    for (const r of rows) {
      if (r.religion) religion.add(r.religion);
      if (r.subcaste) subcaste.add(r.subcaste);
      if (r.language) language.add(r.language);
    }

    return {
      religion: [...religion].sort(),
      subcaste: [...subcaste].sort(),
      language: [...language].sort()
    };
  },

  async count() {
    const [rows] = await pool.query('SELECT COUNT(*)::int AS total FROM profiles WHERE deleted_at IS NULL');
    return rows[0].total;
  },

  // A handful of recent, available profiles for the public homepage's
  // "Meet our Brides & Grooms" row — photos are blurred client-side (CSS)
  // since this is shown to signed-out visitors, not matched members.
  async listFeatured(genderFilter, limit = 8) {
    const params = [];
    let where = "deleted_at IS NULL AND marital_status != 'married'";
    if (genderFilter) {
      where += ' AND gender = ?';
      params.push(genderFilter);
    }
    params.push(limit);
    const [rows] = await pool.query(
      `SELECT id, full_name, gender, image_name, city,
              DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) AS age
       FROM profiles WHERE ${where} ORDER BY created_at DESC LIMIT ?`,
      params
    );
    return rows;
  }
};

module.exports = Profile;
