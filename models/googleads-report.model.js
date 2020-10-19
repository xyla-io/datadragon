let GoogleadsReportParameters = function(requestParameters, credential) {
  Object.assign(this, requestParameters);
  this.startDate = _convertDateString(this.startDate);
  this.endDate = _convertDateString(this.endDate);
  this.credential = credential
};

function _convertDateString(dateString) {
  let date = new Date(dateString);
  return `${date.getUTCFullYear()}-${('00' + (date.getUTCMonth() + 1)).slice(-2)}-${('00' + date.getUTCDate()).slice(-2)}`;
}

module.exports.GoogleadsReportParameters = GoogleadsReportParameters;