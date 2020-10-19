const Q = require('q');
const PythonShell = require('python-shell');
const rootDirectory = require('path').dirname(require.main.filename);

module.exports.run = function(scriptName, scriptArguments, shouldLog = true) {
  let deferred = Q.defer();

  let shell = this.shell(scriptName, scriptArguments);

  var result;
  let errors = [];
  let logs = [];

  shell.on('message', message => {
    if (message.errors) {
      if (shouldLog) {
        console.log(scriptName + ' python script errors:', message.errors);
      }
      errors = errors.concat(message.errors);
    }
    if (message.log) {
      if (shouldLog) {
        console.log(scriptName + ' python script log: ' + message.log);
      }
      logs.push(message.log);
    }
    if (message.result) {
      result = message.result;
    }
  });

  shell.end(scriptError => {
    if (scriptError) {
      if (shouldLog) {
        console.log(scriptName + ' python script error:', scriptError);
      }
      errors.unshift(scriptError);
    }

    if (result) {
      deferred.resolve({
        result: result,
        errors: errors,
        logs: logs,
      })
    } else {
      let error = scriptName + ' python script completed without returning a result.';
      if (shouldLog) {
        console.log(error + '\nArgs:\n' + JSON.stringify(JSON.stringify(scriptArguments)));
      }
      errors.unshift(error);

      deferred.reject({ errors: errors, logs: logs });
    }
  });

  return deferred.promise;
};

module.exports.interact = function(scriptName, scriptArguments, resultHandler, errorHandler, closeHandler, shouldLog = true) {
  let shell = this.shell(scriptName, scriptArguments);

  shell.on('message', message => {
    if (message.errors) {
      if (shouldLog) {
        console.log(scriptName + ' python script errors:', message.errors);
      }
    }
    if (message.log) {
      if (shouldLog) {
        console.log(scriptName + ' python script log: ' + message.log);
      }
    }
    if (resultHandler) {
      let response = resultHandler(message, shell);
      if (response !== undefined) {
        shell.send(response);
      }
    }
  });

  shell.on('error', error => {
    if (shouldLog) {
      console.log(scriptName + ' python script error:', error);
    }
    if (errorHandler) {
      errorHandler(error, shell);
    }
  });

  shell.on('close', () => {
    if (closeHandler) {
      closeHandler(shell);
    }
  });

  return shell;
};

module.exports.shell = function(scriptName, scriptArguments) {
  let options = {
    mode: 'json',
    pythonPath: rootDirectory + '/python/environment/bin/python',
    scriptPath: __dirname + '/../scripts',
    args: [JSON.stringify(scriptArguments)]
  };

  let shell = new PythonShell(scriptName, options);

  return shell;
};

module.exports.runCommand = function(command, commandArguments, shouldLog = true) {
  let scriptArguments = Object.assign(
    {
      command: command,
    },
    commandArguments
  );
  return module.exports.run('../datadragon_api.py', scriptArguments, shouldLog);
}