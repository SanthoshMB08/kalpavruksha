const { parseAdExpiry } = require('../utils/adPlacements');
const { establishSession, logout, validPassword, PASSWORD_MESSAGE } = require('../utils/security');
const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Advertisement = require('../models/Advertisement');
const SuccessStory = require('../models/SuccessStory');
const ContactMessage = require('../models/ContactMessage');
const profileOptions = require('../utils/profileOptions');

exports.showLogin = (req, res) => {
  res.render('superadmin/login', { title: 'Super Admin Login', error: null });
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findByUsername(username);
    if (!user || user.status !== 'approved' || user.role !== 'superadmin') {
      return res.render('superadmin/login', { title: 'Super Admin Login', error: 'Invalid credentials.' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('superadmin/login', { title: 'Super Admin Login', error: 'Invalid credentials.' });
    }
    await establishSession(req, user);
    res.redirect('/portal/super-secure-dashboard');
  } catch (err) {
    req.log.error(err);
    res.render('superadmin/login', { title: 'Super Admin Login', error: 'Something went wrong.' });
  }
};

exports.logout = (req, res, next) => logout(req, res, next, '/portal/super-secure-login');

// --- Overview page: stats + quick links only ---
exports.dashboard = async (req, res) => {
  try {
    const [userCounts, totalProfiles, adCount, storyCount] = await Promise.all([
      User.counts(),
      Profile.count(),
      Advertisement.listAll().then((r) => r.length),
      SuccessStory.listAll().then((r) => r.length)
    ]);
    const adminCount = userCounts.total_admins;
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
    req.log.error(err);
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
  const adminsResult = await User.listAll({ role: 'admin' }, { page: req.query.page });
  res.render('superadmin/admins', {
    title: 'Sub-Admin Management',
    active: 'admins',
    admins: adminsResult.rows,
    pageInfo: adminsResult,
    currentQuery: req.query,
    formErrors: [],
    old: {}
  });
};

exports.createAdmin = async (req, res) => {
  const errors = validationResult(req);
  const { name, mobile_number, username, password } = req.body;
  if (!errors.isEmpty()) {
    const adminsResult = await User.listAll({ role: 'admin' });
    return res.render('superadmin/admins', {
      title: 'Sub-Admin Management',
      active: 'admins',
      admins: adminsResult.rows,
      pageInfo: adminsResult,
      currentQuery: req.query,
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
    req.log.error(err);
    req.flash('error', 'Could not create admin account.');
    res.redirect('/portal/super-secure-dashboard/admins');
  }
};

exports.removeAdmin = async (req, res) => {
  await User.deleteById(req.params.id);
  req.flash('success', 'Admin account removed.');
  res.redirect('/portal/super-secure-dashboard/admins');
};

exports.unlockAdmin = async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) {
    req.flash('error', 'Account not found.');
    return res.redirect('/portal/super-secure-dashboard/admins');
  }
  await User.unlockAccount(req.params.id);
  req.flash('success', `"${target.username}" has been unlocked.`);
  res.redirect('/portal/super-secure-dashboard/admins');
};

// Super Admin can reset an Admin's password.
exports.changeAdminPassword = async (req, res) => {
  const { password } = req.body;
  if (!validPassword(password)) {
    req.flash('error', PASSWORD_MESSAGE);
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
    req.log.error(err);
    req.flash('error', 'Could not update password.');
  }
  res.redirect('/portal/super-secure-dashboard/admins');
};

// --- Full profile edit (Super Admin only — includes gender & the jathaka
// document, which an ordinary Admin is not permitted to touch) ---
exports.showEditProfileForm = async (req, res) => {
  const profile = await Profile.findByIdFull(req.params.id);
  if (!profile) return res.redirect('/portal/admin-dashboard/profiles');
  res.render('superadmin/profile-edit', { title: `Edit ${profile.full_name}`, active: 'profiles', profile, errors: [], opts: profileOptions });
};

exports.updateProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const profile = await Profile.findByIdFull(req.params.id);
    return res.render('superadmin/profile-edit', {
      title: `Edit ${profile ? profile.full_name : ''}`,
      active: 'profiles',
      profile: { ...profile, ...req.body, id: req.params.id },
      errors: errors.array().map((e) => e.msg),
      opts: profileOptions
    });
  }
  try {
    const files = req.files || {};
    const data = { ...req.body };
    if (files.profile_image) data.image_name = files.profile_image[0].filename;
    if (files.profile_image_2) data.image_name_2 = files.profile_image_2[0].filename;
    if (files.jathaka_pdf) data.jathaka_pdf_name = files.jathaka_pdf[0].filename;
    if (files.biodata_pdf) data.biodata_pdf_name = files.biodata_pdf[0].filename;
    // Keep the legacy `language` column (still used by the member search
    // filter) in sync whenever mother_tongue is edited here.
    if (data.mother_tongue) {
      data.language = data.mother_tongue === 'Other' ? (data.mother_tongue_other || 'Other') : data.mother_tongue;
    }
    await Profile.updateFields(req.params.id, data);
    req.flash('success', 'Profile updated.');
    res.redirect(`/portal/admin-dashboard/profiles/${req.params.id}`);
  } catch (err) {
    req.log.error(err);
    req.flash('error', 'Could not update profile.');
    res.redirect(`/portal/super-secure-dashboard/profiles/${req.params.id}/edit`);
  }
};

