# ⚔️ Research Debate: The "Keyword vs. Natural Language" Paradox

**Topic:** Why does "vhq" work, but "what is vhq" fail?
**Objective:** Identify the root cause of retrieval failure for natural language queries and propose a robust fix.

---

## 🎭 The Panel

### 🟢 Researcher A: Dr. Vector (The Semantic Purist)
*   **Stance:** "This is an **Embedding/Chunking Issue**. Modern embeddings like `bge-m3` are trained to understand questions. 'What is VHQ' should match 'VHQ System Overview' perfectly in vector space. If it fails, our data chunks are likely too small, context-less, or the vector search is being drowned out by bad keyword logic."
*   **Hypothesis:** The explicit questions ("What is...") drift away from the declarative headers in the documents in vector space.

### 🔴 Researcher B: Engineer Sarah (The Pragmatic Engineer)
*   **Stance:** "It's a **Noise & Pipeline Issue**. 'What', 'is', 'the' are noise. If our Hybrid Search gives too much weight to exact keywords, the presence of 'what' and 'is' (if not filtered) dilutes the score. OR, the **Query Rewriter** is hallucinating a different intent for the longer sentence."
*   **Hypothesis:** The system is over-engineering. It tries to "rewrite" a simple question into something complex, or the Keyword Search part of Hybrid Search is failing to extract the core entity "VHQ".

---

## 🗣️ The Argument

**Dr. Vector:** "Look, if the user types 'vhq', the vector matches the exact term. When they type 'what is vhq', the vector shifts. The distance usually increases. But it shouldn't increase *that* much. Are we using **Cosine Similarity** correctly? Or is the `hybridBoost` penalizing the vector result because 'what' doesn't appear in the document?"

**Sarah:** "I bet it's the **Hybrid Fusion**.
1.  **Scene:** User types 'what is vhq'.
2.  **Vector Search:** Finds 'VHQ Manual' (Score 0.75).
3.  **Keyword Search:** Looks for 'what' & 'is' & 'vhq'.
    *   If 'what' and 'is' are Common Stop Words but NOT removed, the FTS (Full Text Search) rank drops because the document *doesn't* contain them frequent enough.
    *   This pulls down the *Fused Score*."

**Dr. Vector:** "Good point. Also, checking the **Query Rewriter**. Does it turn 'what is vhq' into some weird Thai translation or a different intent because of the history?"

---

## 📝 The Investigation Plan (Agreed Strategy)

1.  **Step 1: The "Black Box" Test (Debug Script)**
    *   Run `rewriteQuery('what is vhq')` -> See output.
    *   Run `hybridSearch('vhq')` vs `hybridSearch('what is vhq')`.
    *   Compare:
        *   Vector Scores (Is the drift huge?)
        *   Keyword Scores (Is 'what is' dragging it down?)
        *   Final Fused Scores.

2.  **Step 2: The Logic Audits**
    *   **Stop Word List:** verify if 'what', 'is' are stripped in `retrievalService.js`.
    *   **Rewriter:** Ensure it doesn't over-process short definitions.

3.  **Step 3: The Fix**
    *   If **Rewriter** fault -> Tweak Prompt ("Keep simple definitions simple").
    *   If **Stop Words** fault -> Implement strictly robust entity extraction (Extract "VHQ" from "What is VHQ").

**Next Action:** Execute Step 1 (Write `tests/debug_vhq_mismatch.js`).
