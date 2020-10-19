const {Command, flags} = require('@oclif/command');
const chalk = require('chalk');
const {
  connect,
  disconnect,
  findRule,
  getRuleRunArgs,
  format
} = require('../../datadragon');

class DebugRuleCommand extends Command {
  async run() {
    const {
      flags,
      args,
    } = this.parse(DebugRuleCommand);
    await connect();
    const rule = await findRule(args.ruleID);
    const overrides = {scriptArguments: {}};
    if (flags.granularity) {
      overrides.scriptArguments.granularity = flags.granularity;
    }
    if (flags.from) {
      overrides.scriptArguments.startDate = flags.from;
    }
    if (flags.to) {
      overrides.scriptArguments.endDate = flags.to;
    }
    if (flags['dry-run-only'] === true) {
      overrides.scriptArguments.dryRunOnly = true;
    }
    if (flags['allow-non-dry-run'] === true) {
      overrides.scriptArguments.nonDryRunRuleIDs = [args.ruleID];
    }
    const runArgs = await getRuleRunArgs(rule, overrides);
    this.log(format(flags, runArgs));
    if (!flags.quiet) {
      this.log(chalk.yellow(`\n${flags.escape ? 'Escaped' : 'Unescaped'} run arguments for rule ${chalk.blue(rule.metadata.description)} ${chalk.cyan(rule._id)}`));
    }
    await disconnect();
    // This command does not seem to exit without a call to exit().
    setTimeout(() => process.exit(0), 100);
  }
}

DebugRuleCommand.description = 'Debug a rule';

DebugRuleCommand.flags = Object.assign(format.flags({
  separate: null,
  'json-string': {default: true},
}), {
  granularity: flags.string({
    char: 'g',
    description: 'time granularity',
    options: ['HOURLY', 'DAILY'],
  }),
  from: flags.string({
    char: 'f',
    description: 'start date',
  }),
  to: flags.string({
    char: 't',
    description: 'end date',
  }),
  'allow-non-dry-run': flags.boolean({
    description: 'override dry run only configuration to allow a live run',
    allowNo: true,
  }),
  'dry-run-only': flags.boolean({
    description: 'force a dry run unless --allow-non-dry-run is also set',
    allowNo: true,
  }),
});

DebugRuleCommand.args = [
  {
    name: 'ruleID',
    required: true,
  },
]

module.exports = DebugRuleCommand
