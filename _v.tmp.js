// Throwaway: re-verify the dashboard markup + SQL after the i18n trim.
const path = require('path');
const fs = require('fs');
const Module = require('module');
const ejs = require('ejs');

let pass = 0;
const fails = [];
const check = (n, c) => (c ? pass++ : fails.push(n));

// ---- markup ----
// The module only exports getTranslator, so coverage is probed the way a missing
// key behaves in production: t() falls through to the key name itself.
const i18n = require('./utils/i18n');
const opts = require('./utils/profileOptions');
const tpl = fs.readFileSync(path.join(__dirname, 'views/user-dashboard.ejs'), 'utf8');

const base = (over) => Object.assign({
  title: 'Find Your Match', profiles: [],
  pageInfo: { page: 1, perPage: 24, total: 0, totalPages: 1 }, currentQuery: {},
  religionOptions: opts.RELIGION_OPTIONS,
  casteOptionsByReligion: opts.CASTE_OPTIONS_BY_RELIGION,
  subcasteOptions: ['Lingayat', 'Vokkaliga'],
  languageOptions: opts.MOTHER_TONGUE_OPTIONS,
  filters: {}, afterSearchAds: [],
  currentUser: { id: 1, gender: 'male' }, currentLang: 'en', csrfToken: 'x', nonce: 'n',
  t: i18n.getTranslator('en'),
  fileUrl: () => '/x', withoutParams: () => '/dashboard'
}, over);

const render = (o) => ejs.render(tpl, base(o), { filename: path.join(__dirname, 'views/user-dashboard.ejs') });

// Both locales must cover every key the view asks for, or Kannada falls
// through to raw English key names.
const asked = [...new Set([...tpl.matchAll(/t\('(dashboard\.[A-Za-z]+)'\)/g)].map((m) => m[1]))];
for (const lang of i18n.SUPPORTED_LANGS) {
  const t = i18n.getTranslator(lang);
  for (const k of asked) {
    check(lang + ' has ' + k, t(k) !== k);
  }
}
check('subcaste placeholder is not the raw key', i18n.getTranslator('kn')('dashboard.subcastePlaceholder') !== 'dashboard.subcastePlaceholder');
check('no dead anySubcaste key', i18n.getTranslator('en')('dashboard.anySubcaste') === 'dashboard.anySubcaste');



(async () => {
  let h = await render({});
  check('no range input', !/type=["']range["']/.test(h));
  check('no slider css', !h.includes('fc-slider'));
  check('no combobox', !h.includes('fc-combo'));
  for (const f of ['religion', 'caste', 'language']) {
    check(f + ' is a select', new RegExp('<select[^>]*name="' + f + '"').test(h));
  }
  check('subcaste is typeable', /<input[^>]*name="subcaste"/.test(h));
  check('subcaste is not a select', !/<select[^>]*name="subcaste"/.test(h));
  check('subcaste suggests in-use values', /list="fcSubcasteList"/.test(h) && h.includes('<option value="Lingayat">') && h.includes('<option value="Vokkaliga">'));
  check('subcaste echoed', /name="subcaste"[\s\S]{0,200}?value="Kasar"/.test(await render({ filters: { subcaste: 'Kasar' } })));
  check('age boxes present', /name="minAge"/.test(h) && /name="maxAge"/.test(h));
  check('any-language prompt rendered', h.includes('Any language'));
  check('pick-caste prompt rendered', h.includes('Choose a religion first'));
  check('caste closed with no religion', /<select[^>]*name="caste"[\s\S]{0,400}?disabled/.test(h));
  check('subcaste never disabled', !/name="subcaste"[\s\S]{0,400}?disabled/.test(h));
  check('subcaste does not autosubmit', !/el === subcasteSel/.test(h) && !/subcasteSel/.test(h));

  const withList = Object.keys(opts.CASTE_OPTIONS_BY_RELIGION)[0];
  h = await render({ filters: { religion: withList, caste: opts.CASTE_OPTIONS_BY_RELIGION[withList][0], minAge: 24 } });
  check('caste opens', !/<select[^>]*name="caste"[\s\S]{0,400}?disabled/.test(h));
  check('caste selected', new RegExp('<option value="' + opts.CASTE_OPTIONS_BY_RELIGION[withList][0] + '" selected').test(h));
  check('min age echoed', /name="minAge"[^>]*value="24"/.test(h));

  for (const r of opts.RELIGION_OPTIONS) {
    if (opts.CASTE_OPTIONS_BY_RELIGION[r.value]) continue;
    const x = await render({ filters: { religion: r.value } });
    check('caste closed for ' + r.value, /<select[^>]*name="caste"[\s\S]{0,400}?disabled/.test(x));
  }
  const nasty = await render({ casteOptionsByReligion: { hindu: ['</script><script>alert(1)</script>'] } });
  check('payload escaped', !nasty.includes('"</script><script>alert(1)'));

  // ---- sql ----
  const cap = [];
  const pool = { query: async (sql, params) => { cap.push({ sql, params }); return /COUNT\(\*\)/i.test(sql) ? [[{ total: 0 }], []] : [[], []]; } };
  const origLoad = Module._load;
  Module._load = function (r) { return r === '../config/db' ? pool : origLoad.apply(this, arguments); };
  const Profile = require('./models/Profile');
  const last = () => cap[cap.length - 1];

  await Profile.search({ religion: 'hindu', caste: 'Lingayat', subcaste: 'kasar', language: 'Kannada', minAge: 24, maxAge: 31, gender: 'female' }, { page: 1 });
  let s = last();
  check('two exact predicates', ['religion', 'caste'].every((c) => s.sql.includes('LOWER(' + c + ') = LOWER(?)')));
  check('subcaste is a typed substring', s.sql.includes('subcaste ILIKE ?') && s.params[2] === '%kasar%');
  check('language substring', s.sql.includes('language ILIKE ?'));
  check('age bounds', s.sql.includes("AGE(CURRENT_DATE, date_of_birth)) >= ?") && s.sql.includes("AGE(CURRENT_DATE, date_of_birth)) <= ?"));
  check('params ordered', JSON.stringify(s.params.slice(0, 7)) === JSON.stringify(['hindu', 'Lingayat', '%kasar%', '%Kannada%', 'female', 24, 31]));

  await Profile.searchFull({ religion: 'Hind' }, {});
  s = last();
  check('admin keeps substring', s.sql.includes('religion ILIKE ?') && s.params[0] === '%Hind%');

  const idx = await Profile.filterOptionIndex();
  check('index flat', idx.links === undefined && idx.caste === undefined);
  check('index columns', Array.isArray(idx.religion) && Array.isArray(idx.subcaste) && Array.isArray(idx.language));

  console.log('checks passed: ' + pass + ', failed: ' + fails.length);
  if (fails.length) { fails.forEach((f) => console.log('  FAIL: ' + f)); process.exit(1); }
})();
