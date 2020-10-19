let fs = require('fs');

fs.readFile('rules.json', 'utf8', (error, data) => {
  let oldRules = JSON.parse(data);
  let newRules = oldRules.map((oldRule) => {
    let newRule = {
      campaignID: oldRule.campaignID,
      adgroupID: oldRule.adgroupID,
      isEnabled: false,
      account: oldRule.account,
      runInterval: oldRule.runInterval,
      dataCheckRange: oldRule.dataCheckRange,
      granularity: oldRule.granularity,
      shouldPerformAction: false,
      shouldSendEmail: false,
      created: new Date(),
      tasks: [{
        actions: [{
          action: oldRule.action,
          adjustmentValue: oldRule.actionAdjustmentValue,
          adjustmentLimit: oldRule.actionAdjustmentLimit,
        }],
        conditionGroup: {
          subgroups: [],
          operator: 'all',
          conditions: [{
            metric: oldRule.kpiMetric,
            metricValue: oldRule.kpiMetricValue,
            operator: oldRule.conditionalOperator,
          }]
        },
      }],
      metadata: {
        accountName: oldRule.account,
        campaignName: oldRule.metadata.campaignName,
        adGroupName: oldRule.metadata.adGroupName,
        actionDescription: description(oldRule),
        description: '',
      },
    };

    return newRule;
  });

  fs.writeFile('newRules.json', JSON.stringify(newRules), 'utf8', (error) => {
    console.log('Error writing file (maybe): ', error);
  });
});

function description(rule) {
  var components = [
    metric(rule.kpiMetric),
    `${conditionalOperator(rule.conditionalOperator)}`,
    `$${rule.kpiMetricValue}`,
    '→',
    `${action(rule.action)}`,
  ];

  if (rule.action != 'no_action' && rule.action != 'pause_keyword') {
    components = components.concat([
      `${rule.actionAdjustmentValue}%`,
      '⇥',
      `$${rule.actionAdjustmentLimit}`,
    ]);
  }
  return components.join(' ');
}

function conditionalOperator(operator) {
  switch (operator) {
    case 'greater': return '>';
    case 'less': return '<';
    default: return operator;
  }
}

function action(action) {
  switch (action) {
    case 'inc_bid': return '☝︎ Bid';
    case 'dec_bid': return '☟ Bid';
    case 'pause_keyword': return '⏸ keyword';
    case 'no_action': return '∅';
    case 'inc_cpa_goal': return '☝︎ CPA Goal';
    case 'dec_cpa_goal': return '☟ CPA Goal';
    case null: return '∅';
  }
}

function metric(kpiMetric) {
  switch (kpiMetric) {
    case 'reavgCPA': return 'CPA';
    case 'reavgCPT': return 'CPT';
    case 'totalSpend': return 'Spend';
  }
}