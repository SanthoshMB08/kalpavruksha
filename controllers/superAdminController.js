const bcrypt = require('bcrypt');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Advertisement = require('../models/Advertisement');

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

exports.dashboard = async (req, res) => {
  try {
    const [userCounts, totalProfiles, admins, ads] = await Promise.all([
      User.counts(),
      Profile.count(),
      User.listAll({ role: 'admin' }),
      Advertisement.listAll()
    ]);
    res.render('superadmin/dashboard', {
      title: 'Super Admin Dashboard',
      userCounts,
      totalProfiles,
      admins,
      ads
    });
  } catch (err) {
    console.error(err);
    res.render('superadmin/dashboard', {
      title: 'Super Admin Dashboard',
      userCounts: {},
      totalProfiles: 0,
      admins: [],
      ads: []
    });
  }
};

// --- Sub-admin (staff) management ---
exports.createAdmin = async (req, res) => {
  const { name, mobile_number, username, password } = req.body;
  try {
    const exists = await User.mobileOrUsernameExists(mobile_number, username);
    if (exists) {
      req.flash('error', 'That mobile number or username already exists.');
      return res.redirect('/portal/super-secure-dashboard');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({ name, mobile_number, username, passwordHash, role: 'admin', status: 'approved' });
    req.flash('success', `Admin account "${username}" created.`);
    res.redirect('/portal/super-secure-dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not create admin account.');
    res.redirect('/portal/super-secure-dashboard');
  }
};

exports.removeAdmin = async (req, res) => {
  await User.deleteById(req.params.id);
  req.flash('success', 'Admin account removed.');
  res.redirect('/portal/super-secure-dashboard');
};

// --- Sponsorship / Ad manager ---
exports.createAd = async (req, res) => {
  try {
    if (!req.file) {
      req.flash('error', 'Please choose an image for the advertisement.');
      return res.redirect('/portal/super-secure-dashboard');
    }
    const { ad_title, placement, target_url } = req.body;
    await Advertisement.create({
      ad_title,
      placement,
      target_url,
      image_name: req.file.filename
    });
    req.flash('success', 'Advertisement uploaded.');
    res.redirect('/portal/super-secure-dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not upload advertisement.');
    res.redirect('/portal/super-secure-dashboard');
  }
};

exports.toggleAd = async (req, res) => {
  await Advertisement.toggleActive(req.params.id);
  res.redirect('/portal/super-secure-dashboard');
};

exports.deleteAd = async (req, res) => {
  await Advertisement.deleteById(req.params.id);
  req.flash('success', 'Advertisement removed.');
  res.redirect('/portal/super-secure-dashboard');
};
