const Profile = require('../models/Profile');
const Interest = require('../models/Interest');
const Advertisement = require('../models/Advertisement');

exports.dashboard = async (req, res) => {
  try {
    const filters = {
      religion: req.query.religion,
      caste: req.query.caste,
      language: req.query.language,
      subcaste: req.query.subcaste,
      gender: req.query.gender,
      keyword: req.query.keyword,
      minAge: req.query.minAge,
      maxAge: req.query.maxAge
    };
    const [profiles, religions, castes, languages, afterSearchAds] = await Promise.all([
      Profile.search(filters),
      Profile.distinctValues('religion'),
      Profile.distinctValues('caste'),
      Profile.distinctValues('language'),
      Advertisement.listActiveByPlacement('after_search')
    ]);
    res.render('user-dashboard', {
      title: 'Find Your Match',
      profiles,
      religions,
      castes,
      languages,
      filters,
      afterSearchAds
    });
  } catch (err) {
    console.error(err);
    res.render('user-dashboard', {
      title: 'Find Your Match',
      profiles: [],
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
  res.render('partials/profile-modal', { profile, layout: false });
};

exports.saveProfile = async (req, res) => {
  await Interest.markSaved(req.session.user.id, req.params.id);
  req.flash('success', 'Profile saved.');
  res.redirect('back');
};

exports.expressInterest = async (req, res) => {
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
