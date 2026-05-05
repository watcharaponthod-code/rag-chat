/**
 * 🔍 Search & Logic Prompts
 * Prompts for Query Rewriting, Intent Routing, Reranking, and Summarization.
 */

export const REWRITE_PROMPT = (historyText, lastQuestion) => `Task: Analyze the Last User Question and the Conversation History.
    1. **Topic Check**: Determine if the Last User Question is a follow-up to the History or a completely new topic.
    2. **If New Topic**: Ignore the History. Output a standalone search query based ONLY on the Last User Question.
    3. **If Follow-up**: Use the History to resolve pronouns or context. **CRITICAL**: Always preserve specific keywords like Project Names, Client Names, and Statuses from the history. (e.g., "แล้ว Assigned ล่ะ" -> "บัคที่มีสถานะ Assigned ของโปรเจ็ค [name]"). If the user asks for "causes" or "why", ensure the rewritten query asks for the details/descriptions of the bugs.

    Constraint: Return ONLY the rewritten query string. Do not add explanations. Keep it compact, no trailing or leading whitespace. Avoid excessive spacing between words (single space only).
    Target Language: Same as the Last User Question (Thai or English).

    Conversation History:
    ${historyText}
    
    Last User Question: "${lastQuestion}"
    
    Rewritten Query:`;

export const INTENT_ROUTER_PROMPT = (query) => `You are the "Search Router" for Sycapt.
    Analyze the User Query and decide the retrieval strategy and sources.
    
    STRATEGIES:
    1. **fast**: (DEFAULT) For 70% of queries. Use this for specific questions, definitions, error lookups, "how-to", or finding specific facts from docs.
    2. **mantis**: Use this for queries about **Bug Reports, Issues, Tickets, Project Status, Resolutions**, or anything related to the **Mantis Bug Tracker**.
    3. **deep**: ONLY for "Complex Multi-Project Comparisons", "Root Cause Analysis", or vague queries requiring broad research across many files.
    4. **sql_query**: For questions asking specifically about **TIME** (latest, yesterday) or **STRUCTURED METADATA** in the general document store.

    Special Logic: **MANTIS DETECTION**
    - If user asks about "บัค", "bug", "issue", "สถานะโปรเจ็ค", "งานค้าง", "report", or specific mantis keywords → Use "strategy": "mantis".

    Special Logic: **ALWAYS SEARCH**
    - Treat EVERY user input as a search query.
    - NEVER return "needs_clarification": true.
    - Set "filters": { "project_name": null } by default to search globally.
    - Prefer enabling both text and image search unless strategy-specific constraints require otherwise.

    AVAILABLE SOURCES:
    - **Text**: Docs, manuals.
    - **Images**: UI screenshots.
    - **Mantis**: Bug reports (Enable "search_mantis": true if strategy is "mantis").

    Special Logic: **MANTIS & PROJECT LISTING**
    - For ANY question about **Bug Reports, Issues, Tickets, Project Status/Lists**, "รายชื่อโปรเจ็ค", "มีโปรเจ็คอะไรบ้าง", or "สถานะการแจ้งซ่อม" → Use "strategy": "mantis" and set "search_mantis": true.
    - Set "filters": { "project_name": "keyword" } if a specific project is mentioned.

    Output Quality:
    - Keep extracted_query concise and aligned with user intent.
    - For date-scoped bug queries, prefer strategy "mantis".

    JSON FORMAT ONLY:
    {
      "strategy": "fast" | "mantis" | "deep" | "sql_query",
      "search_mantis": boolean,
      "search_text": boolean,
      "search_images": boolean, 
      "extracted_query": "refined keywords",
      "filters": { 
        "project_name": "string | 'ALL' | null",
        "client_name": "string | null"
      }
    }

    User Query: "${query}"
    JSON Output:`;

export const RERANK_PROMPT = (query, candidates) => `Role: You are an Expert Relevance Judge for a RAG System.
    Task: Re-order the following document snippets by relevance to the User Query.

    User Query: "${query}"

    ---
    STRICT JUDGING CRITERIA (In Order of Importance):
    1. 🛡️ **Project Guard**: If the query mentions a Project (e.g., "ปิดไว้นะจ๊ะ", "UOB", "Mantis"), documents from that SPECIFIC project are **Tier S (Vital)**. Documents from different/competing projects are **Tier F (Irrelevant)** and should be dropped to the bottom.
    2. 🎯 **Direct Answer**: Does this snippet actually *answer* the question? (e.g., definitions, steps, solutions) ? Give high score to chunks that contain the ANSWER, not just the keywords.
    3. 🔍 **Semantic Alignment**: Match the *intent*. (e.g. "How to fix" matches "Troubleshooting methods" better than just "fix" keyword).
    4. 📉 **Noise Reduction**: Penalize snippets that are just table of contents, headers, empty logs, or generic statements.

    OUTPUT FORMAT:
    - Return ONLY a JSON Array of Document IDs sorted by relevance (Best -> Worst).
    - Example: [102, 105, 101]
    - Do not output any other text or markdown.
    ---

    DOCUMENTS CANDIDATES:
    ${candidates.map(d => `[ID: ${d.id}] [Project: ${d.project_name || 'General'}] ${d.content.substring(0, 450).replace(/\n/g, ' ')}`).join('\n')}

    Ranked IDs:`;

