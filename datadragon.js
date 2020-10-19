const mongoose = require('mongoose');
const databaseConfig = require('./config/database');
const { quote } = require('shell-quote');
const stringify = require('json-stable-stringify');
const { flags } = require('@oclif/command');
const csvSync = require('csv/lib/sync');
const { runCommand } = require('./modules/python');

function purgedObjectIDs(obj) {
  let purged;
  if (obj === null) {
    purged = null;
  } else if (obj === undefined) {
    purged = undefined;
  } else if (Array.isArray(obj)) {
    return obj.map(v => purgedObjectIDs(v));
  } else if (typeof obj === 'object') {
    purged = {};
    Object.keys(obj).forEach(key => {
      if (key === '_id') { return; }
      purged[key] = purgedObjectIDs(obj[key]);
    });
  } else {
    purged = obj;
  }
  return purged;
}

module.exports.connect = async function() {
  // Connect mongoose to our database
  await mongoose.connect(databaseConfig.databaseURL);
};

module.exports.disconnect = async function() {
  // Disconnect mongoose from our database
  await mongoose.disconnect();
};

module.exports.format = function(flags, output) {
  let formatFlags = Object.assign({}, flags);
  if (formatFlags['parse-csv']) {
    output = csvSync.parse(output, {
      columns: true,
      skip_empty_lines: true
    });
  }
  if (formatFlags.quiet) {
    formatFlags = {quiet: true};
  }
  if (formatFlags.separate && Array.isArray(output)) {
    delete formatFlags.separate;
    return output.map(o => module.exports.format(formatFlags, o)).join('\n\n');
  }

  let formatted;
  if (flags.csv) {
    formatted = csvSync.stringify(output, {
      header: true,
    });
  } else {
    formatted = formatFlags.pretty ? stringify(output, {space: 2}) : stringify(output);
  }

  if (formatFlags['json-string']) {
    formatted = JSON.stringify(formatted);
  }
  if (formatFlags.escape) {
    formatted = quote([formatted]);
  }
  return formatted;
};

module.exports.format.flags = function(overrides) {
  const flagOptions = {
    escape: {
      char: 'e',
      description: 'shell escape',
      allowNo: true,
    },
    'json-string': {
      char: 'j',
      description: 'whether to quote as a JSON string',
      allowNo: true,
    },
    quiet: {
      char: 'q',
      description: 'whether to format output for piping',
      allowNo: true,
    },
    pretty: {
      char: 'p',
      description: 'whether to format output with readable whitespace',
      allowNo: true,
    },
    separate: {
      char: 's',
      description: 'whether to separate output items with blank lines',
      allowNo: true,
    },
    csv: {
      description: 'whether to format the output as CSV data',
      allowNo: true,
    },
    'parse-csv': {
      description: 'whether to format the output as CSV data',
      allowNo: true,
    },
  };
  if (overrides) {
    Object.keys(overrides).forEach(flag => {
      if (!overrides[flag]) {
        delete flagOptions[flag];
      } else {
        Object.assign(flagOptions[flag], overrides[flag]);
      }
    });
  }
  const formatFlags = {};
  Object.keys(flagOptions).forEach(flag => {
    formatFlags[flag] = flags.boolean(flagOptions[flag]);
  });
  return formatFlags;
};

module.exports.getUsers = async function() {
  const User = require('./models/user.model');
  const users = await User.find({});
  return users;
};

module.exports.createUser = async function(user, password) {
  const User = require('./models/user.model');
  const newUser = Object.assign({}, user);
  delete newUser._id;
  if (password !== undefined && password !== null) {
    const passwordHash = await new Promise((resolve, reject) => User.generateHash(password, (err, hash) => err ? reject(err) : resolve(hash)));
    newUser.local = Object.assign({}, newUser.local, {password: passwordHash});
  }
  const createdUser = await User.createUser(new User(newUser));
  return createdUser;
};

function certificateCredential(certificate, Certificate) {
  return {
    _id: certificate._id,
    __v: -1,
    user: certificate.user.toString(),
    target: 'apple_search_ads',
    name: certificate.name,
    modificationDate: certificate.certificateCreationDate,
    creationDate: certificate.certificateCreationDate,
    path: Certificate.pathForCertificate(certificate.user.toString(), certificate.name),
    credential: Object.assign({'org_name': certificate._id.toString()}, certificate.credentials),
  };
}

module.exports.getCredentials = async function() {
  const { Credential } = require('./models/credential.model');
  const Certificate = require('./models/certificate.model');
  let credentials = await Credential.find({});
  credentials = credentials.map(c => Object.assign({path: c.path}, c.toObject()));
  let certificates = await Certificate.find({});
  certificates = certificates.map(c => certificateCredential(c, Certificate));
  credentials = credentials.concat(certificates);
  return credentials;
};

module.exports.createCredential = async function(credential, certificatePath) {
  const newCredential = Object.assign({}, credential);
  delete newCredential._id;
  delete newCredential.path;
  let createdCredential;
  if (certificatePath !== undefined && certificatePath !== null) {
    const Certificate = require('./models/certificate.model');
    const fs = require('fs');
    const { promisify } = require('util');
    const uuid = require('uuid');
    const absoluteCertificatePath = certificatePath.startsWith('/') ? certificatePath :  `${__dirname}/${certificatePath}`;
    const tempCertificatePath = `${__dirname}/output/temp/${uuid.v4()}`
    await promisify(fs.copyFile)(absoluteCertificatePath, tempCertificatePath);
    createdCredential = await Certificate.createCertificate(new Certificate(newCredential), tempCertificatePath);
    createdCredential = certificateCredential(createdCredential, Certificate);
  } else {
    const { Credential } = require('./models/credential.model');
    delete newCredential.credentials;
    createdCredential = await Credential.createCredential(new Credential(newCredential));
    createdCredential = Object.assign({path: createdCredential.path}, createdCredential.toObject());
  }
  return createdCredential;
};

