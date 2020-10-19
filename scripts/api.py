import sys
import os
import json

from enum import Enum
from pathlib import Path
from .channel import Channel
from io_fetch_channel import ChannelPerformanceFetcher
from io_channel import IOSharedResourceMap
from regla import channel_factory, ChannelEntity, RuleSerializer
from datetime import datetime
from typing import Dict

class Command(Enum):
  campaigns = 'campaigns'
  adgroups = 'adgroups'
  orgs = 'orgs'
  execute_rule = 'execute_rule'
  impact_report = 'impact_report'
  channel_report = 'channel_report'
  enity_report = 'entity_report'
  rule_report = 'rule_report'
  report = 'report'
  entity_process = 'entity_process'

def prepare_credentials(args: Dict[str, any]) -> Dict[str, any]:
  shared_credentials_map = IOSharedResourceMap(url_key='shared_credentials_url')
  credentials = shared_credentials_map.run(args['credentials'])
  return credentials

def run():
  args = json.loads(sys.argv[1])
  from moda import log
  log.set_message_logger(lambda message, end: print(json.dumps({'log': message + end})))
  with open(Path(__file__).parent.parent / 'configure.json') as f:
    configure = json.load(f)
  command = Command(args['command'])

  if command is Command.orgs:
    channel = channel_factory(channel_identifier=args['channel'])
    with channel.connected(credentials=prepare_credentials(args)):
      orgs = channel.get_entities(entity_type=ChannelEntity.org)
    print(json.dumps({
      'data': [
        {
          **d,
          'id': d['id'],
        } for d in orgs
      ]
    }))

  elif command is Command.campaigns:
    channel = channel_factory(channel_identifier=args['channel'])
    with channel.connected(credentials=prepare_credentials(args)):
      campaigns = [
        campaign 
        for org in args['orgs']
        for campaign in channel.get_entities(
          entity_type=ChannelEntity.campaign,
          parent_ids={ChannelEntity.org: str(org['id'])}
        )
      ]
    print(json.dumps({
      'data': [
        {
          **d,
          'org_id': d['org_id'],
          'id': d['id'],
        } for d in campaigns
      ]
    }))

  elif command is Command.adgroups:
    channel = channel_factory(channel_identifier=args['channel'])
    with channel.connected(credentials=prepare_credentials(args)):
      ad_groups = channel.get_entities(
        entity_type=ChannelEntity.ad_group,
        parent_ids={ChannelEntity.org: str(args['orgID']), ChannelEntity.campaign: str(args['campaignID'])}
      )
    print(json.dumps({
      'data': [
        {
          **d,
          'org_id': d['org_id'],
          'campaign_id': d['campaign_id'],
          'id': d['id'],
        } for d in ad_groups
      ]
    }))

  elif command is Command.execute_rule:
    from io_map import IOMap
    IOMap.map_auto_register = True
    from .rule_executor import RuleExecutor
    date_format = '%Y-%m-%d'
    rule_executor = RuleExecutor(options=args['dbConfig'])
    rule = rule_executor.get_rule(rule_id=args['ruleID'])
    if configure['dry_run_only'] is not False or ('dryRunOnly' in args and args['dryRunOnly']):
      if rule._id in configure['non_dry_run_rule_ids']:
        log.log(f'Allowing non dry run for rule {rule._id} despite dry_run_only configuration because rule is listed in the non_dry_run_rule_ids configuration.')
      elif 'nonDryRunRuleIDs' in args and rule._id in args['nonDryRunRuleIDs']:
        log.log(f'Allowing non dry run for rule {rule._id} despite dry_run_only configuration because rule is listed in the nonDryRunRuleIDs argument.')
      else:
        if not rule.dryRun:
          log.log(f'Forcing dry run for rule {rule._id} due to dry_run_only configuration.')
        rule.dryRun = True
    result = rule_executor.execute(
      credentials=prepare_credentials(args),
      rule=rule,
      granularity=args['granularity'],
      start_date=datetime.strptime(args['startDate'], date_format),
      end_date=datetime.strptime(args['endDate'], date_format)
    )

    print(json.dumps({
      "result" : result,
    }, cls=RuleSerializer))

  elif command is Command.impact_report:
    from io_map import IOMap
    IOMap.map_auto_register = True
    from .rule_executor import RuleExecutor
    date_format = '%Y-%m-%d'
    credentials = prepare_credentials(args)
    rule_id = args['ruleID']
    report_id = args['reportID']

    rule_executor = RuleExecutor(options=args['dbConfig'])
    rule = rule_executor.get_rule(rule_id=rule_id)
    report_metadata = rule_executor.get_impact_report_metadata(
      credentials=credentials,
      rule=rule
    )

    print(json.dumps({'result': {'reportId': report_id, 'granularity': report_metadata.granularity.value}}))
    if report_metadata.is_valid:
      report = rule_executor.get_impact_report(
        credentials=credentials,
        rule=rule
      )
      print(f'{{"result":{{"reportId": "{report_id}", "rows": {report.to_json(orient="records")}}}}}')

    input()
  
  elif command is Command.channel_report:
    fetcher = ChannelPerformanceFetcher(
      raw_channel=args['channel'],
      raw_time_granularity=args['time_granularity'],
      raw_entity_granularity=args['entity_granularity'],
      raw_performance_columns=[]
    )
    start = datetime.fromtimestamp(args['start'])
    end = datetime.fromtimestamp(args['end'])
    report = fetcher.run(
      credentials=prepare_credentials(args),
      start=start,
      end=end
    )
    print(json.dumps({
      'data': report.to_csv(index=False),
    }))

  elif command is Command.report:
    from .report import get_metadata_report
    result = get_metadata_report(
      columns=args['columns'],
      filters=args['filters'],
      options=args['options'],
      credentials=prepare_credentials(args)
    )
    print(json.dumps({
      'result': {
        'metadata': result['metadata'],
        'report': result['report'].to_csv(index=False),
      },
    }))

  elif command is Command.entity_process:
    from .entity import process_entities
    result = process_entities(
      operations=args['operations'],
      context=args['context'],
      credentials=prepare_credentials(args)
    )
    print(json.dumps({
      'result': result,
    }))

  else:
    raise ValueError('Unsupported command', command)

if __name__ == '__main__':
  run()