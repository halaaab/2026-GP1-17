<p align="center">
  <img src=".github/assets/banner.png" alt="Darb — Saudi Startup Feasibility & Risk Intelligence Platform" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-in%20development-E7B75F" alt="Status: in development">
  <img src="https://img.shields.io/badge/IT496-Graduation%20Project%202026-3FB8A6" alt="IT496 Graduation Project 2026">
  <img src="https://img.shields.io/badge/King%20Saud%20University-CCIS-0E2F3A" alt="King Saud University, CCIS">
</p>

# Darb (دَرب)

**An Agentic Platform for Evaluating Startup Ideas in Saudi Arabia**
King Saud University — College of Computer and Information Sciences, Department of Information Technology
IT 496 Graduation Project, First Semester 1448 H (Fall 2026) — Group 17

## Introduction

Saudi Arabia's Vision 2030 places startups at the center of economic diversification, yet founders judge new ideas from scattered, general information about competitors, survival and regulation, and often end up relying on assumptions rather than evidence.

**Darb** is a bilingual (Arabic and English) agentic AI web platform that helps Saudi founders evaluate a startup idea before launch, through one guided conversation covering competitors, survival potential and regulatory requirements. A supervised Survival Prediction Model, trained on Ministry of Commerce commercial registration records and enriched with GASTAT and SAMA indicators, produces the Founder Intelligence Score; the Competitor Agent finds the idea's competitors among verified Saudi startups and the web; and the Founder Roadmap Agent builds the steps to establish and launch the business from official Saudi sources.

**Coverage:** ventures across all economic activities in the national SSIC classification.

**Development:** Scrum over six sprints in two releases: Sprints 0–2 lead to Release 1, and Sprints 3–5 lead to Release 2.

## Main Features

| Feature | Description | Release |
|---|---|---|
| Landing page and bilingual interface | Introduces Darb; every page works in Arabic and English | 1 |
| Accounts | Sign-up with background questions, sign-in with email or Google, password reset, profile, account deletion | 1 |
| Saudi Startup Explorer | Browse Saudi startups and their details | 1 |
| Incubators & Accelerators Explorer | Browse startup support programs and their details | 1 |
| Regulatory & Licensing Explorer | Browse requirements, licenses, permits and authorities | 1 |
| Conversational Agent | The founder describes the idea in a conversation; the agent asks follow-up questions and delegates the analysis | 1 |
| Competitor Analysis | Competitors from Darb's verified Saudi startups and the web, each checked against the Ministry of Commerce's active registrations and labelled direct or indirect, with the Idea Similarity Score (ISS, 0–100), the market level, competitive opportunities and follow-up questions | 1 |
| Admin console | Admin sign-in with two-step verification, overview metrics, and management of startups, programs and regulatory requirements | 1 |
| Founder Intelligence Score (FIS) | A 0–100 score of the idea's one-year survival potential (lower, moderate or higher), from the Survival Prediction Model | 2 |
| Explainability | The factors behind each score, explained with SHAP | 2 |
| Saudi Market Insights | Monsha'at enterprise counts and size structure for the idea's sector | 2 |
| Personalized Founder Roadmap | Regulatory and practical launch steps, ordered so that prerequisites come first, as a list or a diagram | 2 |
| Support-program recommendations | Incubators and accelerators suited to the founder's venture | 2 |
| What-if analysis | A changed version of the idea, compared with the original | 2 |
| Idea & Assessment History | Revisit past ideas, conversations and results | 2 |
| Comprehensive Assessment Report | All results in one report, exportable as PDF | 2 |
| Founder and admin account management | Admins view, deactivate or delete founder accounts and view admin accounts | 2 |

## Architecture

Darb uses a **client–server architecture** with one client and two servers:

| Part | Responsibility |
|---|---|
| Darb Web Application | The founder workspace and the administrative console, in Arabic and English |
| Server 1: Agent Server (Mastra) | Hosted on Render. The **Conversational Agent** is the supervisor: it talks to the founder and delegates to the **Competitor Agent** (Release 1) and the **Founder Roadmap Agent** (Release 2). It also holds the Ministry of Commerce's active registrations, so the Competitor Agent can confirm a competitor is a registered business |
| ML Service (Python, FastAPI) | Part of Server 1: the Survival Prediction Model, which produces the Founder Intelligence Score, and its SHAP explanations. Only the Conversational Agent calls it. Implemented in Release 2 |
| Server 2: Supabase | Authentication (email and password, Google sign-in, two-step verification for administrators) and the PostgreSQL database, protected by Row Level Security |

