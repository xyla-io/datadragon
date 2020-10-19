for rule in db.rules.find({}, {'user': 1}):
  db.rulesHistory.update({'ruleID': rule['_id']}, {'$set': {'userID': rule['user']}})
