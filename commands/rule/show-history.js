const {Command, flags} = require('@oclif/command');
const chalk = require('chalk');
const {
  connect,
  disconnect,
  getRuleHistory,
  format
} = require('../../datadragon');

class ShowRuleHistoryCommand extends Command {
  async run() {
    const {
      args,
      flags
    } = this.parse(ShowRuleHistoryCommand);
    await connect();
    const history = await getRuleHistory(args.ruleID);
    const historyTypeSort = {
      execute: 0,
      action: 1,
      error: 2,
      failed: 3,
      edited: 4,
    };
    const historyTypeColor = {
      execute: 'gray',
      action: 'green',
      error: 'magenta',
      failed: 'red',
      edited: 'cyan',
    };
    history.sort((a, b) => {
      let timeDelta = a.historyCreationDate - b.historyCreationDate;
      if (timeDelta !== 0) { return timeDelta; }
      let typeDelta = historyTypeSort[b.historyType] - historyTypeSort[a.historyType];
      if (typeDelta !== 0) { return typeDelta; }
      return (a.actionDescription > b.actionDescription) ? 1 : -1;
    });
    if (flags.color && !flags.quiet) {
      this.log(history.map(h => chalk[historyTypeColor[h.historyType]](JSON.stringify(h))).join('\n'));
    } else {
      this.log(format(flags, history));
    }
    if (!flags.quiet) {
      this.log(chalk.blue(`${history.length} entires for rule ID ${chalk.cyan(args.ruleID)}`));      
    }
    await disconnect();
  }
}

ShowRuleHistoryCommand.description = 'Show the history for a rule';

ShowRuleHistoryCommand.flags = Object.assign(format.flags(), {
  color: flags.boolean({
    char: 'c',
    default: true,
    allowNo: true,
  }),
});

ShowRuleHistoryCommand.args = [
  {
    name: 'ruleID',
    required: true,
  },
]


module.exports = ShowRuleHistoryCommand
