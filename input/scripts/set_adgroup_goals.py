import re
import json

from typing import List
from io_map import IOMapKey
from io_channel import IOEntityKey, IOEntityGranularity, IOEntityAttribute

api: 'APIRunContext'
script_args: List[str]

dry_run = not script_args or script_args[0] != 'live'

report = api.run_api_command(
  command=['python:run'],
  command_args=[
    json.dumps([
      {
        'command': 'fetch',
        'targets': {
          'credentials.heathcliff/IOAppleSearchAdsReporter': ''
        }
      },
      {
        'command': 'report',
        'columns': [
          'campaign.id',
          'campaign.name',
          'adgroup.id',
          'adgroup.name',
          'adgroup.goal',
        ],
        'filters': {},
        'options': {},
        'credentials': {}
      }
    ]),
    '-t', '0.targets.credentials\\.heathcliff/IOAppleSearchAdsReporter',
    '-f', 'credential://CREDENTIAL',
    '-g', '1.result.report',
    '--parse-csv', '-p',
    '-q'
  ],
  load_output=True
)

print(report)

campaign_ids = {
  e['campaign.id']
  for e in report
  if re.match(r'^(Data Dragon)( |$)', e['campaign.name'])
}

entities = [
  {
    IOEntityKey.granularity.value: IOEntityGranularity.adgroup.value,
    IOEntityKey.id.value: e['adgroup.id'],
    IOEntityKey.parent_ids.value: {
      IOEntityGranularity.campaign.value: e['campaign.id'],
    },
    IOEntityKey.update.value: {
      IOEntityAttribute.goal.value: 4.5,
    }
  }
  for e in report
  if e['campaign.id'] in campaign_ids and e['adgroup.id']
]

print(entities)

result = api.run_api_command(
  command=['python:run'],
  command_args=[
    json.dumps([
      {
        'command': 'fetch',
        'targets': {
          'credentials.shared': ''
        }
      },
      {
        'command': 'entity_process',
        'operations': [
          {
            IOMapKey.map.value: 'iomap.io_map.util/IOMapEach',
            IOMapKey.construct.value: {
              'key_map': 'iocontext.commit',
            },
            IOMapKey.input.value: {
              'items': 'iocontext.entities',
            },
            IOMapKey.output.value: 'run.output',
          },
        ],
        'context': {
          'entities': entities,
          'commit': {
            IOMapKey.map.value: 'iomap.heathcliff.io_entity/IOAppleSearchAdsEntityCommitter',
            IOMapKey.input.value: {
              'entity': 'run.unmapped',
              'credentials': 'iocontext.credentials.shared',
              'dry_run': dry_run,
            },
          }
        },
        'credentials': {
          'shared': {},
        }
      }
    ]),
    '-t', '0.targets.credentials\\.shared',
    '-f', 'credential://CREDENTIAL',
  ]
)