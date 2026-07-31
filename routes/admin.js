const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAdmin, isSuperAdmin } = require('../middleware/auth');
const { uploadProfileAssets } = require('../middleware/upload');
const { profileValidators, memberCreateValidators } = require('../middleware/validators');
const { doubleCsrfProtection } = require('../middleware/csrf');
const { loginLimiter } = require('../middleware/rateLimiters');

router.get('/admin-login', adminController.showLogin);
router.post('/admin-login', loginLimiter, doubleCsrfProtection, adminController.login);
router.get('/admin-logout', adminController.logout);

router.get('/admin-dashboard', isAdmin, adminController.dashboard);
router.get('/admin-dashboard/activity', isAdmin, adminController.activityFeed);

router.get('/admin-dashboard/users', isAdmin, adminController.userManagement);
router.post('/admin-dashboard/users/:id/approve', isAdmin, doubleCsrfProtection, adminController.approveUser);
router.post('/admin-dashboard/users/:id/reject', isAdmin, doubleCsrfProtection, adminController.rejectUser);
router.post('/admin-dashboard/users/create-direct', isAdmin, doubleCsrfProtection, memberCreateValidators, adminController.createUserDirect);
router.post('/admin-dashboard/users/:id/password', isAdmin, doubleCsrfProtection, adminController.changeUserPassword);
router.post('/admin-dashboard/users/:id/delete', isAdmin, doubleCsrfProtection, adminController.deleteUser);

router.get('/admin-dashboard/profiles', isAdmin, adminController.listProfiles);
router.get('/admin-dashboard/profiles/new', isAdmin, adminController.showNewProfileForm);
// CSRF check runs AFTER uploadProfileAssets (multer) — the token lives in the
// multipart body, which isn't parsed yet when the request first arrives.
router.post('/admin-dashboard/profiles', isAdmin, uploadProfileAssets, doubleCsrfProtection, profileValidators, adminController.createProfile);
router.get('/admin-dashboard/profiles/:id', isAdmin, adminController.viewProfileFull);
router.get('/admin-dashboard/profiles/:id/pdf', isAdmin, adminController.exportProfilePdf);
router.post('/admin-dashboard/profiles/:id/photos', isAdmin, uploadProfileAssets, doubleCsrfProtection, adminController.updateProfilePhotos);
router.post('/admin-dashboard/profiles/:id/marital-status', isAdmin, doubleCsrfProtection, adminController.updateMaritalStatus);
router.post('/admin-dashboard/profiles/:id/delete', isSuperAdmin, doubleCsrfProtection, adminController.deleteProfile);

// Success stories: view-only for Admin — create/update/toggle/delete are Super Admin only (see routes/superadmin.js)
router.get('/admin-dashboard/stories', isAdmin, adminController.storiesPage);

module.exports = router;
