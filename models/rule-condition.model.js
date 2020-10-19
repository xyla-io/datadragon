const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RuleConditionSchema = Schema({
  metric: {
    type: String,
    required: 'Please provide a metric'
  },
  metricValue : {
    type : Number,
    required: 'Please provide a metric value'
  },
  operator: {
    type: String,
    enum: ['less', 'greater', 'leq', 'geq', 'equal']
  },
});

RuleConditionSchema.virtual('longDescription').get(function() {
  let metricDescription = (function(metric) {
    switch (metric) {
      case 'reavgCPA': return 'CPA';
      case 'reavgCPT': return 'CPT';
      case 'reavgCPM': return 'CPM';
      case 'totalSpend': return 'Spend'
      case 'totalImpressions': return 'Impressions';
      case 'totalTaps': return 'Taps';
      case 'totalConversions': return 'Conversions';
      case 'reavgTTR': return 'TTR';
      case 'reavgConversionRate': return 'CR';
      default: return metric;
    }
  })(this.metric);

  let metricPrefix = (function(metric) {
    switch (metric) {
      case 'reavgCPA':
      case 'reavgCPT':
      case 'reavgCPM':
      case 'totalSpend': return '$';
      default: return '';
    }
  })(this.metric);

  let metricSuffix = (function(metric) {
    switch (metric) {
      case 'reavgTTR':
      case 'reavgConversionRate': return '%';
      default: return '';
    }
  })(this.metric);

  let operatorDescription = (function(operator) {
    switch (operator) {
      case 'less': return 'is less than';
      case 'greater': return 'is greater than';
      case 'leq': return 'is at most';
      case 'geq': return 'is at least';
      case 'equal': return 'is';
      default: return operator;
    }
  })(this.operator);

  var description = `**${metricDescription}** ${operatorDescription} ${metricPrefix}${this.metricValue}${metricSuffix}`;
  return description;
});

const RuleConditionGroupSchema = Schema({
  conditions: [RuleConditionSchema],
  subgroups: {
    type: [{ type: Schema.Types.ObjectId, ref: 'RuleConditionGroup' }],
    default: []
  },
  operator: {
    type: String,
    enum: ['any', 'all']
  },
});

RuleConditionGroupSchema.post('remove', function(group) {
  RuleConditionGroup.find().where('_id').in(group.subgroups).exec((error, subgroups) => {
    subgroups.forEach(subgroup => {
      subgroup.remove();
    });
  });
});

RuleConditionGroupSchema.pre('find', function(next) {
  this.populate('subgroups');
  next()
});

RuleConditionGroupSchema.virtual('longDescription').get(function() {
  let operatorDescription = (function(operator) {
    switch (operator) {
      case 'any': return 'or';
      case 'all': return 'and';
      default: return operator;
    }
  })(this.operator);

  var description = 'If ';
  description += this.conditions.map(condition => condition.longDescription).concat(this.subgroups.map(group => `(${group.longDescription})`)).join(` ${operatorDescription} `)
  return description;
});

let RuleConditionGroup = mongoose.model('RuleConditionGroup', RuleConditionGroupSchema, 'ruleConditionGroups');

function createConditionGroup(newGroup, callback) {
  if (newGroup.subgroups.length === 0) {
    newGroup.save(callback);
    return;
  }

  let subgroupCount = newGroup.subgroups.length;
  let subgroupSaveErrors = [];

  newGroup.subgroups.forEach(subgroup => {
    createConditionGroup(subgroup, (error, model) => {
      subgroupCount--;
      if (error) {
        subgroupSaveErrors.push(error);
      }

      if (subgroupCount === 0) {
        if (subgroupSaveErrors.length > 0) { console.log('Subgroup save errors: ', subgroupSaveErrors); }
        newGroup.save(callback);
      }
    });
  });
}

function deleteConditionGroupByID(id, completion) {
  RuleConditionGroup.findById(id, (error, group) => {
    group.remove(completion);
  });
}

module.exports.condition = mongoose.model('RuleCondition', RuleConditionSchema);
module.exports.group = RuleConditionGroup;

module.exports.createConditionGroup = createConditionGroup;
module.exports.deleteConditionGroupByID = deleteConditionGroupByID;