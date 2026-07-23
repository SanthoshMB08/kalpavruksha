const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const User = require('../models/User');

exports.showRegister = (req, res) => {
  res.render('register', { title: 'Register', errors: [], old: {} });
};

exports.register = async (req, res) => {
  const errors = validationResult(req);
  const { name, mobile_number, username, password, terms, privacy } = req.body;

  if (!errors.isEmpty() || !terms || !privacy) {
    const errList = errors.array().map((e) => e.msg);
    if (!terms || !privacy) errList.push('You must accept the Terms & Conditions and Privacy Policy.');
    return res.render('register', {
      title: 'Register',
      errors: errList,
      old: { name, mobile_number, username }
    });
  }

  try {
    const exists = await User.mobileOrUsernameExists(mobile_number, username);
    if (exists) {
      return res.render('register', {
        title: 'Register',
        errors: ['That mobile number or username is already registered.'],
        old: { name, mobile_number, username }
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({ name, mobile_number, username, passwordHash });

    req.flash('success', 'Registration received. An admin will review your profile shortly.');
    return res.redirect('/pending-approval');
  } catch (err) {
    console.error(err);
    return res.render('register', {
      title: 'Register',
      errors: ['Something went wrong. Please try again.'],
      old: { name, mobile_number, username }
    });
  }
};

exports.showLogin = (req, res) => {
  res.render('login', { title: 'Login', error: null });
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findByUsername(username);
    if (!user || user.role !== 'user') {
      return res.render('login', { title: 'Login', error: 'Invalid username or password.' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('login', { title: 'Login', error: 'Invalid username or password.' });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      status: user.status
    };

    if (user.status === 'pending') return res.redirect('/pending-approval');
    if (user.status === 'rejected') {
      req.session.destroy(() => {});
      return res.render('login', {
        title: 'Login',
        error: 'Your profile was not approved. Please contact support.'
      });
    }
    return res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    return res.render('login', { title: 'Login', error: 'Something went wrong. Please try again.' });
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
