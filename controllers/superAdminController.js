const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
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
  res.render('superadmin/admins', { title: 'Sub-Admin Management', active: 'admins', admins, formErrors: [], old: {} });
};

exports.createAdmin = async (req, res) => {
  const errors = validationResult(req);
  const { name, mobile_number, username, password } = req.body;
  if (!errors.isEmpty()) {
    const admins = await User.listAll({ role: 'admin' });
    return res.render('superadmin/admins', {
      title: 'Sub-Admin Management',
      active: 'admins',
      admins,
      formErrors: errors.array().map((e) => e.msg),
      old: { name, mobile_number, username }
    });
  }
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

// Super Admin can reset an Admin's password.
exports.changeAdminPassword = async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    req.flash('error', 'Password must be at least 8 characters.');
    return res.redirect('/portal/super-secure-dashboard/admins');
  }
  try {
    const target = await User.findById(req.params.id);
    if (!target || target.role !== 'admin') {
      req.flash('error', 'That account cannot be changed here.');
      return res.redirect('/portal/super-secure-dashboard/admins');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await User.updatePassword(req.params.id, passwordHash);
    req.flash('success', `Password updated for "${target.username}".`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not update password.');
  }
  res.redirect('/portal/super-secure-dashboard/admins');
};

// --- Full profile edit (Super Admin only — includes gender & the jathaka
// document, which an ordinary Admin is not permitted to touch) ---
exports.showEditProfileForm = async (req, res) => {
  const profile = await Profile.findByIdFull(req.params.id);
  if (!profile) return res.redirect('/portal/admin-dashboard/profiles');
  res.render('superadmin/profile-edit', { title: `Edit ${profile.full_name}`, active: 'profiles', profile, errors: [] });
};

exports.updateProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const profile = await Profile.findByIdFull(req.params.id);
    return res.render('superadmin/profile-edit', {
      title: `Edit ${profile ? profile.full_name : ''}`,
      active: 'profiles',
      profile: { ...profile, ...req.body, id: req.params.id },
      errors: errors.array().map((e) => e.msg)
    });
  }
  try {
    const files = req.files || {};
    const data = { ...req.body };
    if (files.profile_image) data.image_name = files.profile_image[0].filename;
    if (files.profile_image_2) data.image_name_2 = files.profile_image_2[0].filename;
    if (files.jathaka_pdf) data.jathaka_pdf_name = files.jathaka_pdf[0].filename;
    if (files.biodata_pdf) data.biodata_pdf_name = files.biodata_pdf[0].filename;
    await Profile.updateFields(req.params.id, data);
    req.flash('success', 'Profile updated.');
    res.redirect(`/portal/admin-dashboard/profiles/${req.params.id}`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not update profile.');
    res.redirect(`/portal/super-secure-dashboard/profiles/${req.params.id}/edit`);
  }
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
    const { ad_title, placement, target_url, expires_at } = req.body;
    if (!expires_at) {
      req.flash('error', 'Please set an expiry date/time for the advertisement.');
      return res.redirect('/portal/super-secure-dashboard/ads');
    }
    const expiresAt = new Date(expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      req.flash('error', 'Expiry must be a valid date/time in the future.');
      return res.redirect('/portal/super-secure-dashboard/ads');
    }
    await Advertisement.create({
      ad_title,
      placement,
      target_url,
      image_name: req.file.filename,
      expiresAt
    });
    req.flash('success', 'Advertisement uploaded. It has taken over the single slot for this location.');
    res.redirect('/portal/super-secure-dashboard/ads');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not upload advertisement.');
    res.redirect('/portal/super-secure-dashboard/ads');
  }
};

exports.toggleAd = async (req, res) => {
  try {
    await Advertisement.toggleActive(req.params.id);
  } catch (err) {
    if (err.code === 'AD_EXPIRED') {
      req.flash('error', err.message);
    } else {
      console.error(err);
      req.flash('error', 'Could not update advertisement status.');
    }
  }
  res.redirect('/portal/super-secure-dashboard/ads');
};

exports.deleteAd = async (req, res) => {
  await Advertisement.deleteById(req.params.id);
  req.flash('success', 'Advertisement removed.');
  res.redirect('/portal/super-secure-dashboard/ads');
};

// --- Success stories (home page content) — Super Admin only ---
exports.storiesPage = async (req, res) => {
  const stories = await SuccessStory.listAll();
  res.render('admin/stories', {
    title: 'Success Stories',
    active: 'stories',
    stories,
    portalHome: '/portal/super-secure-dashboard',
    isSuperAdmin: true,
    canEdit: true
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
