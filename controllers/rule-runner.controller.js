const PythonShell = require('python-shell');
const rootDirectory = require('path').dirname(require.main.filename);
const Rule = require(rootDirectory + '/models/rule.model').Rule;
const email = require(rootDirectory + '/controllers/email.controller.js');
const dbConfig = require(rootDirectory + '/config/database');
const uuid = require('uuid');
const newrelic = require('../modules/newrelic');
const History = require('../models/rule-history.model');
const { Credential } = require('../models/credential.model');

const kRuleRunLimit = 5;
const kRuleTimeoutLimit = 10 * 60 * 1000;  // In milliseconds!
var currentRuleRuns = [];

function RuleRun(rule) {
  this.rule = rule;
  this.startTime = Date.now();
  this.id = uuid.v4();
  this.errors = [];
  this.actions = [];
}

RuleRun.prototype.assignShell = function (shell) {
  this.shell = shell;
};

RuleRun.prototype.runTime = function () {
  return Date.now() - this.startTime;
};

RuleRun.prototype.start = function() {
  newrelic.startBackgroundTransaction('ruleRun', 'rule', this.id, this.eventAttributes);
  let attributes = this.eventAttributes;
  attributes.subEvent = 'start';
  newrelic.recordCustomEvent('ruleRunEvent', attributes);
};

RuleRun.prototype.error = function(errors) {
  this.errors = errors;
  
  let attributes = this.eventAttributes;
  attributes.subEvent = 'error';
  attributes.errorCount = errors.length;
  attributes.errors = newrelic.truncateAttribute(this.errorsLongDescription);
  newrelic.recordCustomEvent('ruleRunEvent', attributes);
};

RuleRun.prototype.triggered = function(result) {
  var actionLogs = [];
  if (result.actionResults) {
    result.actionResults.forEach(actionResult => {
      actionLogs = actionLogs.concat(actionResult.logs.filter(l => l !== null));
    });
  }
  this.actions = actionLogs;

  let attributes = this.eventAttributes;
  attributes.subEvent = 'triggered';
  attributes.actionCount = actionLogs.length;
  attributes.actions = newrelic.truncateAttribute(this.actionsLongDescription);
  newrelic.recordCustomEvent('ruleRunEvent', attributes);

  this.actions.forEach(action => this.action(action));
};

RuleRun.prototype.notTriggered = function() {
  let attributes = this.eventAttributes;
  attributes.subEvent = 'notTriggered';
  newrelic.recordCustomEvent('ruleRunEvent', attributes);
};

RuleRun.prototype.end = function() {
  newrelic.endBackgroundTransaction(this.id);
};

RuleRun.prototype.action = function(action) {
  let attributes = {
    runID: this.id,
    ruleID: this.rule._id,
    dryRun: !this.rule.shouldPerformAction,
    userID: this.rule.user._id.toString(),
    targetType: action.targetType,
    targetID: action.targetID,
    targetDescription: action.targetDescription,
    actionDescription: action.actionDescription,
  };
  newrelic.recordCustomEvent('ruleActionEvent', attributes);
};

RuleRun.prototype.shortDateString = function(date) {
  let locale = "en-us";
  let options = { 
    year: 'numeric', 
    month: "numeric", 
    day: 'numeric',  
    hour: 'numeric', 
    minute: 'numeric', 
    timeZoneName: 'short',
  }
  return date.toLocaleString(locale, options);
};

RuleRun.prototype.longDateString = function(date) {
  let locale = "en-us";
  let options = { 
    year: 'numeric', 
    month: "long", 
    day: 'numeric', 
    weekday: 'long', 
    hour: 'numeric', 
    minute: 'numeric', 
    timeZoneName: 'short',
  }
  return date.toLocaleString(locale, options);
};

Object.defineProperty(RuleRun.prototype, 'eventAttributes', {
  get() {
    return { 
      runID: this.id,
      ruleID: this.rule._id,
      ruleDescription: this.rule.metadata.description,
      dryRun: !this.rule.shouldPerformAction,
      userID: this.rule.user._id.toString(),
      userEmail: this.rule.user.local.email,
    };
  },
});

