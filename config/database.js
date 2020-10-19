// 27017 is the default port number.  
module.exports = {
  databaseURL: 'mongodb://localhost:27017/datadragon',
  database: 'datadragon',
  rulesCollection: 'rules',
  rulesHistoryCollection: 'rulesHistory',
  rulesMonitorCollection: 'rulesMonitor',
  ruleConditionGroupsCollection: 'ruleConditionGroups',
}