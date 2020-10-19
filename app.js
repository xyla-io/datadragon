// We will declare all our dependencies here
require('newrelic');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('./config/session');
const cors = require('cors');
const morgan = require('./config/morgan');
const mongoose = require('mongoose');
const databaseConfig = require('./config/database');
const rules = require('./controllers/rules.controller');
const ruleHistory = require('./controllers/rules-history.controller');
const rulesRunner = require('./config/rule-runner.config.js');
const passport = require('./config/passport.js');
const campaigns = require('./controllers/campaigns.controller');
const adgroups = require('./controllers/adgroups.controller');
const users = require('./controllers/users.controller');
const sso = require('./controllers/sso.controller');
const certificates = require('./controllers/certificates.controller');
const cheshireTerms = require('./controllers/cheshire-terms.controller');
const cheshireITunesConnect = require('./controllers/cheshire-itunesconnect-analytics.controller');
const mobileaction = require('./controllers/mobileaction.controller');
const searchadsReport = require('./controllers/searchads-report.controller');
const http = require('http');
const https = require('https');
const fs = require('fs');
const socket = require('./modules/socket');
const appConfig = require('./config/app.config');
const adjustCredentials = require('./controllers/adjust-credentials.controller');
const adjust = require('./controllers/adjust.controller');
const googleadsCredentials = require('./controllers/googleads-credentials.controller');
const googleadsReport = require('./controllers/googleads-report.controller');
const credentials = require('./controllers/credentials.controller');
const notifications = require('./controllers/notifications.controller');
const ioMap = require('./controllers/io-map.controller');

// Get arguments
let config = {
  port: process.argv[2],
  host: process.argv[3],
  ssl: process.argv[4] === 'true',
  site: process.argv[5],
};

appConfig.init(config);

// Connect mongoose to our database
mongoose.connect(databaseConfig.databaseURL).then(
  () => {
    // Set up rules running
    rulesRunner.init();

    // Initialize our app variable
    const app = express();

    // Middleware for CORS
    app.use(cors(appConfig.cors));

    // Middlewares for bodyparsing using both json and urlencoding
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());

    /*express.static is a built in middleware function to serve static files.
     We are telling express server public folder is the place to look for the static files

    */
    app.use(express.static(path.join(__dirname, 'public')));

    // Set up sessions
    session.init(app);

    // Set up passport
    passport.init(app);

    // Set up morgan request logging
    morgan.init(app);

    app.get('/', (req, res) => {
      res.send('Invalid page');
    });

    // Routing all HTTP requests to respective controllers
    app.use('/api/rules', rules);
    app.use('/api/rules/history', ruleHistory);
    app.use('/api/campaigns', campaigns);
    app.use('/api/adgroups', adgroups);
    app.use('/api/users', users);
    app.use('/api/certificates', certificates);
    app.use('/api/adjust/credentials', adjustCredentials);
    app.use('/api/googleads/credentials', googleadsCredentials);
    app.use('/api/credentials', credentials);
    app.use('/api/notifications', notifications);
    app.use('/api/sso', sso);
    app.use('/api/iomap', ioMap);

    // Initialize socket routes
    cheshireTerms.init();
    cheshireITunesConnect.init();
    mobileaction.init();
    searchadsReport.init();
    adjust.init();
    googleadsReport.init();

    // Listen on HTTPS
    if (config.ssl) {
      let options = {
        cert: fs.readFileSync('./ssl/server.crt'),
        key: fs.readFileSync('./ssl/server.key'),
      };

      let server = https.createServer(options, app);
      socket.init(server);
      server.listen(config.port, config.host, () => {
        console.log(`Starting the server on host ${config.host} at port ${config.port} with SSL`);
      });
    } else {
      let server = http.createServer(app);
      socket.init(server);
      server.listen(config.port, config.host, () => {
        console.log(`Starting the server on host ${config.host} at port ${config.port}`);
      });
    }

    let io = socket(server);
    io.on()

  },
  err => { console.log(err); }
);