Object.defineProperty(RuleRun.prototype, 'startDate', {
  get() {
    return new Date(this.startTime);
  },
});

Object.defineProperty(RuleRun.prototype, 'ruleName', {
  get() {
    return (this.rule.metadata.title === null) ? 'Your rule' : this.rule.metadata.title;
  },
});

Object.defineProperty(RuleRun.prototype, 'ruleShortName', {
  get() {
    return `${this.ruleName} created ${this.shortDateString(this.rule.created)} executed ${this.shortDateString(this.startDate)}`;
  },
});

Object.defineProperty(RuleRun.prototype, 'ruleLongName', {
  get() {
    return `**${this.ruleName}** created on ${this.longDateString(this.rule.created)}  \n${(this.rule.shouldPerformAction) ? '**Executed**' : 'Made a **dry run**'} on ${this.longDateString(this.startDate)}`;
  },
});

Object.defineProperty(RuleRun.prototype, 'ruleLongDescription', {
  get() {
    return this.rule.longDescription;
  },
});

Object.defineProperty(RuleRun.prototype, 'ruleDebugDescription', {
  get() {
    return `*Rule ID:* ${this.rule._id}  \n*Created:* ${this.rule.created.toISOString()}  \n*Run:* ${this.startDate.toISOString()}  \n*Dry Run:* ${!this.rule.shouldPerformAction}  \n*Description:* ${this.rule.metadata.description}  \n*User ID:* ${this.rule.user._id}  \n*User email:* ${this.rule.user.local.email}`;
  },
});

Object.defineProperty(RuleRun.prototype, 'errorsLongDescription', {
  get() {
    return this.errors.join('\n\n');
  }
});

Object.defineProperty(RuleRun.prototype, 'actionsLongDescription', {
  get() {
    function _targetTypeDescription(targetType) {
      switch (targetType) {
        case 'keyword': return 'Keyword'
        case 'adgroup': return 'Ad Group'
        default: return targetType;
      }
    }
    let actionPrefix = (this.rule.shouldPerformAction) ? '' : '*Would have* ';
    return this.actions.map((action, index) => `${index + 1}. ${actionPrefix}${action.actionDescription} for *${_targetTypeDescription(action.targetType)}* ${action.targetDescription}\n`).join('\n');
  },
});

