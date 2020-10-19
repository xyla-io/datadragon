const mongoose = require('mongoose');

const historyTypes = Object.freeze({
  action: 'action',
  edited: 'edited',
  execute: 'execute',
  failed: 'failed',
  error: 'error',
});

const RuleHistorySchema = mongoose.Schema({
  historyCreationDate: {
    type: Date,
    required: 'Please provide a historyCreationDate'
  },
  historyType: {
    type: String,
    enum: Object.values(historyTypes),
    default: 'action',
  },
  errorDescriptions: {
    type: [String],
    default: [],
  },
  actionCount: {
    type: Number,
    default: 0,
  },
  lastDataCheckedDate: {
    type: Date,
    default: null
  },
  targetID: {
    type: Object,
    required: 'Please provide a targetID'
  },
  targetType: {
    type: String,
    default: null
  },
  targetChannel: {
    type: String,
    default: null
  },
  adjustmentType: {
    type: String,
    default: null
  },
  adjustmentFrom: {
    type: Object,
    default: null
  },
  adjustmentTo: {
    type: Object,
    default: null
  },
  actionDescription: {
    type: String,
    required: 'Please provide an action description'
  },
  targetDescription: {
    type: String,
    default: null,
  },
  userID: {
    type: mongoose.Schema.Types.ObjectId,
    required: 'Please provide a userID'
  },
  ruleID: {
    type: mongoose.Schema.Types.ObjectId,
    required: 'Please provide a ruleID'
  },
  channel: {
    type: String,
    default: null,
  },
  ruleDescription: {
    type: String,
    required: 'Please provide a rule description'
  },
  consumedData: {
    type: Boolean,
    default: false,
  },
  dryRun: {
    type: Boolean,
    default: false,
  },
});

RuleHistorySchema.index({ historyCreationDate: -1, ruleID: 1, userID: 1 });

const RuleHistory = module.exports = mongoose.model('RuleHistory', RuleHistorySchema, 'rulesHistory');
module.exports.historyTypes = historyTypes;

/**
 * Get history for a rule
 * 
 * @param {object} parameters search parameters
 * @param {string} parameters.ruleID a user id string to filter by
 * @param {string[]} [parameters.types] an array of historyType values
 * @param {Date} [parameters.startDate] the start Date object or ISO string of a date range to search within (inclusively)
 * @param {Date} [parameters.endDate] the end Date object or ISO string of a date range to search within (inclusively)
 */
module.exports.getHistory = async ({ userID, ruleID, types, startDate, endDate, count}) => {
  if (!ruleID && !userID) { throw new Error('ruleID or userID is required'); }
  const query = {};
  if (ruleID) { query.ruleID = new mongoose.Types.ObjectId(ruleID); }
  if (userID) { query.userID = new mongoose.Types.ObjectId(userID); }
  if (Array.isArray(types)) {
    query.historyType = { $in: types };
  }
  if (startDate) {
    query.historyCreationDate = { $gte: startDate };
  }
  if (endDate) {
    query.historyCreationDate = {
      ...(query.historyCreationDate || {}),
      $lte: endDate,
    };
  }
  if (count !== undefined) {
    let group = {};
    count.forEach(property => group[property] = '$' + property);
    return RuleHistory.aggregate([
      { $match: query },
      { $group: { "_id": group, count: { $sum: 1} } },
    ]).cursor({async: true})
      .exec()
      .then(cursor => cursor.toArray())
      .then(counts => counts.map(count => Object.assign({count: count.count}, count._id)));
  } else {
    return RuleHistory
    .find(query)
    .sort('-historyCreationDate')
    .exec()
    .then(history => {
      let historyTypeSort = {
        execute: 0,
        action: 1,
        error: 2,
        failed: 3,
        edited: 4,
      };
      history.sort((a, b) => {
        let timeDelta = b.historyCreationDate - a.historyCreationDate;
        if (timeDelta !== 0) { return timeDelta; }
        let typeDelta = historyTypeSort[b.historyType] - historyTypeSort[a.historyType];
        if (typeDelta !== 0) { return typeDelta; }
        return (a.actionDescription > b.actionDescription) ? 1 : -1;
      });
      return history;
    });
  }
};

module.exports.createHistory = (newHistory, completion) => {
  newHistory.save(completion);
};

module.exports.deleteHistoryForRuleID = (ruleID, completion) => {
  RuleHistory.remove({ ruleID: ruleID }, completion);
};
