# Install Python Virtual Environment

```bash
python3 -m venv environment
source environment/bin/activate
# the command prompt should indicate an active environment
pip install -r requirements.txt
deactivate
```

# Unit Testing

To run the search ads module's unit tests

```bash
source environment/bin/activate
cd search_ads_api
python -m unittest
deactivate
```