// use isEnabled outside of the mongoose query
module.exports.runRules = (completion, overrides) => {
  currentRuleRuns = currentRuleRuns.filter(ruleRun => {
    if (ruleRun.runTime() >= kRuleTimeoutLimit) {
      console.log('RULE TIMED OUT: ');
      Rule.log(ruleRun.rule);
      return false
    } else {
      return true
    }
  });

  if (currentRuleRuns.length) {
    console.log('current rule runs: ', currentRuleRuns.length);
    console.log('limit: ', kRuleRunLimit - currentRuleRuns.length);
  }
  if (currentRuleRuns.length >= kRuleRunLimit) { return }

  let nowTime = new Date().getTime();
  let queryString = `
    if ((this.lastRun !== null) && ((this.lastRun.getTime() + this.runInterval) > ${nowTime})) { return false; }
    return true;
    `;

  Rule.where('isEnabled').equals(true)
    .$where(queryString)
    .limit(kRuleRunLimit - currentRuleRuns.length)
    .sort('lastRun')
    .populate('user')
    .populate('tasks')
    .populate({
      path:'tasks.conditionGroup',
      model: 'RuleConditionGroup',
    })
    .exec((error, rules) => {

    if (error) {
      console.log(error);
      completion();
      return;
    }

    if (overrides && overrides.rules) {
      rules = overrides.rules;
      console.log(`Overriding rules with ${rules.length} provided rules: ${rules.map(r=> r._id).join(', ')}`);
    }
    
    let runsToComplete = [];

    function finish(ruleRun) {
      ruleRun.end();
      currentRuleRuns = currentRuleRuns.filter(currentRuleRun => {
        return currentRuleRun !== ruleRun
      });
      runsToComplete = runsToComplete.filter(runToComplete => runToComplete !== ruleRun);
      if (!runsToComplete.length) { completion(); }
    }
    
    if (rules.length) {
      console.log('rules retrieved: ', rules.length);
    }
    rules.forEach(rule => {
      let ruleRun = new RuleRun(rule);
      runsToComplete.push(ruleRun);
      ruleRun.start();
      
      let credential;
      Credential.credentialDataForPath(rule.account).then(c => credential = c).then(() => Rule.updateLastRunByID(rule._id, new Date())).then(rule => {
        currentRuleRuns.push(ruleRun);
        console.log('Executing rule:', rule.metadata.title || rule.metadata.description, '[', rule._id, ']');

        let shell = executeRule(rule, credential, (errors, result) => {
          console.log('Rule execution ended:', rule.metadata.title || rule.metadata.description, '[', rule._id, ']');
          if (errors.length > 0) {
            console.log('Error thrown by rule:', rule.metadata.title || rule.metadata.description, '[', rule._id, ']', JSON.stringify(errors));
            Rule.log(rule)
            console.log(errors);
            ruleRun.error(errors);
            let text = '### 🚨 DATADRAGON Error thrown by rule\n\n' + ruleRun.ruleLongName + '\n\n' + ruleRun.ruleLongDescription + '\n\nThis rule threw an unexpected error. Please let us know at ' + email.replyToEmail + ' if it keeps throwing errors and we\'ll work on fixing them.\n\n### Error output\n\n<code>\n' + ruleRun.errorsLongDescription + '\n</code>\n\n### Debugging information\n\n' + ruleRun.ruleDebugDescription;
            sendRuleEmail(rule, text, '🚨 DATADRAGON Rule Error 🚨 Re: ' + ruleRun.ruleShortName);
          }

          if (result && result.report) {
            ruleRun.triggered(result);
            rule.lastTriggered = new Date();
            rule.save();

            if (result.actionResults) {
              result.actionResults.forEach((actionResult, index) => {
                if (!actionResult.apiResponse) { return; }
                console.log('Rule result api response for action ' + index + ': ', actionResult.apiResponse);
              });
              if (!rule.shouldPerformAction) {
                result.actionResults.forEach((actionResult, index) => {
                  if (!actionResult.logs) { return; }
                  console.log('Rule dry run result logs for action ' + index + ': ', actionResult.logs);
                });
              }  
            }

            if (rule.shouldSendEmail || rule.shouldMonitor) {
              let attachments = [ {
                filename: `datadragon-rule-alert-${ruleRun.rule._id}-${ruleRun.startDate.toISOString().replace(/:/g, '.')}.csv`,
                content: result.report,
                contentType: 'text/csv'
              }];
              var text = '### DATADRAGON Notification triggered for rule\n\n' + ruleRun.ruleLongName + '\n\n' + ruleRun.ruleLongDescription + '\n\nThis rule triggered an alert because its conditions were met and its *Send Email* option was checked. Please find the data that triggered this rule in the attached CSV document.';
              if (ruleRun.actions.length > 0) {
                text += '\n\n### ' + ((ruleRun.rule.shouldPerformAction) ? 'Actions taken' : 'Actions the rule *would have* taken if it weren\'t a dry run') + '\n\n' + ruleRun.actionsLongDescription;
              }
              text += '\n\n### Debugging information\n\n' + ruleRun.ruleDebugDescription + '\n\n### CSV report data\n\n'
              sendRuleEmail(rule, text, 'DATADRAGON Rule Notification 🔮 Re: ' + ruleRun.ruleShortName, attachments);
            } else {
              console.log('Did not have to send email about ');
              Rule.log(rule);
            }
          } else {
            console.log('Did not get result data: ', result);
            ruleRun.notTriggered();
          }

          finish(ruleRun);
        }, overrides);

        ruleRun.assignShell(shell);
      },
        err => {
        console.log('Error saving rule', err);
        finish(ruleRun);
        });
    });
  });
};

