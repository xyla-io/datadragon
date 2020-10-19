import datetime

for rule in db.rules.find({'lastRun': {'$exists': 1, '$ne': None}}, {'lastRun': 1}):
  db.rules.update({'_id': rule['_id']}, {'$set': {'lastRun': rule['lastRun'] - datetime.timedelta(seconds=120) }})