const { wrapHandlers, validateId } = require('../middleware/routeSafety');
const express = require('express');
const router = express.Router();
router.param('id', validateId);
const userController = wrapHandlers(require('../controllers/userController'));
const { isApprovedUser } = require('../middleware/auth');
const { doubleCsrfProtection } = require('../middleware/csrf');
const { profileActionLimiter } = require('../middleware/rateLimiters');

router.get('/dashboard', isApprovedUser, userController.dashboard);
router.get('/my-profile', isApprovedUser, userController.myProfile);
router.get('/profile/:id/modal', isApprovedUser, userController.profileModal);
router.post('/profile/:id/save', isApprovedUser, profileActionLimiter, doubleCsrfProtection, userController.saveProfile);
router.post('/profile/:id/unsave', isApprovedUser, profileActionLimiter, doubleCsrfProtection, userController.unsaveProfile);
router.post('/profile/:id/express-interest', isApprovedUser, profileActionLimiter, doubleCsrfProtection, userController.expressInterest);
router.post('/profile/:id/withdraw-interest', isApprovedUser, profileActionLimiter, doubleCsrfProtection, userController.withdrawInterest);
router.get('/saved-profiles', isApprovedUser, userController.savedProfiles);

module.exports = router;