function executeRule(rule, credential, completionHandler, overrides) {
  let scriptArgs = scriptArguments(rule, credential);
  if (overrides && overrides.scriptArguments) {
    console.log(`Overriding rule script arguments ${JSON.stringify(overrides.scriptArguments)}`);
    Object.assign(scriptArgs, overrides.scriptArguments);
  }
  scriptArgs.command = 'execute_rule';

  let options = {
    mode: 'json',
    pythonPath: rootDirectory + '/python/environment/bin/python',
    scriptPath: __dirname + '/..',
    args: [JSON.stringify(scriptArgs)]
  };

  let shell = new PythonShell('datadragon_api.py', options);

  var result;
  let errors = [];

  shell.on('message', message => {
    if (message.errors) {
      errors = errors.concat(message.errors);
    }
    if (message.log) {
      console.log(message.log);
    }
    if (message.result) {
      result = message.result;
      if (result.actionResults) {
        result.actionResults.forEach(actionResult => {
          errors = errors.concat(actionResult.errors.filter(e => e !== null));
        });
      }
    }
  });

  let runError;
  shell.end(scriptError => {
    if (scriptError) {
      runError = scriptError;
      errors.unshift(scriptError);
    }

    if (!result) {
      let resultError = "Python script completed without returning a result.";
      if (runError === undefined) {
        runError = resultError;
      }
      errors.unshift(resultError);
    } else if (result.errors) {
      errors = result.errors.concat(errors)
    }

    if (runError !== undefined) {
      let history = new History({
        historyCreationDate: new Date(),
        historyType: 'failed',
        targetID: -1,
        actionDescription: `<strong>FAIL: </strong>Did not complete execution for rule ${rule.metadata.description}`,
        errorDescriptions: [scriptError.toString()],
        userID: rule.user,
        ruleID: rule._id,
        channel: rule.channel,
        ruleDescription: rule.metadata.description,
      });
      History.createHistory(history, (err, history) => {
        if (err) {
          console.log('An error occurred: ', err);
          errors.push(err.toString());
        }
        completionHandler(errors, result);
      });
    } else {
      completionHandler(errors, result);
    }
  });

  return shell
}

function scriptArguments(rule, credential) {

  function _dateString(date) {
    return `${date.getFullYear()}-${('00' + (date.getMonth() + 1)).slice(-2)}-${('00' + date.getDate()).slice(-2)}`;
  }

  let startDate = new Date(Date.now() - rule.dataCheckRange);
  let endDate = new Date();

  let scriptArgs = {
    dbConfig: dbConfig,
    credentials: credential.credential,
    orgName: rule.account,
    ruleID: rule._id,
    startDate: _dateString(startDate),
    endDate : _dateString(endDate),
    granularity: 'HOURLY',
  };

  return scriptArgs;
}

function sendRuleEmail(rule, emailMarkdown, subjectTitle, attachments) {
  let emails = [];
  if (rule.shouldMonitor) {
    emails = emails.concat([]);
  }
  let completion = err => {
    if (err) {
      console.log('Error sending email to: ', emails)
    } else {
      console.log('Sent email to: ', emails)
    }
    console.log(emailMarkdown);
  };

  if (rule.shouldSendEmail) {
    if (rule.user.local !== undefined) {
      emails.push(rule.user.local.email);
      email.sendMarkdownEmail(emails, emailMarkdown, subjectTitle, attachments, completion);
    } else {
      rule.populate('user', (err, rule) => {
        if (err) {
          console.log(err);
          return;
        }
        emails.push(rule.user.local.email);
        email.sendMarkdownEmail([rule.user.local.email], emailMarkdown, subjectTitle, attachments, completion);
      });    
    }
  } else if (emails.length) {
    email.sendMarkdownEmail(emails, emailMarkdown, subjectTitle, attachments, completion);
  }
}

module.exports.scriptArguments = scriptArguments;

const { promisify } = require('util');
module.exports.runRules[promisify.custom] = overrides => new Promise((resolve, reject) =>
  module.exports.runRules(resolve, overrides));
