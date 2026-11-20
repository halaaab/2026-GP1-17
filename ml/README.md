# Darb survival model

This folder holds the code for the survival prediction model: given a founder's business idea, it predicts whether
the business will still be operating one year after its establishment.

## Folders

| Folder | What goes in it |
|---|---|
| `notebooks/` | The pipeline, numbered notebooks run in order |
| `experiments/` | The earlier experiment notebooks, kept as they were (the pipeline reuses their decisions) |
| `src/` | Shared code: `mc_files.py` (the Ministry of Commerce files and their attribute names), `isic_classifier.py` (sector rules for business names), `model_tools.py` (the same preparation and scores for every model) |
| `reports/` | Counts-only results of the notebooks (no business records), so the team can review them in GitHub |

## The pipeline

Each notebook saves its results in `Darb DataSets/pipeline/`, and the next one loads them. Only `00` reads the raw
files.

| # | Notebook | What it does | Status |
|---|---|---|---|
| 00 | `00_download` | Introduction, research question and methodology; copies every raw file once in a fast-loading format | Done |
| 01 | `01_eda_raw` | Exploratory analysis of the raw data | Done |
| 02 | `02_preprocess_businesses` | One row per business: attributes at founding, presence in each quarter, survival target, conversions of sole proprietorships into companies, economic sector | Done |
| 03 | `03_preprocess_economic` | Economic indicators (GDP, point-of-sale spending) before each founding quarter | Being rebuilt |
| 04 | `04_eda_clean` | Exploratory analysis of the preprocessed business records (Ministry of Commerce data only, training businesses only) | Done |
| 05 | `05_moc_feature_extraction` | Time split; every feature that can be derived from the Ministry of Commerce records, studied on the training businesses only (no model trained, test set never opened) | Done, awaiting the decision on which features enter the model |
| 05 | `05_features` | Feature engineering and time split with the business information only; association between the inputs and leakage checks | Done, awaiting the decisions listed in its summary |
| 06–08 | `06_baseline`, `07_tuning`, `08_final_training` | Baselines, tuning, final training | Being rebuilt |

## Reports (`reports/`)

| File | From | Content |
|---|---|---|
| `00_manifest.csv` | 00 | Every raw file: rows, columns, size |
| `02_summary.csv` | 02 | Businesses, survived and failed per founding quarter |
| `02_legal_form_mapping.csv` | 02 | Every recorded legal form and its standard form (Companies Law, Article 4) |
| `02_city_mapping.csv` | 02 | Every locality recorded from 2025 Q2 and the city it is assigned to |
| `02_sector_keywords.csv` | 02 | The keywords that give the sector from a business name, with their counts |
| `02_sector_keywords_removed.csv` | the team | Keywords removed after review (optional; 02 excludes them) |
| `05_feature_profile.csv` | 05 | Each numeric feature: availability, percentiles, area under the ROC curve alone, failure-rate range |
| `05_feature_groups.csv` | 05 | Failure rate of each feature by group of values (training businesses) |
| `05_feature_correlation.csv` | 05 | Spearman correlation between the numeric features |
| `05_categorical_association.csv` | 05 | Cramér's V between the categorical features |
| `05_business_input_association.csv` | 05 (features) | Cramér's V between the business inputs, and of each input with the outcome |

## Rules

- **One person edits a notebook at a time.** Git cannot combine two people's edits to the same notebook. New experiments go in `experiments/` with your name.
- **Clear all outputs before committing.** Outputs can contain business details. On your laptop the outputs stay until you clear them.
- **Data never goes in Git.** It stays in the Google Drive folder [Darb DataSets](https://drive.google.com/drive/folders/1Y_TN68LIO1xkOmbi0Y8auEvB09Mh_1gc). Only the counts-only files in `reports/` are committed.

## Running the notebooks

**On a laptop:** keep a copy of Darb DataSets in `~/darb-data` (or set `DARB_DATA` to its folder), install
`requirements.txt`, and run the notebooks from `ml/notebooks/`. LightGBM and XGBoost on a Mac also need OpenMP:
`brew install libomp`.

**On Colab:** a Colab server cannot see the files on your laptop.

1. In Drive, add a shortcut to Darb DataSets in your My Drive.
2. Upload the files of `ml/src` to `/content`.
3. Run the notebook: its setup cell connects Drive and installs the missing packages.
