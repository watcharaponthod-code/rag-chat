# 🧪 AI Research Roundtable: Path to >90% RAG Accuracy

**Subject:** Strategic Planning for "Overfitting Prevention & Retrieval Optimization"
**Date:** 2026-01-12
**Participants:** 10 AI Researchers & Engineers

---

## 🟢 Session 1: Problem Identification (Why are we stuck at ~67%?)

**Dr. Aris (Lead):** "Everyone, thank you for joining. Our objective is clear: The AI needs to answer questions with accuracy greater than 90%. Currently, our benchmarks show we are around 67-83%. We fail specifically when filtering by Project (e.g., searching for 'issues' in 'CVX'). Why?"

**Sarah (Retrieval):** "The core issue isn't the AI model itself, it's the **Retrieval Logic**. We hardcoded `0.3` for fuzzy matching, then `0.5`. We are guessing numbers. When we search for 'CVX' in the 'CVX - LG' project, the exact match fails, and the fuzzy match is inconsistent."

**Ken (Data):** "I checked the data. The metadata in `mantis_embeddings` and `documents` is messy. Some projects are named 'Chevron', some 'CVX', some 'CVX - LG'. Code-level fuzzy matching is a band-aid. We need strict metadata, or very smart filtering."

**Tanya (QA):** "The benchmarks we ran (`benchmark_v2.js`) were 'Unit Tests' for retrieval. They checked *'Did we find the doc?'*. They didn't checks *'Did the AI answer correctly?'*. The user wants **End-to-End** testing. Does the final JSON response contain the right answer?"

**Prof. David (Security):** "And while tuning for recall, we broke isolation. We accidentally allowed 'Cross-Project Leakage' in previous tests. We need a `Config File` that acts as a 'Policy Engine' to enforce strict thresholds."

---

## 🔵 Session 2: The "Config-Driven" Architecture Proposal

**James (Backend):** "I propose we stop editing `retrievalService.js` directly for every experiment. It's dangerous and messy. We need to abstract **all** hyperparameters."

**Mike (DevOps):** "Agreed. I will design a `rag.config.json` (or `.js`) that Hot-Reloads. It should contain:
1.  `text_weight` vs `vector_weight` (Hybrid Search Balance)
2.  `fuzzy_threshold` (Project Name Matching Strictness)
3.  `similarity_cutoff` (Minimum score to be considered 'relevant')
4.  `context_window_size` (How many docs we feed the LLM)"

**Dr. Emily (Prompt):** "Don't forget the **Prompt**. Even if retrieval works, if the context is too large (15 chunks), the model gets 'lost in the middle'. We need to configure `max_chunks` dynamically."

---

## 🟡 Session 3: The Research Methodology (The Loop)

**Dr. Aris:** "Good. Here is our research cycle. We will not commit code until it passes this loop:"

1.  **Hypothesis:** E.g. *"Increasing Keyword Weight from 0.7 to 0.9 will fix the 'issue' query miss."*
2.  **Config Change:** Edit `ragConfig.js` ONLY.
3.  **Automated Lab Test:** Run a new `lab_bench.js` that:
    *   Simulates a user request to the **real AI Controller** (`chat.controller.js`).
    *   Captures the **Final Output** (not just DB rows).
    *   Uses an **Evaluator LLM** (or strict keyword check) to grade the answer.
4.  **Analysis:** If Accuracy < 90%, analyze logs. Was it Retrieval Miss? Or Generation Hallucination?
5.  **Commit:** Only when the config proves stable.

---

## 🔴 Session 4: Detailed Action Plan

**Victor (Vision):** "Don't ignore images. 'VHQ' queries need images. My limit is currently hardcoded to 10. This needs to be in the config too."

**Lisa (UX):** "Speed matters. If we use a complex `DeepSeek-R1` for evaluation, the tests will be slow. For the 'Lab Test', can we use a faster model or just check retrieval presence first?"

**Dr. Aris:** "We will do a **Two-Stage Benchmark**:
1.  **Stage A (Retrieval Check):** Fast. Does the right doc appear in Top 5? (Target: 95% Recall)
2.  **Stage B (Generation Check):** Slower. Send to LLM. Does the answer make sense? (Target: 90% Accuracy)"

---

## ✅ Final Consensus: The "Research Kit"

We need to build these tools before we touch the main code again:

1.  **`server/config/rag.config.js`**: The Central Brain.
2.  **`tests/lab_dataset.json`**: The "Golden Standard" (Real questions, Real Expected Docs).
3.  **`tests/run_lab.js`**: The Research Runner. It must:
    *   Load Config.
    *   Run searches.
    *   **Call the actual `chat` API** (mocking the HTTP request).
    *   Generate a Report Card.

**Signed,**
*The AI Research Team*
