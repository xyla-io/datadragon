const Q = require('q');
const path = require('path');
const PythonShell = require('python-shell');

const Channel = {
  appleSearchAds: 'apple_search_ads',
  googleAds: 'google_ads',
};

const Entity = {
  campaign: 'campaign',
  adgroup: 'adgroup',
  ad: 'ad',
};

const appDir = path.dirname(require.main.filename);

function buildSearchAdsScriptArgs(credential, parentEntityIDs) {
  return Object.assign({
    credentials: credential.credential,
    accountName: credential.name,
    channel: credential.target,
  }, parentEntityIDs);
}

function buildScriptOptions() {
  return {
    mode: 'json',
    pythonPath: appDir + '/python/environment/bin/python',
    scriptPath: __dirname + '/..',
  };
}

function addArgsToOptions(options, args) {
  options.args = [JSON.stringify(args)];
  return options;
}

function getChannelReport({credential, timeGranularity, entityGranularity, start, end}) {
  const deferred = Q.defer();

  function get_channel_report(options, args) {
    args.command = 'channel_report';
    let shell = new PythonShell('datadragon_api.py', addArgsToOptions(options, args));
    let data;
    shell.on('message', message => {
      if (message.log !== undefined) {
        console.log(message.log);
      } else {
        data = message.data;
      }
    });

    shell.end(error => {
      if (error !== undefined) {
        deferred.reject(error);
      } else {
        deferred.resolve(data);
      }
    });
  }

  const scriptArgs = {
    credentials: credential.credential,
    channel: credential.target,
    time_granularity: timeGranularity,
    entity_granularity: entityGranularity,
    start: new Date(start).getTime() / 1000,
    end: new Date(end).getTime() / 1000
  };

  const scriptOptions = buildScriptOptions();
  get_channel_report(scriptOptions, scriptArgs);
  return deferred.promise;
}

function getCredentialEntities(credential, entity, parentEntityIDs) {
  const deferred = Q.defer();

  function get_adgroups(options, args) {
    args.command = 'adgroups';
    let shell = new PythonShell('datadragon_api.py', addArgsToOptions(options, args));
    let data;
    shell.on('message', message => {
      if (message.log !== undefined) {
        console.log(message.log);
      } else {
        data = message.data;
      }
    });

    shell.end(error => {
      if (error !== undefined) {
        deferred.reject(error);
      } else {
        options.args.adgroups = data;
        options.args = [JSON.stringify(options.args)];
        deferred.resolve(data);
        return;
      }
    });
  }

  function get_campaigns(options, args) {
    args.command = 'campaigns';
    let shell = new PythonShell('datadragon_api.py', addArgsToOptions(options, args));
    let data;
    shell.on('message', message => {
      if (message.log !== undefined) {
        console.log(message.log);
      } else {
        data = message.data;
      }
    });

    shell.end(error => {
      if (error !== undefined) {
        deferred.reject(error);
      } else {
        deferred.resolve(data);
      }
    });  
  }

  function get_orgs(options, args) {
    args.command = 'orgs';
    let shell = new PythonShell('datadragon_api.py', addArgsToOptions(options, args));
    let data;
    shell.on('message', message => {
      if (message.log !== undefined) {
        console.log(message.log);
      } else {
        data = message.data;
      }
    });

    shell.end(error => {
      if (error !== undefined) {
        deferred.reject(error);
      } else {
        const campaignArgs = JSON.parse(options.args[0]);
        campaignArgs.orgs = data;
        get_campaigns(options, campaignArgs);
      }
    });
  }

  const scriptArgs = buildSearchAdsScriptArgs(credential, parentEntityIDs);
  const scriptOptions = buildScriptOptions();

  switch (entity) {
  case Entity.campaign:
    get_orgs(scriptOptions, scriptArgs);
    break;
  case Entity.adgroup:
    get_adgroups(scriptOptions, scriptArgs);
    break;
  }
  return deferred.promise;
}

module.exports.Channel = Channel;
module.exports.Entity = Entity;
module.exports.getCredentialEntities = getCredentialEntities;
module.exports.getChannelReport = getChannelReport;