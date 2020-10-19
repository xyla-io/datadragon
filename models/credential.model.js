const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Q = require('q');
const RuleModel = require('./rule.model');
const {
  pathFromComponents,
  componentsFromPath,
} = require('../modules/path-utilities');
const Certificate = require('./certificate.model');

let CredentialSchema = new Schema({
  target: {
    type: 'string',
    required: 'Please provide a target',
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: 'Please provide a user',
  },
  creationDate: {
    type: Date,
    default: () => new Date(),
  },
  modificationDate: {
    type: Date,
    default: () => new Date(),
  },
  name: {
    type: 'string',
    required: 'Please provide a credential name',
  },
  credential: {
    type: Schema.Types.Mixed,
    required: 'Please provide a credential'
  },
});

CredentialSchema.index({ user: 1, target: 1, name: 1}, { unique: true });

CredentialSchema.post('remove', credential => {
  RuleModel.Rule.deleteAccountRules(credential.path, error => {
    if (error) { console.log('Error deleting credential rules', error); }
  });
});

CredentialSchema.virtual('path').get(function() {
  return pathFromComponents(['user', this.user.toString(), 'credential', this.target, this.name]);
});

CredentialSchema.methods.nonSecretProperties = function() {
  let properties = this.toObject();
  properties.path = this.path;
  delete properties.credential;
  return properties
};

CredentialSchema.statics.conditionsFromPath = function(path) {
  const components = componentsFromPath(path);
  return {
    user: new mongoose.Types.ObjectId(components[1]),
    target: components[3],
    name: components[4],
  };
}

CredentialSchema.statics.createCredential = function(newCredential) {
  return newCredential.save();
};

CredentialSchema.statics.deleteByPath = function(credentialPath) {
  return this.findOne(this.conditionsFromPath(credentialPath)).then(credential => credential.remove());
};

CredentialSchema.statics.getCredentialByPath = function(credentialPath) {
  return this.findOne(this.conditionsFromPath(credentialPath));
};

CredentialSchema.statics.getUserCredentials = function(userID) {
  return this.find({ user: new mongoose.Types.ObjectId(userID) });
};

CredentialSchema.statics.deleteUserCredentials = function(userID) {
  return this.find({ user: new mongoose.Types.ObjectId(userID) }).then(
    credentials => Q.allSettled(credentials.map(credential => credential.remove())).then(
      results => {
        console.log('finished deleting user credentials');
        let errors = results.filter(result => result.state === 'rejected').map(result => result.reason);
        if (errors.count) { throw new Error('Failed to delete user credentials. Errors:\n\n' + errors.join('\n')) }
        return null;
      }
    )
  );
};

CredentialSchema.statics.credentialDataForPath = function(path) {
  const conditions = this.conditionsFromPath(path);
  return Credential.getCredentialByPath(path)
    .then(credential => {
      return (credential) ? {
        target: credential.target,
        name: credential.name,
        credential: credential.credential,
      } : null;
    })
    .then(data => {
      if (data === null && conditions.target === 'apple_search_ads') {
        return Certificate.findOne({
          user: conditions.user,
          name: conditions.name,
        }).then(certificate => {
          return (certificate) ? {
            target: 'apple_search_ads',
            name: certificate._id.toString(),
            credential: Object.assign({'org_name': certificate._id.toString()}, certificate.credentials)
          } : null;
        });
      } else {
        return data;
      }
    });
};

let Credential = mongoose.model('Credential', CredentialSchema);

module.exports.Credential = Credential;