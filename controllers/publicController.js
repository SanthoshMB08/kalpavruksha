const Advertisement = require('../models/Advertisement');
const Profile = require('../models/Profile');
const SuccessStory = require('../models/SuccessStory');

exports.home = async (req, res) => {
  try {
    const [adsByPlacement, totalProfiles, stories] = await Promise.all([
      Advertisement.listActiveGroupedByPlacements(['sidebar', 'home_middle', 'home_bottom']),
      Profile.count(),
      SuccessStory.listActive()
    ]);
    res.render('index', {
      title: 'Kalpavruksha Kalyana',
      sidebarAds: adsByPlacement.sidebar,
      midAds: adsByPlacement.home_middle,
      bottomAds: adsByPlacement.home_bottom,
      totalProfiles,
      stories
    });
  } catch (err) {
    console.error(err);
    res.render('index', {
      title: 'Kalpavruksha Kalyana',
      sidebarAds: [],
      midAds: [],
      bottomAds: [],
      totalProfiles: 0,
      stories: []
    });
  }
};

exports.contactSubmit = (req, res) => {
  // Placeholder: in production this would email/store the enquiry.
  req.flash('success', 'Thank you, we will get back to you shortly.');
  res.redirect('/#contact');
};
