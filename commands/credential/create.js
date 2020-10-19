const {Command, flags} = require('@oclif/command');
const {
  connect,
  disconnect,
  createCredential,
  format,
} = require('../../datadragon');
const chalk = require('chalk');
const mongoose = require('mongoose');

class CreateCredentialCommand extends Command {
  async run() {
    const {
      args,
      flags,
    } = this.parse(CreateCredentialCommand);
    await connect();
    const newCredential = JSON.parse(args.credential);
    if (flags.timestamp) {
      newCredential.name = newCredential.name + `_${new Date().getTime()}`;
    }
    if (flags.user) {
      newCredential.user = mongoose.Types.ObjectId(flags.user);
    }
    const credential = await createCredential(newCredential, flags.certificate);
    let output = credential;
    this.log(format(flags, output));
    if (!flags.quiet) {
      this.log(chalk.blue(`\nCreated credential ${credential.path.toString()}`));
    }
    await disconnect();
  }
}

CreateCredentialCommand.description = 'create a new credential';

CreateCredentialCommand.flags = Object.assign(format.flags({
  separate: null,
  escape: {default: true},
}), {
  certificate: flags.string({
    char: 'c',
    description: 'certificate path',
  }),
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
});

CreateCredentialCommand.args = [
  {
    name: 'credential',
    required: true,
  },
];

module.exports = CreateCredentialCommand;
