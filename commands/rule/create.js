const {Command, flags} = require('@oclif/command');
const {
  connect,
  disconnect,
  createRule,
  format,
} = require('../../datadragon');
const chalk = require('chalk');
const mongoose = require('mongoose');

class CreateRuleCommand extends Command {
  async run() {
    const {
      args,
      flags,
    } = this.parse(CreateRuleCommand);
    await connect();
    const newRule = JSON.parse(args.rule);
    if (flags.timestamp) {
      newRule.metadata.title = newRule.metadata.title ?  `${newRule.metadata.title}_${new Date().getTime()}` : (new Date().getTime()).toString();
    }
    if (flags.user) {
      newRule.user = mongoose.Types.ObjectId(flags.user);
    }
    if (flags.credential) {
      newRule.account = flags.credential;
    }
    const rule = await createRule(newRule);
    let output = rule;
    this.log(format(flags, output));
    if (!flags.quiet) {
      this.log(chalk.blue(`\nCreated rule ${rule._id}`));
    }
    await disconnect();
  }
}

CreateRuleCommand.description = 'create a new rule';

CreateRuleCommand.flags = Object.assign(format.flags({
  separate: null,
  escape: {default: true},
}), {
  timestamp: flags.boolean({
    char: 't',
    description: 'timestamp name',
    default: false,
    allowNo: true,
  }),
  user: flags.string({
    char: 'u',
    description: 'user ID'
  }),
  credential: flags.string({
    char: 'c',
    description: 'credentail path'
  }),
});

CreateRuleCommand.args = [
  {
    name: 'rule',
    required: true,
  },
];

module.exports = CreateRuleCommand;
