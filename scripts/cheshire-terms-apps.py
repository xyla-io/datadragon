import sys
import os
import json

sys.path.append(os.path.dirname(os.path.realpath(__file__)) + "/../python/cheshire/")
from cheshire.mobile_action import MobileActionClient

mobileAction = MobileActionClient()
mobileAction.errorHandler = lambda error: print(json.dumps({"errors": [error]}))
apps = mobileAction.getApps()

print(json.dumps({"result": [a._asdict() for a in apps]}))
