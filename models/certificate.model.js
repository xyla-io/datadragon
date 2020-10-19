const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const fs = require('fs');
const Q = require('q');
const path = require('path');
const rootDirectory = path.dirname(require.main.filename);
const unzip = require('unzip');
const RuleModel = require('./rule.model');
const {
  pathFromComponents,
} = require('../modules/path-utilities');

let CertificateSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: 'Please provide a user',
  },
  certificateCreationDate: {
    type: Date,
    default: () => new Date(),
  },
  name: {
    type: 'string',
    required: 'Please provide a certificate name',
  },
});

CertificateSchema.index({ user: 1, name: 1}, { unique: true });

function pathForCertificate(userID, certificateName) {
  return pathFromComponents(['user', userID, 'credential', 'apple_search_ads', certificateName]);
}

CertificateSchema.post('remove', certificate => {
  let account = pathForCertificate(certificate.user.toString(), certificate.name);
  RuleModel.Rule.deleteAccountRules(account, error => {
    if (error) { console.log('Error deleting certificate rules', error); }
  });
});

CertificateSchema.statics.pathForCertificate = pathForCertificate;

CertificateSchema.virtual('certificateDirectoryPath').get(function() {
  return `${rootDirectory}/files/users/${this.user.toString()}/certificates/${this._id.toString()}`;
});

CertificateSchema.virtual('credentials').get(function() {
  return {
    pem: `${this.certificateDirectoryPath}/cert.pem`,
    key: `${this.certificateDirectoryPath}/cert.key`,
  };
});

CertificateSchema.methods.delete = function() {
  let deferred = Q.defer();
  let certificatePath = this.certificateDirectoryPath;

  Q.allSettled([
    Q.Promise((resolve, reject) => {
      fs.unlink(`${certificatePath}/cert.key`, err => {
        if (err) {
          reject(err);
        } else {
          resolve(null);
        }
      });
    }),
    Q.Promise((resolve, reject) => {
      fs.unlink(`${certificatePath}/cert.pem`, err => {
        if (err) {
          reject(err);
        } else {
          resolve(null);
        }
      });
    }),
  ]).then(results => {
    fs.rmdir(certificatePath, err => {
      fs.access(certificatePath, err => {
        if (!err) { return deferred.reject(new Error('Failed to remove certificate directory.')); }
        return this.remove().then(
          certificate => deferred.resolve(certificate),
          err => deferred.reject(err));
      });
    });
  });

  return deferred.promise;
};

let Certificate = mongoose.model('Certificate', CertificateSchema);

Certificate.createCertificate = function(newCertificate, zipFilePath) {
  let deferred = Q.defer();
  let errors = [];

  function cleanup(err, certificate, message) {
    if (err !== null) {
      errors.push(err);
    }
    fs.unlink(zipFilePath, err => {
      if (err) {
        errors.push(err);
      }
      if (errors.length) {
        if (message === undefined) {
          message = 'Failed to upload certificate.';
        }
        message += ' Errors:\n\n' + errors.join('\n');
      }
      if (message === undefined) {
        deferred.resolve(certificate);
      } else {
        let error = new Error(message);
        console.log(error);
        deferred.reject(error);
      }
    });
  }

  newCertificate.save().then(
    certificate => {
      let certificatePath = certificate.certificateDirectoryPath;
      fs.mkdir(certificatePath, err => {
        if (err) { return cleanup(err); }
        let pemDeferred = Q.defer();
        let keyDeferred = Q.defer();
        let closeDeferred = Q.defer();
        let pemFound = false;
        let keyFound = false;
        Q.allSettled([pemDeferred.promise, keyDeferred.promise, closeDeferred.promise]).then(
          results => {
            results.forEach(result => {
              if (result.state === 'rejected') {
                errors.push(result.reason);
              }
            });
            if (errors.length && !pemDeferred.promise.isRejected() && !keyDeferred.promise.isRejected()) {
              cleanup(null, certificate, 'Uploaded certificate but errors occurred.');
            } else {
              cleanup(null, certificate);
            }
          });
        fs.createReadStream(zipFilePath)
          .pipe(unzip.Parse())
          .on('error', err => errors.push(err))
          .on('entry', entry => {
            let fileName = path.basename(entry.path);
            let extension = path.extname(entry.path);
            let type = entry.type; // 'Directory' or 'File'
            if (type === 'File' && !fileName.startsWith('.') && extension === '.pem') {
              if (pemFound) {
                errors.push(new Error('Duplicate pem file in zip archive.'));
              } else {
                pemFound = true;
                entry.pipe(fs.createWriteStream(`${certificatePath}/cert.pem`)
                  .on('error', err => pemDeferred.reject(err))
                  .on('close', () => pemDeferred.resolve(null)));
              }
            } else if (type === 'File' && !fileName.startsWith('.') && extension === '.key') {
              if (keyFound) {
                errors.push(new Error('Duplicate key file in zip archive.'));
              } else {
                keyFound = true;
                entry.pipe(fs.createWriteStream(`${certificatePath}/cert.key`)
                  .on('error', err => keyDeferred.reject(err))
                  .on('close', () => keyDeferred.resolve(null)));
              }
            } else {
              entry.autodrain();
            }
          })
          .on('close', () => {
            if (!pemFound) {
              pemDeferred.reject(new Error('No pem file found in zip archive.'));
            }
            if (!keyFound) {
              keyDeferred.reject(new Error('No key file found in zip archive.'));
            }
            closeDeferred.resolve(null);
          });
      });
    },
    err => {
      if (err.code && err.code === 11000) {
        err = new Error('Please provide a unique certificate name.');
      }
      cleanup(err);
    });

  return deferred.promise;
};

Certificate.deleteById = function(certificateID) {
  return Certificate.findById(certificateID).then(certificate => certificate.delete());
};

Certificate.getCertificateById = function(certificateID) {
  return Certificate.findById(certificateID);
};

Certificate.getUserCertificates = function(userID) {
  return Certificate.find({ user: new mongoose.Types.ObjectId(userID) });
};

Certificate.deleteUserCertificates = function(userID) {
  return Certificate.find({ user: new mongoose.Types.ObjectId(userID) }).then(
    certificates => Q.allSettled(certificates.map(certificate => certificate.delete())).then(
       results => {
         console.log('finished deleting user certificates');
         let errors = results.filter(result => result.state === 'rejected').map(result => result.reason);
         if (errors.count) { throw new Error('Failed to delete user certificates. Errors:\n\n' + errors.join('\n')) }
         return null;
       }));
};

module.exports = Certificate;