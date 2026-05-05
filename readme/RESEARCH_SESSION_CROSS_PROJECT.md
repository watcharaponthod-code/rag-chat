# 🚨 Emergency Research Session: Cross-Project Contamination ("VHQ" vs "MABOS")

**Subject:** Fixing Hallucination and Improving FTS Coverage
**Date:** 2026-01-12
**Status:** CRITICAL

---

## 🟢 1. Problem Analysis

**Dr. Aris:** "The user searched for 'VHQ'. The document for VHQ might not explicitly define 'What is VHQ', BUT the system returned 'MABOS' documents instead. This is unacceptable. It's better to say 'I don't know' than to lie."

**Sarah (Retrieval):** "This happened because of **Vector Drift**. If VHQ docs are scarce or low-quality, the vector search found the 'next closest thing' (MABOS), maybe because MABOS docs mention similar tech stacks (API, Login, etc.)."

**Prof. David (Security):** "Our isolation logic `projectFuzzyThreshold` works IF the user specifies a project. But 'VHQ' is just a keyword in the query, NOT a filter. We need **Implicit Project Detection**."

**Ken (Data):** "Also, the user mentioned `fts` (Full Text Search) needs improvement. Currently, our `fts` column might be just raw text. If 'VHQ' appears only once in a 20-page PDF, FTS rank is low. We need to weight the **Title** and **Metadata** higher in FTS."

---

## 🔵 2. Solution Strategy

**Dr. Emily (Prompt):** "If the retrieval returns MABOS documents for a VHQ query, the LLM should refuse to answer. We need a **Critical Check** in the System Prompt: _'If `query` mentions Project A, but `context` is Project B, DO NOT USE IT.'_"

**James (Backend):** "We can also force strictness in `retrievalService`.

1.  **Implicit Project Filter:** If query contains a known project name (e.g., 'VHQ'), automatically apply `filters.project_name = 'VHQ'`."
2.  **FTS Boost:** Update the SQL to concatenate `document_name` and `metadata` into the `fts` Vector with higher weight (using `setweight`)."

**Tanya (QA):** "We need a new Test Case:

- **Q:** 'VHQ'
- **Expected:** Documents MUST contain 'VHQ'.
- **Forbidden:** Documents containing 'MABOS' (unless VHQ mentions MABOS)."

---

## 🟡 3. Action Plan (The Fix)

### Step A: Data Engineering (Ken & James)

- **Action:** Modify the `document_chunks` table or the query to ensure `document_name` and `project_name` are heavily indexed in FTS.
- **Code:** `ts_rank_cd(setweight(to_tsvector(title), 'A') || setweight(to_tsvector(content), 'B'), ...)`

### Step B: Logic Refinement (Sarah)

- **Action:** Implement **"Project Auto-Detection"** in `unifiedSearch`.
- **Logic:**
  ```javascript
  const knownProjects = ["VHQ", "MABOS", "CVX", "ปิดไว้นะจ๊ะ"];
  const detectedProject = knownProjects.find((p) =>
    query.toUpperCase().includes(p),
  );
  if (detectedProject && !filters.project_name) {
    filters.project_name = detectedProject; // Auto-scope!
  }
  ```

### Step C: Test Suite Update (Tanya)

- **Action:** Add the "VHQ vs MABOS" negative test to `lab_dataset.json`.

---

## ✅ Voting

- **Auto-Scope Project:** [APPROVED 10/10]
- **FTS Weight Tuning:** [APPROVED 10/10]

**Signed,**
_The AI Research Team_
