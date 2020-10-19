const express = require('express');
const router = express.Router();
const History = require('../models/rule-history.model');
const acl = new (require('../modules/acl'))();
const handleError = require('../modules/error').handleError;
const validating = require('../modules/validating');

let SearchNotificationsParameters = validating.Validating.model({
  type: 'object',
  required: [
    'startDate',
  ],
  additionalProperties: false,
  properties: {
    startDate: {
      type: 'string',
      format: 'date-time',
    },
    endDate: {
      type: 'string',
      format: 'date-time',
    },
  },
});

acl.allow([
  {
    roles: [acl.roles.user],
    allows: [
      { resources: ['/search', '/count'], permissions: ['post'] },
    ],
  },
]);

router.post('/search', acl.middleware(), async (req, res) => {
  let parameters = new SearchNotificationsParameters(req.body);
  let errors = parameters.validationErrors();
  if (errors) { return handleError(res, 400, 'Invalid search notifications parameters.\n\n' + errors.join('\n')); }

  try {
    const ruleHistoryEntries = await History.getHistory({
      userID: req.user._id.toString(),
      types: [ History.historyTypes.error, History.historyTypes.failed ],
      startDate: new Date(parameters.startDate),
      endDate: parameters.endDate ? new Date(parameters.endDate) : undefined,
    });

    const notifications = ruleHistoryEntries.map(entry => ({
      messages: [`Rule: ${entry.ruleDescription}`].concat(entry.errorDescriptions),
      date: entry.historyCreationDate,
      associations: { rule: entry.ruleID },
    }));

    res.json({
      success: true,
      message: 'Notifications successfully searched',
      notifications,
    });
  } catch (err) {
    handleError(res, 500, 'Failed to search notifications.', err);
  }
});

router.post('/count', acl.middleware(), async (req, res) => {
  let parameters = new SearchNotificationsParameters(req.body);
  let errors = parameters.validationErrors();
  if (errors) { return handleError(res, 400, 'Invalid count notifications parameters.\n\n' + errors.join('\n')); }

  try {
    const ruleHistoryCounts = await History.getHistory({
      userID: req.user._id.toString(),
      startDate: new Date(parameters.startDate),
      endDate: parameters.endDate ? new Date(parameters.endDate) : undefined,
      count: [
        'ruleID',
        'historyType',
      ],
    });

    const countsByRuleID = {};
    const emptyCounts = {};
    Object.keys(History.historyTypes).forEach(historyType => emptyCounts[History.historyTypes[historyType]] = 0);
    ruleHistoryCounts.forEach(count => {
      ruleID = count.ruleID.toString()
      if (!Object.keys(countsByRuleID).includes(ruleID)) {
        countsByRuleID[ruleID] = {
          ruleID: ruleID,
          counts: Object.assign({}, emptyCounts),
        };
      }
      countsByRuleID[ruleID].counts[count.historyType] = count.count;
    });

    res.json({
      success: true,
      message: 'Notifications successfully counted',
      ruleCounts: Object.values(countsByRuleID),
    });
  } catch (err) {
    handleError(res, 500, 'Failed to count notifications.', err);
  }
});

module.exports = router;
