const socket = require('../modules/socket');
const { ITunesConnectAPI } = require('../models/cheshire-itunesconnect.model');

module.exports.init = function() {
  socket.acl.allow([
    {
      roles: [socket.acl.roles.user],
      allows: [
        {resources: [
          '/cheshire/itunesconnect/providers',
          '/cheshire/itunesconnect/provider:set',
          '/cheshire/itunesconnect/report'
        ], permissions: ['socket']},
      ],
    },
  ]);

  socket.use('/cheshire/itunesconnect/providers', (path, data, context) => {
    prepareContext(context);

    let taskID = context.startTask(path);

    context.iTunesConnect.getProviderIds()
      .then(providerIds => {
        if (!context.shouldCompleteTask(path, taskID)) { return }
        context.send(path, providerIds);
      })
      .catch(error => {
        if (!context.shouldCompleteTask(path, taskID)) { return }
        context.error(error);
      });
  });

  socket.use('/cheshire/itunesconnect/provider:set', (path, data, context) => {
    prepareContext(context);

    let taskID = context.startTask(path);

    context.iTunesConnect.changeProvider(data)
      .then(() => {
        if (!context.shouldContinueTask(path, taskID)) { return }
        context.send('/cheshire/itunesconnect/providerId', data);
        return context.iTunesConnect.getApps();
      })
      .then(data => {
        if (!context.shouldCompleteTask(path, taskID)) { return }
        context.send('/cheshire/itunesconnect/apps', data);
      })
      .catch(error => {
        if (!context.shouldCompleteTask(path, taskID)) { return }
        context.error(error);
      });
  });

  socket.use('/cheshire/itunesconnect/report', (path, data, context) => {
    prepareContext(context);

    let taskID = context.startTask(path);
    context.iTunesConnect.runReport()
      .then(data => {
        if (!context.shouldCompleteTask(path, taskID)) { return }
        context.send(path, data);
      })
      .catch(error => {
        if (!context.shouldCompleteTask(path, taskID)) { return }
        context.error(error);
      });
  });
};

function prepareContext(context) {
  if (!context.iTunesConnect) { context.iTunesConnect = new ITunesConnectAPI('EMAIL', 'PASSWORD'); }
}
