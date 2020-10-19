import sys
import os
import json

args = json.loads(sys.argv[1])
sys.path.append(os.path.dirname(os.path.realpath(__file__)) + "/../python/cheshire/")
from cheshire.mobile_action import MobileActionClient

mobileAction = MobileActionClient()
mobileAction.errorHandler = lambda error: print(json.dumps({"errors": [error]}))
details = mobileAction.getAppDetails(args["trackId"])

print(json.dumps({"result": details }))