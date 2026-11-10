const { wrapHandlers, validateId } = require('../middleware/routeSafety');
const { validateLogin, validPassword, PASSWORD_MESSAGE } = require('../utils/security');
const express = require('express');
const router = express.Router();
router.param('id', validateId);
const { body } = require('express-validator');
const publicController = wrapHandlers(require('../controllers/publicController'));
const authController = wrapHandlers(require('../controllers/authController'));
const { redirectIfLoggedIn } = require('../middleware/auth');
const { nameField, mobileField, genderField } = require('../middleware/validators');
const { doubleCsrfProtection } = require('../middleware/csrf');
const { loginIpLimiter, loginLimiter, registerLimiter, contactLimiter } = require('../middleware/rateLimiters');

router.get('/', publicController.home);
router.post('/contact', contactLimiter, doubleCsrfProtection, publicController.contactSubmit);
router.get('/terms', publicController.terms);
router.get('/privacy', publicController.privacy);
router.get('/cookie-policy', publicController.cookiePolicy);

router.get('/register', redirectIfLoggedIn, authController.showRegister);
router.post(
  '/register',
  registerLimiter,
  doubleCsrfProtection,
  [
    nameField('name', 'Name'),
    mobileField('mobile_number', 'Mobile number'),
    genderField('gender'),
    body('username').isString().bail().trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3 to 50 characters.'),
    body('password').custom(validPassword).withMessage(PASSWORD_MESSAGE)
  ],
  authController.register
);

router.get('/login', redirectIfLoggedIn, authController.showLogin);
router.post('/login', loginIpLimiter, loginLimiter, doubleCsrfProtection, validateLogin, authController.login);
router.post('/logout', doubleCsrfProtection, authController.logout);
router.get('/pending-approval', authController.pendingApproval);

module.exports = router;
