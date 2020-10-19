const express = require('express');
const router = express.Router();
const passport = require('passport');
const acl = new (require('../modules/acl'))();
const owner = require('../modules/owner');
const User = require('../models/user.model');
const { Session } = require('../models/session.model');
const validating = require('../modules/validating');
const handleError = require('../modules/error').handleError;
const sendEmail = require('./email.controller').sendEmail;
const appConfig = require('../config/app.config');

let SignUpParameters = validating.Validating.model({
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1,
    },
    email: {
      type: 'string',
      minLength: 1,
    },
    password: {
      type: 'string',
    },
    confirmedPassword: {
      type: 'string',
    },
  },
  additionalProperties: false,
}, (instance) => {
  if (instance.password !== instance.confirmedPassword) { return ['instance.password must equal instance.confirmedPassword']; }
  return User.passwordValidationErrors(instance.password);
});

let SignInParameters = validating.Validating.model({
  type: 'object',
  properties: {
    email: {
      type: 'string',
      minLength: 1,
    },
    password: {
      type: 'string',
      minLength: 1,
    },
  },
  additionalProperties: false,
});

let ForgotPasswordParameters = validating.Validating.model({
  type: 'object',
  properties: {
    email: {
      type: 'string',
      minLength: 1,
    },
  },
  additionalProperties: false,
});

let ResetPasswordParameters = validating.Validating.model({
  type: 'object',
  properties: {
    userID: {
      type: 'string',
      minLength: 1,
    },
    token: {
      type: 'string',
      minLength: 1,
    },
    password: {
      type: 'string',
    },
    confirmedPassword: {
      type: 'string',
    },
  },
  additionalProperties: false,
}, (instance) => {
  if (instance.password !== instance.confirmedPassword) { return ['instance.password must equal instance.confirmedPassword']; }
  return User.passwordValidationErrors(instance.password);
});

acl.allow([
  {
    roles:[acl.roles.guest],
    allows:[
      { resources: ['/signup', '/signin', '/forgot-password', '/reset-password'], permissions: ['post'] },
      { resources: ['/session'], permissions: ['get'] },
    ]
  },
  {
    roles:[acl.roles.user],
    allows:[
      { resources: ['/session'], permissions: ['get', 'delete'] },
      // { resources: ['/'], permissions: ['delete'] },
    ]
  },
]);

router.post('/signup', acl.middleware(), (req, res, next) => {
  let parameters = new SignUpParameters(req.body);
  let errors = parameters.validationErrors();
  if (errors) { return handleError(res, 400, 'Invalid sign in parameters.\n\n' + errors.join('\n')); }
  passport.authenticate('local-signup', (err, user, info) => {
    if (err) {
      res.status(500).json({
        success: false,
        message: `Failed to create a new user. Error: ${err}`,
        user: null
      });
    } else if (user !== false) {
      req.logIn(user, err => {
        if (err) {
          res.status(500).json({
            success: false,
            message: `Failed to create a new user. Error: ${err}`,
            user: null
          });
        } else {
          res.json({
            success: true,
            message: 'User created successfully.',
            user: user
          });
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: info.message,
        user: null,
      })
    }
  })(req, res, next);
});

router.post('/signin', acl.middleware(), (req, res, next) => {
  let parameters = new SignInParameters(req.body);
  let errors = parameters.validationErrors();
  if (errors) { return handleError(res, 400, 'Invalid sign in parameters.\n\n' + errors.join('\n')); }
  passport.authenticate('local-signin', (err, user, info) => {
    if (err) {
      res.status(500).json({
        success: false,
        message: `Failed to sign in user. Error: ${err}`,
        user: null
      });
    } else if (user !== false) {
      req.logIn(user, err => {
        if (err) {
          res.status(500).json({
            success: false,
            message: `Failed to sign in user. Error: ${err}`,
            user: null
          });
        } else {
          res.json({
            success: true,
            message: 'User signed in successfully.',
            user: user
          });
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: info.message,
        user: null
      });
    }
  })(req, res, next);
});

router.post('/reset-password', acl.middleware(), (req, res, next) => {
  let parameters = new ResetPasswordParameters(req.body);
  let errors = parameters.validationErrors();
  if (errors) { return handleError(res, 400, 'Invalid forgot password parameters.\n\n' + errors.join('\n')); }
  User.getByID(parameters.userID)
    .then(user => {
      if (!user) {
        return res.json({
          success: false,
          title: 'Unrecognized User',
          message: 'The user is not on file.',
        });
      }
      if (!user.verifyPasswordResetToken(parameters.token)) {
        return res.json({
          success: false,
          title: 'Invalid Link',
          message: 'This password reset link is not valid. It may have expired or already been used.',
        });
      }
      user.setNewPassword(parameters.password)
        .then(() => {
          req.logOut();
          return Session.removeAllSessions({ userID: user.id })
            .catch((error) => {
              console.error(`Error deleting all user sessions for user: ${user.id}`, error);
            })
        }).then(() => {
          res.json({
            success: true,
            title: 'Password Reset',
            message: 'Your password has been reset. Please log in.',
          });
        })
        .catch(error => {
          handleError(res, 500, 'Failed to set new password for user', error);
        });
    })
    .catch(error => {
      handleError(res, 500, 'Failed to retrieve user', error);
    })
});

router.post('/forgot-password', acl.middleware(), (req, res, next) => {
  let parameters = new ForgotPasswordParameters(req.body);
  let errors = parameters.validationErrors();
  if (errors) { return handleError(res, 400, 'Invalid forgot password parameters.\n\n' + errors.join('\n')); }
  User.getByEmail(parameters.email)
    .then(user => {
      if (!user) {
        res.json({
          success: false,
          title: 'Unrecognized Email',
          message: 'Sorry, the email address ' + parameters.email + ' is not on file.',
        });
        return;
      }
      user.createPasswordResetToken()
        .then(user => {
          let link = `${appConfig.config.site}/reset-password/${user._id}/${user.resetPassword.token}`;
          let mailBody = `A password reset has been requested for ${user.local.email} at DataDragon. To reset your password, please follow the link below:\n\n${link}`;
          console.log(mailBody);
          sendEmail(user.local.email, mailBody, 'DataDragon Password Reset', [], err => {
            if (err) {
              console.log(err);
              handleError(res, 500, 'Failed to send password reset email to user. ');
              return;
            }
            res.json({
              success: true,
              title: 'Email Sent',
              message: 'A password reset email has been sent to ' + parameters.email + '. Please follow the link in the email to reset your password.',
            });
          });
        })
        .catch(error => {
          console.log(error);
          handleError(res, 500, 'Failed to set a password reset token for user.');
        });
    })
    .catch(error => {
      handleError(res, 500, 'Failed to retrieve user', error);
    })
});

router.get('/session', acl.middleware(), (req, res, next) => {
  if (req.isAuthenticated()) {
    res.json({
      success: true,
      message: 'User session retrieved.',
      user: req.user,
    });
  } else {
    res.json({
      success: false,
      message: `No user session available.`,
      user: null,
    });
  }
});

router.delete('/session', acl.middleware(), (req, res, next) => {
  req.logout();
  res.json({
    success: true,
    message: 'User signed out.',
  });
});

router.delete('/:id', acl.middleware(0), owner.middleware('users', '_id'), (req, res, next) => {
  User.deleteById(req.params.id).then(
    () => res.json({
      success: true,
      message: 'User account deleted.',
    }),
    err => {
      console.log(err);
      res.status(500).json({
        success: false,
        message: `Failed to delete user account. Error: ${err}.`,
      });
    });
});

module.exports = router;
