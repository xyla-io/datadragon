const express = require('express');
const router = express.Router();
const acl = new (require('../modules/acl'))();
const formidable = require('formidable');
const Certificate = require('../models/certificate.model');
const handleError = require('../modules/error').handleError;
const ownerMiddleware = require('../modules/owner').middleware('certificates');
const Rule = require('../models/rule.model').Rule;

acl.allow([
  {
    roles:[acl.roles.user],
    allows:[
      { resources: ['/'], permissions: ['get', 'post', 'delete'] },
    ]
  },
]);

router.get('/', acl.middleware(), (req, res) => {
  Certificate.getUserCertificates(req.user._id.toString()).then(
    certificates => res.json({
      success: true,
      message: 'Certificates loaded successfully',
      certificates: certificates,
    }),
    err => handleError(res, 500, 'Failed to load certificates for user.', err)
  );
});

router.post('/', acl.middleware(), (req, res, next) => {
  let form = new formidable.IncomingForm();
  form.parse(req, function(err, fields, files) {
    if (err) {
      handleError(res, 400, 'Invalid certificate form.', err);
      return;
    }
    if (!files.zipFile || !files.zipFile.path) {
      handleError(res, 400, 'No certificate file uploaded.');
      return;
    }

    let certificate = new Certificate(fields);
    certificate.user = req.user._id;
    Certificate.createCertificate(certificate, files.zipFile.path).then(
      certificate => {
        res.json({
          certificate: certificate,
          message: 'Certificate added.',
        });
      },
      err => handleError(res, 500, 'Failed to add certificate', err)
    );
  });
});

router.delete('/:id', acl.middleware(0), ownerMiddleware, (req, res, next) => {
  Certificate.getCertificateById(req.params.id).then(
    certificate => {
      if (!certificate){ throw new Error('Certificate not found'); }
      let account = Certificate.pathForCertificate(req.user._id.toString(), certificate.name);
      return Rule.getAccountRules(account);
    }
  ).then(
    rules => {
      if (rules && rules.length) { throw new Error(`${rules.length} rules use this certificate and must be deleted first:\n\n${rules.map(rule => rule.metadata.description).join('\n')}`); }
      return Certificate.deleteById(req.params.id);
    }
  ).then(
    () => res.json({
      success: true,
      message: 'Certificate deleted.',
    })
  ).catch(
    err => {
      handleError(res, 500, 'Failed to delete certificate', err)
    }
  );
});

module.exports = router;
