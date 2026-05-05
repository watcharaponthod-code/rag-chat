import * as Prompts from '../../config/prompts/searchPrompts.js';
import { callOllama } from './ollamaClient.js';

export const analyzeIntent = async (query, history = [], options = {}) => {
    const intentModel = process.env.OLLAMA_INTENT_MODEL;
    const pureAgentic = Boolean(options?.pureAgentic);
    const defaultIntent = {
        search_text: true,
        search_images: true,
        search_mantis: false,
        filters: {}
    };

    // 1. Contextual Query Rewriting (Handle Follow-ups)
    let contextQuery = query;
    if (history && history.length > 0) {
        try {
            const historyText = history.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');
            const rewritePrompt = Prompts.REWRITE_PROMPT(historyText, query);
            const rewritten = await callOllama(intentModel, rewritePrompt, '', false, { temperature: 0.1 });
            if (rewritten && !rewritten.startsWith('[System Error]')) {
                contextQuery = rewritten.trim();
                console.log(`[Intent] Query Rewritten: "${query}" -> "${contextQuery}"`);
            }
        } catch (e) { console.warn('[Intent] Rewrite failed:', e.message); }
    }

    const lowerQuery = contextQuery.toLowerCase();
    const mantisTriggers = ['@mantis', '@bug', '@error'];

    // 2. Fast Path: Explicit Mentions
    if (mantisTriggers.some(tag => lowerQuery.includes(tag))) {
        return {
            ...defaultIntent,
            search_mantis: true,
            extracted_query: contextQuery.replace(/@mantis|@bug|@error/gi, '').trim(),
            filters: {}
        };
    }

    if (!pureAgentic) {
        // 3. Fast Path: Simple Questions
        const simpleRegex = /^(what|who|where|when|define|meaning|translate|is|are|how to|ขั้นตอน|วิธี|คือ|แปล|ขอ|ช่วย)\b|(\?)$/i;
        const hasMantisOrBugCue = /@mantis|@bug|@error|\bbug\b|\bissue\b|\bticket\b|บัค|ปัญหา|เมื่อวาน|วันนี้|เดือนนี้|ปีนี้|\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/i.test(contextQuery);
        if (simpleRegex.test(contextQuery) && contextQuery.split(/\s+/).length < 15 && !hasMantisOrBugCue) {
            return {
                ...defaultIntent,
                strategy: 'fast',
                extracted_query: contextQuery,
                needs_clarification: false
            };
        }
    }

    if (!pureAgentic) {
        // 4. Context Continuity: Auto-route to Mantis if follow-up references previous Mantis results
        const hasMantisHistory = history.slice(-4).some(m =>
            (m.role === 'user' && /@mantis|@bug|@error/i.test(m.content)) ||
            (m.role === 'assistant' && (m.content.includes('บัค') || m.content.includes('Mantis') || m.content.includes('mantis_issue')))
        );
        const isReferentialQuery = /เหล่านี้|เหล่านั้น|ที่กล่าว|ดังกล่าว|these project|from the list|ที่แสดง|ที่ฟันออกมา|เป็นโปรเจ็คเหล่านี้|from above|in the list above|ที่เห็น|ละ|ล่ะ|ตัวไหน|มีอะไรบ้าง|status|สถานะ|assigned|new|resolved|closed|acknowledged|feedback|fixed|หรอ|หรือเปล่า|ใช่ไหม|ใช่มั้ย|จริงหรอ|แล้ว|ของปี|ปี\s*\d{4}|ทั้งปี|ปีที่แล้ว|ทั้งหมดนั้น|ตัวเลข|ตัวนี้|จากที่|ที่ตอบ|ที่บอก/.test(lowerQuery);

        if (hasMantisHistory && isReferentialQuery) {
            console.log('[Intent] Context Continuity: Follow-up on Mantis results detected → routing to Mantis');
            return {
                ...defaultIntent,
                strategy: 'mantis',
                search_mantis: true,
                extracted_query: contextQuery,
                filters: {}
            };
        }
    }

    // 4. Heavy Analysis: LLM Routing
    const prompt = Prompts.INTENT_ROUTER_PROMPT(contextQuery);

    try {
        const rawResponse = await callOllama(intentModel, prompt, '', false, { temperature: 0.0 });
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // Allow mantis routing from AI if history strongly suggests it
            if (!parsed.search_mantis) parsed.search_mantis = false;
            if (parsed.search_text) parsed.search_images = true;
            return {
                ...defaultIntent,
                ...parsed,
                // Ensure we use the most refined keywords
                extracted_query: parsed.extracted_query || contextQuery
            };
        }
    } catch (e) {
        console.warn(`[Router] Intent Analysis Error: ${e.message}. Using context query.`);
    }

    return { ...defaultIntent, extracted_query: contextQuery };
};
