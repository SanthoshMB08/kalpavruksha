const { safeRedirect } = require('../utils/security');
const Profile = require('../models/Profile');
const Interest = require('../models/Interest');
const Advertisement = require('../models/Advertisement');
const User = require('../models/User');
const profileOptions = require('../utils/profileOptions');

// Gender-based matching is mandatory: a male member only ever sees female
// profiles and vice versa. This is enforced here, not left to the user to pick.
function oppositeGender(gender) {
  if (gender === 'male') return 'female';
  if (gender === 'female') return 'male';
  return null;
}

function boundedQueryText(value, maxLength = 100) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) || undefined : undefined;
}

exports.dashboard = async (req, res) => {
  // Age inputs are strings off the query string. Clamp them once, here, so the
  // view, the chips and the SQL all agree on the same range.
  const parseAge = (v) => {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return null;
    return Math.min(90, Math.max(18, n));
  };
  const minAge = parseAge(req.query.minAge);
  const maxAge = parseAge(req.query.maxAge);

  // Sub-caste is typed, so it arrives with whatever spacing the member used. A
  // box holding only spaces is an empty filter, not a search for "   ".
  const subcaste = boundedQueryText(req.query.subcaste);

  // The canonical dropdown contents are the same lists the create-profile form
  // offers, so what a member can filter by is exactly what staff can record.
  // Anything already in the database but missing from those lists (a retired
  // religion slug, the free text left by mother_tongue = "Other") gets appended
  // so real profiles never become unreachable. Comparison is case-insensitive,
  // so a legacy "Hindu" and the canonical "hindu" collapse to one entry.
  const mergeValues = (canonical, extra) => {
    const seen = new Set(canonical.map((v) => String(v).toLowerCase()));
    return canonical.concat(extra.filter((v) => !seen.has(String(v).toLowerCase())));
  };

  // Keeps the create-form labels ("Hindu") for the values that have one, and
  // falls back to the raw stored value for the ones that don't.
  const withLabels = (canonical, extra) => {
    const seen = new Set(canonical.map((o) => o.value.toLowerCase()));
    return canonical.concat(
      extra.filter((v) => !seen.has(String(v).toLowerCase())).map((v) => ({ value: v, label: v }))
    );
  };

  try {
    const myGender = req.session.user.gender;
    const filters = {
      religion: boundedQueryText(req.query.religion),
      caste: boundedQueryText(req.query.caste),
      language: boundedQueryText(req.query.language),
      subcaste,
      gender: oppositeGender(myGender),
      keyword: boundedQueryText(req.query.keyword),
      minAge,
      maxAge
    };
    const [searchResult, used, afterSearchAds, profileStates] = await Promise.all([
      Profile.search(filters, { page: req.query.page }),
      Profile.filterOptionIndex(),
      Object.keys(req.query).some(key => ['religion','caste','language','subcaste','keyword','minAge','maxAge'].includes(key) && req.query[key]) ? Advertisement.listActiveByPlacement('after_search') : [],
      Interest.statesByUser(req.session.user.id)
    ]);

    res.render('user-dashboard', {
      title: 'Find Your Match',
      profiles: searchResult.rows,
      profileStates,
      pageInfo: searchResult,
      currentQuery: req.query,
      religionOptions: withLabels(profileOptions.RELIGION_OPTIONS, used.religion),
      casteOptionsByReligion: profileOptions.CASTE_OPTIONS_BY_RELIGION,
      subcasteOptions: used.subcaste,
      languageOptions: mergeValues(profileOptions.MOTHER_TONGUE_OPTIONS, used.language),
      filters,
      afterSearchAds
    });
  } catch (err) {
    req.log.error(err);
    res.status(503).render('service-error');
  }
};

exports.myProfile = async (req, res) => {
  try {
    const [user, profile] = await Promise.all([
      User.findMemberById(req.session.user.id),
      Profile.findByUserId(req.session.user.id)
    ]);

    if (!user) {
      req.flash('error', 'Your account details could not be loaded. Please contact the administrator.');
      return res.redirect('/');
    }

    res.render('my-profile', {
      title: 'My Profile',
      user,
      profile
    });
  } catch (err) {
    req.log.error(err);
    req.flash('error', 'Could not load your profile right now. Please try again.');
    res.redirect('/');
  }
};

