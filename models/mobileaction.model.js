const validator = new (require('jsonschema').Validator)();
const python = require('../modules/python');

// let AppDetailsParameters = function(data) {
//   Object.assign(this, data);
//   delete this.validationErrors;
// };
//
// AppDetailsParameters.schema = {
//   type: 'object',
//   properties: {
//     requestId: {
//       type: 'string',
//       minLength: 1,
//       required: true,
//     },
//     parameter: {
//       type: 'string',
//       minLength: 1,
//       required: true,
//     },
//   },
// };
//
// AppDetailsParameters.validateInstance = function(instance) {
//   return validator.validate(instance, this.schema);
// };
//
// AppDetailsParameters.prototype.validationErrors = function() {
//   let result = ReportParameters.validateInstance(this);
//   return result.errors.length === 0 ? undefined : result.errors;
// };

let MobileAction = function() {};

MobileAction.getAppDetails = function(adamId) {
  return python.run('mobileaction-app-details.py', { trackId : adamId })
    .then(result => {
      if (result.result) { return result.result }
      if (result.errors) { throw(result.errors.join('\n')) }
      throw('Failed to get app details result');
    });
};

// module.exports.ReportParameters = ReportParameters;
module.exports.MobileAction = MobileAction;