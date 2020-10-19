const {Command, flags} = require('@oclif/command');
const chalk = require('chalk');
const {
  connect,
  disconnect,
  clearRuleHistory,
} = require('../../datadragon');

class ClearRuleHistoryCommand extends Command {
  async run() {
    const {
      args,
    } = this.parse(ClearRuleHistoryCommand);
    await connect();
    await clearRuleHistory(args.ruleID);
    this.log(chalk.yellow(`Cleared history for rule ID ${chalk.cyan(args.ruleID)}`))
    await disconnect();
  }
}

ClearRuleHistoryCommand.description = 'Clear the history for a rule';

ClearRuleHistoryCommand.args = [
  {
    name: 'ruleID',
    required: true,
  },
]


module.exports = ClearRuleHistoryCommand
