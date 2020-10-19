import pymongo
import pdb
from pprint import pprint

from regla import *
from regla.models.rule_model import *
from regla.models.action_models import *
from regla.models.serializer import *

args = {
    "orgName": "search-ads-research",
    "ruleID": "",
}
args["certificates"] = {
                           "../../credentials/{orgName}.pem".format(orgName=args["orgName"]): "../../credentials/{orgName}.key".format(orgName=args["orgName"]),
                       }

# configure database
client = pymongo.MongoClient("mongodb://localhost:27017/datadragon")
db=client.datadragon

# get the latest rule ID
lastRuleID = str(db.rules.find_one(sort=[("created", pymongo.DESCENDING)], projection=[])["_id"])
args["ruleID"] = lastRuleID

for key, value in args["certificates"].items():
    certs = {
        "SEARCH-ADS-PEM": key,
        "SEARCH-ADS-KEY": value,
    }

with set_env(**certs):
    rule = Rule.ruleWithID(rulesCollection=db.rules, conditionGroupsCollection=db.ruleConditionGroups, id=args["ruleID"])
    rule.connect(credentials={'org_name': args["orgName"]})
    pprint(rule)

    result = rule.execute(startDate="2017-01-01", endDate="2017-0-02", granularity='HOURLY', historyCollection=db.rulesHistory, monitorCollection=db.rulesMonitor)

    pprint(SearchAdsSerializer().encode({"result": result}))

