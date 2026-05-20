# CookSmart – AI-Powered African Recipe Recommendation

**Live demo:** [https://cooksmart-seven.vercel.app](https://cooksmart-seven.vercel.app)

## Problem

Mainstream recipe platforms are Western-biased and fail for African dishes (e.g., *luwombo*, *matoke*). No open, structured dataset exists for African cuisine.

## Solution

CookSmart is a production LLM‑augmented recommendation system for African recipes.  
It combines a **curated structured dataset** + **retrieval** + **LLM reasoning** (LLaMA 3.1).

## System Architecture

| Layer          | Technology |
|----------------|-------------|
| Frontend       | React       |
| Backend API    | Python (Flask) |
| Database       | PostgreSQL  |
| LLM inference  | LLaMA 3.1 (Groq) |
| Prompt refinement | Claude |

**Flow:**  
`User query → Retrieval (PostgreSQL) → Prompt engineering → LLaMA 3.1 → Claude-assisted formatting → Response`

## Dataset (critical contribution)

- **71 structured African recipes** – manually curated
- No existing clean dataset → built from aggregation + normalization
- Unified schema: ingredients, steps, measurements

## Key Engineering Trade‑offs

| Challenge | Decision | Rationale |
|-----------|----------|-----------|
| No dataset | Manual curation | Most time‑intensive, but unavoidable |
| Custom model vs. LLM | LLM‑augmented (no training) | Compute constraints + faster iteration |
| Prompt unreliability | Claude‑assisted prompt layer | Consistency + cultural relevance |

## Outcome

- **3 months**, team of 5 → production system
- Working architecture: domain dataset + retrieval + LLM reasoning + lightweight full‑stack

---

## Run locally (optional)
bash
# backend
cd backend
pip install -r requirements.txt
python app.py

# frontend
cd frontend
npm install
npm start

## Repo structure

/
├── backend/       # Flask API + PostgreSQL client
├── frontend/      # React app
├── data/          # Curated recipe dataset (JSON/CSV)
└── prompts/       # Prompt templates + Claude refinement


