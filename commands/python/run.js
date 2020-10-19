const {Command, flags} = require('@oclif/command');
const {
  connect,
  disconnect,
  pathCollection,
  pathCollectionKey,
  injectResources,
  runPython,
  format,
} = require('../../datadragon');
const chalk = require('chalk');
const { collection } = require('../../models/user.model');

class RunPythonCommand extends Command {
  async run() {
    const {
      args,
      flags,
    } = this.parse(RunPythonCommand);
    if (flags.target.length !== flags.fetch.length) { throw new Error('The number of target options must equal the number of fetch options.') }

    const injectOverrides = {};
    flags.target.forEach((target, index) => {
      injectOverrides[target] = flags.fetch[index];
    });

    let pythonCommands = JSON.parse(args.pythonCommands);
    if (!Array.isArray(pythonCommands)) {
      pythonCommands = [pythonCommands];
    }
    Object.keys(injectOverrides).forEach(target => {
      const collection = pathCollection(pythonCommands, target, true);
      collection[pathCollectionKey(pythonCommands, target)] = injectOverrides[target];
    });

    await connect();
    const context = {
      commands: pythonCommands,
      output: [],
    }
    for (let index = 0; index < pythonCommands.length; index++) {
      const command = pythonCommands[index];
      if (!flags.quiet) {
        this.log(`Running command ${index}: ${command.command}`);
      }
      if (command.command === 'fetch') {
        await injectResources(command.targets, pythonCommands[index + 1], context);
        context.output.push(null);
      } else {
        const output = await runPython(command, context);
        context.output.push(output);
      }
    }

    let output = context.output;
    if (flags.get.length) {
      const selected_output = {};
      flags.get.forEach(path => {
        const collection = pathCollection(output, path);
        if (collection === undefined) {
          selected_output[path] = collection;
        } else {
          selected_output[path] = collection[pathCollectionKey(output, path)];
        }
      });
      output = flags.get.length === 1 ? selected_output[flags.get[0]] : selected_output;
    }

    this.log(format(flags, output));
    if (!flags.quiet) {
      this.log(chalk.blue(`\nRan ${pythonCommands.length} commands`));
    }
    await disconnect();
  }
}

RunPythonCommand.description = 'run Python commands';

RunPythonCommand.flags = Object.assign(format.flags(), {
  target: flags.string({
    char: 't',
    description: 'target paths',
    multiple: true,
    default: [],
  }),
  fetch: flags.string({
    char: 'f',
    description: 'fetch resources',
    multiple: true,
    default: [],
  }),
  get: flags.string({
    char: 'g',
    description: 'get output paths',
    multiple: true,
    default: [],
  }),
});

RunPythonCommand.args = [
  {
    name: 'pythonCommands',
    required: true,
  },
];

module.exports = RunPythonCommand;
