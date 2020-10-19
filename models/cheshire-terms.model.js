const validator = new (require('jsonschema').Validator)();
const python = require('../modules/python');

let ReportParameters = function(data) {
  Object.assign(this, data);
  delete this.validationErrors;
};

ReportParameters.schema = {
  type: 'object',
  properties: {
    rootTerm: {
      type: 'string',
      minLength: 1,
      required: true,
    },
    priorityThreshold: {
      type: 'number',
      required: true,
    },
  },
};

ReportParameters.validateInstance = function(instance) {
  return validator.validate(instance, this.schema);
};

ReportParameters.prototype.validationErrors = function() {
  let result = ReportParameters.validateInstance(this);
  return result.errors.length === 0 ? undefined : result.errors;
};

let App = function() {};

App.getApps = function() {
  return python.run('cheshire-terms-apps.py')
    .then(result => {
      if (result.result) { return result.result }
      if (result.errors) { throw(result.errors.join('\n')) }
      throw('Failed to get apps result');
    });
};

module.exports.ReportParameters = ReportParameters;
module.exports.App = App;