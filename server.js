require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const flash = require('connect-flash');
const path = require('path');
const { pool } = require('./config/db');

const publicRoutes = require('./routes/public');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const superAdminRoutes = require('./routes/superadmin');

const app = express();
const PORT = process.env.PORT || 5000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parsing & static assets
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sessions (stored in Supabase Postgres so admins stay logged in across restarts)
const sessionStore = new PgSession({
  pool,
  tableName: 'session',
  createTableIfMissing: true
});
app.use(
  session({
    key: 'kalpavruksha_sid',
    secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
  })
);

app.use(flash());

// Make session user and flash messages available in every view
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.successMsg = req.flash('success');
  res.locals.errorMsg = req.flash('error');
  next();
});

// Routes
app.use('/', publicRoutes);
app.use('/', userRoutes);
app.use('/portal', adminRoutes);
app.use('/portal', superAdminRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// Error handler (e.g. multer file-type errors)
app.use((err, req, res, next) => {
  console.error(err);
  req.flash('error', err.message || 'Something went wrong.');
  res.redirect('back');
});

app.listen(PORT, () => {
  console.log(`Kalpavruksha Kalyana running at http://localhost:${PORT}`);
});
