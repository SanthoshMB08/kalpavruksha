const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { checkLogin } = require('../utils/accountLockout');

exports.showRegister = (req, res) => {
  // Prefills from the homepage's quick-register banner form / search bar,
  // which link here as a plain GET with these as query params.
  const { name, mobile_number, gender } = req.query;
  res.render('register', { title: 'Register', errors: [], old: { name, mobile_number, gender } });
};

exports.register = async (req, res) => {
  const errors = validationResult(req);
  const { name, mobile_number, username, password, gender, terms, privacy } = req.body;

  if (!errors.isEmpty() || !terms || !privacy) {
    const errList = errors.array().map((e) => e.msg);
    if (!terms || !privacy) errList.push('You must accept the Terms & Conditions and Privacy Policy.');
    return res.render('register', {
      title: 'Register',
      errors: errList,
      old: { name, mobile_number, username, gender }
    });
  }

  try {
    const exists = await User.mobileOrUsernameExists(mobile_number, username);
    if (exists) {
      return res.render('register', {
        title: 'Register',
        errors: ['That mobile number or username is already registered.'],
        old: { name, mobile_number, username, gender }
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({ name, mobile_number, username, passwordHash, gender });

    req.flash('success', 'Registration received. An admin will review your profile shortly.');
    return res.redirect('/pending-approval');
  } catch (err) {
    req.log.error(err);
    return res.render('register', {
      title: 'Register',
      errors: ['Something went wrong. Please try again.'],
      old: { name, mobile_number, username, gender }
    });
  }
};

exports.showLogin = (req, res) => {
  res.render('login', { title: 'Login', error: null, old: { username: '' } });
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  const renderLoginError = (error) => res.render('login', {
    title: 'Login',
    error,
    old: { username: username || '' }
  });
  try {
    const user = await User.findByUsername(username);
    if (!user || user.role !== 'user') {
      return renderLoginError('Invalid username or password.');
    }

    const result = await checkLogin(user, password);
    if (result.outcome !== 'ok') {
      if (result.outcome === 'locked_now') req.log.warn({ userId: user.id }, 'Account locked after repeated failed login attempts');
      return renderLoginError(result.message);
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      status: user.status,
      gender: user.gender
    };

    if (user.status === 'pending') return res.redirect('/pending-approval');
    if (user.status === 'rejected') {
      req.session.destroy(() => {});
      return renderLoginError('Your profile was not approved. Please contact support.');
    }
    return res.redirect('/dashboard');
  } catch (err) {
    req.log.error(err);
    return renderLoginError('Something went wrong. Please try again.');
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
};

exports.pendingApproval = (req, res) => {
  res.render('pending-approval', { title: 'Awaiting Approval' });
};
