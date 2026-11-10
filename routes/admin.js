const { wrapHandlers, validateId } = require('../middleware/routeSafety');
const { validateLogin } = require('../utils/security');
const express = require('express');
const router = express.Router();
router.param('id', validateId);
const adminController = wrapHandlers(require('../controllers/adminController'));
const privateDocumentController = wrapHandlers(require('../controllers/privateDocumentController'));
const { isAdmin, isSuperAdmin } = require('../middleware/auth');
const { parseProfileAssets, uploadCapacity, uploadProfileAssets } = require('../middleware/upload');
const { profileValidators, memberCreateValidators } = require('../middleware/validators');
const { doubleCsrfProtection } = require('../middleware/csrf');
const { loginIpLimiter, loginLimiter, uploadLimiter } = require('../middleware/rateLimiters');

router.get('/admin-login', adminController.showLogin);
router.post('/admin-login', loginIpLimiter, loginLimiter, doubleCsrfProtection, validateLogin, adminController.login);
router.post('/admin-logout', doubleCsrfProtection, adminController.logout);

router.get('/admin-dashboard', isAdmin, adminController.dashboard);
router.get('/admin-dashboard/activity', isAdmin, adminController.activityFeed);
router.get('/admin-dashboard/private-files/:bucket/:filename', isAdmin, privateDocumentController.serve);

router.get('/admin-dashboard/users', isAdmin, adminController.userManagement);
router.post('/admin-dashboard/users/:id/approve', isAdmin, doubleCsrfProtection, adminController.approveUser);
router.post('/admin-dashboard/users/:id/reject', isAdmin, doubleCsrfProtection, adminController.rejectUser);
router.post('/admin-dashboard/users/create-direct', isAdmin, doubleCsrfProtection, memberCreateValidators, adminController.createUserDirect);
router.post('/admin-dashboard/users/:id/password', isAdmin, doubleCsrfProtection, adminController.changeUserPassword);
router.post('/admin-dashboard/users/:id/delete', isAdmin, doubleCsrfProtection, adminController.deleteUser);
router.post('/admin-dashboard/users/:id/unlock', isSuperAdmin, doubleCsrfProtection, adminController.unlockUser);

router.get('/admin-dashboard/profiles', isAdmin, adminController.listProfiles);
router.get('/admin-dashboard/profiles/new', isAdmin, adminController.showNewProfileForm);
router.get('/admin-dashboard/profiles/check-mobile', isAdmin, adminController.checkMobile);
// Parse multipart before CSRF; persist files only after CSRF and validation.
router.post('/admin-dashboard/profiles', isAdmin, uploadLimiter, uploadCapacity, parseProfileAssets, doubleCsrfProtection, profileValidators, uploadProfileAssets, adminController.createProfile);
router.get('/admin-dashboard/profiles/:id', isAdmin, adminController.viewProfileFull);
router.get('/admin-dashboard/profiles/:id/pdf', isAdmin, adminController.exportProfilePdf);
router.post('/admin-dashboard/profiles/:id/photos', isAdmin, uploadLimiter, uploadCapacity, parseProfileAssets, doubleCsrfProtection, uploadProfileAssets, adminController.updateProfilePhotos);
router.post('/admin-dashboard/profiles/:id/marital-status', isAdmin, doubleCsrfProtection, adminController.updateMaritalStatus);
router.post('/admin-dashboard/profiles/:id/delete', isSuperAdmin, doubleCsrfProtection, adminController.deleteProfile);

// Success stories: view-only for Admin — create/update/toggle/delete are Super Admin only (see routes/superadmin.js)
router.get('/admin-dashboard/stories', isAdmin, adminController.storiesPage);

module.exports = router;
