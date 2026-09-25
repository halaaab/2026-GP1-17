# Datasets (Data Layer)

Darb uses several datasets across the system. Each gets its own folder here, organized by what it powers.

| Folder | Dataset | Used by | Sources |
|---|---|---|---|
| `survival-model/` | Historical startup outcomes | Feasibility model | TBD |
| `regulatory-requirements/` | Saudi Regulatory Master Dataset | Founder Roadmap Agent | Team-built |
| `idea-similarity/` | Startup profiles for similarity search | Idea similarity engine | TBD |
| `incubators-accelerators/` | Saudi incubators & accelerators | Incubators & Accelerators Explorer | TBD |
| `market-indicators/` | Monsha'at Business Atlas indicators | Market insights | Monsha'at |

## Rules
1. **One folder per dataset**, each with a README: purpose, what uses it, source, license.
2. **`survival-model/` has `raw/` and `processed/`** because it goes through a cleaning pipeline before training. Raw files are never edited and are not committed (licensing and GitHub's 100 MB file limit).
3. **The other datasets are stored directly in their folder.**
4. **Private partner data is never committed**, even processed.
