const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const deleteConditionGroupByID = require('../models/rule-condition.model').deleteConditionGroupByID;
const createConditionGroup = require('../models/rule-condition.model').createConditionGroup;

const RuleActionSchema = Schema({
  action : {
    type : String,
    default: 'no_action'
  },
  adjustmentValue : {
    type : Number,
    default: null
  },
  adjustmentLimit: {
    type : Number,
    default: null
  },
});

RuleActionSchema.virtual('longDescription').get(function() {
  let actionDescription = (function(action) {
    switch (action) {
      case 'inc_bid': return 'Increase Bid';
      case 'dec_bid': return 'Decrease Bid';
      case 'inc_cpa_goal': return 'Increase CPA Goal';
      case 'dec_cpa_goal': return 'Decrease CPA Goal';
      case 'increase_campaign_budget': return 'Increase Campaign Budget';
      case 'decrease_campaign_budget': return 'Decrease Campaign Budget';
      case 'pause_keyword': return 'Pause Keyword';
      case 'pause_campaign': return 'Pause Campaign';
      case 'no_action': return 'Take No Action';
      default: return action;
    }
  })(this.action);

  let makesAdjustment = (function(action) {
    switch (action) {
      case 'pause_keyword':
      case 'pause_campaign':
      case 'no_action': return false;
      default: return true;
    }
  })(this.action);

  var description = `Then **${actionDescription}**`;
  if (makesAdjustment) {
    if (this.adjustmentValue !== null) {
      description += ` by ${this.adjustmentValue}%`;
    }
    if (this.adjustmentLimit !== null) {
      description += ` stopping at $${this.adjustmentLimit}`;
    }
  }
  return description;
});

const RuleTaskSchema = Schema({
  conditionGroup : {
    type : mongoose.Schema.Types.ObjectId,
    ref : 'RuleConditionGroup',
    required : 'Please provide a condition group'
  },
  actions: [RuleActionSchema],
});

RuleTaskSchema.post('remove', task => {
  console.log('task post remove');
  deleteConditionGroupByID(task.conditionGroup, error => {
    if (error) { console.log('Error deleting task condition group', error); }
  });
});

RuleTaskSchema.pre('save', function(next) {
  if (!this.conditionGroup._id) {
    next();
    return;
  }
  RuleTask.findById(this._id, (error, oldTask) => {
    if (error) {
      console.log('Error finding task', error);
    }
    if (oldTask) {
      deleteConditionGroupByID(oldTask.conditionGroup);
    }
    createConditionGroup(this.conditionGroup, (error, model) => {
      if (model) {
        this.conditionGroup = model;
      }
      next();
    });
  });
});

RuleTaskSchema.virtual('longDescription').get(function() {
  var description = `- ${this.conditionGroup.longDescription}\n`;
  description += this.actions.map(action => { return '    - ' + action.longDescription}).join('\n');
  return description;
});

let RuleAction = mongoose.model('RuleAction', RuleActionSchema);
let RuleTask = mongoose.model('RuleTask', RuleTaskSchema);

RuleTask.Action = RuleAction;

RuleTask.createConditionGroup = (completion) => {
  createConditionGroup(this.conditionGroup, (error, model) => {
    if (error) {
      console.log('Error creating condition group: ', error);
    }
    this.conditionGroup = model;
    callback(error);
  });
};

module.exports = RuleTask;
