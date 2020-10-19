const express = require('express');
const router = express.Router();

const acl = new (require('../modules/acl'))();
const {
  pathPatternMiddleware,
} = require('../modules/path-utilities');
const ownerMiddleware = require('../modules/owner').pathMiddleware(2);
const handleError = require('../modules/error').handleError;
const Credential = require('../models/credential.model').Credential;
const {
  Entity,
  getCredentialEntities,
} = require('../modules/channel');

acl.allow([
  {
    roles: [acl.roles.user],
    allows: [
      { resources: ['/'], permissions: ['get'] },
    ],
  },
]);

// GET HTTP method
router.get('/:account/:orgID/:campaignID', acl.middleware(0), ownerMiddleware, pathPatternMiddleware('account', /^user_[^_]+_credential_[^_]+_[^_]+$/), (req, res) => {
  Credential.credentialDataForPath(req.params.account)
    .then(credential => {
      if (!credential) {
        throw new Error('Account not found.');
      }
      return getCredentialEntities(credential, Entity.adgroup, {
        orgID: req.params.orgID,
        campaignID: req.params.campaignID,
        accountName: req.params.account,
      });
    })
    .then(adgroups => res.json({
      success: true,
      message: 'Ad groups loaded successfully',
      adgroups
    }))
    .catch(error => {
      handleError(res, 500, 'Failed to retrieve ad groups.', error);
    });
});

module.exports = router;