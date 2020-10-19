from typing import List, Dict, Optional
from io_map import IOMap, IOMapGraph

def process_entities(operations: List[Dict[str, any]], context: Dict[str, any], credentials: Dict[str, Dict[str, any]]) -> Optional[any]:
  with IOMap._local_registries(clear=True):
    IOMap._register_map_identifiers(identifiers=[
      'io_map.util/IOMapGraph',
      'io_map.util/IOMapEach',
      'heathcliff.io_entity/IOAppleSearchAdsEntityCommitter',
    ])
    IOMap._register_context({
      'credentials': credentials,
      **context,
    })
    graph = IOMapGraph(
      key_maps=operations
    )
    output = graph.run()
  return output

