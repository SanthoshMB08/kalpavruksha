const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { isApprovedUser } = require('../middleware/auth');
const { doubleCsrfProtection } = require('../middleware/csrf');

router.get('/dashboard', isApprovedUser, userController.dashboard);
router.get('/profile/:id/modal', isApprovedUser, userController.profileModal);
router.post('/profile/:id/save', isApprovedUser, doubleCsrfProtection, userController.saveProfile);
router.post('/profile/:id/express-interest', isApprovedUser, doubleCsrfProtection, userController.expressInterest);
router.get('/saved-profiles', isApprovedUser, userController.savedProfiles);

module.exports = router;
