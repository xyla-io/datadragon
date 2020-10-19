const nodemailer = require('nodemailer');
const markdown = require('nodemailer-markdown').markdown;
const config = require('../config/email.config.js');
const configure = require('../environment/configure');

function emailDescription(emailAddressList, emailText, subjectTitle, attachments) {
  return `Email disabled to ${emailAddressList.join(', ')} with subject ${subjectTitle}\n${emailText}`
}

module.exports.sendEmail = (emailAddressList, emailText, subjectTitle, attachments, completion) => {
  if (configure.disable_email) {
    console.log(emailDescription(emailAddressList, emailText, subjectTitle, attachments));
    return;
  }
  var mailOptions = {
    to: emailAddressList,
    from: config.from,
    subject: subjectTitle,
    text: emailText,
    attachments: attachments
  };

  transport.sendMail(mailOptions, completion);
};

module.exports.sendMarkdownEmail = (emailAddressList, emailMarkdown, subjectTitle, attachments, completion) => {
  if (configure.disable_email) {
    console.log(emailDescription(emailAddressList, emailMarkdown, subjectTitle, attachments));
    return;
  }
  var mailOptions = {
    to: emailAddressList,
    from: config.from,
    subject: subjectTitle,
    markdown: emailMarkdown,
    attachments: attachments
  };

  transport.sendMail(mailOptions, completion);
};

module.exports.replyToEmail = config.from;

const transport = nodemailer.createTransport(config.transportOptions);
transport.use('compile', markdown())