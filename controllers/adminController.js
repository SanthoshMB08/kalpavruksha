const bcrypt = require('bcrypt');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Interest = require('../models/Interest');
const SuccessStory = require('../models/SuccessStory');

exports.showLogin = (req, res) => {
  res.render('admin/login', { title: 'Admin Login', error: null });
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findByUsername(username);
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return res.render('admin/login', { title: 'Admin Login', error: 'Invalid credentials.' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('admin/login', { title: 'Admin Login', error: 'Invalid credentials.' });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      status: user.status,
      viewMode: 'admin'
    };

    if (user.role === 'superadmin') return res.redirect('/portal/super-secure-dashboard');
    return res.redirect('/portal/admin-dashboard');
  } catch (err) {
    console.error(err);
    return res.render('admin/login', { title: 'Admin Login', error: 'Something went wrong.' });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect('/portal/admin-login'));
};

exports.toggleView = (req, res) => {
  if (!req.session.user) return res.redirect('/portal/admin-login');
  req.session.user.viewMode = req.session.user.viewMode === 'admin' ? 'user' : 'admin';
  const back = req.get('Referrer');
  if (req.session.user.viewMode === 'user') return res.redirect('/dashboard');
  return res.redirect(back || '/portal/admin-dashboard');
};

// --- Overview page: at-a-glance stats + recent activity only ---
exports.dashboard = async (req, res) => {
  try {
    const [pending, recentInterests, totalProfiles] = await Promise.all([
      User.listPending(),
      Interest.recentExpressed(8),
      Profile.count()
    ]);
    res.render('admin/dashboard', {
      title: 'Admin Overview',
      active: 'overview',
      pending,
      recentInterests,
      totalProfiles
    });
  } catch (err) {
    console.error(err);
    res.render('admin/dashboard', {
      title: 'Admin Overview',
      active: 'overview',
      pending: [],
      recentInterests: [],
      totalProfiles: 0
    });
  }
};

// --- User management page: pending approvals + direct creation ---
exports.userManagement = async (req, res) => {
  try {
    const pending = await User.listPending();
    res.render('admin/users', { title: 'User Management', active: 'users', pending });
  } catch (err) {
    console.error(err);
    res.render('admin/users', { title: 'User Management', active: 'users', pending: [] });
  }
};

exports.approveUser = async (req, res) => {
  await User.updateStatus(req.params.id, 'approved');
  req.flash('success', 'User approved.');
  res.redirect('/portal/admin-dashboard/users');
};

exports.rejectUser = async (req, res) => {
  await User.updateStatus(req.params.id, 'rejected');
  req.flash('success', 'User denied.');
  res.redirect('/portal/admin-dashboard/users');
};

// Admin direct-creation form: bypasses approval entirely.
exports.createUserDirect = async (req, res) => {
  const { name, mobile_number, username, password } = req.body;
  try {
    const exists = await User.mobileOrUsernameExists(mobile_number, username);
    if (exists) {
      req.flash('error', 'That mobile number or username already exists.');
      return res.redirect('/portal/admin-dashboard/users');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({ name, mobile_number, username, passwordHash, role: 'user', status: 'approved' });
    req.flash('success', `User "${username}" created and activated instantly.`);
    res.redirect('/portal/admin-dashboard/users');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not create user.');
    res.redirect('/portal/admin-dashboard/users');
  }
};

// --- Profiles ---
exports.listProfiles = async (req, res) => {
  const profiles = await Profile.listAllFull();
  res.render('admin/profiles', { title: 'All Profiles', active: 'profiles', profiles });
};

exports.showNewProfileForm = (req, res) => {
  res.render('admin/profile-form', { title: 'Upload New Profile', active: 'profiles', errors: [] });
};

exports.createProfile = async (req, res) => {
  try {
    const files = req.files || {};
    const image = files.profile_image ? files.profile_image[0].filename : null;
    const jathaka = files.jathaka_pdf ? files.jathaka_pdf[0].filename : null;

    if (!image) {
      req.flash('error', 'A profile photo is required.');
      return res.redirect('/portal/admin-dashboard/profiles/new');
    }

    await Profile.create({
      ...req.body,
      image_name: image,
      jathaka_pdf_name: jathaka,
      created_by: req.session.user.id
    });

    req.flash('success', 'Profile uploaded successfully.');
    res.redirect('/portal/admin-dashboard/profiles');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not save profile. Please check the form and try again.');
    res.redirect('/portal/admin-dashboard/profiles/new');
  }
};

exports.deleteProfile = async (req, res) => {
  await Profile.deleteById(req.params.id);
  req.flash('success', 'Profile removed.');
  res.redirect('/portal/admin-dashboard/profiles');
};

exports.viewProfileFull = async (req, res) => {
  const profile = await Profile.findByIdFull(req.params.id);
  if (!profile) return res.redirect('/portal/admin-dashboard/profiles');
  res.render('admin/profile-detail', { title: profile.full_name, active: 'profiles', profile });
};

// --- Success stories (home page content) ---
exports.storiesPage = async (req, res) => {
  const stories = await SuccessStory.listAll();
  res.render('admin/stories', { title: 'Success Stories', active: 'stories', stories, portalHome: '/portal/admin-dashboard' });
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
  res.redirect('/portal/admin-dashboard/stories');
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
  res.redirect('/portal/admin-dashboard/stories');
};

exports.toggleStory = async (req, res) => {
  await SuccessStory.toggleActive(req.params.id);
  res.redirect('/portal/admin-dashboard/stories');
};

exports.deleteStory = async (req, res) => {
  await SuccessStory.deleteById(req.params.id);
  req.flash('success', 'Success story removed.');
  res.redirect('/portal/admin-dashboard/stories');
};
