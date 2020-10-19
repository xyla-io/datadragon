module.exports = {
  from: 'FROM_EMAIL',
  transportOptions: {
    host: 'smtp.office365.com',
    port: 587,
    requireTLS: true,
    auth: {
      user: 'USER_EMAIL',
      pass: 'PASSWORD',
    }
  }
};
