for rule in db.rules.find({'modified': {'$exists': False}}, {'created': 1}):
  db.rules.update({'_id': rule['_id']}, {'$set': {'modified': rule['created']}})
