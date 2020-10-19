const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Schema = mongoose.Schema;
const Q = require('q');
const fs = require('fs');
const rootDirectory = require('path').dirname(require.main.filename);
const Certificate = require('./certificate.model');
const Credential = require('./credential.model').Credential;
const token = require('../modules/token');

const kResetPasswordTokenLifetime = 2 * 24 * 60 * 60 * 1000;

const ResetPasswordSchema = Schema({
  token: {
    type: String,
    required: 'Please provide a password reset token',
  },
  date: {
    type: Date,
    required: 'Please provide a password reset date',
  },
});

const UserSchema = Schema({
  local: {
    email: {
      type: String,
      required: 'Please provide an email address',
      unique: true,
    },
    password: {
      type: String,
      required: 'Please provide a password',
    },
  },
  resetPassword: ResetPasswordSchema,
  name: {
    type: String,
    required: 'Please provide a name',
  }
});

UserSchema.methods.validatePassword = function(password, completion) {
  return bcrypt.compare(password, this.local.password, completion);
};

UserSchema.methods.userDirectoryPath = function() {
  return `${rootDirectory}/files/users/${this._id.toString()}`;
};

UserSchema.methods.userCertificatesDirectoryPath = function() {
  return `${this.userDirectoryPath()}/certificates`;
};

UserSchema.methods.delete = function() {
  return Credential.deleteUserCredentials(this._id.toString()).then(() => Certificate.deleteUserCertificates(this._id.toString()).then(
    () => {
      let certificatesPath = this.userCertificatesDirectoryPath();
      let userPath = this.userDirectoryPath();

      fs.rmdir(certificatesPath, err => {
        if (err) { console.log(err); }
        fs.rmdir(userPath, err => {
          if (err) { console.log(err); }
          fs.access(userPath, err => {
            if (!err) { return deferred.reject(new Error('Failed to remove user directory.')); }
            return this.remove().then(
              user => deferred.resolve(user),
              err => deferred.reject(err));
          });
        });
      });
    }
  ));
};

UserSchema.methods.createPasswordResetToken = function() {
  return token.generateToken(64)
    .then(token => {
      this.resetPassword = {
        token: token,
        date: new Date(),
      };
      return this.save();
    });
};

UserSchema.methods.setNewPassword = function(newPassword) {
  let deferred = Q.defer();
  User.generateHash(newPassword, (err, hash) => {
    if (err) {
      return deferred.reject(err);
    }
    this.local.password = hash;
    this.resetPassword = null;
    this.save()
      .then(user => {
        deferred.resolve(user);
      })
      .catch(error => {
        deferred.reject(error);
      });
  });
  return deferred.promise;
};

UserSchema.methods.verifyPasswordResetToken = function(token) {
  if (!this.resetPassword) return false;
  let tokenAge = Date.now() - this.resetPassword.date.getTime();
  if (tokenAge > kResetPasswordTokenLifetime) { return false }
  return token === this.resetPassword.token;
};

UserSchema.statics.generateHash = function(password, completion) {
  return bcrypt.hash(password, 10, completion);
};

UserSchema.statics.passwordValidationErrors = function(password) {
  let requirements = [
    { regex: /.{6}/, message: 'contain at least 6 characters' },
    { regex: /[a-z]/, message: 'contain a lower case letter' },
    { regex: /[A-Z]/, message: 'contain a capital letter' },
    { regex: /[0-9]/, message: 'contain a number' },
  ];

  let errors = [];
  requirements.forEach(requirement => {
    if (password.match(requirement.regex) !== null) { return }
    errors.push(requirement.message);
  });

  if (errors.length === 0) { return [] }
  return ['Passwords must\n' + requirements.map(requirement => requirement.message).join('\n') + '\n\nThis password does not\n' + errors.join('\n')];
};

let User = mongoose.model('User', UserSchema);

User.createUser = function(newUser) {
  let deferred = Q.defer();

  function handleDirectoryError(err) {
    console.log(err);
    user.delete().then(
      () => deferred.reject(err),
      err => deferred.reject(err));
  }

  newUser.save().then(
    user => {
      console.log(user.userDirectoryPath());
      let userPath = user.userDirectoryPath();
      let certificatesPath = user.userCertificatesDirectoryPath();
      console.log('Creating user path');
      fs.mkdir(userPath, err => {
        if (err) { return handleDirectoryError(err); }
        fs.mkdir(certificatesPath, err => {
          if (err) { return handleDirectoryError(err); }
          deferred.resolve(user);
        });
      });
    },
    err => deferred.reject(err));

  return deferred.promise;
};

User.deleteById = (id) => {
  return User.findById(id).then(user => {
    if (user === null) { throw new Error('Failed to find user.'); }
    return user.delete();
  });
};

User.getByEmail = function(email) {
  return User.findOne({ 'local.email': email });
};

User.getByID = function(userID) {
  return User.findById(userID);
};

module.exports = User;

