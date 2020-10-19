const express = require('express');
const router = express.Router();
const acl = new (require('../modules/acl'))();
const AdjustCredential = require('../models/adjust-credential.model').AdjustCredential;
const handleError = require('../modules/error').handleError;
const ownerMiddleware = require('../modules/owner').middleware('adjustCredentials');
const validating = require('../modules/validating');

let CreateCredentialParameters = validating.Validating.model({
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1,
    },
    userToken: {
      type: 'string',
      minLength: 1,
    },
    appToken: {
      type: 'string',
      minLength: 1,
    },
  },
  additionalProperties: false,
});

acl.allow([
  {
    roles:[acl.roles.user],
    allows:[
      { resources: ['/'], permissions: ['get', 'post', 'delete'] },
    ]
  },
]);

router.get('/', acl.middleware(), (req, res) => {
  AdjustCredential.getUserCredentials(req.user._id.toString())
    .then(credentials => {
      return credentials.map(credential => {
        let properties = credential.toObject();
        delete properties.user;
        delete properties.userToken;
        delete properties.appToken;
        return properties
      });
    })
    .then(
      credentials => res.json({
        success: true,
        message: 'Credentials loaded successfully',
        credentials: credentials,
      }),
      err => handleError(res, 500, 'Failed to load credentials for user.', err));
});

router.post('/', acl.middleware(), (req, res, next) => {
  let parameters = new CreateCredentialParameters(req.body);
  let errors = parameters.validationErrors();
  if (errors) { return handleError(res, 400, 'Invalid adjust credential parameters.\n\n' + errors.join('\n')); }

  let credential = new AdjustCredential(req.body);
  credential.user = req.user._id;
  AdjustCredential.createCredential(credential).then(
    credential => {
      res.json({
        credential: credential,
        message: 'Credential added.',
      });
    },
    err => handleError(res, 500, 'Failed to add credential', err));
});

router.delete('/:id', acl.middleware(0), ownerMiddleware, (req, res, next) => {
  AdjustCredential.deleteById(req.params.id).then(
    () => {
      res.json({
        success: true,
        message: 'Credential deleted.',
      });
    },
    err => handleError(res, 500, 'Failed to delete credential', err));
});

module.exports = router;
