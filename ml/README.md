# Darb survival model

This folder holds the code for the Survival Prediction Model, which produces the Founder Intelligence Score.

## Folders

| Folder | What goes in it |
|---|---|
| `notebooks/` | Notebooks for exploring data and training models |
| `src/` | Shared code, and later the FastAPI service |

## Rules

- **One owner per notebook.** Git cannot combine two people's edits to the same notebook. Name yours with its order, topic and your name, like `01_cohort_check_sara.ipynb`.
- **Clear all outputs before committing.** Use Clear All Outputs, so no data or large results reach GitHub.
- **Data never goes in Git.** It stays in the Google Drive folder [Darb DataSets](https://drive.google.com/drive/folders/1Y_TN68LIO1xkOmbi0Y8auEvB09Mh_1gc).

## How the notebooks connect

Notebooks connect through files saved in Drive. One notebook saves its result, and the next one loads it.

1. **Preprocessing** builds the survival label and the train, validation and test files.
2. **One notebook per model** (logistic regression baseline, LightGBM, XGBoost) loads those same files and saves its scores.
3. **Comparison and calibration** picks the best model, calibrates it and saves the final model.

To keep the comparison fair:

- Only the preprocessing notebook splits the data.
- Every model reports PR-AUC and recall, using the same code.
- The test set is used once, at the very end, on the chosen model.

## Running a notebook in Colab

A Colab server runs on Google's computers, so it cannot see the files on your laptop.

1. In Drive, add a shortcut to Darb DataSets in your My Drive.
2. Connect Drive in the first cell:

   ```python
   from google.colab import drive
   drive.mount('/content/drive')
   ```

3. Install the packages in the next cell. The list matches `requirements.txt`:

   ```python
   !pip install pandas numpy scikit-learn lightgbm xgboost shap pyarrow matplotlib
   ```
