import sys
import os
import json
from datetime import datetime, timezone

args = json.loads(sys.argv[1])

from regla import SearchAds, set_env, channel_factory
from regla.models.report_models import SearchAdsReporter, RuleReportType, RuleReportGranularity
from .channel import Channel

# extract script arguments
certificates = args["certificates"]
campaignIDs = args["campaignIDs"]
adGroupIDs = args["adGroupIDs"]
reportType = RuleReportType(args["reportType"])
startDateString = args["startDate"]
endDateString = args["endDate"]

dateFormat = "%Y-%m-%d"
startDate = datetime.strptime(startDateString, dateFormat)
endDate = datetime.strptime(endDateString, dateFormat)
channel = channel_factory(channel_identifier=Channel.apple_search_ads.value)
granularity = channel.highest_compatible_granularity(reportType, startDate, endDate)
if granularity is None: granularity = RuleReportGranularity.monthly

shouldContinue = True
for certificate in certificates:
    certs = {
        "SEARCH-ADS-PEM": certificate["pem"],
        "SEARCH-ADS-KEY": certificate["key"],
    }

    with set_env(**certs):
        api = SearchAds("")
        campaigns = api.get_campaigns()
        reporter = SearchAdsReporter(reportType=reportType)

        for campaignID in campaignIDs:
            campaign = [c for c in campaigns if int(c._id) == campaignID]
            if not campaign:
                continue
            campaign = campaign[0]

            reporter.fetchRawReport(startDate=startDate,
                                    endDate=endDate,
                                    granularity=granularity.value,
                                    api=api,
                                    campaign=campaign,
                                    adGroupIDs=adGroupIDs if adGroupIDs else None)

            print('{{"result":{{"reportType":"{reportType}","granularity":"{granularity}","startDate":"{startDate}","endDate":"{endDate}","campaignID":"{campaignID}","rows":{records}}}}}'.format(reportType=reportType.value, granularity=granularity.value, startDate=startDate.replace(tzinfo=timezone.utc).timestamp() * 1000, endDate=endDate.replace(tzinfo=timezone.utc).timestamp() * 1000, campaignID=campaignID, records=reporter.rawReport.to_json(orient='records')))
            shouldContinue = input()
            if not shouldContinue:
                break

    if not shouldContinue:
        break

                # print(json.dumps({
    #   "result": {
    #     "orgName" : orgName,
    #     "campaignIDs" : campaignIDs,
    #     "adGroupIDs" : adGroupIDs,
    #     "reportType" : reportType.value,
    #     "startDate" : startDate,
    #     "endDate" : endDate
    #   }
    # }))
