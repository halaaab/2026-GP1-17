"""Shared code for the model notebooks (06_baseline, 07_tuning, 08_final_training).

Every model is prepared and scored with the same code, so the comparison is fair.
The positive class is FAILED (failed_1y = 1): it is the rare outcome we most want to catch.
"""
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import average_precision_score, brier_score_loss, precision_score, recall_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


def make_preprocessor(numeric, categorical, scale_numbers):
    """Numbers: empty -> median (+ scaling for logistic regression). Categories: empty -> 'missing', then one
    column per value; values seen fewer than 200 times in training share one 'infrequent' column."""
    number_steps = [('fill', SimpleImputer(strategy='median', add_indicator=True))]
    if scale_numbers:
        number_steps.append(('scale', StandardScaler()))
    category_steps = [('fill', SimpleImputer(strategy='constant', fill_value='missing')),
                      ('one_hot', OneHotEncoder(handle_unknown='infrequent_if_exist', min_frequency=200,
                                                sparse_output=False))]
    return ColumnTransformer([('numbers', Pipeline(number_steps), numeric),
                              ('categories', Pipeline(category_steps), categorical)],
                             verbose_feature_names_out=False)


def make_model(preprocessor, classifier):
    return Pipeline([('prepare', preprocessor), ('model', classifier)])


def scores(y_true, p_fail, threshold=0.5):
    """The same scores for every model. p_fail = predicted chance of failing within one year."""
    y_true = np.asarray(y_true)
    predicted_fail = np.asarray(p_fail) >= threshold
    return {
        'PR-AUC': average_precision_score(y_true, p_fail),
        'ROC-AUC': roc_auc_score(y_true, p_fail),
        'recall (failed)': recall_score(y_true, predicted_fail, zero_division=0),
        'precision (failed)': precision_score(y_true, predicted_fail, zero_division=0),
        'Brier': brier_score_loss(y_true, p_fail),
        'failure rate': y_true.mean(),
    }


def fis(p_fail):
    """Founder Intelligence Score: 100 x chance of still being registered after one year."""
    return 100 * (1 - np.asarray(p_fail))


def fis_band(score):
    return pd.cut(score, bins=[-0.01, 39.999, 69.999, 100], labels=['0–39 lower', '40–69 moderate', '70–100 higher'])
