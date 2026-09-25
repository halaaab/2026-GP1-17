# Survival Model Dataset

- **Purpose:** Historical company-level startup data used to train, compare, and evaluate the Survival Prediction Model, whose output drives the Founder Intelligence Score (FIS = 100 × predicted survival probability).
- **Used by:** Survival Prediction Model, Explainability Engine
- **Source(s):** Zid historical merchant data if the collaboration is finalized; otherwise Crunchbase. Enriched with Monsha'at Business Atlas indicators (see `../market-indicators/`), matched by economic activity and business entry year.
- **Candidate models:** Random Forest, XGBoost (final choice based on data and comparative performance)
- **License / access:** Zid — private, never committed. Crunchbase — per Crunchbase terms.

## Layout
- `raw/` — original files exactly as received. Never edited. Not committed.
- `processed/` — cleaned, merged data used for training.
