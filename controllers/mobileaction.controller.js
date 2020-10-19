const MobileAction = require('../models/mobileaction.model').MobileAction;
const socket = require('../modules/socket');

module.exports.init = function() {
  socket.acl.allow([
    {
      roles: [socket.acl.roles.user],
      allows: [
        { resources: ['/mobileaction/app/details'], permissions: ['socket'] },
      ],
    },
  ]);

  socket.use('/mobileaction/app/details', (path, parameters, context) => {
    let requestParameters = context.requestParameters(parameters);
    if (requestParameters === null) { return }
    let taskKey = path + ':' + parameters.requestId;
    let taskID = context.startTask(taskKey, path);
    MobileAction.getAppDetails(requestParameters.adamId)
      .then(details => {
        if (!context.shouldCompleteTask(taskKey, taskID)) { return }
        context.answer(path, parameters.requestId, details);
      })
      .catch(error => {
        if (!context.shouldCompleteTask(taskKey, taskID)) { return }
        context.error('Failed to retrieve app details' + error);
        context.answer(path, parameters.requestId, null);
      });
  });
};