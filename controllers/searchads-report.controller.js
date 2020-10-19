const python = require('../modules/python');
const model = require('../models/searchads-report.model');
const rootDirectory = require('path').dirname(require.main.filename);
const validating = require('../modules/validating');
const Q = require('q');
const Rule = require('../models/rule.model').Rule;
const dbConfig = require(rootDirectory + '/config/database');
const { Credential } = require('../models/credential.model');
const socket = require('../modules/socket');

let ImpactReportRequestParameters = validating.Validating.model({
  type: 'object',
  properties: {
    reportId: {
      type: 'string',
      minLength: 1,
    },
    ruleId: {
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
        { resources: ['/searchads/report', '/searchads/report/end', '/searchads/impact-report', '/searchads/impact-report/end'], permissions: ['socket'] },
      ],
    },
  ]);

  socket.use('/searchads/report', (path, data, context) => {
    console.log(data);
    var parameterData = data;
    parameterData.startDate = _dateString(new Date(data.startDate));
    parameterData.endDate = _dateString(new Date(data.endDate));

    parameterData.certificates = data.accountIDs.map(accountID => {
      return {
        pem: `${rootDirectory}/files/users/${context.getUserID()}/certificates/${accountID}/cert.pem`,
        key: `${rootDirectory}/files/users/${context.getUserID()}/certificates/${accountID}/cert.key`,
      }
    });

    parameterData.orgName = data.account;

    let parameters = new model.ReportParameters(parameterData);
    let errors = parameters.validationErrors();
    if (errors) {
      context.error('Invalid report parameters\n\n' + errors.join('\n'));
      context.send('/searchads/report/end');
      return;
    }

    let taskID = context.startTask(path);
    python.interact('searchads-report.py', parameters, (result, shell) => {
      if (!context.shouldContinueTask(path, taskID)) { return false }
      if (!result.result) { return }

      console.log('sending event', path);
      context.send(path, result.result);
      return true;
    }, (error, shell) => {
      if (!context.shouldCompleteTask(path, taskID)) { return }
      shell.end();
      context.error('Failed to generate report\n\n' + error);
      context.send('/searchads/report/end');
    }, () => {
      if (!context.shouldCompleteTask(path, taskID)) { return }
      context.send('/searchads/report/end');
    });
  });

  socket.use('/searchads/impact-report', (path, data, context) => {
    let requestParameters = new ImpactReportRequestParameters(data);
    let errors = requestParameters.validationErrors();
    if (errors) {
      context.error('Invalid report parameters\n\n' + errors.join('\n'));
      context.send('/searchads/impact-report/end');
      return;
    }

    let taskID = context.startTask(path);
    let rule;
    Rule.getRuleByID(requestParameters.ruleId)
      .then(r => {
        rule = r;
        if (!context.shouldContinueTask(path, taskID)) { return false }
        if (!rule || rule.user.toString() !== context.getUserID()) { throw 'User does not own this rule' }
        return Credential.credentialDataForPath(rule.account);
      }).then(credential => {
        if (!context.shouldContinueTask(path, taskID)) { return false }

        let parameters = new model.ImpactReportParameters(requestParameters.reportId, rule, dbConfig, credential);

        let report = {
          reportId: parameters.reportId,
        };
        context.send(path, report);

        python.interact('../datadragon_api.py', parameters, (result, shell) => {
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
          context.send(path + '/end');
        }, () => {
          if (!context.shouldCompleteTask(path, taskID)) { return }
          context.send(path + '/end');
        });
      })
      .catch(error => {
        if (!context.shouldContinueTask(path, taskID)) { return false }
        context.error('Failed to generate report\n\n' + error);
        context.send(path + '/end');
      });
  });
};

function _dateString(date) {
  return `${date.getUTCFullYear()}-${('00' + (date.getUTCMonth() + 1)).slice(-2)}-${('00' + date.getUTCDate()).slice(-2)}`;
}