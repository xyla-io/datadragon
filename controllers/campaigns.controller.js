const express = require('express');
const router = express.Router();
const {
  pathPatternMiddleware,
} = require('../modules/path-utilities');
const ownerMiddleware = require('../modules/owner').pathMiddleware();
const Credential = require('../models/credential.model').Credential;
const handleError = require('../modules/error').handleError;
const {
  Entity,
  getCredentialEntities,
} = require('../modules/channel');

const acl = new (require('../modules/acl'))();

acl.allow([
  {
    roles: [acl.roles.user],
    allows: [
      { resources: ['/'], permissions: ['get'] },
    ],
  },
]);

// GET HTTP method
router.get('/:account', acl.middleware(0), ownerMiddleware, pathPatternMiddleware('account', /^user_[^_]+_credential_[^_]+_[^_]+$/), (req, res) => {
  Credential.credentialDataForPath(req.params.account)
    .then(credential => {
      if (!credential) {
        throw new Error('Account not found.');
      }
      return getCredentialEntities(credential, Entity.campaign, {
        accountName: req.params.account,
      });
    })
    .then(campaigns => res.json({
      success: true,
      message: 'Campaigns loaded successfully',
      campaigns: campaigns
    }))
    .catch(error => {
      handleError(res, 500, 'Failed to retrieve campaigns.', error);
    });
});

module.exports = router;