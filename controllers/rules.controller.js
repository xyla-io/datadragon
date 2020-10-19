const express = require('express');
const router = express.Router();
const Rule = require('../models/rule.model').Rule;
const History = require('../models/rule-history.model');
const ConditionGroup = require('../models/rule-condition.model').group;
const Task = require('../models/rule-task.model');
const deleteConditionGroupByID = require('../models/rule-condition.model').deleteConditionGroupByID;
const acl = new (require('../modules/acl'))();
const ownerMiddleware = require('../modules/owner').middleware('rules');
const handleError = require('../modules/error').handleError;
const { componentsFromPath } = require('../modules/path-utilities');
const ReadWriteLock = require('rwlock');
const ruleLock = new ReadWriteLock();

const path = require('path');
let appDir = path.dirname(require.main.filename);

let fs = require('fs');

acl.allow([
  {
    roles: [acl.roles.user],
    allows: [
      { resources: ['/'], permissions: ['get', 'post', 'patch', 'put', 'delete'] },
    ],
  },
]);

router.get('/', acl.middleware(), async (req, res) => {
  try {
    const rules = await Rule.getUserRules(req.user._id.toString());
    res.json({
      success: true,
      message: 'Rules loaded successfully',
      rules,
    });
  } catch (err) {
    res.json({
      success: false,
      message: `Failed to load rules for user. Error: ${err}`,
      rules: []
    });
  }
});

router.get('/import', acl.middleware(), (req, res, next) => {
  fs.readFile(appDir + '/scripts/newRules.json', 'utf8', (error, data) => {
    let rules = JSON.parse(data);
    rules.forEach(rule => {
      let newRule = _ruleWithRequestBody(rule);
      Rule.createRule(newRule, (err, rule) => {
        console.log('Added rule', rule);
      });
    });

    res.json({
      success: true,
      message: 'Hopefully the rules were added.',
    });
  });
});

router.get('/:id', acl.middleware(0), ownerMiddleware, async (req, res, next) => {
  try {
    const rule = await Rule.getRuleByID(req.params.id);
    res.json({
      success: true,
      rule,
    });
  } catch (err) {
    console.log('An error occurred: ', err);
    res.status(500).send(err.toString());
  }
});

router.post('/', acl.middleware(), checkRuleBodyMiddleware, (req, res, next) => {
  let newRule = _ruleWithRequestBody(req.body);
  newRule.user = req.user._id;

  Rule.createRule(newRule, (err, rule) => {
    if (err) {
      handleError(res, 500, 'Failed to create a new rule.', err);
    } else {
      res.json({
        success: true,
        message: 'Added successfully.',
        rule: rule
      });
    }
  });
});

router.patch('/:id', acl.middleware(0), ownerMiddleware, checkRuleBodyMiddleware, (req, res, next) => {
  ruleLock.readLock(req.params.id, async (release) => {
    try {
      const update = req.body;
      const existingRule = await Rule.getRuleByID(req.params.id);
      if (
        existingRule.modified !== null
        && existingRule.modified.getTime() !== new Date(update.modified).getTime()
      ) {
        res.status(409).json({
          success: false,
          message: 'This rule was updated by someone else after you loaded it. Please review the new state of the rule and re-apply your changes where necessary.',
          rule: existingRule,
        });
      } else {
        if (update.isEnabled === false) {
          update.lastRun = undefined;
          update.lastTriggered = undefined;
        }
        update.modified = new Date();
        await Rule.updateRuleByID(req.params.id, update);
        const rule = await Rule.getRuleByID(req.params.id);
        res.json({
          success: true,
          message: 'Updated successfully.',
          rule: rule
        });
      }
    } catch (err) {
      console.log('An error occurred: ', err);
      res.status(500).send(err.toString());
    } finally {
      release();
    }
  })
});