// Returns partial HTML for the profile-detail modal (privacy-safe fields only).
exports.profileModal = async (req, res) => {
  const profile = await Profile.findByIdPublic(req.params.id);
  if (!profile) return res.status(404).send('<p class="p-6 text-maroon-800">Profile not found.</p>');
  // A married profile (or a profile of the same gender, if the URL is guessed
  // directly) must never be shown to a member.
  const myGender = req.session.user && req.session.user.gender;
  if (profile.marital_status === 'married' || (myGender && profile.gender === myGender)) {
    return res.status(404).send('<p class="p-6 text-maroon-800">Profile not found.</p>');
  }
  res.render('partials/profile-modal', { profile, profileStates: await Interest.statesByUser(req.session.user.id), layout: false });
};

// Shared guard: a profile must exist, be unmarried, and be the opposite
// gender of the logged-in member to be a valid save/interest target. Without
// this, a user could POST directly to /profile/<any-id>/save for a
// nonexistent, same-gender, or married profile and it would silently write
// to the interests table (profileModal already enforced this — save/interest
// did not).
async function isValidInterestTarget(req, profileId) {
  const profile = await Profile.findByIdPublic(profileId);
  if (!profile) return false;
  const myGender = req.session.user && req.session.user.gender;
  if (profile.marital_status === 'married') return false;
  if (myGender && profile.gender === myGender) return false;
  return true;
}

exports.saveProfile = async (req, res) => {
  if (!(await isValidInterestTarget(req, req.params.id))) {
    if (req.get('Accept') === 'application/json') return res.status(404).json({error:req.t('That profile is not available.')});
    req.flash('error', 'That profile is not available.');
    return res.redirect(safeRedirect(req, req.get('Referrer'), '/dashboard'));
  }
  await Interest.markSaved(req.session.user.id, req.params.id);
  if (req.get('Accept') === 'application/json') return res.json({message:req.t('Profile saved.'), isSaved:true});
  req.flash('success', 'Profile saved.');
  res.redirect(safeRedirect(req, req.get('Referrer'), '/dashboard'));
};

exports.unsaveProfile = async (req, res) => {
  await Interest.markUnsaved(req.session.user.id, req.params.id);
  if (req.get('Accept') === 'application/json') return res.json({message:req.t('Profile removed from saved.'), isSaved:false});
  req.flash('success', 'Profile removed from saved.');
  res.redirect(safeRedirect(req, req.get('Referrer'), '/saved-profiles'));
};

exports.expressInterest = async (req, res) => {
  if (!(await isValidInterestTarget(req, req.params.id))) {
    if (req.get('Accept') === 'application/json') return res.status(404).json({error:req.t('That profile is not available.')});
    req.flash('error', 'That profile is not available.');
    return res.redirect(safeRedirect(req, req.get('Referrer'), '/dashboard'));
  }
  await Interest.markInterested(req.session.user.id, req.params.id);
  if (req.get('Accept') === 'application/json') return res.json({message:req.t('Interest expressed! The admin has been notified.'), isInterested:true});
  req.flash('success', 'Interest expressed! The admin has been notified.');
  res.redirect(safeRedirect(req, req.get('Referrer'), '/dashboard'));
};

exports.withdrawInterest = async (req, res) => {
  await Interest.markNotInterested(req.session.user.id, req.params.id);
  if (req.get('Accept') === 'application/json') return res.json({message:req.t('Interest withdrawn.'), isInterested:false});
  req.flash('success', 'Interest withdrawn.');
  res.redirect(safeRedirect(req, req.get('Referrer'), '/saved-profiles?tab=interested'));
};

exports.savedProfiles = async (req, res) => {
  const tab = req.query.tab === 'interested' ? 'interested' : 'saved';
  const userId = req.session.user.id;
  const [activeResult, otherCount] = await Promise.all([
    tab === 'interested' ? Interest.listInterestedByUser(userId, { page: req.query.page }) : Interest.listSavedByUser(userId, { page: req.query.page }),
    tab === 'interested' ? Interest.countSavedByUser(userId) : Interest.countInterestedByUser(userId)
  ]);
  const saved = tab === 'saved' ? activeResult.rows : [];
  const interested = tab === 'interested' ? activeResult.rows : [];
  const savedCount = tab === 'saved' ? activeResult.total : otherCount;
  const interestedCount = tab === 'interested' ? activeResult.total : otherCount;
  res.render('saved-profiles', {
    title: 'Saved Profiles',
    saved,
    interested,
    savedCount,
    interestedCount,
    pageInfo: activeResult,
    currentQuery: req.query,
    tab
  });
};
