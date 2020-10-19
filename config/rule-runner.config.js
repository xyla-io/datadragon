const cron = require('cron');
const path = require('path');
const ruleRunner = require(path.dirname(require.main.filename) + '/controllers/rule-runner.controller.js');
const configure = require('../environment/configure');

module.exports.init = () => {
  if (configure.disable_rule_cron) {
    console.log('Rule cron job disabled in configuration.');
    return;
  }
  new cron.CronJob({
    cronTime: '*/10 * * * * *',
    onTick: () => {
      ruleRunner.runRules(() => {});
    },
    start: true,
    timeZone: 'America/Detroit',
    runOnInit: true
  });
};
