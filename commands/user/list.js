const {Command} = require('@oclif/command');
const {
  connect,
  disconnect,
  getUsers,
  format,
} = require('../../datadragon');
const chalk = require('chalk');

class ListUserCommand extends Command {
  async run() {
    const {flags} = this.parse(ListUserCommand);
    await connect();
    const users = await getUsers();
    let output = users.sort((a, b) => a.local.email < b.local.email ? -1 : b.local.email < a.local.email ? 1 : 0);
    output = output.map(u => u.toObject());
    this.log(format(flags, output));
    if (!flags.quiet) {
      this.log(chalk.blue(`\n${output.length} users`));
    }
    await disconnect();
  }
}

ListUserCommand.description = 'List all users';

ListUserCommand.flags = format.flags({
  escape: {default: true},
  separate: {default: true},
});

module.exports = ListUserCommand
