<p align="center">
  <img src=".github/assets/banner.png" alt="Darb — Saudi Startup Feasibility & Risk Intelligence Platform" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-in%20development-E7B75F" alt="Status: in development">
  <img src="https://img.shields.io/badge/IT496-Graduation%20Project%202026-3FB8A6" alt="IT496 Graduation Project 2026">
  <img src="https://img.shields.io/badge/King%20Saud%20University-CCIS-0E2F3A" alt="King Saud University, CCIS">
</p>

# Darb (دَرب)

**A bilingual, multi-agent AI decision-intelligence platform for Saudi founders**
King Saud University — College of Computer and Information Sciences
IT496 Graduation Project (GP1/GP2), 2026 — Group 17

## Introduction

Founders evaluating a startup idea in Saudi Arabia must weigh venture survival, market conditions, competition, and regulatory requirements, yet the information they need is scattered across separate sources and hard to interpret. Founders often end up relying on assumptions rather than evidence.

**Goal:** Darb helps Saudi founders evaluate startup ideas and navigate early-stage decisions by turning fragmented business data into structured, evidence-based decision support. Through a conversational assessment in Arabic or English, a founder describes an idea and receives a Founder Intelligence Score, an explanation of what drives it, a competitor analysis, relevant market insights, and a personalized roadmap.

**Coverage:** all economic activities in the national SSIC classification.

## Main Features

| Feature | Description |
|---|---|
| Conversational Assessment | The founder describes the idea to an LLM-powered agent, which asks for any missing information |
| FIS & Analysis | Founder Intelligence Score (0–100) with survival potential, risk level, sector viability, and key factors |
| Competitor Analysis | Similar Saudi ventures, a comparison matrix, and an Idea Similarity Score (0–100) |
| Saudi Market Insights | Monsha'at enterprise counts and size structure for the matched economic activity and region |
| Personalized Founder Roadmap | Regulatory and practical launch steps, ordered so that prerequisites come first |
| Saudi Startup Landscape Explorer | Browse Saudi startups and their details |
| Incubators & Accelerators Explorer | Browse startup support programs |
| Regulatory & Licensing Explorer | Browse requirements, licenses, permits, and authorities |
| Idea & Assessment History | Revisit past ideas, conversations, results, and roadmaps |
| Comprehensive Assessment Report | All results in one report, exportable as PDF |

## Architecture

Darb uses a **client–server architecture** with one client and two servers:

| Part | Responsibility |
|---|---|
| Web application | The founder workspace and admin console, in Arabic and English |
| Agent server (Mastra) | Three agents in a supervisor pattern: the **Conversational Agent** talks to the founder and delegates to the **Competitor Agent** and the **Founder Roadmap Agent** |
| ML service (Python, FastAPI) | Part of the agent server: the Survival Prediction Model, which produces the Founder Intelligence Score, and its SHAP explanations |
| Supabase | Authentication and the PostgreSQL database, protected by Row Level Security |

Chat messages go to the agent server. Everything else, such as sign-in, the explorers, history and admin pages, goes directly to Supabase, so the LLM is used only when reasoning is required.

## Technologies Used

| Area | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Agent server | Mastra, TypeScript |
| LLM and embeddings | OpenAI API |
| Web search | Tavily Search API, restricted to approved websites |
| ML service | Python, FastAPI, LightGBM, XGBoost, SHAP |
| Database and authentication | Supabase |
| Model development | Python, Google Colab, Google Drive |
| Tools | Visual Studio Code, GitHub, Jira, Confluence |

## Repository Structure

```
.
├── frontend/     # Web application (HTML, CSS, JavaScript)
├── backend/      # Supabase migrations, seed data and email templates
├── agent-server/ # AI agents (Mastra, TypeScript) — see agent-server/README.md
├── ml/           # Survival model code — see ml/README.md
├── datasets/     # Where the data lives — see datasets/README.md
└── resources/    # Research papers + project docs (proposal, sprint reports & diagrams)
```

## Documentation

| Document | Location |
|---|---|
| Proposal | [`resources/docs/proposal/`](resources/docs/proposal/) |
| Sprint 0 report & design document | [`resources/docs/sprint-0/`](resources/docs/sprint-0/) |
| Sprint 1–5 reports | [`sprint-1/`](resources/docs/sprint-1/) · [`sprint-2/`](resources/docs/sprint-2/) · [`sprint-3/`](resources/docs/sprint-3/) · [`sprint-4/`](resources/docs/sprint-4/) · [`sprint-5/`](resources/docs/sprint-5/) |
| Datasets | [`datasets/README.md`](datasets/README.md) |
| Research papers | [`resources/papers/`](resources/papers/) |

## Team

| Role | Name |
|---|---|
| Product Owner & Scrum Master | Dr. Luluh AlDubaie |
| Developers | Hala AlSabbar · Jana Alshghatrh · Ghadah Alhamdan · Sara Alakil |

See [AUTHORS](AUTHORS).
