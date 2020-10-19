const express = require('express');
const router = express.Router();
const passport = require('passport');
const acl = new (require('../modules/acl'))();

acl.allow([
  {
    roles:[acl.roles.guest, acl.roles.user],
    allows:[
      { resources: ['/'], permissions: ['get'] },
    ]
  },
]);

router.get('/', acl.middleware(), (req, res, next) => {
  passport.authenticate('sso', (err, user) => {
    if (err || !user) {
      return res.status(403).json({
        success: false,
        message: err || 'Authentication failed.',
      });
    }
    req.logIn(user, err => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: err || 'Authentication failed.',
        });
      }
      res.status(200).json({
        success: true,
        user,
        url: process.argv[5],
      });
    });
  })(req, res, next);
});

module.exports = router;