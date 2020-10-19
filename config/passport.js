const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const CustomStrategy = require('passport-custom').Strategy;
const User = require('../models/user.model');
const crypto = require('crypto');
const ssoConfig = require('../config/sso.config');

module.exports.init = (app) => {
  passport.serializeUser(function(user, done) {
    done(null, user._id.toString());
  });

  passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
      done(err, user);
    });
  });

  passport.use('local-signup', new LocalStrategy({
      // by default, local strategy uses username and password, we will override with email
      usernameField : 'email',
      passwordField : 'password',
      passReqToCallback : true // allows us to pass back the entire request to the callback
    }, (req, email, password, done) => {
      // find a user whose email is the same as the forms email we are checking to see if the user trying to login already exists
      User.findOne({ 'local.email': email }, function(err, user) {
        // if there are any errors, return the error
        if (err) { return done(err); }

        // check to see if there is already a user with that email
        if (user) {
          return done(null, false, { message: 'An account already exists for this email.' });
        } else {

          // if there is no user with that email create the user
          User.generateHash(password, (err, hash) => {
            if (err) { return done(err); }

            let name = (req.body === undefined) ? null : req.body.name;
            let newUser = new User({
              local: {
                email: email,
                password: hash,
              },
              name: name,
            });

            // save the user
            User.createUser(newUser).then(
              user => done(null, user),
              err => done(err));
          });
        }
      });
    }));

  passport.use('local-signin', new LocalStrategy({
    // by default, local strategy uses username and password, we will override with email
    usernameField : 'email',
    passwordField : 'password',
  }, (username, password, done) => {
    User.findOne({ 'local.email': username }, function (err, user) {
      if (err) { return done(err); }
      if (!user) { return done(null, false, { message: 'Incorrect username.' }); }

      user.validatePassword(password, (err, isValid) => {
        if (err) { return done(err); }
        if (isValid) return done(null, user);
        return done(null, false, { message: 'Incorrect password.' });
      });
    });
  }));

  passport.use('sso', new CustomStrategy((req, done) => {
    let { data, signature } = req.query;
    const { clientId, timestamp, email, domain } = JSON.parse(decodeURIComponent(data));
    const url = `${domain}/sso?data=${encodeURIComponent(data)}`
    if (!ssoConfig.clients[clientId]) {
      return done('Authentication failed.', null);
    }
    const { apiKey } = ssoConfig.clients[clientId];
    if (!apiKey) {
      console.log(`No authentication key for sso clientId ${clientId}`);
      return done('Authentication failed.', null);
    }
    const computedSignature = crypto.createHmac('sha256', apiKey).update(url).digest('hex');
    if (computedSignature !== signature) {
      return done('Authentication failed.', null);
    }
    const timeoutSeconds = 20;
    if (Date.now() - timestamp > timeoutSeconds * 1000) {
      return done('Authentication failed.', null);
    }

    User.findOne({ 'local.email': email }, function (err, user) {
      if (err) { return done(err); }
      if (!user) { return done(null, false); }
      return done(null, user);
    });
  }));


  app.use(passport.initialize());
  app.use(passport.session());
};
