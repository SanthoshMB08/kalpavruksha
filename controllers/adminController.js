const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Interest = require('../models/Interest');
const SuccessStory = require('../models/SuccessStory');
const { streamProfilePdf } = require('../utils/profilePdf');

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
      status: user.status
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

// --- User management page: pending approvals, active members, direct creation ---
exports.userManagement = async (req, res) => {
  try {
    const [pending, members] = await Promise.all([User.listPending(), User.listApprovedUsers()]);
    res.render('admin/users', { title: 'User Management', active: 'users', pending, members, formErrors: [], old: {} });
  } catch (err) {
    console.error(err);
    res.render('admin/users', { title: 'User Management', active: 'users', pending: [], members: [], formErrors: [], old: {} });
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

// Admin direct-creation form: bypasses approval entirely. Gender is required
// (mandatory for the opposite-gender match rule) and must be the opposite of
// nothing in particular here — this is account creation, not matching.
exports.createUserDirect = async (req, res) => {
  const errors = validationResult(req);
  const { name, mobile_number, username, password, gender } = req.body;
  if (!errors.isEmpty()) {
    const [pending, members] = await Promise.all([User.listPending(), User.listApprovedUsers()]);
    return res.render('admin/users', {
      title: 'User Management',
      active: 'users',
      pending,
      members,
      formErrors: errors.array().map((e) => e.msg),
      old: { name, mobile_number, username, gender }
    });
  }
  try {
    const exists = await User.mobileOrUsernameExists(mobile_number, username);
    if (exists) {
      req.flash('error', 'That mobile number or username already exists.');
      return res.redirect('/portal/admin-dashboard/users');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({ name, mobile_number, username, passwordHash, role: 'user', status: 'approved', gender });
    req.flash('success', `User "${username}" created and activated instantly.`);
    res.redirect('/portal/admin-dashboard/users');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not create user.');
    res.redirect('/portal/admin-dashboard/users');
  }
};

// Admin can reset a member's (role='user') password.
exports.changeUserPassword = async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    req.flash('error', 'Password must be at least 8 characters.');
    return res.redirect('/portal/admin-dashboard/users');
  }
  try {
    const target = await User.findById(req.params.id);
    if (!target || target.role !== 'user') {
      req.flash('error', 'That account cannot be changed here.');
      return res.redirect('/portal/admin-dashboard/users');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await User.updatePassword(req.params.id, passwordHash);
    req.flash('success', `Password updated for "${target.username}".`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not update password.');
  }
  res.redirect('/portal/admin-dashboard/users');
};

// --- Profiles ---
exports.listProfiles = async (req, res) => {
  const filters = {
    keyword: req.query.keyword,
    religion: req.query.religion,
    caste: req.query.caste,
    subcaste: req.query.subcaste,
    language: req.query.language,
    gender: req.query.gender,
    minAge: req.query.minAge,
    maxAge: req.query.maxAge,
    maritalStatus: req.query.maritalStatus
  };
  const hasFilters = Object.values(filters).some((v) => v !== undefined && v !== '');
  const [profiles, religions, castes, languages] = await Promise.all([
    hasFilters ? Profile.searchFull(filters) : Profile.listAllFull(),
    Profile.distinctValues('religion'),
    Profile.distinctValues('caste'),
    Profile.distinctValues('language')
  ]);
  res.render('admin/profiles', { title: 'All Profiles', active: 'profiles', profiles, religions, castes, languages, filters });
};

exports.showNewProfileForm = (req, res) => {
  res.render('admin/profile-form', { title: 'Upload New Profile', active: 'profiles', errors: [], old: {} });
};

exports.createProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('admin/profile-form', {
      title: 'Upload New Profile',
      active: 'profiles',
      errors: errors.array().map((e) => e.msg),
      old: req.body
    });
  }
  try {
    const files = req.files || {};
    const image = files.profile_image ? files.profile_image[0].filename : null;
    const image2 = files.profile_image_2 ? files.profile_image_2[0].filename : null;
    const jathaka = files.jathaka_pdf ? files.jathaka_pdf[0].filename : null;
    const biodata = files.biodata_pdf ? files.biodata_pdf[0].filename : null;

    if (!image) {
      req.flash('error', 'A profile photo is required.');
      return res.redirect('/portal/admin-dashboard/profiles/new');
    }

    await Profile.create({
      ...req.body,
      image_name: image,
      image_name_2: image2,
      jathaka_pdf_name: jathaka,
      biodata_pdf_name: biodata,
      marital_status: 'unmarried',
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

// Admin capability: add/replace up to two profile photos on an existing profile.
exports.updateProfilePhotos = async (req, res) => {
  try {
    const files = req.files || {};
    const data = {};
    if (files.profile_image) data.image_name = files.profile_image[0].filename;
    if (files.profile_image_2) data.image_name_2 = files.profile_image_2[0].filename;
    if (Object.keys(data).length === 0) {
      req.flash('error', 'Choose at least one photo to upload.');
      return res.redirect(`/portal/admin-dashboard/profiles/${req.params.id}`);
    }
    await Profile.updateFields(req.params.id, data);
    req.flash('success', 'Profile photo(s) updated.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not update photos.');
  }
  res.redirect(`/portal/admin-dashboard/profiles/${req.params.id}`);
};

// Admin capability: mark a profile Married / Unmarried. Married profiles stop
// appearing to members immediately (enforced in Profile.search()).
exports.updateMaritalStatus = async (req, res) => {
  const status = req.body.marital_status === 'married' ? 'married' : 'unmarried';
  await Profile.updateFields(req.params.id, { marital_status: status });
  req.flash('success', `Profile marked as ${status}.`);
  res.redirect(`/portal/admin-dashboard/profiles/${req.params.id}`);
};

// Admin capability: download the profile as a PDF (with photo).
exports.exportProfilePdf = async (req, res) => {
  const profile = await Profile.findByIdFull(req.params.id);
  if (!profile) return res.redirect('/portal/admin-dashboard/profiles');
  await streamProfilePdf(res, profile);
};

// --- Success stories (view-only for Admin — editing is Super Admin only) ---
exports.storiesPage = async (req, res) => {
  const stories = await SuccessStory.listAll();
  res.render('admin/stories', { title: 'Success Stories', active: 'stories', stories, portalHome: '/portal/admin-dashboard', canEdit: false });
};