module.exports.findRule = async function(ruleID) {
  const {Rule} = require('./models/rule.model');
  const rule = await Rule.getRuleByID(ruleID);
  return rule;
};

module.exports.getRules = async function() {
  const {Rule} = require('./models/rule.model');
  const rules = await Rule.find({})
    .populate('tasks')
    .populate({
      path:'tasks.conditionGroup',
      model: 'RuleConditionGroup',
    });
  return rules;
};

module.exports.getRuleToRun = async function(ruleID) {
  require('./models/user.model');
  const {Rule} = require('./models/rule.model');
  const rule = await Rule.findById(ruleID)
    .populate('user')
    .populate('tasks')
    .populate({
      path:'tasks.conditionGroup',
      model: 'RuleConditionGroup',
    });
  return rule;
};

module.exports.createRule = async function(rule) {
  const { Rule } = require('./models/rule.model');
  const { _ruleWithRequestBody } = require('./modules/datadragon-shared');
  const { promisify } = require('util');
  const purgedRule = purgedObjectIDs(rule);
  const newRule = _ruleWithRequestBody(purgedRule);
  newRule.user = rule.user;
  const createdRule = await promisify(Rule.createRule)(newRule);
  return createdRule;
};

module.exports.getRuleRunArgs = async function(rule, overrides) {
  const { scriptArguments } = require('./controllers/rule-runner.controller');
  const { Credential } = require('./models/credential.model');
  const credential = await Credential.credentialDataForPath(rule.account);
  const scriptArgs = scriptArguments(rule, credential);
  if (overrides && overrides.scriptArguments) {
    Object.assign(scriptArgs, overrides.scriptArguments);
  }
  scriptArgs.command = 'execute_rule';
  return scriptArgs;
};

module.exports.runRule = async function(rule, overrides) {
  const { runRules } = require('./controllers/rule-runner.controller');
  const { promisify } = require('util');
  const runOverrides = Object.assign({}, overrides);
  runOverrides.rules = [rule];
  await promisify(runRules)(runOverrides);
  return runOverrides;
};

module.exports.clearRuleHistory = async function(ruleID) {
  const RuleHistory = require('./models/rule-history.model');
  return new Promise((resolve, reject) => {
    RuleHistory.deleteHistoryForRuleID(ruleID, err => {
      if (err) { reject(err); }
      else { resolve(); }
    });
  });
};

module.exports.getRuleHistory = async function(ruleID) {
  const RuleHistory = require('./models/rule-history.model');
  return RuleHistory.getHistory({ruleID: ruleID});
};

module.exports.componentsFromCollectionPath = function(collectionPath) {
  return collectionPath.split(/(?<!(^|[^\\])(\\\\)*\\)\./).filter(c => c !== undefined).map(c => c.replace(/\\(.)/g, '$1'));
};

module.exports.collectionPathFromComponents = function(collectionPathComponents) {
  return collectionPathComponents.map(c => c.replace(/\\/g, '\\\\').replace(/\./g, '\\.')).join('.');
};

module.exports.pathCollection = function(collection, components, populate = false) {
  if (collection === undefined) { return undefined; }
  if (typeof components === 'string') {
    components = module.exports.componentsFromCollectionPath(components);
  }
  if (components.length < 2) {
    return collection;
  }
  let component = components[0];
  if (Array.isArray(collection) && typeof component === 'string') {
    component = parseInt(component);
  }
  let value = collection[component];
  const valueComponent = components[1];
  if (value === undefined && populate) {
    value = typeof valueComponent !== 'string' || valueComponent.match(/[0-9]+/) ? [] : {};
    collection[component] = value;
  }
  if (components.length === 2) { return value; }
  return module.exports.pathCollection(value, components.slice(1), populate);
};

module.exports.pathCollectionKey = function(collection, components) {
  if (typeof components === 'string') {
    components = module.exports.componentsFromCollectionPath(components);
  }
  collection = module.exports.pathCollection(collection, components);
  if (collection === undefined || !components.length) { return undefined; }
  let component = components[components.length - 1];
  if (Array.isArray(collection) && typeof component === 'string') {
    component = parseInt(component);
  }
  return component;
};

module.exports.fetchResource = async function(resourceURL) {
  const protocol = resourceURL.split('://')[0];
  let resource;
  switch (protocol) {
    case 'credential':
      const { Credential } = require('./models/credential.model');
      const credential_path = resourceURL.slice(protocol.length + 3);
      resource = await Credential.credentialDataForPath(credential_path);
      resource = resource.credential;
      break;
    default: throw new Error(`Fetching ${protocol} resources is not yet supported.`);
  }
  return resource;
};

module.exports.injectResources = async function(targets, template, context) {
  for (target of Object.keys(targets)) {
    const resourceURL = targets[target];
    const resource = await module.exports.fetchResource(resourceURL);
    const collection = module.exports.pathCollection(template, target, true);
    collection[module.exports.pathCollectionKey(template, target)] = resource;
  }
};

module.exports.runPython = async function(command, context) {
  return runCommand(command.command, command);
};
