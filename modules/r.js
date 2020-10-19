const R = require('r-script');
const Q = require('q');

module.exports.run = function(scriptName, scriptArguments, shouldLog = true) {
  let deferred = Q.defer();

  let shell = this.shell(scriptName, scriptArguments);

  var result;
  let errors = [];
  let logs = [];

  shell.call((scriptError, message) => {
    if (scriptError) {
      if (shouldLog) {
        console.log(scriptName + ' R script error:', scriptError);
      }
      errors.push(scriptError);
    }

    if (message) {
      if (message.errors) {
        if (shouldLog) {
          console.log(scriptName + ' R script errors:', message.errors);
        }
        errors = errors.concat(message.errors);
      }
      if (message.log) {
        if (shouldLog) {
          console.log(scriptName + ' R script log: ' + message.log);
        }
        logs.push(message.log);
      }
      if (message.result) {
        result = message.result;
      }
    }
    if (result) {
      deferred.resolve({
        result: result,
        errors: errors,
        logs: logs,
      })
    } else {
      let error = scriptName + ' R script completed without returning a result.';
      if (shouldLog) {
        console.log(error);
      }
      errors.unshift(error);

      deferred.reject({ errors: errors, logs: logs });
    }
  });

  return deferred.promise;
};

module.exports.shell = function(scriptName, scriptArguments) {
  let scriptPath = __dirname + '/../scripts/' + scriptName;

  let shell = R(scriptPath);
  if (scriptArguments !== undefined) {
    shell.data(scriptArguments);
  }

  return shell;
};
