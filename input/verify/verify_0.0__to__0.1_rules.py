import pandas as pd

prod_df: pd.DataFrame = dfs[1]
prod_df.shouldPerformAction = False
prod_df['safeMode'] = True
prod_df['channel'] = 'apple_search_ads'
prod_df = prod_df.reindex(sorted(prod_df.columns), axis=1)

dfs[1] = prod_df
dfs[0] = dfs[0].reindex(sorted(dfs[0].columns), axis=1)
