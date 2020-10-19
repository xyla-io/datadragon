const mongoose = require('mongoose');
const History = require('../models/rule-history.model');
const Task = require('../models/rule-task.model');
const deleteConditionGroupByID = require('../models/rule-condition.model').deleteConditionGroupByID;
const Q = require('q');

const RuleMetadataSchema = mongoose.Schema({
  accountName : {
    type : String,
    required : "Please provide an account name"
  },
  campaignName : {
    type : String,
    required : 'Please provide a campaign name'
  },
  adGroupName : {
    type : String,
    default : 'All',
    required : 'Please provide an ad group name'
  },
  actionDescription : {
    type : String,
    required : 'Please provide a rule description'
  },
  description : {
    type : String,
    required : 'Please provide a rule description'
  },
  title : {
    type : String,
    default : null
  },
});

const RuleSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: 'Please provide a user'
  },
  created : {
    type : Date,
    default : Date.now
  },
  modified: {
    type : Date,
    default : Date.now
  },
  lastRun : {
    type : Date,
    default : null
  },
  lastTriggered: {
    type : Date,
    default : null
  },
  channel: {
    type: String,
    required: 'Please provide a channel.',
  },
  account : {
    type: String,
    required: 'Please provide an account',
  },
  orgID : {
    type : Object,
    required : 'Please provide an org ID'
  },
  campaignID : {
    type : Object,
    required : 'Please provide a campaign ID'
  },
  adgroupID : {
    type : Object,
    default : null
  },
  granularity : {
    type : String,
    required : 'Please provide a granularity'
  },
  isEnabled : {
    type : Boolean,
    default : true
  },
  dataCheckRange : {
    type : Number,
    required : 'Please provide a data check range'
  },
  runInterval : {
    type : Number,
    default : 60 * 60 * 1000
  },
  tasks : [Task.schema],
  shouldSendEmail: {
    type: Boolean,
    default: false
  },
  shouldPerformAction : {
    type : Boolean,
    default : false
  },
  shouldMonitor : {
    type : Boolean,
    default : false
  },
  safeMode: {
    type: Boolean,
    default: true,
  },
  metadata : {
    type : RuleMetadataSchema,
    required : 'Please provide metadata'
  },
  options: {
    type: Object,
    default: {},
  },
}, {
  toJSON: { minimize: false },
  toObject: { minimize: false },
});

RuleSchema.index({ user: 1 });

RuleSchema.post('remove', rule => {
  History.deleteHistoryForRuleID(rule._id, error => {
    if (error) { console.log('Error deleting rule history', error); }
  });
});

RuleSchema.virtual('longDescription').get(function() {
  function _intervalDescription(interval) {
    switch (interval) {
      case 60 * 60 * 1000: return 'hour';
      case 60 * 60 * 1000 * 4: return '4 hours';
      case 60 * 60 * 1000 * 12: return '12 hours';
      case 60 * 60 * 1000 * 24: return 'day';
      case 60 * 60 * 1000 * 24 * 7: return 'week';
      default: return `${interval / 1000 / 60 / 60} hours`;
    }
  }
  var description = `In campaign **${this.metadata.campaignName}** in ${(this.adgroupID === null) ? 'all ad groups' : 'ad group **' + this.metadata.adGroupName + '**'}  \nEvery ${_intervalDescription(this.runInterval)} review the last ${_intervalDescription(this.dataCheckRange)} of data  \n`;
  description += this.tasks.map(task => task.longDescription).join('  \n');
  return description;
});

const Rule = mongoose.model('Rule', RuleSchema);

Rule.deleteRules = function(rules) {
  let promises = rules.map(rule => {
    rule.tasks.forEach(task => {
      deleteConditionGroupByID(task.conditionGroup);
    });
    return rule.remove();
  });
  Q.allSettled(promises).then(results => {
    let errors = results.filter(result => result.state === 'fulfilled').map(result => result.reason);
    if (!errors.length) { return rules; }
    errors.forEach(err => console.log('Error deleting rule: ', err));
    throw new Error(`Errors deleting ${rejectedResults.length} rules. Errors:\n\n${errors.join('\n')}`)
  });
};

Rule.getAllRules = (callback) => {
  Rule.find(callback);
};

Rule.getUserRules = (userID) => {
  return Rule.find({ user: new mongoose.Types.ObjectId(userID) })
    .populate('tasks')
    .populate({
      path:'tasks.conditionGroup',
      model: 'RuleConditionGroup',
    })
};

Rule.getRuleByID = (id) => {
  return Rule.findById(id)
    .populate('tasks')
    .populate({
      path:'tasks.conditionGroup',
      model: 'RuleConditionGroup',
    })
};

Rule.createRule = (newRule, callback) => {
  if (!newRule.tasks) {
    console.log('Error: you need to include tasks when creating a new rule');
    return;
  }

  newRule.save(callback);
};

Rule.updateRuleByID = (id, rule) => {
  return Rule.findByIdAndUpdate(id, rule, { new : true });
};

Rule.deleteRuleById = (id, callback) => {
  Rule.findById(id)
    .populate('tasks')
    .exec((error, rule) => {
    if (error) {
      console.log('Error finding rule: ', error);
      callback(null, error);
    } else {
      rule.tasks.forEach(task => {
        deleteConditionGroupByID(task.conditionGroup);
      });
      rule.remove(callback);
    }
  });
};

Rule.getAccountRules = function(account) {
  return Rule.find({ account: account });
};

Rule.deleteAccountRules = function(account, callback) {
  Rule.find({ account: account })
    .then(
      rules => Rule.deleteRules(rules).then(
        () => callback(),
        err => callback(err)),
      err => callback(err));
};

Rule.deleteUserRules = function(userID, callback) {
  Rule.find({ user: mongoose.Types.ObjectId(userID) })
    .then(
      rules => Rule.deleteRules(rules).then(
        () => callback(),
        err => callback(err)),
      err => callback(err));
};

Rule.updateLastRunByID = function(ruleID, runDate) {
  return Rule.findByIdAndUpdate(ruleID, { lastRun: runDate });
};

Rule.log = (rule) => {
  if (!rule) {
    console.log(rule)
    return;
  }
  const props = rule.toObject();
  props.tasks = props.tasks.length;
  console.log(props)
}

module.exports.Rule = Rule;
