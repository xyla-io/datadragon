const express = require('express');
const router = express.Router();
const acl = new (require('../modules/acl'))();
const GoogleadsCredential = require('../models/googleads-credential.model').GoogleadsCredential;
const handleError = require('../modules/error').handleError;
const ownerMiddleware = require('../modules/owner').middleware('googleadsCredentials');
const validating = require('../modules/validating');

let CreateCredentialParameters = validating.Validating.model({
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1,
    },
    developerToken: {
      type: 'string',
      minLength: 1,
    },
    clientId: {
      type: 'string',
      minLength: 1,
    },
    clientSecret: {
      type: 'string',
      minLength: 1,
    },
    refreshToken: {
      type: 'string',
      minLength: 1,
    },
    clientCustomerId: {
      type: 'number',
      minimum: 0,
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
  GoogleadsCredential.getUserCredentials(req.user._id.toString())
    .then(credentials => {
      return credentials.map(credential => credential.nonSecretProperties());
    })
    .then(credentials => {
      res.json({
        success: true,
        message: 'Credentials loaded successfully',
        credentials: credentials,
      });
    })
    .catch(err => handleError(res, 500, 'Failed to load credentials for user.', err));
});

router.post('/', acl.middleware(), (req, res, next) => {
  let parameters = new CreateCredentialParameters(req.body);
  let errors = parameters.validationErrors();
  if (errors) { return handleError(res, 400, 'Invalid googleads credential parameters.\n\n' + errors.join('\n')); }

  let credential = new GoogleadsCredential(req.body);
  credential.user = req.user._id;
  GoogleadsCredential.createCredential(credential)
    .then(credential => {
      res.json({
        credential: credential.nonSecretProperties(),
        message: 'Credential added.',
      });
    })
    .catch(err => handleError(res, 500, 'Failed to add credential', err));
});

router.delete('/:id', acl.middleware(0), ownerMiddleware, (req, res, next) => {
  GoogleadsCredential.deleteById(req.params.id)
    .then(() => {
      res.json({
        success: true,
        message: 'Credential deleted.',
      });
    })
    .catch(err => handleError(res, 500, 'Failed to delete credential', err));
});

module.exports = router;
