const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const publicController = require('../controllers/publicController');
const authController = require('../controllers/authController');
const { redirectIfLoggedIn } = require('../middleware/auth');

router.get('/', publicController.home);
router.post('/contact', publicController.contactSubmit);

router.get('/register', redirectIfLoggedIn, authController.showRegister);
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('mobile_number')
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Enter a valid 10-digit mobile number.'),
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
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.get('/pending-approval', authController.pendingApproval);

module.exports = router;
