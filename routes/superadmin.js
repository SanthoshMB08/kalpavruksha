const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const { isSuperAdmin } = require('../middleware/auth');
const { uploadAdImage } = require('../middleware/upload');

router.get('/super-secure-login', superAdminController.showLogin);
router.post('/super-secure-login', superAdminController.login);
router.get('/super-secure-logout', superAdminController.logout);

router.get('/super-secure-dashboard', isSuperAdmin, superAdminController.dashboard);

router.post('/super-secure-dashboard/admins', isSuperAdmin, superAdminController.createAdmin);
router.post('/super-secure-dashboard/admins/:id/remove', isSuperAdmin, superAdminController.removeAdmin);

router.post('/super-secure-dashboard/ads', isSuperAdmin, uploadAdImage, superAdminController.createAd);
router.post('/super-secure-dashboard/ads/:id/toggle', isSuperAdmin, superAdminController.toggleAd);
router.post('/super-secure-dashboard/ads/:id/delete', isSuperAdmin, superAdminController.deleteAd);

module.exports = router;
