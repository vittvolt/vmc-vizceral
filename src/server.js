// var http = require('http');
const express = require('express');
const app = express();
const path = require('path');
const server = require('http').createServer(app);
const socket = require('socket.io');
const io = socket.listen(server);

var VoltClient = require('./voltjs/client');
var VoltConfiguration = require('./voltjs/configuration');
var VoltConstants = require('./voltjs/voltconstants');
var util = require('util');
var VoltProcedure = require('./voltjs/query');
var AsyncPolling = require('async-polling');

var configs = [];
var client = new VoltClient(configs);

var num = 1000;

// Store the traffic from a stats table in db
var trafficData_hosts = [0, 0, 0];
var trafficData_hosts_diff = [0, 0, 0];

var trafficData_sites = [[0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0]];
var trafficData_sites_diff = [[0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0]];

function voltinit() {
  // VoltDB js test
  // volt = require('../voter/voter/models/volt');
  // volt.initClient(false);

  // var configs = [];

  configs.push(getConfiguration('localhost'));
  // The client is only configured at this point. The connection
  // is not made until the call to client.connect().
  // client = new VoltClient(configs);

  // You can register for a long list of event types, including the results
  // of queries. Some developers will prefer a common message loop
  // while others will prefer to consume each event in a separate handler.
  // Queries can also be processed in a common handler at the client level,
  // but would be better handled by using a query callback instead.
  client.on(VoltConstants.SESSION_EVENT.CONNECTION,eventListener);
  client.on(VoltConstants.SESSION_EVENT.CONNECTION_ERROR,eventListener);
  client.on(VoltConstants.SESSION_EVENT.QUERY_RESPONSE_ERROR,eventListener);
  client.on(VoltConstants.SESSION_EVENT.QUERY_DISPATCH_ERROR,eventListener);
  client.on(VoltConstants.SESSION_EVENT.FATAL_ERROR,eventListener);

  // The actual connection.
  // Note, there are two handlers. The first handler will generally indicate
  // a success, though it is possible for one of the connections to the
  // volt cluster to fail.
  // The second handler is more for catastrophic failures.
  client.connect(function startup(code, event,results) {
    util.log('Node connected to VoltDB');
  }, function loginError(code, event, results) {
    util.log('Node did not connect to VoltDB');
  });

}

function getConfiguration(host) {
  var cfg = new VoltConfiguration();
  cfg.host = host;
  cfg.messageQueueSize = 20;
  return cfg;
}

function eventListener(code, event, message) {
  util.log(util.format( 'Event %s\tcode: %d\tMessage: %s', event, code,
    message));
}

function callProc() {
  // var selectProc = new VoltProcedure('sel', []);
  var statsProc = new VoltProcedure('@Statistics', ['string', 'int']);
  // var query = selectProc.getQuery();
  var statsQuery = statsProc.getQuery();
  statsQuery.setParameters(["PROCEDURE", 0]); // host number given as 2nd parameter

  // client.callProcedure(query, function initVoter(code, event, results) {
  //   var val = results.table[0];
  //   util.log('Initialized app for ' + JSON.stringify(val).toString() + ' candidates.');
  //   // trafficData.normal = val[0].ID;
  //   // trafficData.danger = val[0].A;
  //   io.emit('time', { time: new Date().toJSON() });
  // });

  client.callProcedure(statsQuery, function initVoter(code, event, results) {
    var val = results.table[0];

    // Traverse through the stats for each site on the specified host
    // Format: [{HOST_ID: ... , SITE_ID : ... , INVOCATIONS : ... ...}, ...]
    for (let k = 0; k < val.length; k++) {
      console.log('host_id: ' + val[k].HOST_ID + ' site_id: ' + val[k].SITE_ID + ' invocations: ' + val[k].INVOCATIONS +
                  ' procedure: ' + val[k].PROCEDURE);
      let hostId = val[k].HOST_ID;
      let siteId = val[k].SITE_ID;
      let d = val[k].INVOCATIONS;
      trafficData_hosts_diff[hostId] += d;
      trafficData_sites_diff[hostId][siteId] += d;
    }

    let temp_hosts = [0, 0, 0];
    let temp_sites = [[0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0]];

    // Reset the diff results, update the accumulated results
    for (let i = 0; i < trafficData_hosts_diff.length; i++) {
      temp_hosts[i] = trafficData_hosts_diff[i] - trafficData_hosts[i];
      trafficData_hosts[i] = trafficData_hosts_diff[i];
      trafficData_hosts_diff[i] = 0;
    }
    for (let i = 0; i < trafficData_sites_diff.length; i++) {
      for (let j = 0; j < trafficData_sites_diff[0].length; j++) {
        temp_sites[i][j] = trafficData_sites_diff[i][j] - trafficData_sites[i][j];
        trafficData_sites[i][j] = trafficData_sites_diff[i][j];
        trafficData_sites_diff[i][j] = 0;
      }
    }

    io.emit('traffic', { hostsData: temp_hosts, sitesData: temp_sites });


  });
}

voltinit();

console.log(path.resolve('dist', './browser.js'));

// app.use((req, res, next) => {
//   console.log('Middleware 1...');
//   next();
// });

// The index page
app.get('/', (req, res) => {
  res.sendFile(path.resolve('dist', './index.html'));
});

// The main js script
app.get('/browser.js', (req, res) => {
  res.sendFile(path.resolve('dist', './browser.js'));
});

// In fonts folder
app.get('/fonts/*.css', (req, res) => {
  res.sendFile(path.resolve('dist', 'fonts', 'source-sans-pro.css')); // if you think hardcoding is bad, change it yourself
});

// All the other files should go to the current folder
app.get('/*', (req, res) => {
  res.sendFile(path.resolve('dist', '.' + req.originalUrl));
});


io.on('connection', function(socket) {
  socket.on('i am client', (d) => {console.log('received i am client from client !')});
});


server.listen(3000);
// app.listen(3000, function () {
//   console.log('Hell yea...');
// });

// Put a friendly message on the terminal
console.log("Server running at http://127.0.0.1:3000/");


AsyncPolling(function (end) {
  callProc();
  end();
}, 1000).run();