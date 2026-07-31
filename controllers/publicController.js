const Advertisement = require('../models/Advertisement');
const Profile = require('../models/Profile');
const SuccessStory = require('../models/SuccessStory');
const ContactMessage = require('../models/ContactMessage');

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
    req.log.error(err);
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

exports.contactSubmit = async (req, res) => {
  const { name, mobile, message } = req.body;
  if (!name || !mobile || !message) {
    req.flash('error', 'Please fill in all fields.');
    return res.redirect('/#contact');
  }
  try {
    await ContactMessage.create({ name: name.trim(), mobile: mobile.trim(), message: message.trim() });
    req.flash('success', 'Thank you, we will get back to you shortly.');
  } catch (err) {
    req.log.error(err);
    req.flash('error', 'Something went wrong sending your message. Please try again.');
  }
  res.redirect('/#contact');
};

exports.terms = (req, res) => {
  res.render('terms', { title: 'Terms & Conditions' });
};

exports.privacy = (req, res) => {
  res.render('privacy', { title: 'Privacy Policy' });
};
