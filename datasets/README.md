# Datasets (Data Layer)

Darb uses several datasets across the system. Each has its own folder, organized by what it powers. All data is prepared in advance and loaded into the data layer.

| Folder | Dataset | Used by | Source |
|---|---|---|---|
| `survival-model/` | Historical company-level startup data | Survival Prediction Model → FIS & Analysis | Zid (under discussion) or Crunchbase |
| `market-indicators/` | Saudi market indicators by economic activity and year | Survival Prediction Model, Saudi Market Insights | Monsha'at Business Atlas |
| `regulatory-requirements/` | Saudi regulatory & licensing knowledge base | Founder Roadmap Agent, Regulatory & Licensing Explorer | Official Saudi government sources |
| `idea-similarity/` | Saudi startup corpus with vector embeddings | Idea Similarity Engine, Startup Landscape Explorer | TBD |
| `incubators-accelerators/` | Incubator & accelerator records | Incubators & Accelerators Explorer | TBD |


