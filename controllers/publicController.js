const Advertisement = require('../models/Advertisement');
const Profile = require('../models/Profile');

exports.home = async (req, res) => {
  try {
    const [sidebarAds, totalProfiles] = await Promise.all([
      Advertisement.listActiveByPlacement('sidebar'),
      Profile.count()
    ]);
    res.render('index', { title: 'Kalpavruksha Kalyana', sidebarAds, totalProfiles });
  } catch (err) {
    console.error(err);
    res.render('index', { title: 'Kalpavruksha Kalyana', sidebarAds: [], totalProfiles: 0 });
  }
};

exports.contactSubmit = (req, res) => {
  // Placeholder: in production this would email/store the enquiry.
  req.flash('success', 'Thank you, we will get back to you shortly.');
  res.redirect('/#contact');
};
