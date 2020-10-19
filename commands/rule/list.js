const {Command, flags} = require('@oclif/command');
const {
  connect,
  disconnect,
  getRules,
  format,
} = require('../../datadragon');
const chalk = require('chalk');

class ListRuleCommand extends Command {
  async run() {
    const {flags} = this.parse(ListRuleCommand);
    await connect();
    const rules = await getRules();
    let output = rules.sort((a, b) => {
      // if (a.account < b.account) { return -1; }
      // else if (b.account < a.account) { return 1; }
      // if (a.channel < b.channel) { return -1; }
      // else if (b.channel < a.channel) { return 1; }
      return a.created - b.created;
    });
    this.log(format(flags, output));
    if (!flags.quiet) {
      this.log(chalk.blue(`\n${output.length} rules`));
    }
    await disconnect();
  }
}

ListRuleCommand.description = 'List rules';

ListRuleCommand.flags = format.flags({
  escape: {default: true},
  separate: {default: true},
});

module.exports = ListRuleCommand
