const express = require('express');
const router = express.Router();
const acl = new (require('../modules/acl'))();
const Credential = require('../models/credential.model').Credential;
const Certificate = require('../models/certificate.model');
const handleError = require('../modules/error').handleError;
const ownerMiddleware = require('../modules/owner').pathMiddleware();
const ownerMiddlewareOne = require('../modules/owner').pathMiddleware(1);
const {
  pathPatternMiddleware,
} = require('../modules/path-utilities');
const validating = require('../modules/validating');
const { Rule } = require('../models/rule.model');
const {
  getChannelReport
} = require('../modules/channel');

let CreateCredentialParameters = validating.Validating.model({
  type: 'object',
  required: [
    'target',
    'name',
    'credential',
  ],
  additionalProperties: false,
  properties: {
    target: {
      enum: ['apple_search_ads', 'google_ads', 'snapchat'],
    },
    name: {
      type: 'string',
      minLength: 1,
    },
    credential: {
      type: 'object',
      maxProperties: 1024,
      additionalProperties: {
        type: 'string',
        maxLength: 65536,
      }
    },
  },
});

acl.allow([
  {
    roles:[acl.roles.user],
    allows:[
      { resources: ['/'], permissions: ['get', 'post', 'delete'] },
      { resources: ['/:path/channel-report'], permissions: ['post'] },
    ]
  },
]);

router.get('/', acl.middleware(), (req, res) => {
  const userID = req.user._id.toString();
  Credential.getUserCredentials(userID)
    .then(credentials => {
      return credentials.map(credential => credential.nonSecretProperties());
    })
    .then(credentials => {
      return Certificate.getUserCertificates(userID)
        .then(certificates => credentials.concat(certificates.map(certificate => {
          return {
            _id: certificate._id,
            __v: -1,
            user: userID,
            target: 'apple_search_ads',
            name: certificate.name,
            modificationDate: certificate.certificateCreationDate,
            creationDate: certificate.certificateCreationDate,
            path: Certificate.pathForCertificate(userID, certificate.name),
          };
        })));
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
  if (errors) { return handleError(res, 400, 'Invalid credential parameters.\n\n' + errors.join('\n')); }

  let credential = new Credential(req.body);
  credential.user = req.user._id;
  Credential.createCredential(credential)
    .then(credential => {
      res.json({
        credential: credential.nonSecretProperties(),
        message: 'Credential added.',
      });
    })
    .catch(err => handleError(res, 500, 'Failed to add credential', err));
});

router.post(
  '/:path/channel-report', 
  acl.middleware(0),
  ownerMiddlewareOne,
  pathPatternMiddleware('path', /^user_[^_]+_credential_[^_]+_[^_]+$/),
  (req, res) => {
  Credential.credentialDataForPath(req.params.path)
    .then(credential => {
      if (!credential) {
        throw new Error('Account not found.');
      }
      return getChannelReport({
        credential: credential, 
        entityGranularity: req.body.entityGranularity,
        timeGranularity: req.body.timeGranularity, 
        start: req.body.start,
        end: req.body.end
      });
    })
    .then(report => res.json({
      success: true,
      message: 'Channel report retrieved successfully',
      report: report
    }))
    .catch(error => {
      handleError(res, 500, 'Failed to retrieve channel report.', error);
    });
});

router.delete('/:path', acl.middleware(0), ownerMiddleware, (req, res, next) => {
  Rule.getAccountRules(req.params.path)
    .then(rules => {
      if (rules && rules.length) { throw new Error(`${rules.length} rules use these credentials and must be deleted first:\n\n${rules.map(rule => rule.metadata.description).join('\n')}`); }
      return Credential.deleteByPath(req.params.path);
    })
    .then(() => {
      res.json({
        success: true,
        message: 'Credential deleted.',
      });
    })
    .catch(err => handleError(res, 500, 'Failed to delete credential', err));
});

module.exports = router;
