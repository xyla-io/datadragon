const {Command, flags} = require('@oclif/command');
const {
  connect,
  disconnect,
  createUser,
  format,
} = require('../../datadragon');
const chalk = require('chalk');

class CreateUserCommand extends Command {
  async run() {
    const {
      args,
      flags,
    } = this.parse(CreateUserCommand);
    await connect();
    const newUser = JSON.parse(args.user);
    if (flags.unique) {
      newUser.local.email = newUser.local.email.replace(/@/, `_${new Date().getTime()}@`);
    }
    const user = await createUser(newUser, flags.password);
    let output = user.toObject();
    this.log(format(flags, output));
    if (!flags.quiet) {
      this.log(chalk.blue(`\nCreated user ${user._id.toString()}`));
    }
    await disconnect();
  }
}

CreateUserCommand.description = 'Create a user';

CreateUserCommand.flags = Object.assign(format.flags({
  separate: null,
  escape: {default: true},
}), {
  password: flags.string({
    char: 'w',
    description: 'user password',
  }),
  unique: flags.boolean({
    char: 't',
    description: 'timestamp email',
    default: false,
    allowNo: true,
  }),
});

CreateUserCommand.args = [
  {
    name: 'user',
    required: true,
  },
];

module.exports = CreateUserCommand;
