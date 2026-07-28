const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAdmin, isSuperAdmin } = require('../middleware/auth');
const { uploadProfileAssets } = require('../middleware/upload');
const { profileValidators, memberCreateValidators } = require('../middleware/validators');

router.get('/admin-login', adminController.showLogin);
router.post('/admin-login', adminController.login);
router.get('/admin-logout', adminController.logout);

router.get('/admin-dashboard', isAdmin, adminController.dashboard);
router.get('/admin-dashboard/activity', isAdmin, adminController.activityFeed);

router.get('/admin-dashboard/users', isAdmin, adminController.userManagement);
router.post('/admin-dashboard/users/:id/approve', isAdmin, adminController.approveUser);
router.post('/admin-dashboard/users/:id/reject', isAdmin, adminController.rejectUser);
router.post('/admin-dashboard/users/create-direct', isAdmin, memberCreateValidators, adminController.createUserDirect);
router.post('/admin-dashboard/users/:id/password', isAdmin, adminController.changeUserPassword);

router.get('/admin-dashboard/profiles', isAdmin, adminController.listProfiles);
router.get('/admin-dashboard/profiles/new', isAdmin, adminController.showNewProfileForm);
router.post('/admin-dashboard/profiles', isAdmin, uploadProfileAssets, profileValidators, adminController.createProfile);
router.get('/admin-dashboard/profiles/:id', isAdmin, adminController.viewProfileFull);
router.get('/admin-dashboard/profiles/:id/pdf', isAdmin, adminController.exportProfilePdf);
router.post('/admin-dashboard/profiles/:id/photos', isAdmin, uploadProfileAssets, adminController.updateProfilePhotos);
router.post('/admin-dashboard/profiles/:id/marital-status', isAdmin, adminController.updateMaritalStatus);
router.post('/admin-dashboard/profiles/:id/delete', isSuperAdmin, adminController.deleteProfile);

// Success stories: view-only for Admin — create/update/toggle/delete are Super Admin only (see routes/superadmin.js)
router.get('/admin-dashboard/stories', isAdmin, adminController.storiesPage);

module.exports = router;
