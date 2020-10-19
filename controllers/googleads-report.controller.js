const python = require('../modules/python');
const GoogleadsCredential = require('../models/googleads-credential.model').GoogleadsCredential;
const GoogleadsReportParameters = require('../models/googleads-report.model').GoogleadsReportParameters;
const validating = require('../modules/validating');

const socket = require('../modules/socket');

let ReportRequestParameters = validating.Validating.model({
  type: 'object',
  properties: {
    credentialId: {
      type: 'string',
      minLength: 1,
    },
    reportType: {
      type: 'string',
      minLength: 1,
    },
    startDate: {
      type: 'string',
      minLength: 1,
    },
    endDate: {
      type: 'string',
      minLength: 1,
    },
  },
  additionalProperties: false,
});

module.exports.init = function() {
  socket.acl.allow([
    {
      roles: [socket.acl.roles.user],
      allows: [
        { resources: ['/googleads/report', '/googleads/report/end'], permissions: ['socket'] },
      ],
    },
  ]);

  socket.use('/googleads/report', (path, data, context) => {
    let requestParameters = new ReportRequestParameters(data);
    let errors = requestParameters.validationErrors();
    if (errors) {
      context.error('Invalid report parameters\n\n' + errors.join('\n'));
      context.send('/googleads/report/end');
      return;
    }

    let taskID = context.startTask(path);
    GoogleadsCredential.getCredentialById(requestParameters.credentialId)
      .then(credential => {
        if (!credential || credential.user.toString() !== context.getUserID()) { throw 'User does not own this credential' }

        let parameters = new GoogleadsReportParameters(requestParameters, credential);

        python.interact('googleads_report.py', parameters, (result, shell) => {
          if (!context.shouldContinueTask(path, taskID)) { return false }
          if (!result.result) { return }

          let event = (result.result.rows === undefined) ? path : path + '/rows';
          console.log('sending event', event);
          context.send(event, result.result);
          return true;
        }, (error, shell) => {
          if (!context.shouldCompleteTask(path, taskID)) { return }
          shell.end();
          context.error('Failed to generate report\n\n' + error);
          context.send('/googleads/report/end');
        }, () => {
          if (!context.shouldCompleteTask(path, taskID)) { return }
          context.send('/googleads/report/end');
        });
      })
      .catch(error => {
        if (!context.shouldContinueTask(path, taskID)) { return false }
        context.error('Failed to generate report\n\n' + error);
        context.send('/googleads/report/end');
      });
  });

  socket.use('/googleads/report/cancel', (path, data, context) => {
    if (!context.shouldCompleteTask('/googleads/report')) { return }
    context.send('/googleads/report/end');
  });
};
