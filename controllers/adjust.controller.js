const Adjust = require('../models/adjust.model').Adjust;
const socket = require('../modules/socket');
const validating = require('../modules/validating');
const AdjustCredential = require('../models/adjust-credential.model').AdjustCredential;

let RevenueReportParameters = validating.Validating.model({
  type: 'object',
  properties: {
    credentialID: {
      type: 'string',
      minLength: 1,
    },
    period: {
      type: 'string',
      minLength: 1,
    },
    startDate: {
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
        { resources: ['/adjust/revenue/report'], permissions: ['socket'] },
      ],
    },
  ]);

  socket.use('/adjust/revenue/report', (path, parameters, context) => {
    let requestParameters = context.requestParameters(parameters);
    if (requestParameters === null) { return }
    let reportParameters = new RevenueReportParameters(requestParameters);
    let errors = reportParameters.validationErrors();
    if (errors) { return handleError(res, 400, 'Invalid adjust revenue report parameters.\n\n' + errors.join('\n')); }
    let taskKey = path + ':' + parameters.requestId;
    let taskID = context.startTask(taskKey, path);
    AdjustCredential.getCredentialById(reportParameters.credentialID)
      .then(credential => {
        if (!credential || credential.user.toString() !== context.getUserID()) { throw 'User does not own this credential' }

        let startDate = new Date(reportParameters.startDate);
        credential.lastRevenueReportDate = startDate;
        credential.save();

        let scriptParameters = {
          usertoken: credential.userToken,
          apptoken: credential.appToken,
          period: reportParameters.period,
          start: `${startDate.getFullYear()}-${('00' + (startDate.getMonth() + 1)).slice(-2)}-${('00' + startDate.getDate()).slice(-2)}`,
        };
        return Adjust.getRevenueReport(scriptParameters)
      })
      .then(report => {
        if (!context.shouldCompleteTask(taskKey, taskID)) { return }
        context.answer(path, parameters.requestId, report);
      })
      .catch(error => {
        if (!context.shouldCompleteTask(taskKey, taskID)) { return }
        context.error('Failed to retrieve adjust revenue report. ' + error);
        context.answer(path, parameters.requestId, null);
      });
  });
};