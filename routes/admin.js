const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAdmin } = require('../middleware/auth');
const { uploadProfileAssets } = require('../middleware/upload');

router.get('/admin-login', adminController.showLogin);
router.post('/admin-login', adminController.login);
router.get('/admin-logout', adminController.logout);

router.get('/admin-dashboard', isAdmin, adminController.dashboard);
router.post('/admin-dashboard/toggle-view', isAdmin, adminController.toggleView);

router.post('/admin-dashboard/users/:id/approve', isAdmin, adminController.approveUser);
router.post('/admin-dashboard/users/:id/reject', isAdmin, adminController.rejectUser);
router.post('/admin-dashboard/users/create-direct', isAdmin, adminController.createUserDirect);

router.get('/admin-dashboard/profiles', isAdmin, adminController.listProfiles);
router.get('/admin-dashboard/profiles/new', isAdmin, adminController.showNewProfileForm);
router.post('/admin-dashboard/profiles', isAdmin, uploadProfileAssets, adminController.createProfile);
router.get('/admin-dashboard/profiles/:id', isAdmin, adminController.viewProfileFull);
router.post('/admin-dashboard/profiles/:id/delete', isAdmin, adminController.deleteProfile);

module.exports = router;
