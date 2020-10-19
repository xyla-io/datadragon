import json
import pandas as pd

from io_map import IOMapKey, IOMap, IOMapGraph, IOSourceReporter, IOMultiSourceReporter
from typing import Optional, List, Dict

def get_metadata_report(columns: List[str], filters: Dict[str, any], options: Dict[str, any], credentials: Dict[str, any]) -> Dict[str, any]:
    IOMapGraph._register_map_identifiers([
      'heathcliff/IOAppleSearchAdsReporter',
      'hazel/IOGoogleAdsReporter',
      'azrael/IOSnapchatReporter',
    ])

    graph = IOMapGraph(
      key_maps = [
        {
          IOMapKey.map.value: IOMultiSourceReporter(
            columns=columns,
            filters=filters,
            options=options
          ),
          IOMapKey.input.value: {
            'credentials': 'input.credentials',
          },
          IOMapKey.output.value: 'output.report',
        },
        {
          IOMapKey.map.value: StripSourceReportMetadataMap(),
          IOMapKey.input.value: {
            'report': 'output.report',
          },
          IOMapKey.output.value: {
            'metadata': 'output.metadata',
            'report': 'output.report',
          }
        }
      ],
    )
    output = graph.run(credentials=credentials)
    return output

class StripSourceReportMetadataMap(IOMap):
  metadata: Optional[List[any]]
  report: Optional[pd.DataFrame]

  @classmethod
  def _get_map_identifier(cls) -> str:
    return f'datadragon/{cls.__name__}'

  @classmethod
  def get_output_keys(cls) -> List[str]:
    return [
      'metadata',
      'report',
    ]

  def run(self, report: pd.DataFrame):
    self.prepare_run(
      metadata=[],
      report=report
    )
    if '' not in self.report:
      self.report[''] = None
    self.report.reset_index(drop=True, inplace=True)

    drop_indices = []
    for index in self.report.index:
      row = self.report.loc[index]
      notna_columns = [c for c in row.index if pd.notna(row[c])]
      if not notna_columns or notna_columns == ['']:
        drop_indices.append(index)
      row_metadata = json.loads(row['']) if '' in row and pd.notna(row['']) else []
      for metadata_entry in row_metadata:
        if set(metadata_entry.keys()) == {'credential', 'map'} and metadata_entry['map'] == IOMultiSourceReporter._get_map_identifier():
          if index not in drop_indices and len(row_metadata) == 1:
            self.report.loc[index, ''] = metadata_entry['credential']
          continue
        if metadata_entry not in self.metadata:
          self.metadata.append(metadata_entry)

    if drop_indices:
      report.drop(index=drop_indices, inplace=True)
      self.report.reset_index(drop=True, inplace=True)

    output = self.populated_output
    self.clear_run()
    return output

