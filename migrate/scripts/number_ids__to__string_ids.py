id_properties = [
  'orgID',
  'campaignID',
  'adgroupID',
]
for rule in db.rules.find({}, {p: 1 for p in id_properties}):
  updates = {}
  for id_property in id_properties:
    if id_property not in rule or rule[id_property] is None:
      continue
    if isinstance(rule[id_property], str):
      continue
    updates[id_property] = str(rule[id_property])
  if updates:
    db.rules.update({'_id': rule['_id']}, {'$set': updates})
