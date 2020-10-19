const mongoose = require('mongoose');
const Session = mongoose.model('Session', new mongoose.Schema(), 'sessions');

Session.removeAllSessions = ({ userID }) => {
  if (!userID) {
    return Promise.reject('userID is required');
  }
  return Session.remove({
    session: { $regex: `.*"user":"${userID}".*`}
  })
};

module.exports.Session = Session;