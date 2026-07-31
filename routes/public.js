const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const publicController = require('../controllers/publicController');
const authController = require('../controllers/authController');
const { redirectIfLoggedIn } = require('../middleware/auth');
const { nameField, mobileField, genderField } = require('../middleware/validators');
const { doubleCsrfProtection } = require('../middleware/csrf');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiters');

router.get('/', publicController.home);
router.post('/contact', doubleCsrfProtection, publicController.contactSubmit);
router.get('/terms', publicController.terms);
router.get('/privacy', publicController.privacy);

router.get('/register', redirectIfLoggedIn, authController.showRegister);
router.post(
  '/register',
  registerLimiter,
  doubleCsrfProtection,
  [
    nameField('name', 'Name'),
    mobileField('mobile_number', 'Mobile number'),
    genderField('gender'),
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters.'),
    body('password')
      .isLength({ min: 8 })
      .matches(/[A-Z]/)
      .matches(/[a-z]/)
      .matches(/[0-9]/)
      .withMessage('Password must be 8+ characters with uppercase, lowercase, and a number.')
  ],
  authController.register
);

router.get('/login', redirectIfLoggedIn, authController.showLogin);
router.post('/login', loginLimiter, doubleCsrfProtection, authController.login);
router.get('/logout', authController.logout);
router.get('/pending-approval', authController.pendingApproval);

module.exports = router;
