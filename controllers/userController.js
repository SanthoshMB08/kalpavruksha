const Profile = require('../models/Profile');
const Interest = require('../models/Interest');

exports.dashboard = async (req, res) => {
  try {
    const filters = {
      religion: req.query.religion,
      caste: req.query.caste,
      language: req.query.language,
      subcaste: req.query.subcaste,
      gender: req.query.gender
    };
    const [profiles, religions, castes, languages] = await Promise.all([
      Profile.search(filters),
      Profile.distinctValues('religion'),
      Profile.distinctValues('caste'),
      Profile.distinctValues('language')
    ]);
    res.render('user-dashboard', {
      title: 'Find Your Match',
      profiles,
      religions,
      castes,
      languages,
      filters
    });
  } catch (err) {
    console.error(err);
    res.render('user-dashboard', {
      title: 'Find Your Match',
      profiles: [],
      religions: [],
      castes: [],
      languages: [],
      filters: {}
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
  await Interest.upsert(req.session.user.id, req.params.id, true);
  req.flash('success', 'Profile saved.');
  res.redirect('back');
};

exports.expressInterest = async (req, res) => {
  await Interest.upsert(req.session.user.id, req.params.id, false);
  req.flash('success', 'Interest expressed! The admin has been notified.');
 res.redirect(req.get("Referrer") || "/");
};

exports.savedProfiles = async (req, res) => {
  const saved = await Interest.listSavedByUser(req.session.user.id);
  res.render('saved-profiles', { title: 'Saved Profiles', saved });
};
