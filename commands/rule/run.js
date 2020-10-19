const {Command, flags} = require('@oclif/command');
const {
  connect,
  disconnect,
  getRuleToRun,
  runRule,
  format,
} = require('../../datadragon');
const chalk = require('chalk');

class RunRuleCommand extends Command {
  async run() {
    const {
      args,
      flags,
    } = this.parse(RunRuleCommand);
    await connect();
    const rule = await getRuleToRun(args.ruleID);
    if (!flags.quiet) {
      this.log(`Running rule ${args.ruleID}:\n${format(flags, rule)}`);
    }
    if (!rule) {
      throw new Error(`Rule not found for ID ${args.ruleID}`);
    }
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
    const run = await runRule(rule, overrides);
    if (!flags.quiet) {
      delete run.rules;
      this.log('Rule run overrides:');
      this.log(format(flags, run));
      this.log(chalk.blue(`\nRan rule ${rule._id} ${rule.metadata.description}`));
    }
    await disconnect();
    // This command does not seem to exit without a call to exit().
    setTimeout(() => process.exit(0), 100);
  }
}

RunRuleCommand.description = 'run a rule';

RunRuleCommand.flags = Object.assign(format.flags(), {
  granularity: flags.string({
    char: 'g',
    description: 'time granularity',
    options: ['HOURLY', 'DAILY'],
  }),
  from: flags.string({
    char: 'f',
    description: 'from date',
  }),
  to: flags.string({
    char: 't',
    description: 'to date',
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

RunRuleCommand.args = [
  {
    name: 'ruleID',
    required: true,
  },
];

module.exports = RunRuleCommand;
