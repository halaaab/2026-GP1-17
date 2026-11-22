"""Darb's model service: the conversational agent's predict_survival tool calls POST /predict here.

It serves the partial model made by train_business_model.py (business records only, not the final model).

Start it from the repository root:
    .venv/bin/python -m uvicorn model_service:app --app-dir ml/src --port 8000
Then try it at http://localhost:8000/docs, and set ML_SERVICE_URL=http://localhost:8000 in agent-server/.env.
"""
import json
import os
from datetime import date
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel, Field

DATA_DIR = Path(os.environ.get('DARB_DATA', Path.home() / 'darb-data'))
MODELS = DATA_DIR / 'pipeline' / 'models'

model = joblib.load(MODELS / 'business_only_model.joblib')
report = json.loads((MODELS / 'business_only_model_report.json').read_text())

# The 13 regions as the Ministry of Commerce records write them, and the English names the agent may send.
REGIONS_IN_ENGLISH = {
    'riyadh': 'الرياض', 'makkah': 'مكة المكرمة', 'mecca': 'مكة المكرمة', 'eastern': 'الشرقية',
    'eastern province': 'الشرقية', 'qassim': 'القصيم', 'al-qassim': 'القصيم', 'madinah': 'المدينة المنورة',
    'medina': 'المدينة المنورة', 'asir': 'عسير', 'aseer': 'عسير', 'najran': 'نجران', 'jazan': 'جازان',
    'jizan': 'جازان', 'hail': 'حائل', "ha'il": 'حائل', 'tabuk': 'تبوك', 'al-jouf': 'الجوف', 'al jouf': 'الجوف',
    'jouf': 'الجوف', 'northern borders': 'الحدود الشمالية', 'al-baha': 'الباحة', 'al baha': 'الباحة',
    'baha': 'الباحة',
    # The largest cities, in case the agent sends a city instead of its region.
    'jeddah': 'مكة المكرمة', 'taif': 'مكة المكرمة', 'dammam': 'الشرقية', 'khobar': 'الشرقية',
    'al khobar': 'الشرقية', 'dhahran': 'الشرقية', 'jubail': 'الشرقية', 'ahsa': 'الشرقية', 'al-ahsa': 'الشرقية',
    'buraidah': 'القصيم', 'abha': 'عسير', 'khamis mushait': 'عسير', 'yanbu': 'المدينة المنورة',
}


class Idea(BaseModel):
    sector: str = Field(description='The ISIC4 section letter, e.g. "K".')
    sub_sector: str = Field(description='The ISIC4 division (2 digits). Received, but not a model input yet.')
    region: str = Field(description='A Saudi region (Arabic or English), or "Nationwide".')


def to_region(text):
    """The region as the records write it, or None (nationwide or not recognised)."""
    cleaned = text.strip().lower().removesuffix(' region').removesuffix(' province').strip()
    if text.strip() in report['regions']:
        return text.strip()
    if cleaned in REGIONS_IN_ENGLISH:
        return REGIONS_IN_ENGLISH[cleaned]
    return next((region for region in report['regions'] if region in text), None)


app = FastAPI(title='Darb model service')


@app.get('/health')
def health():
    return {'status': 'ok', 'model': report['model'], 'stage': report['stage'],
            'validation_scores': report['validation_scores']}


@app.post('/predict')
def predict(idea: Idea):
    sector = idea.sector.strip().upper()
    region = to_region(idea.region)
    # The founder is starting now, so the founding quarter is today's quarter.
    quarter = f'Q{(date.today().month - 1) // 3 + 1}'
    row = pd.DataFrame([{'economic_sector': sector, 'region': region, 'founding_quarter_of_year': quarter}])
    p_fail = float(model.predict_proba(row)[0, 1])
    return {
        'survival_probability': round(1 - p_fail, 4),
        'model_stage': report['stage'],
        # What the model used. A sector or region it did not recognise counts as "average" for that input.
        'used_inputs': {'sector': sector if sector in report['sectors'] else None, 'region': region,
                        'founding_quarter_of_year': quarter},
    }
