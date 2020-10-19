import sys
import os
import json

args = json.loads(sys.argv[1])
sys.path.append(os.path.dirname(os.path.realpath(__file__)) + "/../python/cheshire/")
from cheshire.mobile_action import MobileActionClient

def processLetter(letter, letterResults):
    progress = (ord(letter) - ord('a') + 1) / 26
    print(json.dumps({"result": {"rootTerm": args["rootTerm"], "progress": progress, "terms": [r._asdict() for r in letterResults]}}))
    shouldContinue = input()
    return shouldContinue

def handleError(description, response):
    if response.status_code == 400:
        return
    print(json.dumps({"errors": [description]}))


mobileAction = MobileActionClient()
mobileAction.errorHandler = handleError
autocomplete = mobileAction.getExpandedAutocomplete(args["rootTerm"], args["priorityThreshold"], args["appId"], processLetter)

# print(json.dumps({"result": {"rootTerm": args["rootTerm"], "terms": [a._asdict() for a in autocomplete]}}))
