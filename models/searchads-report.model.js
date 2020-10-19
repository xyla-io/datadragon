const validator = new (require('jsonschema').Validator)();

let ReportParameters = function(data) {
  Object.assign(this, data);
  delete this.validationErrors;
};

ReportParameters.schema = {
  type: 'object',
  properties: {
    certificates: {
      type: 'array',
      item: {
        type: 'object',
        required: true,
        properties: {
          pem: {
            type: 'string',
            required: true,
          },
          key: {
            type: 'string',
            required: true,
          }
        }
      }
    },
    accountIDs: {
      type: 'string[]',
      required: true,
    },
    campaignIDs: {
      type: 'string[]',
      required: true,
    },
    adGroupIDs: {
      type: 'string[]',
      required: true
    },
    reportType: {
      type: 'string',
      required: true
    },
    startDate: {
      type: 'string',
      required: true,
    },
    endDate: {
      type: 'string',
      required: true,
    }
  },
};

ReportParameters.validateInstance = function(instance) {
  return validator.validate(instance, this.schema);
};

ReportParameters.prototype.validationErrors = function() {
  let result = ReportParameters.validateInstance(this);
  return result.errors.length === 0 ? undefined : result.errors;
};

let ImpactReportParameters = function(reportId, rule, dbConfig, credential) {
  this.reportID = reportId;
  this.ruleID = rule._id;
  this.orgName = credential.name;
  this.credentials = credential.credential;
  this.dbConfig = dbConfig;
  this.command = 'impact_report';
};

module.exports.ReportParameters = ReportParameters;

module.exports.ImpactReportParameters = ImpactReportParameters;