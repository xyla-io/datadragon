import pandas as pd

dfs[1].loc[dfs[1].shouldPerformAction == False, 'isEnabled'] = False
dfs[1].shouldPerformAction = False
dfs[0].lastRun = dfs[0].lastRun.apply(lambda d: None if pd.isna(d) else d + pd.Timedelta(seconds=60))
for df in dfs:
  df.sort_index(axis=1, inplace=True)