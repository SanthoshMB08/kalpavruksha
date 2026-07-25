const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const { isSuperAdmin } = require('../middleware/auth');
const { uploadAdImage, uploadProfileAssets } = require('../middleware/upload');
const { userCreateValidators, profileEditValidators } = require('../middleware/validators');

router.get('/super-secure-login', superAdminController.showLogin);
router.post('/super-secure-login', superAdminController.login);
router.get('/super-secure-logout', superAdminController.logout);

router.get('/super-secure-dashboard', isSuperAdmin, superAdminController.dashboard);

router.get('/super-secure-dashboard/admins', isSuperAdmin, superAdminController.adminsPage);
router.post('/super-secure-dashboard/admins', isSuperAdmin, userCreateValidators, superAdminController.createAdmin);
router.post('/super-secure-dashboard/admins/:id/remove', isSuperAdmin, superAdminController.removeAdmin);
router.post('/super-secure-dashboard/admins/:id/password', isSuperAdmin, superAdminController.changeAdminPassword);

// Full profile edit — Super Admin only (all fields incl. gender + re-attach jathaka doc)
router.get('/super-secure-dashboard/profiles/:id/edit', isSuperAdmin, superAdminController.showEditProfileForm);
router.post(
  '/super-secure-dashboard/profiles/:id/edit',
  isSuperAdmin,
  uploadProfileAssets,
  profileEditValidators,
  superAdminController.updateProfile
);

router.get('/super-secure-dashboard/ads', isSuperAdmin, superAdminController.adsPage);
router.post('/super-secure-dashboard/ads', isSuperAdmin, uploadAdImage, superAdminController.createAd);
router.post('/super-secure-dashboard/ads/:id/toggle', isSuperAdmin, superAdminController.toggleAd);
router.post('/super-secure-dashboard/ads/:id/delete', isSuperAdmin, superAdminController.deleteAd);

// Success stories — Super Admin only (Admin gets a view-only page, see routes/admin.js)
router.get('/super-secure-dashboard/stories', isSuperAdmin, superAdminController.storiesPage);
router.post('/super-secure-dashboard/stories', isSuperAdmin, superAdminController.createStory);
router.post('/super-secure-dashboard/stories/:id/update', isSuperAdmin, superAdminController.updateStory);
router.post('/super-secure-dashboard/stories/:id/toggle', isSuperAdmin, superAdminController.toggleStory);
router.post('/super-secure-dashboard/stories/:id/delete', isSuperAdmin, superAdminController.deleteStory);

module.exports = router;
