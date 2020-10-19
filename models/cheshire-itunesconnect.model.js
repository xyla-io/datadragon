const Q = require('q');
const itc = require('itunesconnectanalytics');
const Itunes = itc.Itunes;
const AnalyticsQuery = itc.AnalyticsQuery;

function ITunesConnectAPI(username, password) {
  this.username = username;
  this.password = password;
  this.instance = null;
}

ITunesConnectAPI.prototype.logIn = function () {
  let deferred = Q.defer();
  if (this.logInDeferreds) {
    this.logInDeferreds.push(deferred);
    return deferred.promise;
  }

  this.instance = null;
  this.logInDeferreds = [deferred];
  var tempInstance;
  tempInstance = new Itunes(this.username, this.password, {
    errorCallback: e => {
      console.log('error:', e);
      this.logInDeferreds.forEach(loginDeferred => loginDeferred.reject(e));
    },
    successCallback: d => {
      console.log('logged in:', d);
      this.instance = tempInstance;
      this.logInDeferreds.forEach(loginDeferred => loginDeferred.resolve(d));
    }
  });
  return deferred.promise;
};

ITunesConnectAPI.prototype.isLoggedIn = function() { return !!this.instance };

ITunesConnectAPI.prototype.getProviderIds = function() {
  let deferred = Q.defer();

  if (!this.isLoggedIn()) { return this.logIn().then(() => this.getProviderIds()) }
  
  this.instance.getUserInfo((error, data) => {
    console.log(JSON.stringify(data, null, 2));

    if (error) {
      console.log(error);
      deferred.reject(error);
    } else if (!data || !data.contentProviders) {
      deferred.reject(new Error('No providers in API response.'));
    } else {
      deferred.resolve(data.contentProviders);
    }
  });
  return deferred.promise;
};

ITunesConnectAPI.prototype.getApps = function() {
  let deferred = Q.defer();

  if (!this.isLoggedIn()) { return this.logIn().then(() => this.getAppIds()) }

  this.instance.getApps(function(error, data) {
    console.log(JSON.stringify(data, null, 2));

    if (error) {
      console.log(error);
      deferred.reject(error);
    } else if (!data || !data.results) {
      deferred.reject(new Error('No results in API response.'));
    } else {
      deferred.resolve(data.results);
    }
  });
  return deferred.promise;
};

ITunesConnectAPI.prototype.changeProvider = function(providerId) {
  let deferred = Q.defer();

  if (!this.isLoggedIn()) { return this.logIn().then(() => this.getAppIds()) }

  this.instance.changeProvider(providerId, function(error) {
    console.log(JSON.stringify(error, null, 2));

    if (error) {
      console.log(error);
      deferred.reject(error);
    } else {
      deferred.resolve();
    }
  });
  return deferred.promise;
};

ITunesConnectAPI.prototype.runReport = function (reportParameters) {
  let deferred = Q.defer();
  if (!this.isLoggedIn()) {
    return this.logIn().then(() => this.getAppIds())
  }

  var query = AnalyticsQuery.metrics(appId, {
    measures:  itc.measures.units,
  }).date('2016-04-10','2016-05-10');

  this.instance.request(query, function(error, result) {
    console.log(JSON.stringify(result, null, 2));
    if (error) {
      console.log(JSON.stringify(error, null, 2));
      deferred.reject(error);
    } else {
      deferred.resolve(data);
    }
  });
  return deferred.promise;
};

module.exports.ITunesConnectAPI = ITunesConnectAPI;
