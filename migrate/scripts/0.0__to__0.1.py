certificates = {
  str(c['_id']): c['name']
  for c in db.certificates.find({}, {'name': 1})
}

updates = []
for rule in db.rules.find({}, {'account': 1, 'user': 1}):
  safe_name = certificates[str(rule['account'])].replace('-', '-2D').replace('_', '-5F')
  db.rules.update({'_id': rule['_id']}, {'$set': {'account': f'user_{rule["user"]}_credential_apple-5Fsearch-5Fads_{safe_name}'}})
