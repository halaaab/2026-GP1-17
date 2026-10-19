# Market Indicators Dataset

Official Saudi sector indicators used as features in the Darb survival prediction model, plus Monsha'at data used for user-facing market insights.

## Folder layout

| Path | Contents | Used by |
| --- | --- | --- |
| `raw/gastat_real_gdp_by_sector_quarterly_2010_2026.csv` | GASTAT real GDP by economic activity, quarterly | Survival model: sector GDP growth |
| `raw/gastat_sme_revenues_expenses_2019_2024.csv` | GASTAT SME survey: revenues and expenses by section and size | Survival model: small-firm profit margin (rank), small-firm revenue growth |
| `raw/sama_pos_by_sector_monthly_2016_2023.xlsx` | SAMA point-of-sale sales by sector, monthly/quarterly/annual (via KAPSARC) | Survival model: consumer spending, 2020-2023 |
| `raw/sama_pos_by_sector_city_weekly_2020_2025.xlsx` | SAMA point-of-sale transactions, weekly, by sector and by city (via KAPSARC) | Survival model: consumer spending, 2024 |
| `raw/gastat_ssic_activity_classification_2026.xlsx` | Saudi National Classification of Economic Activities (SSIC / ISIC Rev.4) | Sector codes for the classifier; licensing authorities for the Roadmap Agent |
| `processed/indicator_consumer_spending_2020_2024.csv` | Spending growth per POS sector and year, and growth vs total market | Survival model feature |
| `processed/isic_classifier.py` | Business name to ISIC section/division keyword classifier | Preprocessing |
| `monshaat_atlas_market_insights.xlsx` | Monsha'at Business Atlas collection (10 divisions, 2016-2025) | Market Insights tool only, not model training |

## Model join

Market indicators are joined to each startup by sector + founding year (2020-2024).

## Status

Datasets locked on 2026-10-11. Pending: sector GDP, margin and revenue indicator files in `processed/`.