router.put('/:id', acl.middleware(0), ownerMiddleware, checkRuleBodyMiddleware, (req, res, next) => {
  function _respond(rule) {
    res.json({
      success: true,
      message: 'Replaced successfully.',
      rule,
    });
  }

  const ruleID = req.params.id;
  ruleLock.readLock(ruleID, async (release) => {
    try {
      const rule = await Rule.getRuleByID(ruleID);
      if (
        rule.modified !== null
        && rule.modified.getTime() !== new Date(req.body.modified).getTime()
      ) {
        res.status(409).json({
          success: false,
          message: 'This rule was updated by someone else after you loaded it. Please review the new state of the rule and re-apply your changes where necessary.',
          rule,
        });
      } else {
        rule.tasks.forEach(task => {
          deleteConditionGroupByID(task.conditionGroup._id);
        });
        let oldRuleData = rule.toObject();
        let newRule = _ruleWithRequestBody(req.body);
        newRule.modified = new Date();
        rule.set(newRule);
        await rule.save();
        if (rule.metadata.description === oldRuleData.metadata.description) {
          _respond(rule.toObject());
        } else {
          let history = new History({
            historyCreationDate: new Date(),
            historyType: 'edited',
            targetID: -1,
            actionDescription: `<strong>EDIT: </strong>${rule.metadata.description}`,
            ruleID: rule._id,
            userID: rule.user,
            ruleDescription: oldRuleData.metadata.description,
          });
          History.createHistory(history, (err, history) => {
            if (err) {
              console.log('An error occurred: ', err);
              res.status(500).send(err.toString());
            } else {
              _respond(rule);
            }
          });
        }
      }
    } catch (err) {
      console.log('An error occurred: ', err);
      res.status(500).send(err.toString());
    } finally {
      release();
    }
  });
});

//DELETE HTTP method
router.delete('/:id', acl.middleware(0), ownerMiddleware, (req, res, next) => {
  Rule.deleteRuleById(req.params.id, (err, rule) => {
    if (err) {
      res.json({
        success: false,
        message: `Failed to delete the list. Error: ${err}`
      });
    } else if (rule) {
      res.json({
        success: true,
        message: 'Deleted successfully'
      });
    } else {
      res.json({ success: false });
    }
  })
});

function _ruleDescription(rule) {
  return `${rule.metadata.accountName} (${rule.orgID}) → ${rule.metadata.campaignName} → ${rule.metadata.adGroupName} | ${rule.metadata.actionDescription} (every ${rule.runInterval / 1000 / 60 / 60} hr review ${rule.dataCheckRange / 1000 / 60 / 60} hr)`;
}

function _ruleWithRequestBody(body) {
  let rule = new Rule(body);

  rule.tasks = _tasksWithRequestBody(body);
  rule.metadata.description = _ruleDescription(rule);

  return rule;
}

function _tasksWithRequestBody(body) {
  if (body.tasks === undefined || !body.tasks.length) { return null }

  let tasks = body.tasks.map(taskBody => {
    let task = new Task({
      conditionGroup: _conditionGroupWithRequestBody(taskBody.conditionGroup),
      actions: taskBody.actions,
    });

    return task;
  });

  return tasks;
}

function _conditionGroupWithRequestBody(body) {
  if (body.operator === undefined) { return null }

  let subgroups = body.subgroups.map(groupBody => {
    _conditionGroupWithRequestBody(groupBody);
  });

  return new ConditionGroup({
    conditions: body.conditions,
    subgroups: subgroups,
    operator: body.operator,
  });
}

function checkRuleBodyMiddleware(req, res, next) {
  if (typeof req.body !== 'object') {
    return res.status(400).json({
      message: 'Invalid rule body',
    });
  }  
  if (Object.keys(req.body).includes('user') && req.body.user !== req.user._id.toString()) {
    return res.status(400).json({
      message: 'Invalid rule user',
    });
  }
  if (Object.keys(req.body).includes('account')) {
    let accountComponents = componentsFromPath(req.body.account.toString());
    if (accountComponents[0] !== 'user' || accountComponents[1] !== req.user._id.toString()) {
      return res.status(400).json({
        message: 'Invalid rule account',
      });  
    }
  }
  return next()
}

module.exports = router;

const shared = require('../modules/datadragon-shared');
shared._ruleWithRequestBody = _ruleWithRequestBody;