// --- Sponsorship / Ad manager page ---
exports.adsPage = async (req, res) => {
  const ads = await Advertisement.listAll();
  res.render('superadmin/ads', { title: 'Advertisement Manager', active: 'ads', ads });
};

exports.createAd = async (req,res) => {
  try {
    await Advertisement.create({ ad_title:req.body.ad_title, placement:req.body.placement, target_url:req.body.target_url,
      image_name:req.file.filename, mobile_image_name:req.mobileAdFile.filename, expiresAt:req.adExpiresAt });
    req.flash('success','Advertisement published.');
  } catch(err) { req.log.error(err); req.flash('error','Could not publish advertisement. The previous advertisement is unchanged.'); }
  res.redirect(303,'/portal/super-secure-dashboard/ads');
};

exports.toggleAd = async (req, res) => {
  try {
    await Advertisement.toggleActive(req.params.id);
  } catch (err) {
    if (err.code === 'AD_EXPIRED') {
      req.flash('error', err.message);
    } else {
      req.log.error(err);
      req.flash('error', 'Could not update advertisement status.');
    }
  }
  res.redirect('/portal/super-secure-dashboard/ads');
};

// Reactivating an ad whose old expiry has already passed — the admin sets a
// new expiry date/time in the same step, rather than the plain toggle above
// which just rejects the request (see AD_EXPIRED in toggleActive).
exports.reactivateAd = async (req, res) => {
  const { expires_at } = req.body;
  if (!expires_at) {
    req.flash('error', 'Please set a new expiry date/time to reactivate this advertisement.');
    return res.redirect('/portal/super-secure-dashboard/ads');
  }
  const expiresAt = parseAdExpiry(expires_at);
  if (!expiresAt) {
    req.flash('error', 'Expiry must be a valid date/time in the future.');
    return res.redirect('/portal/super-secure-dashboard/ads');
  }
  try {
    await Advertisement.reactivateWithNewExpiry(req.params.id, expiresAt);
    req.flash('success', 'Advertisement reactivated with the new expiry.');
  } catch (err) {
    req.log.error(err);
    req.flash('error', 'Could not reactivate advertisement.');
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

exports.messagesPage = async (req, res) => {
  const messages = await ContactMessage.listAll();
  res.render('superadmin/messages', { title: 'Contact Messages', active: 'messages', messages });
};

exports.markMessageRead = async (req, res) => {
  await ContactMessage.markRead(req.params.id);
  res.redirect('/portal/super-secure-dashboard/messages');
};

exports.deleteMessage = async (req, res) => {
  await ContactMessage.deleteById(req.params.id);
  req.flash('success', 'Message deleted.');
  res.redirect('/portal/super-secure-dashboard/messages');
};

// --- Trash: soft-deleted users + profiles, restore or permanently purge ---
exports.trashPage = async (req, res) => {
  const [deletedUsers, deletedProfiles] = await Promise.all([
    User.listDeleted({ page: req.query.usersPage }),
    Profile.listDeleted({ page: req.query.profilesPage })
  ]);
  res.render('superadmin/trash', {
    title: 'Trash',
    active: 'trash',
    deletedUsers: deletedUsers.rows,
    usersPageInfo: deletedUsers,
    deletedProfiles: deletedProfiles.rows,
    profilesPageInfo: deletedProfiles,
    currentQuery: req.query
  });
};

exports.restoreUser = async (req, res) => {
  await User.restoreById(req.params.id);
  req.flash('success', 'User restored.');
  res.redirect('/portal/super-secure-dashboard/trash');
};

exports.purgeUser = async (req, res) => {
  await User.purgeById(req.params.id);
  req.flash('success', 'User permanently deleted.');
  res.redirect('/portal/super-secure-dashboard/trash');
};

exports.restoreProfile = async (req, res) => {
  await Profile.restoreById(req.params.id);
  req.flash('success', 'Profile restored.');
  res.redirect('/portal/super-secure-dashboard/trash');
};

exports.purgeProfile = async (req, res) => {
  await Profile.purgeById(req.params.id);
  req.flash('success', 'Profile permanently deleted.');
  res.redirect('/portal/super-secure-dashboard/trash');
};

exports.createStory = async (req, res) => {
  const { couple_names, story_text, display_order } = req.body;
  try {
    await SuccessStory.create({ couple_names, story_text, display_order, created_by: req.session.user.id });
    req.flash('success', 'Success story added.');
  } catch (err) {
    req.log.error(err);
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
    req.log.error(err);
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
