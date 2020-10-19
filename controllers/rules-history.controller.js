//Require the express package and use express.Router()
const express = require('express');
const router = express.Router();
const History = require('../models/rule-history.model');
const acl = new (require('../modules/acl'))();
const ownerMiddleware = require('../modules/owner').middleware('rules');

acl.allow([
  {
    roles: [acl.roles.user],
    allows: [
      { resources: ['/'], permissions: ['get'] },
    ],
  },
]);

router.get('/:id', acl.middleware(0), ownerMiddleware, async (req, res) => {
  try {
    const history = await History.getHistory({ ruleID: req.params.id });
    res.json({
      success: true,
      message: 'Rule history loaded successfully',
      history,
    });
  } catch (err) {
    res.json({
      success: false,
      message: `Failed to load history. Error: ${err}`,
      history: []
    });
  }
});

module.exports = router;