const bcrypt = require('bcrypt');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Advertisement = require('../models/Advertisement');
const SuccessStory = require('../models/SuccessStory');

exports.showLogin = (req, res) => {
  res.render('superadmin/login', { title: 'Super Admin Login', error: null });
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findByUsername(username);
    if (!user || user.role !== 'superadmin') {
      return res.render('superadmin/login', { title: 'Super Admin Login', error: 'Invalid credentials.' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('superadmin/login', { title: 'Super Admin Login', error: 'Invalid credentials.' });
    }
    req.session.user = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      status: user.status
    };
    res.redirect('/portal/super-secure-dashboard');
  } catch (err) {
    console.error(err);
    res.render('superadmin/login', { title: 'Super Admin Login', error: 'Something went wrong.' });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect('/portal/super-secure-login'));
};

// --- Overview page: stats + quick links only ---
exports.dashboard = async (req, res) => {
  try {
    const [userCounts, totalProfiles, adminCount, adCount, storyCount] = await Promise.all([
      User.counts(),
      Profile.count(),
      User.listAll({ role: 'admin' }).then((r) => r.length),
      Advertisement.listAll().then((r) => r.length),
      SuccessStory.listAll().then((r) => r.length)
    ]);
    res.render('superadmin/dashboard', {
      title: 'Super Admin Overview',
      active: 'overview',
      userCounts,
      totalProfiles,
      adminCount,
      adCount,
      storyCount
    });
  } catch (err) {
    console.error(err);
    res.render('superadmin/dashboard', {
      title: 'Super Admin Overview',
      active: 'overview',
      userCounts: {},
      totalProfiles: 0,
      adminCount: 0,
      adCount: 0,
      storyCount: 0
    });
  }
};

// --- Sub-admin (staff) management page ---
exports.adminsPage = async (req, res) => {
  const admins = await User.listAll({ role: 'admin' });
  res.render('superadmin/admins', { title: 'Sub-Admin Management', active: 'admins', admins });
};

exports.createAdmin = async (req, res) => {
  const { name, mobile_number, username, password } = req.body;
  try {
    const exists = await User.mobileOrUsernameExists(mobile_number, username);
    if (exists) {
      req.flash('error', 'That mobile number or username already exists.');
      return res.redirect('/portal/super-secure-dashboard/admins');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({ name, mobile_number, username, passwordHash, role: 'admin', status: 'approved' });
    req.flash('success', `Admin account "${username}" created.`);
    res.redirect('/portal/super-secure-dashboard/admins');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not create admin account.');
    res.redirect('/portal/super-secure-dashboard/admins');
  }
};

exports.removeAdmin = async (req, res) => {
  await User.deleteById(req.params.id);
  req.flash('success', 'Admin account removed.');
  res.redirect('/portal/super-secure-dashboard/admins');
};

// --- Sponsorship / Ad manager page ---
exports.adsPage = async (req, res) => {
  const ads = await Advertisement.listAll();
  res.render('superadmin/ads', { title: 'Advertisement Manager', active: 'ads', ads });
};

exports.createAd = async (req, res) => {
  try {
    if (!req.file) {
      req.flash('error', 'Please choose an image for the advertisement.');
      return res.redirect('/portal/super-secure-dashboard/ads');
    }
    const { ad_title, placement, target_url } = req.body;
    await Advertisement.create({
      ad_title,
      placement,
      target_url,
      image_name: req.file.filename
    });
    req.flash('success', 'Advertisement uploaded.');
    res.redirect('/portal/super-secure-dashboard/ads');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not upload advertisement.');
    res.redirect('/portal/super-secure-dashboard/ads');
  }
};

exports.toggleAd = async (req, res) => {
  await Advertisement.toggleActive(req.params.id);
  res.redirect('/portal/super-secure-dashboard/ads');
};

exports.deleteAd = async (req, res) => {
  await Advertisement.deleteById(req.params.id);
  req.flash('success', 'Advertisement removed.');
  res.redirect('/portal/super-secure-dashboard/ads');
};

// --- Success stories (home page content) ---
exports.storiesPage = async (req, res) => {
  const stories = await SuccessStory.listAll();
  res.render('admin/stories', {
    title: 'Success Stories',
    active: 'stories',
    stories,
    portalHome: '/portal/super-secure-dashboard',
    isSuperAdmin: true
  });
};

exports.createStory = async (req, res) => {
  const { couple_names, story_text, display_order } = req.body;
  try {
    await SuccessStory.create({ couple_names, story_text, display_order, created_by: req.session.user.id });
    req.flash('success', 'Success story added.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not add the success story.');
  }
  res.redirect('/portal/super-secure-dashboard/stories');
};

exports.updateStory = async (req, res) => {
  const { couple_names, story_text, display_order } = req.body;
  try {
    await SuccessStory.update(req.params.id, { couple_names, story_text, display_order });
    req.flash('success', 'Success story updated.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not update the success story.');
  }
  res.redirect('/portal/super-secure-dashboard/stories');
};

exports.toggleStory = async (req, res) => {
  await SuccessStory.toggleActive(req.params.id);
  res.redirect('/portal/super-secure-dashboard/stories');
};

exports.deleteStory = async (req, res) => {
  await SuccessStory.deleteById(req.params.id);
  req.flash('success', 'Success story removed.');
  res.redirect('/portal/super-secure-dashboard/stories');
};
