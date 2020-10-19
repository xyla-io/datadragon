const express = require('express');
const router = express.Router();

const acl = new (require('../modules/acl'))();
const handleError = require('../modules/error').handleError;
const Credential = require('../models/credential.model').Credential;
const python = require('../modules/python');
const {
  MicraCache,
  MicraCacheHasher,
  micraCacheMiddleWare,
} = require('../modules/micra/micra-cache');

acl.allow([
  {
    roles: [acl.roles.user],
    allows: [
      { resources: ['/report'], permissions: ['post'] },
    ],
  },
]);


// GET HTTP method
router.post(
  '/report',
  acl.middleware(1),
  micraCacheMiddleWare({
    cache: new MicraCache({
      prefix: 'cache:datadragon:',
    }),
    hasher: new MicraCacheHasher({
      includePaths: [
        'method',
        'protocol',
        'hostname',
        'baseUrl',
        'path',
        'query',
        'user._id',
        'params',
        'body',
      ],
      excludePaths: [
        'query.apikey',
        'query.cachetime',
        'query.cacheexpire',
      ],
      extractMap: {
        time: 'query.cachetime',
        expire: 'query.cacheexpire',
      },
    }),
  }),
  async (req, res) => {
    req.setTimeout(600000);
    if (!Object.keys(req.body).includes('credentials') || typeof req.body.credentials !== 'object') {
      return handleError(res, 400, 'No credentials provided.');
    }
    let apiParameters = Object.assign(
      {
        columns: [],
        filters: {},
        options: {},
      },
      req.body,
      {
        credentials: Object.assign({}, req.body.credentials)
      }
    );
    let credentialPathPattern = `^user_${req.user._id.toString()}_credential_[^_]+_[^_]+$`;
    for (const credentialKey of Object.keys(apiParameters.credentials)) {
      let credentialPath = apiParameters.credentials[credentialKey];
      if (typeof credentialPath !== 'string' || !credentialPath.match(credentialPathPattern)) {
        return handleError(res, 403, 'User does not own this resource.');
      }
      try {
        let credential = await Credential.credentialDataForPath(credentialPath);
        apiParameters.credentials[credentialKey] = credential.credential;
      } catch (error) {
        return handleError(res, 500, 'Failed to retrieve credentials.', error);
      }
    }

    try {
      let result = await python.runCommand('report', apiParameters);
      if (result.errors && result.errors.length) { 
        throw result;
      }
      res.json({
        success: true,
        message: 'Ran report.',
        metadata: result.result.metadata,
        report: result.result.report,
      })
    } catch (error) {
      if (Object.keys(error).includes('errors')) {
        return handleError(res, 500, `${error.errors.length} errors occurred while running the report`, new Error(error.errors.join('\n')));

      } else {
        return handleError(res, 500, 'Failed to run report.', error);
      }
    }
  }
);

module.exports = router;