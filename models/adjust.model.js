const R = require('../modules/r');

let Adjust = function() {};

Adjust.getRevenueReport = function(parameters) {
  return R.run('adjust-revenue-report.r', parameters)
    .then(result => {
      if (result.result) { return result.result }
      if (result.errors) { throw(result.errors.join('\n')) }
      throw('Failed to get app details result');
    });
};

module.exports.Adjust = Adjust;