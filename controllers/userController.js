const Profile = require('../models/Profile');
const Interest = require('../models/Interest');
const Advertisement = require('../models/Advertisement');

// Gender-based matching is mandatory: a male member only ever sees female
// profiles and vice versa. This is enforced here, not left to the user to pick.
function oppositeGender(gender) {
  if (gender === 'male') return 'female';
  if (gender === 'female') return 'male';
  return null;
}

exports.dashboard = async (req, res) => {
  try {
    const myGender = req.session.user.gender;
    const filters = {
      religion: req.query.religion,
      caste: req.query.caste,
      language: req.query.language,
      subcaste: req.query.subcaste,
      gender: oppositeGender(myGender),
      keyword: req.query.keyword,
      minAge: req.query.minAge,
      maxAge: req.query.maxAge
    };
    const [searchResult, religions, castes, languages, afterSearchAds] = await Promise.all([
      Profile.search(filters, { page: req.query.page }),
      Profile.distinctValues('religion'),
      Profile.distinctValues('caste'),
      Profile.distinctValues('language'),
      Advertisement.listActiveByPlacement('after_search')
    ]);
    res.render('user-dashboard', {
      title: 'Find Your Match',
      profiles: searchResult.rows,
      pageInfo: searchResult,
      currentQuery: req.query,
      religions,
      castes,
      languages,
      filters,
      afterSearchAds
    });
  } catch (err) {
    req.log.error(err);
    res.render('user-dashboard', {
      title: 'Find Your Match',
      profiles: [],
      pageInfo: { page: 1, perPage: 24, total: 0, totalPages: 1 },
      religions: [],
      castes: [],
      languages: [],
      filters: {},
      afterSearchAds: []
    });
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
  res.render('partials/profile-modal', { profile, layout: false });
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
    req.flash('error', 'That profile is not available.');
    return res.redirect('back');
  }
  await Interest.markSaved(req.session.user.id, req.params.id);
  req.flash('success', 'Profile saved.');
  res.redirect('back');
};

exports.expressInterest = async (req, res) => {
  if (!(await isValidInterestTarget(req, req.params.id))) {
    req.flash('error', 'That profile is not available.');
    return res.redirect(req.get('Referrer') || '/');
  }
  await Interest.markInterested(req.session.user.id, req.params.id);
  req.flash('success', 'Interest expressed! The admin has been notified.');
  res.redirect(req.get('Referrer') || '/');
};

exports.savedProfiles = async (req, res) => {
  const tab = req.query.tab === 'interested' ? 'interested' : 'saved';
  const [saved, interested] = await Promise.all([
    Interest.listSavedByUser(req.session.user.id),
    Interest.listInterestedByUser(req.session.user.id)
  ]);
  res.render('saved-profiles', { title: 'Saved Profiles', saved, interested, tab });
};
