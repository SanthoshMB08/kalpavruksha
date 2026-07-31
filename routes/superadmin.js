const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const { isSuperAdmin } = require('../middleware/auth');
const { uploadAdImage, uploadProfileAssets } = require('../middleware/upload');
const { userCreateValidators, profileEditValidators } = require('../middleware/validators');
const { doubleCsrfProtection } = require('../middleware/csrf');
const { loginLimiter } = require('../middleware/rateLimiters');

router.get('/super-secure-login', superAdminController.showLogin);
router.post('/super-secure-login', loginLimiter, doubleCsrfProtection, superAdminController.login);
router.get('/super-secure-logout', superAdminController.logout);

router.get('/super-secure-dashboard', isSuperAdmin, superAdminController.dashboard);

router.get('/super-secure-dashboard/admins', isSuperAdmin, superAdminController.adminsPage);
router.post('/super-secure-dashboard/admins', isSuperAdmin, doubleCsrfProtection, userCreateValidators, superAdminController.createAdmin);
router.post('/super-secure-dashboard/admins/:id/remove', isSuperAdmin, doubleCsrfProtection, superAdminController.removeAdmin);
router.post('/super-secure-dashboard/admins/:id/password', isSuperAdmin, doubleCsrfProtection, superAdminController.changeAdminPassword);

// Full profile edit — Super Admin only (all fields incl. gender + re-attach jathaka doc)
router.get('/super-secure-dashboard/profiles/:id/edit', isSuperAdmin, superAdminController.showEditProfileForm);
router.post(
  '/super-secure-dashboard/profiles/:id/edit',
  isSuperAdmin,
  uploadProfileAssets,
  doubleCsrfProtection,
  profileEditValidators,
  superAdminController.updateProfile
);

router.get('/super-secure-dashboard/ads', isSuperAdmin, superAdminController.adsPage);
router.post('/super-secure-dashboard/ads', isSuperAdmin, uploadAdImage, doubleCsrfProtection, superAdminController.createAd);
router.post('/super-secure-dashboard/ads/:id/toggle', isSuperAdmin, doubleCsrfProtection, superAdminController.toggleAd);
router.post('/super-secure-dashboard/ads/:id/reactivate', isSuperAdmin, doubleCsrfProtection, superAdminController.reactivateAd);
router.post('/super-secure-dashboard/ads/:id/delete', isSuperAdmin, doubleCsrfProtection, superAdminController.deleteAd);

// Success stories — Super Admin only (Admin gets a view-only page, see routes/admin.js)
router.get('/super-secure-dashboard/stories', isSuperAdmin, superAdminController.storiesPage);
router.post('/super-secure-dashboard/stories', isSuperAdmin, doubleCsrfProtection, superAdminController.createStory);
router.post('/super-secure-dashboard/stories/:id/update', isSuperAdmin, doubleCsrfProtection, superAdminController.updateStory);
router.post('/super-secure-dashboard/stories/:id/toggle', isSuperAdmin, doubleCsrfProtection, superAdminController.toggleStory);
router.post('/super-secure-dashboard/stories/:id/delete', isSuperAdmin, doubleCsrfProtection, superAdminController.deleteStory);

router.get('/super-secure-dashboard/messages', isSuperAdmin, superAdminController.messagesPage);
router.post('/super-secure-dashboard/messages/:id/read', isSuperAdmin, doubleCsrfProtection, superAdminController.markMessageRead);
router.post('/super-secure-dashboard/messages/:id/delete', isSuperAdmin, doubleCsrfProtection, superAdminController.deleteMessage);

module.exports = router;
