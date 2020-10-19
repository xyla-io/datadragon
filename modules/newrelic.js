const newrelic = require('newrelic');
const Q = require('q');

var webTransactions = {};
var backgroundTransactions = {};

module.exports.startWebTransaction = function(url, id) {
  newrelic.startWebTransaction(url, () => {
    let deferred = Q.defer();
    webTransactions[id] = deferred;
    return deferred.promise;
  });
};

module.exports.endWebTransaction = function(id) {
  if (!webTransactions[id]) { return }
  webTransactions[id].resolve();
  delete webTransactions[id];
};

module.exports.startBackgroundTransaction = function(name, group, id, attributes) {
  newrelic.startBackgroundTransaction(name, group, () => {
    if (attributes) {
      newrelic.addCustomAttributes(attributes);
    }
    let deferred = Q.defer();
    backgroundTransactions[id] = deferred;
    return deferred.promise;
  });
};

module.exports.endBackgroundTransaction = function(id) {
  if (!backgroundTransactions[id]) { return }
  backgroundTransactions[id].resolve();
  delete backgroundTransactions[id];
};

module.exports.recordCustomEvent = function() {
  newrelic.recordCustomEvent.apply(newrelic, arguments);
};

const kMaxAttributeLength = 4000;
module.exports.truncateAttribute = function(attributeValue) {
  var stringValue = attributeValue.toString();
  if (stringValue.length > kMaxAttributeLength) {
    stringValue = stringValue.substr(0, kMaxAttributeLength - 1) + '…';
  }
  return stringValue;
};