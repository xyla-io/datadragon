const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Q = require('q');

let GoogleadsCredentialSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: 'Please provide a user',
  },
  credentialCreationDate: {
    type: Date,
    default: () => new Date(),
  },
  name: {
    type: 'string',
    required: 'Please provide a credential name',
  },
  developerToken: {
    type: 'string',
    required: 'Please provide a developer token',
  },
  clientId: {
    type: 'string',
    required: 'Please provide a client ID',
  },
  clientSecret: {
    type: 'string',
    required: 'Please provide a client secret',
  },
  refreshToken: {
    type: 'string',
    required: 'Please provide a refresh token',
  },
  clientCustomerId: {
    type: 'string',
    required: 'Please provide a client customer ID',
  },
});

GoogleadsCredentialSchema.index({ user: 1, name: 1}, { unique: true });

GoogleadsCredentialSchema.statics.createCredential = function(newCredential) {
  return newCredential.save();
};

GoogleadsCredentialSchema.statics.deleteById = function(credentialID) {
  return GoogleadsCredential.findById(credentialID).then(credential => credential.remove());
};

GoogleadsCredentialSchema.statics.getCredentialById = function(credentialID) {
  return GoogleadsCredential.findById(credentialID);
};

GoogleadsCredentialSchema.statics.getUserCredentials = function(userID) {
  return GoogleadsCredential.find({ user: new mongoose.Types.ObjectId(userID) });
};

GoogleadsCredentialSchema.statics.deleteUserCredentials = function(userID) {
  return GoogleadsCredential.find({ user: new mongoose.Types.ObjectId(userID) }).then(
    credentials => Q.allSettled(credentials.map(credential => credential.remove())).then(
      results => {
        console.log('finished deleting user googleads credentials');
        let errors = results.filter(result => result.state === 'rejected').map(result => result.reason);
        if (errors.count) { throw new Error('Failed to delete user googleads credentials. Errors:\n\n' + errors.join('\n')) }
        return null;
      }));
};

GoogleadsCredentialSchema.methods.nonSecretProperties = function() {
  let properties = this.toObject();
  delete properties.developerToken;
  delete properties.clientId;
  delete properties.clientSecret;
  delete properties.refreshToken;
  delete properties.clientCustomerId;
  return properties
};

let GoogleadsCredential = mongoose.model('googleadsCredential', GoogleadsCredentialSchema, 'googleadsCredentials');

module.exports.GoogleadsCredential = GoogleadsCredential;