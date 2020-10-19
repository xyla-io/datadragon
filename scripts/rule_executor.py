import json
from pymongo import MongoClient
from datetime import datetime
from typing import Dict

from regla.models.rule_model import Rule, RuleImpactReportMetadata

class RuleExecutor:
  rulesCollection: any
  conditionGroupsCollection: any
  rulesHistoryCollection: any
  rulesMonitorCollection: any

  def __init__(self, options: Dict[str, any]):
    client = MongoClient(options["databaseURL"])
    db = client[options["database"]]
    self.rulesCollection = db[options["rulesCollection"]]
    self.conditionGroupsCollection = db[options["ruleConditionGroupsCollection"]]
    self.rulesHistoryCollection = db[options["rulesHistoryCollection"]]
    self.rulesMonitorCollection = db[options["rulesMonitorCollection"]]

  def execute(self, credentials: any, rule: Rule, granularity: str, start_date: datetime, end_date: datetime) -> Dict[str, any]:
    with rule.connected(
      credentials=credentials,
      rule_collection=self.rulesCollection,
      history_collection=self.rulesHistoryCollection,
      monitor_collection=self.rulesMonitorCollection
    ):
      result = rule.execute(
        startDate=start_date,
        endDate=end_date,
        granularity=granularity
      )
  
    return result
  
  def get_rule(self, rule_id: str) -> Dict[str, any]:
    return Rule.ruleWithID(
      rulesCollection=self.rulesCollection,
      conditionGroupsCollection=self.conditionGroupsCollection,
      id=rule_id
    )
  
  def get_impact_report_metadata(self, credentials: any, rule: Rule) -> RuleImpactReportMetadata:
    with rule.connected(
      credentials=credentials,
      history_collection=self.rulesHistoryCollection,
      monitor_collection=self.rulesMonitorCollection,
    ):
      metadata = rule.impactReportMetadata()
    return metadata
  
  def get_impact_report(self, credentials: any, rule: Rule) -> Dict[str, any]:
    with rule.connected(
      credentials=credentials,
      history_collection=self.rulesHistoryCollection,
      monitor_collection=self.rulesMonitorCollection,
    ):
      report = rule.getImpactReport()
    if 'installs' in report.columns and 'conversions' not in report.columns:
      report.rename(columns={'installs': 'conversions'}, inplace=True)

    return report