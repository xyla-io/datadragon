const {Command, flags} = require('@oclif/command');
const {
  connect,
  disconnect,
  getCredentials,
  format,
} = require('../../datadragon');
const chalk = require('chalk');

class ListCredentialCommand extends Command {
  async run() {
    const {flags} = this.parse(ListCredentialCommand);
    await connect();
    const credentials = await getCredentials();
    let output = credentials.sort((a, b) => a.name < b.name ? -1 : b.name < a.name ? 1 : 0);
    this.log(format(flags, output));
    if (!flags.quiet) {
      this.log(chalk.blue(`\n${output.length} credentials`));
    }
    await disconnect();
  }
}

ListCredentialCommand.description = 'List all credentials';

ListCredentialCommand.flags = format.flags({
  escape: {default: true},
  separate: {default: true},
});

module.exports = ListCredentialCommand
