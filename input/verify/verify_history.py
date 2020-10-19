stage_df, prod_df = dfs
prod_df.drop(prod_df.index[prod_df.historyCreationDate < stage_df.historyCreationDate.min() + pd.Timedelta(minutes=2)], inplace=True)
prod_df.drop(prod_df.index[prod_df.historyCreationDate > stage_df.historyCreationDate.max() + pd.Timedelta(minutes=2)], inplace=True)
stage_df.drop(stage_df.index[stage_df.historyCreationDate < stage_df.historyCreationDate.min() + pd.Timedelta(minutes=2)], inplace=True)
edited_rule_ids = prod_df[prod_df.historyType == 'edited'].ruleID.unique()
prod_df.drop(prod_df.index[prod_df.ruleID.isin(edited_rule_ids)], inplace=True)
stage_df.drop(stage_df.index[stage_df.ruleID.isin(edited_rule_ids)], inplace=True)
stage_layer = SQLs[0].Layer(connection_options=SQLs[0].Layer.ConnectionOptions(options=database_configs[0]))
stage_layer.connect()
stage_rule_ids = list(map(str, stage_layer.get_database().rules.distinct('_id', {'isEnabled': True})))
stage_layer.disconnect()
prod_df.drop(prod_df.index[~prod_df.ruleID.isin(stage_rule_ids)], inplace=True)

for df in dfs:
  if 'rule_id' in context['format_parameters']:
    df.drop(df.index[df.ruleID != context['format_parameters']['rule_id']], inplace=True)
  df.historyCreationDate = df.historyCreationDate.apply(lambda d: pd.Timestamp(d.year, d.month, d.day, d.hour))
  df.sort_values(
    by=[
      'historyCreationDate',
      'userID',
      'ruleID',
      'targetID',
      'historyType',
      'actionDescription',
    ], 
    inplace=True
  )
  drop_columns = [
    c for c in df.columns 
    if c not in {
      'userID',
      'ruleID',
      'historyCreationDate',
      'historyType',
      'targetID',
      'actionDescription',
    }
  ]
  df.drop(columns=drop_columns, inplace=True)
  df.sort_index(axis=1, inplace=True)
  df.reset_index(drop=True, inplace=True)