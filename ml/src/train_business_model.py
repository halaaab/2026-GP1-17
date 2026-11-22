"""Trains Darb's first survival model (a partial model) and saves it for the model service.

Partial: it uses the Ministry of Commerce business records only (notebook 05's model table). The economic
indicators (notebook 03) and the tuning (notebooks 06-08) are not in it yet.

It uses only the inputs the conversational agent knows today: the economic sector (ISIC4 section letter),
the region, and the quarter of the year the business is founded in.

Run from the repository root:  .venv/bin/python ml/src/train_business_model.py
Reads:  <DARB_DATA>/pipeline/05_model_table.parquet
Saves:  <DARB_DATA>/pipeline/models/business_only_model.joblib and business_only_model_report.json
The test quarter is never opened: the scores below are on the validation quarters.
"""
import json
import os
import sys
from datetime import date
from pathlib import Path

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, str(Path(__file__).parent))
from model_tools import make_model, make_preprocessor, scores  # noqa: E402

DATA_DIR = Path(os.environ.get('DARB_DATA', Path.home() / 'darb-data'))
PIPELINE = DATA_DIR / 'pipeline'
MODELS = PIPELINE / 'models'

CATEGORICAL = ['economic_sector', 'region', 'founding_quarter_of_year']
NUMERIC = []
TARGET = 'failed_first_year'

table = pd.read_parquet(PIPELINE / '05_model_table.parquet')
training = table[table['split'] == 'training']
validation = table[table['split'] == 'validation']

# No class weights: the founder sees the probability itself, so it must stay close to the real failure rate.
model = make_model(make_preprocessor(NUMERIC, CATEGORICAL, scale_numbers=True),
                   LogisticRegression(max_iter=2000))
model.fit(training[NUMERIC + CATEGORICAL], training[TARGET])

p_fail = model.predict_proba(validation[NUMERIC + CATEGORICAL])[:, 1]
validation_scores = {name: round(float(value), 4) for name, value in scores(validation[TARGET], p_fail).items()}
validation_scores['mean predicted failure'] = round(float(p_fail.mean()), 4)

report = {
    'model': 'business_only_model',
    'stage': 'partial',
    'trained_on': date.today().isoformat(),
    'algorithm': 'logistic regression (no class weights)',
    'inputs': CATEGORICAL + NUMERIC,
    'data': 'Ministry of Commerce business records only (05_model_table.parquet)',
    'training_businesses': int(len(training)),
    'training_failure_rate': round(float(training[TARGET].mean()), 4),
    'validation_businesses': int(len(validation)),
    'validation_scores': validation_scores,
    'regions': sorted(training['region'].dropna().unique().tolist()),
    'sectors': sorted(training['economic_sector'].dropna().unique().tolist()),
    'not_included_yet': ['economic indicators (notebook 03)', 'legal form, capital, city, e-commerce '
                         '(the agent does not ask them yet)', 'tuning (notebook 07)'],
}

MODELS.mkdir(parents=True, exist_ok=True)
joblib.dump(model, MODELS / 'business_only_model.joblib')
(MODELS / 'business_only_model_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