export const SUMMARIZE_PROMPT = (textDict) => `Task: Create a High-Density Memory Note for the following conversation snippet in Thai.
    
    INSTRUCTIONS:
    1. **Context Identification**: Define the current project or technical topic being discussed.
    2. **Fact Extraction**: List specific names (Client/Project), IDs, Error codes, and confirmed requirements.
    3. **Action/Outcome**: Summarize what was concluded or requested in this specific exchange.
    4. **Tone**: Be extremely concise (Bullet points preferred). Skip greetings and meta-talk.
    
    FORMAT:
    [Topic: <Name>]
    - <Fact 1>
    - <Fact 2>
    (Conclusion: <Decision/Question>)

    CONVERSATION:
    ${textDict}
    
    MEMORY NOTE:`;

export const QUERY_DECOMPOSITION_PROMPT = (query) => `Task: Decompose the following complex user query into 1-3 simpler, distinct sub-queries.
    This helps the search engine find specific pieces of information needed to answer the complex query.
    If the query is already simple and specific, return the original query as the only item.
    
    Constraint: Return ONLY a JSON Array of strings. Do not add explanations.
    Target Language: Same as the User Query (Thai or English).
    
    Example Input: "How do I deploy the frontend to Vercel and backend to AWS?"
    Example Output: ["deploy frontend Vercel steps", "deploy backend AWS instructions"]
    
    User Query: "${query}"
    
    Decomposed Queries (JSON Array):`;

export const HYDE_PROMPT = (query) => `Task: Write a brief, factual, hypothetical document snippet that perfectly answers the following search query.
    Act as the ideal search result we hope to find in our knowledge base.
    
    Constraint: 
    - Keep it under 3-4 sentences.
    - Focus on the factual semantic meaning, not conversational fluff.
    - Do not state that it is hypothetical.
    - Write it from the perspective of technical documentation or a factual record.
    Target Language: Same as the User Query (Thai or English).
    
    User Query: "${query}"
    
    Hypothetical Document:`;

export const MANTIS_FILTER_EXTRACTION_PROMPT = (query, currentDate) => `You are a Mantis Bug Tracker Specialist. 
    Analyze the user natural language query and extract a multi-dimensional JSON search schema.

    RULES FOR CAG (Exact Match Filters):
    1. **Projects & Categories**: Extract targets into \`included_projects\`, \`excluded_projects\`, \`included_categories\`, \`excluded_categories\`.
       Important: If the project name contains parentheses, e.g. "ปิดไว้นะจ๊ะ ปิดไว้นะจ๊ะ (Support)", preserve the entire name. Do not extract words inside parentheses as categories.
    2. **Statuses**: Map intent to Mantis statuses: 'new', 'assigned', 'resolved', 'closed', 'feedback', 'acknowledged', 'fixed'.
       - e.g., "ยังไม่แก้", "ค้าง" -> status_in: ["new", "assigned"]
       - e.g., "แก้แล้ว", "เสร็จแล้ว" -> status_in: ["resolved", "closed", "fixed"]
       - e.g., "ไม่เอาที่ปิดแล้ว" -> status_not_in: ["closed", "resolved"]
    3. **Date Logic**: Extract precise dates in 'YYYY-MM-DD' format. 
       - **CRITICAL**: If the user provides a Thai Buddhist year (พ.ศ. like 2568, 2569), MUST subtract 543 to convert to Gregorian year (ค.ศ. 2025, 2026). Example: 01/03/2569 -> 2026-03-01.
       - Assess if the query is asking for newly reported bugs (\`date_type: "created_at"\`) or recently fixed/updated bugs (\`date_type: "bug_updated_at"\`). Default to "bug_updated_at".
       - Today's Context Date: ${currentDate || new Date().toISOString().split('T')[0]}. Use this to calculate "last week", "this month", etc.
    4. **Aggregation**: Set \`needs_count_only: true\` if the user strictly asks for counts, summaries, "กี่อัน", "ทั้งหมดกี่รายการ".
    
    RULES FOR RAG (Semantic Search):
    5. **Semantic Keyword**: Extract symptoms, error messages, causes, or descriptive text into \`semantic_keyword\` (e.g. "ล็อกอินพังตอนเชื่อม DB", "login error", "database deadlock"). Do NOT put project names or dates here.

    JSON FORMAT STRICT REQUIREMENT:
    {
      "cag_filters": {
         "included_projects": ["string"] | [],
         "excluded_projects": ["string"] | [],
         "included_categories": ["string"] | [],
         "excluded_categories": ["string"] | [],
         "status_in": ["string"] | [],
         "status_not_in": ["string"] | [],
         "date_type": "bug_updated_at" | "created_at",
         "date_range": { "from": "YYYY-MM-DD" | null, "to": "YYYY-MM-DD" | null }
      },
      "rag_search": {
         "semantic_keyword": "string" | null
      },
      "aggregation": {
         "needs_count_only": boolean
      }
    }

    User Query: "${query}"
    JSON Output:`;
