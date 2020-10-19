import hazel
import json
import sys
import uuid
import code
from datetime import datetime

ROWS_PER_RESULT = 1000

args = json.loads(sys.argv[1])

credential = args['credential']
report_type = args['reportType']
start_date_string = args['startDate']
end_date_string = args['endDate']

date_format = "%Y-%m-%d"
start_date = datetime.strptime(start_date_string, date_format)
end_date = datetime.strptime(end_date_string, date_format)

adwords_client = hazel.AdWordsClient(developer_token=credential['developerToken'],
                                     client_id=credential['clientId'],
                                     client_secret=credential['clientSecret'],
                                     refresh_token=credential['refreshToken'])

adwords_client.client_customer_id = credential['clientCustomerId']

campaigns = adwords_client.getCampaigns()
campaigns_data = [{
    'id': c.id,
    'name': c.name,
    'status': c.status,
    'targetCpa': c.biddingStrategyConfiguration.biddingScheme.targetCpa.microAmount if hasattr(c.biddingStrategyConfiguration, 'biddingScheme') and hasattr(c.biddingStrategyConfiguration.biddingScheme, 'targetCpa') else None,
} for c in campaigns]

report_id = uuid.uuid4().hex

print(json.dumps({
    'result': {
        'reportId': report_id,
        'reportType': report_type,
        'startDate': start_date.timestamp(),
        'endDate': end_date.timestamp(),
        'campaigns': campaigns_data,
    },
}))

shouldContinue = input()
if shouldContinue:
    report = adwords_client.getReport(report_type=report_type,
                                      start_date=start_date,
                                      end_date=end_date)

    # code.interact(local=locals())

    row_count = len(report.index)

    print(json.dumps({'log': 'adwords report row count: {row_count}'.format(row_count=row_count)}))

    if report.empty:
        print(json.dumps({
            'result': {
                'reportId': report_id,
                'progress': 1.0,
                'rows': [],
            },
        }))
        shouldContinue = input()
    else:
        page_index = 0
        more_pages = True
        shouldContinue = True
        while more_pages and shouldContinue:
            start_index = page_index * ROWS_PER_RESULT
            end_index = min(row_count, start_index + ROWS_PER_RESULT)
            progress = (end_index + 1) / row_count
            more_pages = progress < 1.0
            page_index += 1

            rows = report.iloc[start_index:end_index]

            print('{{"result":{{"reportId":"{report_id}","progress":"{progress}","rows":{records}}}}}'.format(report_id=report_id, progress=progress, records=rows.to_json(orient='records')))

            shouldContinue = input()
