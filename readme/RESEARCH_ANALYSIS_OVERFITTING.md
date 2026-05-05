# 🧪 AI RAG Tuning & Overfitting Prevention: A Roundtable Discussion

**Date:** 2026-01-12  
**Topic:** Critical Analysis of RAG Pipeline Configuration to Prevent Hallucinations and Overfitting  
**Participants:** 10 AI Researchers & Engineers

---

**1. Dr. Aris (Lead Architect):**  
"Alright team, the user wants to know exactly what knobs we turned. We've just disabled the 'Query Rewriter' (Smart Context). Why? Because it was overfitting to the *conversation history* rather than the *current intent*. It was hallucinating context that wasn't there."

**2. Sarah (Data Scientist - Retrieval):**  
"Agreed. But the biggest 'anti-overfitting' move was in the **Hybrid Search Weighting**. We found the Vector Search (Semantic) was getting too creative, returning 'related' concepts when the user wanted specific terms like 'VHQ'.
*   **Adjustment:** We boosted **Exact Keyword Match Score** to `0.75` (Base).
*   **Result:** It acts like a regular search engine first, AI second. This prevents the 'Semantic Drift' overfitting."

**3. Kenji (LLM Engineer):**  
"Let's talk **Temperature**. We locked the Chat Model (Qwen2.5) to `0.5` and the Intent Model (when it was active) to `0.3`.
*   **Reasoning:** High temperature (`0.8+`) makes the model 'creative', which is just a nice word for overfitting to noise. Lowering it forces it to stick to the provided context."

**4. Dr. Ivanov (Context Specialist):**  
"The **Context Window** was a major bottleneck. We were trying to shove 15+ documents into a small model. That causes 'Lost-in-the-Middle' phenomenon.
*   **Optimization:** We implemented a hard slice: `filteredText.slice(0, 7)`.
*   **Trimming:** We cut each document chunk to `1500 chars`.
*   **Why:** Providing *fewer* but *higher quality* tokens prevents the model from getting confused by irrelevant noise."

**5. Lisa (Visual AI Researcher):**  
"Don't forget the **Image Search Overhaul**. It was overfitting to common stop words like 'what' and 'is'.
*   **Fix:** We added a `Stop Word Filter` (removing 'the', 'is', 'at').
*   **Score Penalty:** We lowered Image Similarity to `0.65` so text evidence always wins unless the image description is a perfect match."

**6. Raj (Backend Engineer):**  
"I disabled the **LLM Reranker** entirely.
*   **Controversial opinion:** Small LLMs (0.5B - 7B) aren't smart enough to judge relevance effectively. They were overfitting to 'fluent' sentences and discarding 'technical' specs like database schemas.
*   **Solution:** Validated math (Scoring) > Stupid AI judgement. We trust the raw scores now."

**7. Emily (UX Designer):**  
"By removing the 'Smart Context' UI, we also reduced **Cognitive Overload**. The user input is now 'What You See Is What You Get'. No hidden rewriting means predictable behavior. Predictability is the opposite of overfitting."

**8. Chen (Database Admin):**  
"We also added `pg_trgm` (Trigram) for fuzzy matching project names.
*   **Logic:** This isn't strictly 'AI', but it prevents the system from being *too rigid* (Underfitting). If a user types 'SCB' vs 'scb', the trigram index bridges that gap without needing an LLM to guess."

**9. Marcus (QA Lead):**  
"Testing showed that **Project Filtering** was a double-edged sword.
*   **The Change:** We defaulted the filter to `{}` (Empty/Global Search).
*   **Why:** The AI was aggressively overfitting 'Login Error' to mean 'The Login Project' instead of 'A login error in ANY project'. Opening the filter removed this bias."

**10. Dr. Aris (Closing):**  
"Summary for the User:
1.  **Rewriter Disabled:** Raw Input = True Intent.
2.  **Keyword Boost (0.75):** Facts > Vague Concepts.
3.  **Context Slicing (Top 7):** Less Noise > More Signal.
4.  **Stop Words:** Removing grammatical noise.
5.  **Reranker Bypass:** Trusting the database math over the AI's opinion.

This configuration gives us a **Robust, Low-Latency, Deterministic RAG System**. Class dismissed."
