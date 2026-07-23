const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { isApprovedUser } = require('../middleware/auth');

router.get('/dashboard', isApprovedUser, userController.dashboard);
router.get('/profile/:id/modal', isApprovedUser, userController.profileModal);
router.post('/profile/:id/save', isApprovedUser, userController.saveProfile);
router.post('/profile/:id/express-interest', isApprovedUser, userController.expressInterest);
router.get('/saved-profiles', isApprovedUser, userController.savedProfiles);

module.exports = router;