Requests that only retrieve or store data, such as sign-in, the explorers, the profile, the history and the administration pages, go directly to Supabase. Chat messages go to the agent server, so the LLM is used only when reasoning is required. The client never calls the ML service, the OpenAI API or the Tavily Search API directly.

## Technologies Used

| Area | Technology |
|---|---|
| Programming languages | TypeScript (agent server); JavaScript, HTML and CSS (website); Python 3.13 (survival model); SQL (database) |
| Agent server | Mastra on Node.js 22 |
| LLM and embeddings | OpenAI gpt-4o-mini and text-embedding-3-small |
| Web search | Tavily Search and Extract, preferring Saudi sources and excluding sites that forbid automated access, sit behind a login or paywall, or only list other businesses |
| ML service | Python, FastAPI with Uvicorn; pandas, scikit-learn, LightGBM, XGBoost, SHAP |
| Database and authentication | Supabase: PostgreSQL with pgvector, Supabase Authentication, Google sign-in |
| Hosting | Render (website and agent server), Supabase cloud |
| Model development | Python, Google Colab, Google Drive |
| Tools | Visual Studio Code, GitHub, Jira, Confluence |

## Repository Structure

The folders follow the architecture above: one client, the agent server, the ML work and Supabase.

```
.
├── frontend/      # Client: the Darb web application (HTML, CSS, JavaScript) — see frontend/README.md
├── agent-server/  # Server 1: the agent server (Mastra, TypeScript), with the Conversational Agent
│                  #   and the Competitor Agent — see agent-server/README.md
├── ml/            # Survival Prediction Model: the MoC data preprocessing and EDA notebooks (Release 1);
│                  #   the ML service (Python, FastAPI) is added in Release 2 — see ml/README.md
├── backend/       # Server 2: Supabase — migrations, seed data and email templates — see backend/README.md
├── datasets/      # Where the data lives and the domain checks — see datasets/README.md
└── resources/     # Research paper links and data reviews
```

**Release 1** covers backlog items 1–38 and 40–42. Release 2 work that is in progress (the score, market insights, roadmap, report, history and what-if screens) is already in the website and is completed in Sprints 3–5. The admin founder and admin account pages are built and are tested and completed in Sprint 5.

## Getting Started

Each part of Darb runs on its own. Set them up in this order; the README file of each folder gives the details.

**You need:** Node.js 22.13 or newer, Python 3.13 (for the notebooks), Visual Studio Code with the Live Server extension, and a Supabase project.

1. **Database** (`backend/`)
   In the Supabase SQL Editor, run the files of `backend/supabase/migrations/` in the order of their numbers, then the files of `backend/supabase/seed/`. This creates the tables, their Row Level Security policies and the starting data.

2. **Agent server** (`agent-server/`, see [agent-server/README.md](agent-server/README.md))
   ```bash
   cd agent-server
   npm install
   cp .env.example .env
   npm run dev
   ```
   Fill in the keys in `.env` before starting (each key has a comment explaining it). Open http://localhost:4111 to see the agents in Mastra Studio.

3. **Website** (`frontend/`, see [frontend/README.md](frontend/README.md))
   Set the Supabase project address and publishable key in `frontend/shared/config.js`, then open `frontend/index.html` in Visual Studio Code with **Open with Live Server**.

4. **Model service** (Release 2): the ML service (Python, FastAPI) that serves the Survival Prediction Model is added in Release 2. Until it is connected, the agent server answers that the survival prediction is not available yet.

**Survival model data:** the notebooks in `ml/notebooks/` prepare the data of the survival prediction model; [ml/README.md](ml/README.md) explains how to run them. Because of their size, the raw datasets are kept in the project's Google Drive folder, [Darb DataSets](https://drive.google.com/drive/folders/1Y_TN68LIO1xkOmbi0Y8auEvB09Mh_1gc?usp=sharing). See [datasets/README.md](datasets/README.md) for what each file is.

## Documentation

The project reports are submitted to the course separately and are not stored in this repository.

| Document | Location |
|---|---|
| Datasets | [`datasets/README.md`](datasets/README.md) |
| Research papers | [`resources/papers/`](resources/papers/) |

## Team

| Role | Name |
|---|---|
| Supervisor | Dr. Luluh AlDubaie |
| Team members | Hala Alsabbar · Jana Alshghatrh · Ghadah Alhamdan · Sara Alakil |

See [AUTHORS](AUTHORS).
