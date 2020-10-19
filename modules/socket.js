const io = require('socket.io');
const session = require('../config/session');
const acl = new (require('./acl'))();
const uuid = require('uuid');
const newrelic = require('./newrelic');
const validating = require('./validating');

let aclMiddleware = acl.socketMiddleware();

var routes = {};

let SocketRequest = validating.Validating.model({
  type: 'object',
  properties: {
    requestId: {
      type: 'string',
      minLength: 1,
      maxLength: 1024,
      required: true,
    },
    parameters: {
      type: 'object',
      required: true,
    }
  },
  additionalProperties: false,
});

function SocketContext(client) {
  this.client = client;
  this.tasks = {};
}

SocketContext.prototype.send = function(event, data) {
  this.client.emit(event, data);
};

SocketContext.prototype.answer = function(event, id, data) {
  this.send(event + ':' + id, data);
};

SocketContext.prototype.error = function(error) {
  this.send('apiError', { message: error.toString() });
};

SocketContext.prototype.isAuthenticated = function() {
  return !!(this.client && this.client.request && this.client.request.session && this.client.request.session.passport && this.client.request.session.passport.user);
};

SocketContext.prototype.getUserID = function () {
  if (!this.isAuthenticated()) { return null }
  return this.client.request.session.passport.user;
};

SocketContext.prototype.startTask = function (key, transactionName) {
  this.tasks[key] = uuid.v4();
  if (transactionName === undefined) {
    transactionName = key;
  }
  newrelic.startWebTransaction('socket/' + transactionName, this.tasks[key]);
  return this.tasks[key];
};

SocketContext.prototype.shouldContinueTask = function(key, id) {
  if (id === undefined) { return !!this.tasks[key] }
  return this.tasks[key] === id
};

SocketContext.prototype.shouldCompleteTask = function(key, id) {
  if (!this.shouldContinueTask(key, id)) { return false; }
  newrelic.endWebTransaction(this.tasks[key]);
  delete this.tasks[key];
  return true;
};

SocketContext.prototype.requestParameters = function(request) {
  let socketRequest = new SocketRequest(request);
  let errors = socketRequest.validationErrors()
  if (errors) {
    this.error('Invalid socket request\n\n' + errors.join('\n'));
    return null;
  }
  return socketRequest.parameters;
};

module.exports.init = (server) => {
  let options = {
    origin: '*.*',
  };
  let socket = io(server, options)
    .use(function(socket, next){
      // Wrap the express middleware
      session.middleware(socket.request, {}, next);
    });
  this.socket = socket;

  socket.on('connection', function(client){
    let context = new SocketContext(client);
    for (route in routes) {
      let path = route;
      let handler = routes[route];
      client.on(path, (data) => {
        aclMiddleware(path, context, () => {
          handler(path, data, context);
        });
      });
    }
  });
};

module.exports.use = function(route, handler) {
  routes[route] = handler;
};

module.exports.acl = acl;