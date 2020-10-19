import os
import json

with open(os.path.join(os.path.dirname(__file__), 'local_testing_credentials.json')) as f:
  testing_credentials = json.load(f)