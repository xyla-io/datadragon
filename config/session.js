const session = require('express-session');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo')(session);

module.exports.init = (app) => {
  const store = new MongoStore({ mongooseConnection: mongoose.connection });

  let middleware = session({
    store: store,
    secret: "INSERT_YOUR_SESSION_SECRET_HERE",
    resave: false,
    saveUninitialized: false,
  });

  this.middleware = middleware;

  app.use(middleware);
};