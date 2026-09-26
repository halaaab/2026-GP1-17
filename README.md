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

**Goal:** Darb helps Saudi founders evaluate startup ideas and navigate early-stage decisions by turning fragmented business data into structured, evidence-based decision support. Through a conversational assessment in Arabic or English, a founder describes an idea and receives a Founder Intelligence Score, an explanation of what drives it, comparable Saudi ventures, relevant market indicators, and a personalized regulatory roadmap.

**Target sectors:** AI & Software · Food & Beverages · Fashion · Furniture

## Main Features

| Feature | Description |
|---|---|
| Conversational Assessment | The founder describes the idea to an LLM-powered agent, which asks for any missing information |
| FIS & Analysis | Founder Intelligence Score (0–100) with survival potential, risk level, sector viability, and key factors |
| Similar Startup Recommendations | Comparable Saudi ventures retrieved by semantic similarity |
| Saudi Market Insights | Monsha'at Business Atlas indicators for the matched economic activity |
| Personalized Founder Roadmap | Applicable regulatory requirements, sequenced by dependency and shown as a visual roadmap |
| Saudi Startup Landscape Explorer | Browse Saudi startups and their details |
| Incubators & Accelerators Explorer | Browse startup support programs |
| Regulatory & Licensing Explorer | Browse requirements, licenses, permits, and authorities |
| Idea & Assessment History | Revisit past ideas, conversations, results, and roadmaps |
| Comprehensive Assessment Report | All results in one report, exportable as PDF |

## Architecture

Darb uses a **client–server architecture with a layered server design**:

| Layer | Responsibility |
|---|---|
| Client | Next.js web application (Arabic & English); admin console in English |
| Application layer | Authentication, role-based access control, request routing |
| Agent layer | Mastra.ai, supervisor pattern: the **Conversational Agent** orchestrates and delegates to the **Founder Roadmap Agent** |
| Service layer | Survival Prediction Model, Explainability Engine (XAI), Idea Similarity Engine, market-indicator retrieval, regulatory retrieval, requirement sequencing, roadmap visualization |
| Data layer | Application data, Saudi startup corpus with embeddings, incubators & accelerators, Monsha'at indicators, regulatory knowledge base |

Only assessment and roadmap generation use LLM reasoning; explorers, history, reports, and admin operations go straight to the service layer.

## Technologies Used

| Area | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Agent layer | Mastra.ai, TypeScript |
| LLM | OpenAI API |
| ML / AI services | Python, FastAPI |
| Database & vector storage | Supabase |
| Model development | Python, Google Colab |
| Tools | Visual Studio Code, GitHub, Jira, Canva |

## Repository Structure

```
.
├── frontend/     # Next.js web application
├── backend/      # Mastra agents + FastAPI ML/AI services
├── datasets/     # Data layer — see datasets/README.md
└── resources/    # Research papers + project docs (proposal, sprint reports & diagrams)
```

## Documentation

| Document | Location |
|---|---|
| Proposal | [`resources/docs/proposal/`](resources/docs/proposal/) |
| Sprint 0 report & design diagrams | [`resources/docs/sprint-0/`](resources/docs/sprint-0/) |
| Sprint 1–5 reports | [`sprint-1/`](resources/docs/sprint-1/) · [`sprint-2/`](resources/docs/sprint-2/) · [`sprint-3/`](resources/docs/sprint-3/) · [`sprint-4/`](resources/docs/sprint-4/) · [`sprint-5/`](resources/docs/sprint-5/) |
| Datasets | [`datasets/README.md`](datasets/README.md) |
| Research papers | [`resources/papers/`](resources/papers/) |

## Team

| Role | Name |
|---|---|
| Product Owner & Scrum Master | Dr. Luluh AlDubaie |
| Developers | Hala AlSabbar · Jana Alshghatrh · Ghadah Alhamdan · Sara Alakil |

See [AUTHORS](AUTHORS).
