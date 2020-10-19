const python = require('../modules/python');
const ReportParameters = require('../models/cheshire-terms.model').ReportParameters;
const App = require('../models/cheshire-terms.model').App;

const socket = require('../modules/socket');

module.exports.init = function() {
  socket.acl.allow([
    {
      roles: [socket.acl.roles.user],
      allows: [
        { resources: ['/cheshire/terms/report', '/cheshire/terms/report/cancel', 'cheshireTermsApps'], permissions: ['socket'] },
      ],
    },
  ]);

  socket.use('/cheshire/terms/report', (path, data, context) => {
    let parameters = new ReportParameters(data);
    let errors = parameters.validationErrors();
    if (errors) {
      context.error('Invalid report parameters\n\n' + errors.join('\n'));
      context.send('/cheshire/terms/report/end');
      return;
    }

    let taskID = context.startTask(path);
    python.interact('cheshire-terms.py', parameters, (result, shell) => {
      if (!context.shouldContinueTask(path, taskID)) { return false }
      if (!result.result) { return }
      context.send('/cheshire/terms/report', result.result);
      return true;
    }, (error, shell) => {
      if (!context.shouldContinueTask(path, taskID)) { return }
      shell.end();
      context.error('Failed to generate report\n\n' + error);
      context.send('/cheshire/terms/report/end');
    }, () => {
      if (!context.shouldCompleteTask(path, taskID)) { return }
      context.send('/cheshire/terms/report/end');
    });
  });

  socket.use('/cheshire/terms/report/cancel', (path, data, context) => {
    if (!context.shouldCompleteTask('/cheshire/terms/report')) { return }
    context.send('/cheshire/terms/report/end');
  });

  socket.use('cheshireTermsApps', (path, data, context) => {
    let taskID = context.startTask(path);
    App.getApps()
      .then(apps => {
        if (!context.shouldCompleteTask(path, taskID)) { return }
        context.send('cheshireTermsApps', apps);
      })
      .catch(error => {
        if (!context.shouldCompleteTask(path, taskID)) { return }
        context.error('Failed to retrieve apps' + error);
        });
  });
};