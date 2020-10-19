const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Q = require('q');

let AdjustCredentialSchema = new Schema({
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
  userToken: {
    type: 'string',
    required: 'Please provide a user token',
  },
  appToken: {
    type: 'string',
    required: 'Please provide an app token',
  },
  lastRevenueReportDate: {
    type: Date,
  },
});

AdjustCredentialSchema.index({ user: 1, name: 1}, { unique: true });

let AdjustCredential = mongoose.model('AdjustCredential', AdjustCredentialSchema, 'adjustCredentials');

AdjustCredential.createCredential = function(newCredential) {
  return newCredential.save();
};

AdjustCredential.deleteById = function(credentialID) {
  return AdjustCredential.findById(credentialID).then(credential => credential.remove());
};

AdjustCredential.getCredentialById = function(credentialID) {
  return AdjustCredential.findById(credentialID);
};

AdjustCredential.getUserCredentials = function(userID) {
  return AdjustCredential.find({ user: new mongoose.Types.ObjectId(userID) });
};

AdjustCredential.deleteUserCredentials = function(userID) {
  return AdjustCredential.find({ user: new mongoose.Types.ObjectId(userID) }).then(
    credentials => Q.allSettled(credentials.map(credential => credential.remove())).then(
      results => {
        console.log('finished deleting user adjust credentials');
        let errors = results.filter(result => result.state === 'rejected').map(result => result.reason);
        if (errors.count) { throw new Error('Failed to delete user adjust credentials. Errors:\n\n' + errors.join('\n')) }
        return null;
      }));
};

module.exports.AdjustCredential = AdjustCredential;