/**
 * 🛠️ Mantis Graph Nodes
 */

import * as RetrievalService from '../../services/retrievalService.js';
import RagConfig from '../../config/ragConfig.js';
import * as SystemPrompts from '../../config/prompts/systemPrompts.js';
import { MANTIS_FILTER_EXTRACTION_PROMPT } from '../../config/prompts/searchPrompts.js';
import Logger from '../../services/loggerService.js';
import { setMantisContext } from '../../services/mantisContextStore.js';

import { callOllama } from '../../services/llm/ollamaClient.js';

/**
 * Extracts structured filters from natural language query using AI.
 * Follows "Nano Blueprint": project_name, status logic (open/closed), category_name.
 */
async function extractMantisFiltersAI(query, currentDate, existingFilters = {}) {
    try {
        const prompt = MANTIS_FILTER_EXTRACTION_PROMPT(query, currentDate);
        const rawRes = await callOllama(process.env.OLLAMA_CHAT_MODEL, prompt, 'You are a structured data extractor. You must reply in valid JSON format only.', false, { temperature: 0, format: 'json' });

        // Robust JSON extraction to handle instances where Ollama returns markdown code blocks ```json ... ```
        let jsonStr = rawRes;
        const match = rawRes.match(/```json\s*([\s\S]*?)\s*```/i);
        if (match) {
            jsonStr = match[1];
        } else {
            // Fallback to strict bracket matching if no markdown wrapper
            const braceMatch = rawRes.match(/\{[\s\S]*\}/);
            if (braceMatch) {
               jsonStr = braceMatch[0];
            }
        }

        try {
            const aiFilters = JSON.parse(jsonStr);
            Logger.info(`[MantisNode] AI Extracted Filters: ${JSON.stringify(aiFilters)}`);
            const merged = { ...existingFilters };

            // Parse new multidimensional schema
            if (aiFilters.cag_filters) {
                merged.cag_filters = { ...merged.cag_filters, ...aiFilters.cag_filters };
            }
            if (aiFilters.rag_search) {
                merged.rag_search = { ...merged.rag_search, ...aiFilters.rag_search };
            }
            if (aiFilters.aggregation) {
                merged.aggregation = { ...merged.aggregation, ...aiFilters.aggregation };
            }

            return merged;
        } catch (parseError) {
             Logger.error(`[MantisNode] Failed to parse AI JSON response. Raw string: ${jsonStr}`, parseError.message);
        }
    } catch (e) {
        console.warn('[MantisNode] AI Filter Extraction failed, falling back to basic checks:', e.message);
    }
    return existingFilters;
}

async function classifyMantisQueryAI(query, currentDate) {
    try {
        const prompt = `Classify this Mantis query into JSON only.\n` +
            `Current date: ${currentDate}\n` +
            `Query: ${query}\n\n` +
            `Return strict JSON with keys:\n` +
            `{\n` +
            `  "is_listing_intent": boolean,\n` +
            `  "has_explicit_time_scope": boolean,\n` +
            `  "wants_updated": boolean,\n` +
            `  "is_bug_domain_intent": boolean,\n` +
            `  "followup_other_bugs": boolean,\n` +
            `  "asks_today_scope": boolean,\n` +
            `  "asks_project_of_issue": boolean,\n` +
            `  "exact_ref_id": string | null,\n` +
            `  "temporal_scope": "none" | "today" | "yesterday" | "this_month" | "last_month" | "this_year" | "last_year" | "specific_year" | "date_range",\n` +
            `  "specific_year": number | null\n` +
            `}`;

        const rawRes = await callOllama(
            process.env.OLLAMA_CHAT_MODEL,
            prompt,
            'Return valid JSON only. No markdown.',
            false,
            { temperature: 0, format: 'json' }
        );

        let jsonStr = rawRes;
        const fenced = rawRes.match(/```json\s*([\s\S]*?)\s*```/i);
        if (fenced) {
            jsonStr = fenced[1];
        } else {
            const objectOnly = rawRes.match(/\{[\s\S]*\}/);
            if (objectOnly) jsonStr = objectOnly[0];
        }

        const parsed = JSON.parse(jsonStr);
        const temporalScopeRaw = String(parsed?.temporal_scope || 'none').toLowerCase();
        const allowedTemporalScopes = new Set(['none', 'today', 'yesterday', 'this_month', 'last_month', 'this_year', 'last_year', 'specific_year', 'date_range']);
        const temporalScope = allowedTemporalScopes.has(temporalScopeRaw) ? temporalScopeRaw : 'none';

        return {
            is_listing_intent: Boolean(parsed?.is_listing_intent),
            has_explicit_time_scope: Boolean(parsed?.has_explicit_time_scope) || temporalScope !== 'none',
            wants_updated: Boolean(parsed?.wants_updated),
            is_bug_domain_intent: Boolean(parsed?.is_bug_domain_intent),
            followup_other_bugs: Boolean(parsed?.followup_other_bugs),
            asks_today_scope: Boolean(parsed?.asks_today_scope),
            asks_project_of_issue: Boolean(parsed?.asks_project_of_issue),
            exact_ref_id: parsed?.exact_ref_id ? String(parsed.exact_ref_id).trim() : null,
            temporal_scope: temporalScope,
            specific_year: Number.isFinite(Number(parsed?.specific_year)) ? Number(parsed.specific_year) : null
        };
    } catch {
        return null;
    }
}

function detectTemporalScopeFallback(query = '') {
    const q = String(query).toLowerCase();
    if (q.includes('เดือนนี้') || q.includes('this month') || q.includes('ช่วงนี้')) return { temporal_scope: 'this_month' };
    if (q.includes('วันนี้') || q.includes('today')) return { temporal_scope: 'today' };
    if (q.includes('เดือนที่แล้ว') || q.includes('last month')) return { temporal_scope: 'last_month' };
    if (q.includes('เมื่อวาน') || q.includes('yesterday')) return { temporal_scope: 'yesterday' };
    if (q.includes('ปีนี้') || q.includes('this year')) return { temporal_scope: 'this_year' };
    if (q.includes('ปีที่แล้ว') || q.includes('last year')) return { temporal_scope: 'last_year' };

    const yearMatch = q.match(/(?:ปี|year)\s*(20\d{2}|25\d{2})\b/);
    if (yearMatch) {
        let yyyy = parseInt(yearMatch[1], 10);
        if (yyyy >= 2500) yyyy -= 543;
        return { temporal_scope: 'specific_year', specific_year: yyyy };
    }

    return { temporal_scope: 'none', specific_year: null };
}

function applyTemporalScopeFilter(filters = {}, temporal = {}, now = new Date()) {
    if (!filters.cag_filters) filters.cag_filters = {};
    if (!filters.cag_filters.date_range) filters.cag_filters.date_range = { from: null, to: null };

    const scope = temporal?.temporal_scope || 'none';
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');

    if (scope === 'today') {
        filters.cag_filters.date_range.from = `${yyyy}-${mm}-${dd}`;
        filters.cag_filters.date_range.to = `${yyyy}-${mm}-${dd}`;
        return `Date Filter: Today (${filters.cag_filters.date_range.from})`;
    }

    if (scope === 'yesterday') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yyy = yesterday.getFullYear();
        const mmm = String(yesterday.getMonth() + 1).padStart(2, '0');
        const ddd = String(yesterday.getDate()).padStart(2, '0');
        filters.cag_filters.date_range.from = `${yyy}-${mmm}-${ddd}`;
        filters.cag_filters.date_range.to = `${yyy}-${mmm}-${ddd}`;
        return `Date Filter: Yesterday (${filters.cag_filters.date_range.from})`;
    }

    if (scope === 'this_month') {
        filters.cag_filters.date_range.from = `${yyyy}-${mm}-01`;
        const lastDay = new Date(yyyy, now.getMonth() + 1, 0).getDate();
        filters.cag_filters.date_range.to = `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`;
        return `Date Filter: This Month (${filters.cag_filters.date_range.from} to ${filters.cag_filters.date_range.to})`;
    }

    if (scope === 'last_month') {
        const prev = new Date(now);
        prev.setMonth(prev.getMonth() - 1);
        const yyy = prev.getFullYear();
        const mmm = String(prev.getMonth() + 1).padStart(2, '0');
        filters.cag_filters.date_range.from = `${yyy}-${mmm}-01`;
        const lastDay = new Date(yyy, prev.getMonth() + 1, 0).getDate();
        filters.cag_filters.date_range.to = `${yyy}-${mmm}-${String(lastDay).padStart(2, '0')}`;
        return `Date Filter: Last Month (${filters.cag_filters.date_range.from} to ${filters.cag_filters.date_range.to})`;
    }

    if (scope === 'this_year') {
        filters.cag_filters.date_range.from = `${yyyy}-01-01`;
        filters.cag_filters.date_range.to = `${yyyy}-12-31`;
        return `Date Filter: This Year (${filters.cag_filters.date_range.from} to ${filters.cag_filters.date_range.to})`;
    }

    if (scope === 'last_year') {
        const yyy = yyyy - 1;
        filters.cag_filters.date_range.from = `${yyy}-01-01`;
        filters.cag_filters.date_range.to = `${yyy}-12-31`;
        return `Date Filter: Last Year (${yyy})`;
    }

    if (scope === 'specific_year' && Number.isFinite(Number(temporal?.specific_year))) {
        let yyy = Number(temporal.specific_year);
        if (yyy >= 2500) yyy -= 543;
        filters.cag_filters.date_range.from = `${yyy}-01-01`;
        filters.cag_filters.date_range.to = `${yyy}-12-31`;
        return `Date Filter: Year ${yyy}`;
    }

    return null;
}

function normalizeYear(year) {
    const n = Number(year);
    if (!Number.isFinite(n)) return null;
    return n >= 2500 ? n - 543 : n;
}

function parseDateToken(rawToken) {
    if (!rawToken) return null;
    const token = String(rawToken).trim();

    const ymd = token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymd) {
        const y = normalizeYear(ymd[1]);
        const m = Number(ymd[2]);
        const d = Number(ymd[3]);
        if (y && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
    }

    const dmy = token.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
        const d = Number(dmy[1]);
        const m = Number(dmy[2]);
        const y = normalizeYear(dmy[3]);
        if (y && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
    }

    return null;
}

function normalizeDateRangeOrder(from, to) {
    if (!from || !to) return { from, to };
    // Ensure both are valid strings before comparing
    const sFrom = String(from);
    const sTo = String(to);
    return sFrom <= sTo ? { from, to } : { from: sTo, to: sFrom };
}

function extractLiteralDateRange(query) {
    const match = query.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\s*(?:-|–|—|ถึง|to)\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i);
    if (!match) return null;

    const left = parseDateToken(match[1].replace(/-/g, '/'));
    const right = parseDateToken(match[2].replace(/-/g, '/'));
    if (!left || !right) return null;
    return normalizeDateRangeOrder(left, right);
}

function sanitizeMantisDateFilters(filters = {}, query = '') {
    if (!filters.cag_filters) filters.cag_filters = {};
    if (!filters.cag_filters.date_range) filters.cag_filters.date_range = { from: null, to: null };

    const normalizedFrom = parseDateToken(filters.cag_filters.date_range.from);
    const normalizedTo = parseDateToken(filters.cag_filters.date_range.to);

    if (normalizedFrom) filters.cag_filters.date_range.from = normalizedFrom;
    if (normalizedTo) filters.cag_filters.date_range.to = normalizedTo;

    const literalRange = extractLiteralDateRange(query);
    if (literalRange) {
        filters.cag_filters.date_range.from = literalRange.from;
        filters.cag_filters.date_range.to = literalRange.to;
    }

    const ordered = normalizeDateRangeOrder(filters.cag_filters.date_range.from, filters.cag_filters.date_range.to);
    filters.cag_filters.date_range.from = ordered.from || null;
    filters.cag_filters.date_range.to = ordered.to || null;

    if (!filters.cag_filters.date_type) {
        filters.cag_filters.date_type = 'bug_updated_at';
    }

    return filters;
}

function detectOtherBugsFollowUp(query = '') {
    const q = String(query).toLowerCase();
    const asksOtherBugs = /(?:บัค|bug|issue).*(?:อื่นๆ|อื่น|ที่เหลือ|อีก)|(?:อื่นๆ|ที่เหลือ|นอกจากนั้น|อีก)/.test(q);
    const asksTodayScope = /วันนี้|today/.test(q);
    return { asksOtherBugs, asksTodayScope };
}

function detectListingIntent(query = '') {
    const q = String(query).toLowerCase();
    const hasListCue = /มีอะไรบ้าง|มีไรบ้าง|ทั้งหมด|รายการ|list|show all|ขอดู|โชว์/.test(q);
    const hasBugCue = /บัค|bug|issue|ticket|ปัญหา/.test(q);
    const hasUpdateCue = /อัปเดต|อัพเดต|updated|update|recent|ล่าสุด/.test(q);
    return hasListCue && (hasBugCue || hasUpdateCue);
}

function isExplicitTimeScopeQuery(query = '') {
    const q = String(query).toLowerCase();
    if (/วันนี้|เมื่อวาน|เดือนนี้|เดือนที่แล้ว|ปีนี้|ปีที่แล้ว|today|yesterday|this month|last month|this year|last year/.test(q)) {
        return true;
    }
    if (/\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/.test(q)) {
        return true;
    }
    if (/(?:ปี|year)\s*(20\d{2}|25\d{2})\b/.test(q)) {
        return true;
    }
    return false;
}

function clearTurnScopedFlags(filters = {}) {
    const cleaned = { ...filters };
    delete cleaned.other_bugs_mode;
    delete cleaned.is_listing_query;
    delete cleaned.prefer_bug_listing;
    delete cleaned.exactRefId;

    if (cleaned.cag_filters && typeof cleaned.cag_filters === 'object') {
        cleaned.cag_filters = { ...cleaned.cag_filters };
        delete cleaned.cag_filters.excluded_ref_ids;
    }

    return cleaned;
}

function applyShortDateBugQueryGuardrails(filters = {}, query = '') {
    const q = String(query || '').toLowerCase();
    const aiIntent = filters.__ai_query_intent || null;
    const hasBugKeyword = typeof aiIntent?.is_bug_domain_intent === 'boolean'
        ? aiIntent.is_bug_domain_intent
        : /บัค|bug|issue|ticket|ปัญหา/.test(q);
    const hasExplicitDate = typeof aiIntent?.has_explicit_time_scope === 'boolean'
        ? aiIntent.has_explicit_time_scope
        : isExplicitTimeScopeQuery(q);
    const asksCreatedDate = /created|สร้าง|เปิดเคส|วันเปิด|created_at/.test(q);

    if (!filters.cag_filters) filters.cag_filters = {};

    // For short date+bug lookup, date_type should default to bug_updated_at unless explicitly asking created/opened date.
    if (hasBugKeyword && hasExplicitDate && !asksCreatedDate) {
        filters.cag_filters.date_type = 'bug_updated_at';
    }

    return filters;
}

function stripDateRangeFromFilters(filters = {}) {
    const cloned = {
        ...filters,
        cag_filters: {
            ...(filters.cag_filters || {}),
            date_range: { from: null, to: null }
        }
    };
    return cloned;
}

function extractLatestDateFromRows(rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const candidate = rows.find(r => r?.bug_updated_at) || rows[0];
    const raw = candidate?.bug_updated_at;
    if (!raw) return null;
    const s = String(raw);
    return s.length >= 10 ? s.slice(0, 10) : s;
}

function shiftDate(dateStr, days) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

function buildNearbyDateRangeFilters(filters = {}, beforeDays = 1, afterDays = 1) {
    const from = filters?.cag_filters?.date_range?.from || null;
    const to = filters?.cag_filters?.date_range?.to || null;
    if (!from || !to || from !== to) return null;

    const expandedFrom = shiftDate(from, -Math.abs(beforeDays));
    const expandedTo = shiftDate(to, Math.abs(afterDays));
    if (!expandedFrom || !expandedTo) return null;

    return {
        ...filters,
        cag_filters: {
            ...(filters.cag_filters || {}),
            date_range: {
                from: expandedFrom,
                to: expandedTo
            }
        }
    };
}

function isExactDateScope(filters = {}) {
    const from = filters?.cag_filters?.date_range?.from || null;
    const to = filters?.cag_filters?.date_range?.to || null;
    return Boolean(from && to && from === to);
}

function buildDateFallbackNotice(filters = {}, latestDate = null, mode = 'latest') {
    const from = filters?.cag_filters?.date_range?.from || null;
    const to = filters?.cag_filters?.date_range?.to || null;
    const hasExactDate = Boolean(from && to && from === to);

    if (mode === 'nearby' && hasExactDate) {
        return `ไม่พบบัคที่อัปเดตในวันที่ ${from} จึงขยายช่วงใกล้เคียงเพื่อค้นหาเพิ่มเติม`;
    }

    if (hasExactDate && latestDate) {
        return `ไม่พบบัคที่อัปเดตในวันที่ ${from} แต่ข้อมูลล่าสุดที่พบอัปเดตวันที่ ${latestDate}`;
    }

    if (hasExactDate) {
        return `ไม่พบบัคที่อัปเดตในวันที่ ${from}`;
    }

    if (latestDate) {
        return `ไม่พบบัคในช่วงวันที่ที่ถาม แต่ข้อมูลล่าสุดที่พบอัปเดตวันที่ ${latestDate}`;
    }

    return 'ไม่พบบัคในช่วงวันที่ที่ถาม';
}

function isShortAffirmativeFollowUp(query = '') {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) return false;
    return /^(อยากดู|ดูเลย|ดู|เอาเลย|yes|ok|ได้|show|show me)$/i.test(normalized);
}

function isFocusedIssueFollowUpQuery(query = '') {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) return false;

    // Generic follow-up prompts that should refer to the last focused ticket.
    if (/^(เกี่ยวกับอะไร|คืออะไร|หมายถึงอะไร|รายละเอียด|ขอรายละเอียด|เล่าเพิ่ม|what about it|what is it|details|tell me more)$/i.test(normalized)) {
        return true;
    }

    // Short contextual follow-ups like "อันนี้คืออะไร" / "มันเกี่ยวกับอะไร"
    if (normalized.split(/\s+/).length <= 6 && /(อันนี้|อันนั้น|รายการนี้|ตัวนี้|มัน|it).*(คืออะไร|เกี่ยวกับอะไร|รายละเอียด)/i.test(normalized)) {
        return true;
    }

    return false;
}

export async function nodeAnalyzeBugRequest(state) {
    console.log("-> [Agent Node] analyze_bug_request");
    const thoughts = [{ id: 'agent-1', icon: 'brain', description: `Agent analyzing request details...`, status: 'active' }];

    const queryStr = state.query.toLowerCase();

    // 1. Initial schema setup
    let filters = clearTurnScopedFlags({ ...state.intent?.filters });
    // Legacy context key may exist in persisted filters; remove it for new turn analysis.
    delete filters.exactRefId;
    if (!filters.cag_filters) filters.cag_filters = { date_range: { from: null, to: null }, included_projects: [] };
    if (!filters.cag_filters.date_range) filters.cag_filters.date_range = { from: null, to: null };
    if (!filters.cag_filters.included_projects) filters.cag_filters.included_projects = [];

    const previousIncludedProjects = Array.isArray(filters.cag_filters.included_projects)
        ? [...filters.cag_filters.included_projects]
        : [];
    const previousDateRange = {
        from: filters.cag_filters.date_range?.from || null,
        to: filters.cag_filters.date_range?.to || null
    };
    const previousDateType = filters.cag_filters.date_type || null;

    const currentDateForPrompt = new Date();
    const todayStr = `${currentDateForPrompt.getFullYear()}-${String(currentDateForPrompt.getMonth() + 1).padStart(2, '0')}-${String(currentDateForPrompt.getDate()).padStart(2, '0')}`;
    const aiQueryIntent = await classifyMantisQueryAI(state.query, todayStr);

    // AI-first: detect focused ticket id from classifier. Regex remains a fallback only.
    let exactRefId = aiQueryIntent?.exact_ref_id ? String(aiQueryIntent.exact_ref_id) : null;
    if (!exactRefId) {
        const idMatch = state.query.match(/(?:issue|bug|ticket|item|ref|#|หมายเลข|บัค|ทิกเก็ต|ตั๋ว)\s*(\d{4,8})\b/i);
        if (idMatch && idMatch[1]) {
            exactRefId = idMatch[1];
        } else {
            const standaloneId = state.query.match(/\b(\d{5,8})\b/);
            if (standaloneId && standaloneId[1]) {
                exactRefId = standaloneId[1];
            }
        }
    }
    if (exactRefId) {
        thoughts.push({ id: 'agent-1a', icon: 'search', description: `Target ID: ${exactRefId}`, status: 'active' });
    }

    const followUpIntent = {
        asksOtherBugs: typeof aiQueryIntent?.followup_other_bugs === 'boolean'
            ? aiQueryIntent.followup_other_bugs
            : detectOtherBugsFollowUp(state.query).asksOtherBugs,
        asksTodayScope: typeof aiQueryIntent?.asks_today_scope === 'boolean'
            ? aiQueryIntent.asks_today_scope
            : detectOtherBugsFollowUp(state.query).asksTodayScope
    };

    const hasExplicitTimeScope = aiQueryIntent?.has_explicit_time_scope ?? isExplicitTimeScopeQuery(state.query);
    const temporalScope = aiQueryIntent?.temporal_scope || 'none';

    if (hasExplicitTimeScope) {
        // Explicit temporal scope detected in current query.
        // Rule: If the user provided a fresh temporal intent, we MUST clear the previous turn's date range
        // to prevent stale "single day" filters from corrupting the new search.
        Logger.info('[MantisNode] Fresh temporal intent detected: clearing stale date context.');
        filters = stripDateRangeFromFilters(filters);
        filters = clearTurnScopedFlags(filters);
        exactRefId = null;
    }

    // Resolve follow-up project question to the most recent referenced ticket in session context.
    if (!exactRefId) {
        const asksProjectOfIssue = typeof aiQueryIntent?.asks_project_of_issue === 'boolean'
            ? aiQueryIntent.asks_project_of_issue
            : (/(?:โปรเจ(?:ค|็ค)|project).*(?:ไหน|อะไร|what|which)/i.test(state.query) || /issues?\s+ของ/i.test(queryStr));
        const rememberedRefs = Array.isArray(filters.last_resolved_refs) ? filters.last_resolved_refs : [];
        if (asksProjectOfIssue && rememberedRefs.length > 0) {
            exactRefId = String(filters.last_focus_ref || rememberedRefs[0]);
            thoughts.push({ id: 'agent-1a', icon: 'history', description: `Follow-up resolved to previous ticket ID: ${exactRefId}`, status: 'active' });
        } else {
            const followUpToFocusedIssue = isFocusedIssueFollowUpQuery(state.query);
            const listingIntent = typeof aiQueryIntent?.is_listing_intent === 'boolean'
                ? aiQueryIntent.is_listing_intent
                : detectListingIntent(state.query);
            if (followUpToFocusedIssue && !hasExplicitTimeScope && !listingIntent && rememberedRefs.length > 0) {
                exactRefId = String(filters.last_focus_ref || rememberedRefs[0]);
                thoughts.push({
                    id: 'agent-1a',
                    icon: 'history',
                    description: `Context follow-up resolved to focused ticket ID: ${exactRefId}`,
                    status: 'active'
                });
            }
        }
    }

    const temporalIntent = aiQueryIntent || detectTemporalScopeFallback(state.query);
    const temporalDesc = applyTemporalScopeFilter(filters, temporalIntent, new Date());
    if (temporalDesc) {
        thoughts.push({ id: 'agent-1b', icon: 'calendar', description: temporalDesc, status: 'active' });
    }

    // Extract AI-based structured filters
    filters = await extractMantisFiltersAI(state.query, todayStr, filters);
    filters = sanitizeMantisDateFilters(filters, state.query);
    filters.__ai_query_intent = aiQueryIntent;
    filters = applyShortDateBugQueryGuardrails(filters, state.query);
    delete filters.__ai_query_intent;

    const hasCarryForwardScope = Boolean(
        previousIncludedProjects.length > 0 ||
        previousDateRange.from ||
        previousDateRange.to ||
        filters.last_focus_ref
    );

    // Short affirmative follow-ups should reuse prior scope and continue listing,
    // not trigger a fresh extraction path that can lead to unnecessary clarification.
    if (isShortAffirmativeFollowUp(state.query) && hasCarryForwardScope) {
        filters.is_listing_query = true;

        if (!filters.cag_filters) filters.cag_filters = {};
        if ((!filters.cag_filters.date_range?.from && !filters.cag_filters.date_range?.to) && (previousDateRange.from || previousDateRange.to)) {
            filters.cag_filters.date_range = { ...previousDateRange };
        }

        if ((!Array.isArray(filters.cag_filters.included_projects) || filters.cag_filters.included_projects.length === 0) && previousIncludedProjects.length > 0) {
            filters.cag_filters.included_projects = [...previousIncludedProjects];
        }

        if (!filters.cag_filters.date_type && previousDateType) {
            filters.cag_filters.date_type = previousDateType;
        }

        thoughts.push({
            id: 'agent-1e',
            icon: 'history',
            description: 'Affirmative follow-up detected: reusing previous scope for listing.',
            status: 'active'
        });
    }

    if (followUpIntent.asksOtherBugs && hasCarryForwardScope) {
        filters.other_bugs_mode = true;
        filters.is_listing_query = true;
        if (!filters.cag_filters) filters.cag_filters = {};
        if (!Array.isArray(filters.cag_filters.included_projects) || filters.cag_filters.included_projects.length === 0) {
            filters.cag_filters.included_projects = previousIncludedProjects;
        }

        if (!filters.cag_filters.date_range) {
            filters.cag_filters.date_range = { ...previousDateRange };
        } else if (!filters.cag_filters.date_range.from && !filters.cag_filters.date_range.to) {
            filters.cag_filters.date_range = { ...previousDateRange };
        }

        if (!filters.cag_filters.date_type) {
            filters.cag_filters.date_type = previousDateType || 'bug_updated_at';
        }

        const focusedRef = String(filters.last_focus_ref || exactRefId || '').trim();
        if (focusedRef) {
            filters.cag_filters.excluded_ref_ids = [focusedRef];
        }

        thoughts.push({
            id: 'agent-1d',
            icon: 'history',
            description: 'Follow-up mode: showing other bugs with carried project/date context.',
            status: 'active'
        });

        if (followUpIntent.asksTodayScope && !filters.cag_filters.date_range?.from) {
            filters.cag_filters.date_range = {
                from: todayStr,
                to: filters.cag_filters.date_range?.to || null
            };
        }
    }

    Logger.info(`[MantisNode] Sanitized Filters: ${JSON.stringify(filters)}`);
    
    // Process Entity Matching for Included Projects
    if (filters.cag_filters?.included_projects?.length > 0) {
        const { matchProjectName } = await import('../../services/retrieval/entityMatcher.js');
        const matchedProjects = [];
        for (const proj of filters.cag_filters.included_projects) {
            const matches = await matchProjectName(proj);
            if (matches.length > 0) {
                matchedProjects.push(...matches);
            } else {
                return {
                    needs_clarification: true,
                    clarification_message: `ผมไม่พบชื่อโปรเจคในระบบที่ใกล้เคียงกับคำว่า "${proj}" เลยครับ รบกวนระบุชื่อให้ชัดเจนหรือตรวจสอบตัวสะกดอีกครั้งครับ`,
                    thoughts: [{ id: 'agent-1', status: 'completed' }]
                };
            }
        }
        filters.cag_filters.included_projects = [...new Set(matchedProjects)];
    }

    let summaryParts = [];
    if (filters.cag_filters?.included_projects?.length > 0) summaryParts.push(`Projects: ${filters.cag_filters.included_projects.join(', ')}`);
    if (filters.rag_search?.semantic_keyword) summaryParts.push(`Keyword: ${filters.rag_search.semantic_keyword}`);
    
    const filterSummary = summaryParts.join(' | ');
    if (filterSummary) {
        thoughts.push({ id: 'agent-1c', icon: 'filter', description: `AI Filters: ${filterSummary}`, status: 'active' });
    }

    if (state.sessionId) {
        setMantisContext(state.sessionId, filters);
    }

    return {
        intent: { ...state.intent, exact_ref_id: exactRefId, filters, ai_query_intent: aiQueryIntent },
        thoughts: [{ id: 'agent-1', status: 'completed' }]
    };
}

export async function nodeSearchMantisDB(state) {
    console.log("-> [Agent Node] search_mantis_db");
    console.log("[MantisDB] Filters received:", JSON.stringify(state.intent?.filters));
    const query = state.query;

    try {
        const thoughts = [{ id: 'agent-2', icon: 'database', description: `Agent calling Mantis DB tools...`, status: 'active' }];
        const diagnostics = {
            mode: 'hybrid',
            reason_code: null,
            raw_count: 0,
            kept_count: 0,
            listing_count: 0,
            date_fallback_used: false,
            date_fallback_latest: null
        };

        const filters = { ...state.intent.filters };
        if (state.intent.exact_ref_id) {
            filters.exactRefId = state.intent.exact_ref_id;
        }

        const queryStr = (state.query || '').toLowerCase();
        const asksProjectField = /(?:โปรเจ(?:ค|็ค)|project).*(?:ไหน|อะไร|what|which|name)/i.test(state.query || '');
        const asksCategoryField = /(?:หมวด|category|ประเภท).*(?:ไหน|อะไร|what|which|name)/i.test(state.query || '');
        const asksStatusField = /(?:สถานะ|status).*(?:ไหน|อะไร|what|which)/i.test(state.query || '');
        const isSimpleFieldLookup = asksProjectField || asksCategoryField || asksStatusField;
        const isFocusedContextFollowUp = isFocusedIssueFollowUpQuery(state.query) && Boolean(filters.exactRefId);

        // Fast-path: for simple follow-up field questions, fetch only the focused ticket by ref id.
        // This avoids full hybrid search and keeps behavior deterministic.
        if (isSimpleFieldLookup && filters.exactRefId) {
            const quickRows = await RetrievalService.searchMantis('', filters, 1);
            const quickDoc = quickRows[0];
            if (quickDoc) {
                let directAnswer = null;
                if (asksProjectField) {
                    directAnswer = `Issue ${quickDoc.ref_id} อยู่ในโปรเจ็ค ${quickDoc.project_name || 'N/A'}`;
                } else if (asksCategoryField) {
                    directAnswer = `Issue ${quickDoc.ref_id} อยู่ในหมวด ${quickDoc.category_name || 'N/A'}`;
                } else if (asksStatusField) {
                    directAnswer = `Issue ${quickDoc.ref_id} มีสถานะ ${quickDoc.status || 'N/A'}${quickDoc.resolution ? ` (${quickDoc.resolution})` : ''}`;
                }

                if (directAnswer) {
                    thoughts.push({
                        id: 'agent-2',
                        description: 'Fast Lookup Mode: answered from focused ticket metadata.',
                        status: 'completed'
                    });
                    return {
                        retrieved_bugs: [quickDoc],
                        is_bug_found: true,
                        direct_answer: directAnswer,
                        thoughts
                    };
                }
            }
        }

        // Generic follow-up such as "เกี่ยวกับอะไร" should stay on the last focused ticket.
        if (isFocusedContextFollowUp) {
            const quickRows = await RetrievalService.searchMantis('', filters, 1);
            const quickDoc = quickRows[0];
            if (quickDoc) {
                thoughts.push({
                    id: 'agent-2',
                    description: 'Focused Follow-up Mode: resolved from last focused ticket context.',
                    status: 'completed'
                });
                return {
                    retrieved_bugs: [quickDoc],
                    is_bug_found: true,
                    retrieval_diagnostics: {
                        ...diagnostics,
                        mode: 'focused_ref_lookup',
                        reason_code: 'FOCUSED_REF_FOLLOWUP',
                        raw_count: 1,
                        kept_count: 1
                    },
                    thoughts
                };
            }
        }

        // === LISTING QUERY MODE: Use SQL DISTINCT instead of Hybrid Search ===
        const isOtherBugsMode = Boolean(filters.other_bugs_mode);
        const aiQueryIntent = state.intent?.ai_query_intent;
        const regexListIntent = detectListingIntent(state.query);
        const hasExplicitListCue = /มีอะไรบ้าง|มีไรบ้าง|ทั้งหมด|รายการ|list|show all|ขอดู|โชว์|เหลืออะไรบ้าง/.test(queryStr);
        const aiDateScopedBugListing = Boolean(aiQueryIntent?.has_explicit_time_scope)
            && Boolean(aiQueryIntent?.is_bug_domain_intent)
            && (Boolean(aiQueryIntent?.is_listing_intent) || regexListIntent || hasExplicitListCue)
            && !/สาเหตุ|แก้ไข|analysis|relationship|overview|root cause|ทำไม/.test(queryStr);
        const isListBugIntent = (typeof aiQueryIntent?.is_listing_intent === 'boolean' ? aiQueryIntent.is_listing_intent : regexListIntent)
            && !/สาเหตุ|แก้ไข|analysis|relationship|overview|root cause|ทำไม/.test(queryStr);
        const wantsUpdated = typeof aiQueryIntent?.wants_updated === 'boolean'
            ? aiQueryIntent.wants_updated
            : /อัปเดต|อัพเดต|updated|update|recent|ล่าสุด/.test(queryStr);
        const isAllUpdatedIntent = /ทั้งหมด|all/.test(queryStr) && wantsUpdated;
        const isListing = isOtherBugsMode || filters.is_listing_query || filters.aggregation?.needs_count_only || isListBugIntent || aiDateScopedBugListing;
        if (isListing) {
            diagnostics.mode = 'listing';
            const hasProjectFilter = Boolean(filters.project_name) || Boolean(filters.cag_filters?.included_projects?.length);
            const prefersBugListing = Boolean(filters.prefer_bug_listing) || isListBugIntent;
            if (hasProjectFilter || isOtherBugsMode || prefersBugListing) {
                const listLimit = isAllUpdatedIntent
                    ? Math.max(100, RagConfig.context.mantisFetchLimit || 20)
                    : (RagConfig.context.mantisFetchLimit || 20);
                let listRes = await RetrievalService.listMantisBugs(filters, listLimit);
                let rows = listRes.rows || [];

                // Retry once without excluded_ref_ids when follow-up scope yields nothing.
                // This protects against stale focus-id exclusion collapsing valid rows to zero.
                if (isOtherBugsMode && rows.length === 0 && Array.isArray(filters.cag_filters?.excluded_ref_ids) && filters.cag_filters.excluded_ref_ids.length > 0) {
                    const relaxedFilters = {
                        ...filters,
                        cag_filters: {
                            ...(filters.cag_filters || {})
                        }
                    };
                    delete relaxedFilters.cag_filters.excluded_ref_ids;

                    listRes = await RetrievalService.listMantisBugs(relaxedFilters, listLimit);
                    rows = listRes.rows || [];
                }

                if (isOtherBugsMode && rows.length === 0) {
                    diagnostics.listing_count = 0;
                    diagnostics.kept_count = 0;
                    diagnostics.reason_code = 'OTHER_BUGS_EMPTY_SCOPE';
                    thoughts.push({
                        id: 'agent-2',
                        description: 'Other-bugs mode: no additional bugs left in current scope.',
                        status: 'completed'
                    });

                    return {
                        retrieved_bugs: [],
                        is_bug_found: false,
                        no_other_bugs: true,
                        retrieval_diagnostics: diagnostics,
                        thoughts
                    };
                }

                const hadDateScope = Boolean(filters.cag_filters?.date_range?.from || filters.cag_filters?.date_range?.to);
                const isTodayScope = aiQueryIntent?.temporal_scope === 'today';
                const strictDateScope = Boolean(aiQueryIntent?.has_explicit_time_scope);
                if (rows.length === 0 && hadDateScope) {
                    if (strictDateScope) {
                        diagnostics.listing_count = 0;
                        diagnostics.kept_count = 0;
                        diagnostics.reason_code = 'DATE_SCOPE_STRICT_NO_RESULTS';
                        thoughts.push({
                            id: 'agent-2',
                            description: 'Strict date scope: no results found in requested range, fallback disabled.',
                            status: 'completed'
                        });
                        return {
                            retrieved_bugs: [],
                            is_bug_found: false,
                            retrieval_diagnostics: diagnostics,
                            thoughts
                        };
                    }

                    const nearbyFilters = isTodayScope ? null : buildNearbyDateRangeFilters(filters, 1, 1);
                    if (nearbyFilters) {
                        const nearbyRes = await RetrievalService.listMantisBugs(nearbyFilters, listLimit);
                        const nearbyRows = nearbyRes.rows || [];
                        if (nearbyRows.length > 0) {
                            diagnostics.date_fallback_used = true;
                            diagnostics.reason_code = 'DATE_SCOPE_NO_RESULTS_FALLBACK_NEARBY_RANGE';
                            diagnostics.listing_count = nearbyRows.length;
                            diagnostics.kept_count = nearbyRows.length;
                            thoughts.push({
                                id: 'agent-2',
                                description: `Date fallback: no rows on exact date, expanded search window to ${nearbyFilters.cag_filters.date_range.from}..${nearbyFilters.cag_filters.date_range.to}.`,
                                status: 'completed'
                            });
                            return {
                                retrieved_bugs: nearbyRows,
                                is_bug_found: true,
                                retrieval_diagnostics: diagnostics,
                                fallback_notice: buildDateFallbackNotice(filters, null, 'nearby'),
                                thoughts
                            };
                        }
                    }

                    const relaxedDateFilters = stripDateRangeFromFilters(filters);
                    const relaxedRes = await RetrievalService.listMantisBugs(relaxedDateFilters, listLimit);
                    const relaxedRows = relaxedRes.rows || [];
                    if (relaxedRows.length > 0) {
                        const latestDate = extractLatestDateFromRows(relaxedRows);
                        diagnostics.date_fallback_used = true;
                        diagnostics.date_fallback_latest = latestDate;
                        diagnostics.reason_code = 'DATE_SCOPE_NO_RESULTS_FALLBACK_LATEST';
                        diagnostics.listing_count = relaxedRows.length;
                        diagnostics.kept_count = relaxedRows.length;

                        thoughts.push({
                            id: 'agent-2',
                            description: `Date fallback: no rows in requested date scope, switched to latest available bugs (${latestDate || 'unknown date'}).`,
                            status: 'completed'
                        });

                        return {
                            retrieved_bugs: relaxedRows,
                            is_bug_found: true,
                            retrieval_diagnostics: diagnostics,
                            fallback_notice: buildDateFallbackNotice(filters, latestDate, 'latest'),
                            thoughts
                        };
                    }
                }

                diagnostics.listing_count = rows.length;
                diagnostics.kept_count = rows.length;
                diagnostics.reason_code = rows.length > 0 ? 'LISTING_RESULTS' : 'LISTING_NO_RESULTS';

                thoughts.push({
                    id: 'agent-2',
                    description: `SQL Listing Mode: Found ${rows.length} bugs matching filters.`,
                    status: 'completed'
                });

                return { retrieved_bugs: rows, is_bug_found: rows.length > 0, retrieval_diagnostics: diagnostics, thoughts };
            }

            const listRes = await RetrievalService.listMantisProjects(filters);
            const rows = listRes.rows || [];

            // Format as pseudo-bug objects for nodeSynthesize to handle
            const dateDesc = filters.cag_filters?.date_range?.from ? ` (Updated since ${filters.cag_filters.date_range.from})` : '';
            const listingBugs = rows.map(row => ({
                ref_id: null,
                project_name: row.project_name,
                summary: `Project "${row.project_name}" bug overview: ${row.open_bugs} unresolved/pending, ${row.closed_bugs} resolved, ${row.total_bugs} total bugs detected.${dateDesc}`,
                status: row.open_bugs > 0 ? `${row.open_bugs} Pending` : 'All Resolved',
                resolution: '',
                category_name: '',
                description: `This is an aggregated summary for project ${row.project_name}. Total bugs in system: ${row.total_bugs}. Resolved: ${row.closed_bugs}. Pending Action: ${row.open_bugs}.`,
                bug_updated_at: filters.cag_filters?.date_range?.from || 'N/A'
            }));

            thoughts.push({
                id: 'agent-2',
                description: `SQL Listing Mode: Found ${rows.length} projects matching filters.`,
                status: 'completed'
            });

            diagnostics.listing_count = rows.length;
            diagnostics.kept_count = listingBugs.length;
            diagnostics.reason_code = listingBugs.length > 0 ? 'PROJECT_LISTING_RESULTS' : 'PROJECT_LISTING_EMPTY';

            return { retrieved_bugs: listingBugs, is_bug_found: listingBugs.length > 0, retrieval_diagnostics: diagnostics, thoughts };
        }

        // === HYBRID SEARCH MODE (default) ===
        const isRelationshipQuery = /ความสัมพันธ์|สาเหตุ|overview|relationship|เกิดจาก/.test(queryStr);

        let fetchLimit = RagConfig.context.mantisFetchLimit || 20;
        if (isRelationshipQuery) {
            fetchLimit = 50; // Fetch more for broad analysis
            Logger.info(`[MantisDB] Relationship query detected. Increasing fetchLimit to ${fetchLimit}`);
        }

        let rawBugs = await RetrievalService.searchMantis(query, filters, fetchLimit);
        diagnostics.raw_count = rawBugs.length;

        const hadDateScope = Boolean(filters.cag_filters?.date_range?.from || filters.cag_filters?.date_range?.to);
        const isTodayScope = aiQueryIntent?.temporal_scope === 'today';
        const strictDateScope = Boolean(aiQueryIntent?.has_explicit_time_scope);
        if (rawBugs.length === 0 && hadDateScope && strictDateScope) {
            diagnostics.raw_count = 0;
            diagnostics.reason_code = 'DATE_SCOPE_STRICT_NO_RESULTS';
        }
        if (rawBugs.length === 0 && hadDateScope && !strictDateScope) {
            const nearbyFilters = isTodayScope ? null : buildNearbyDateRangeFilters(filters, 1, 1);
            if (nearbyFilters) {
                rawBugs = await RetrievalService.searchMantis(query, nearbyFilters, fetchLimit);
                diagnostics.raw_count = rawBugs.length;
                if (rawBugs.length > 0) {
                    diagnostics.date_fallback_used = true;
                    diagnostics.reason_code = 'DATE_SCOPE_NO_RESULTS_FALLBACK_NEARBY_RANGE';
                    diagnostics.date_fallback_latest = extractLatestDateFromRows(rawBugs);
                }
            }
        }

        if (rawBugs.length === 0 && hadDateScope && !strictDateScope) {
            const relaxedDateFilters = stripDateRangeFromFilters(filters);
            rawBugs = await RetrievalService.searchMantis(query, relaxedDateFilters, fetchLimit);
            diagnostics.raw_count = rawBugs.length;
            if (rawBugs.length > 0) {
                const latestDate = extractLatestDateFromRows(rawBugs);
                diagnostics.date_fallback_used = true;
                diagnostics.date_fallback_latest = latestDate;
                diagnostics.reason_code = 'DATE_SCOPE_NO_RESULTS_FALLBACK_LATEST';
            }
        }

        if (rawBugs.length === 0 && state.intent.exact_ref_id) {
            Logger.warn(`[MantisDB] Exact ref ${state.intent.exact_ref_id} not found directly. Falling back with inherited session filters.`);
            const fallbackFilters = {
                ...filters,
                exactRefId: null,
                rag_search: {
                    ...(filters.rag_search || {}),
                    semantic_keyword: state.intent.exact_ref_id
                }
            };
            rawBugs = await RetrievalService.searchMantis(state.intent.exact_ref_id, fallbackFilters, fetchLimit);
        }

        // Fallback: If "these" refers to previous projects but search yielded nothing
        if (rawBugs.length === 0 && !filters.project_name && /เหล่านี้|เหล่าตัว/.test(queryStr)) {
            Logger.info('[MantisDB] No projects specified in follow-up. Falling back to fetching recent open bugs.');
            filters.mantis_status_open = true;
            rawBugs = await RetrievalService.searchMantis('', filters, fetchLimit);
        }

        // Apply Smart Filtering & Re-ranking logic
        const filterRes = RetrievalService.processResponseAndSources(rawBugs);
        let retrievedBugs = filterRes.filteredDocs;

        // Deduplicate by ref_id (Hybrid Search can return same bug from both Vector + FTS paths)
        const seen = new Map();
        retrievedBugs.forEach(bug => {
            const key = String(bug.ref_id || bug.id);
            if (!seen.has(key) || (bug.similarity || 0) > (seen.get(key).similarity || 0)) {
                seen.set(key, bug);
            }
        });
        retrievedBugs = Array.from(seen.values());
        console.log(`[MantisDB] Deduplicated: ${filterRes.filteredDocs.length} -> ${retrievedBugs.length} unique bugs`);
        diagnostics.kept_count = retrievedBugs.length;

        if (diagnostics.raw_count === 0) {
            diagnostics.reason_code = 'RAW_NO_RESULTS';
        } else if (diagnostics.raw_count > 0 && retrievedBugs.length === 0) {
            diagnostics.reason_code = 'RELEVANCE_GATE_DROPPED';
        } else {
            diagnostics.reason_code = 'HYBRID_RESULTS';
        }

        // Keep synthesis prompt bounded to avoid consuming all output tokens in reasoning.
        const maxSynthesisIssues = 25;
        if (retrievedBugs.length > maxSynthesisIssues) {
            retrievedBugs = retrievedBugs
                .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
                .slice(0, maxSynthesisIssues);
            console.log(`[MantisDB] Capped issues for synthesis: ${maxSynthesisIssues}`);
        }

        const isFound = retrievedBugs.length > 0;

        if (state.sessionId && retrievedBugs.length > 0) {
            const lastResolvedRefs = [...new Set(retrievedBugs.map(b => b.ref_id).filter(Boolean).map(String))].slice(0, 10);
            const lastResolvedProjects = [...new Set(retrievedBugs.map(b => b.project_name).filter(Boolean))].slice(0, 10);
            const lastFocusRef = state.intent.exact_ref_id
                ? String(state.intent.exact_ref_id)
                : (lastResolvedRefs[0] || filters.last_focus_ref || null);

            setMantisContext(state.sessionId, {
                ...filters,
                last_resolved_refs: lastResolvedRefs,
                last_resolved_projects: lastResolvedProjects,
                last_focus_ref: lastFocusRef
            });
        }

        thoughts.push({
            id: 'agent-2',
            description: `Agent executed Mantis SQL. Found ${rawBugs.length} issues, kept ${retrievedBugs.length} unique relevant ones.`,
            status: 'completed'
        });

        return {
            retrieved_bugs: retrievedBugs,
            is_bug_found: isFound,
            retrieval_diagnostics: diagnostics,
            fallback_notice: diagnostics.date_fallback_used
                ? buildDateFallbackNotice(filters, diagnostics.date_fallback_latest, 'latest')
                : null,
            thoughts: thoughts
        };
    } catch (e) {
        console.error(e);
        return { is_bug_found: false, thoughts: [{ id: 'agent-2', description: `Agent SQL Tool Failed: ${e.message}`, status: 'completed' }] };
    }
}

export async function nodeSynthesize(state) {
    console.log("-> [Agent Node] synthesize");

    if (state.no_other_bugs) {
        return {
            final_response: 'ไม่พบบัคอื่นเพิ่มเติมในขอบเขตเดิมของโปรเจกต์และช่วงวันที่ที่กำลังคุยอยู่ครับ',
            retrieved_bugs: [],
            thoughts: [{ id: 'agent-3', icon: 'check-circle', description: 'Other-bugs follow-up resolved: no additional bugs in scope.', status: 'completed' }]
        };
    }

    if (state.direct_answer) {
        return {
            final_response: state.direct_answer,
            retrieved_bugs: state.retrieved_bugs || [],
            thoughts: [{ id: 'agent-3', icon: 'zap', description: 'Fast-path response from focused ticket metadata.', status: 'completed' }]
        };
    }

    if (state.needs_clarification) {
        return {
            final_response: state.clarification_message,
            retrieved_bugs: [],
            thoughts: [{ id: 'agent-3', icon: 'help-circle', description: 'Agent asking user for clarification.', status: 'completed' }]
        };
    }

    let finalContext = "";
    
    const handledRefIds = [...new Set((state.retrieved_bugs || [])
        .map(doc => doc.ref_id ? String(doc.ref_id) : null)
        .filter(Boolean))];
    const handledProjects = [...new Set((state.retrieved_bugs || [])
        .map(doc => doc.project_name)
        .filter(Boolean))];

    const wantsFullListing = Boolean(state.intent?.ai_query_intent?.is_listing_intent)
        || Boolean(state.intent?.ai_query_intent?.has_explicit_time_scope)
        || Boolean(state.intent?.filters?.is_listing_query);

    const isMassiveListing = wantsFullListing && state.retrieved_bugs.length >= 10;
    const isProjectListing = state.retrieved_bugs.length > 0 && Array.isArray(state.retrieved_bugs) && state.retrieved_bugs.some(b => b.ref_id === null && b.project_name);

    if (state.retrieved_bugs.length > 0) {
        if (state.intent.exact_ref_id) {
            // Incorporate LlamaIndex for refinement - Increase refined list to 10 for better coverage
            const { processWithLlamaIndex } = await import('../../services/llamaIndexService.js');
            const llamaRes = await processWithLlamaIndex(state.query, state.retrieved_bugs, 10);
            state.retrieved_bugs = llamaRes.refinedDocs;
        }

        // Context Mapping Rule:
        // Use full detail for small lookups. Use ULTRA-LEAN mapping for massive listings to prevent LLM memory overflow and hallucinations.
        finalContext = state.retrieved_bugs.map((doc, idx) => {
            const citationId = doc.ref_id
                ? String(doc.ref_id)
                : `PROJECT-${(doc.project_name || `ITEM_${idx}`).replace(/\s+/g, '_').substring(0, 30)}`;
            
            if (isMassiveListing && !isProjectListing) {
                // Lean context: omit heavy text blobs like steps_to_reproduce, content, and resolution
                const shortSummary = (doc.summary || doc.content || '').substring(0, 150).replace(/\n/g, ' ');
                return `<mantis_issue ref_id="${citationId}">
<project_name>${doc.project_name || 'N/A'}</project_name>
<status>${doc.status || 'N/A'}</status>
<bug_updated_at>${doc.bug_updated_at || 'N/A'}</bug_updated_at>
<summary>${shortSummary}</summary>
</mantis_issue>`;
            } else if (isProjectListing) {
                return `<mantis_project_summary>
<project_name>${doc.project_name || 'N/A'}</project_name>
<status>${doc.status || 'N/A'}</status>
<summary>${doc.summary || doc.description || ''}</summary>
</mantis_project_summary>`;
            } else {
                return `<mantis_issue ref_id="${citationId}">
<project_name>${doc.project_name || 'N/A'}</project_name>
<category_name>${doc.category_name || 'N/A'}</category_name>
    <priority>${doc.priority || doc.metadata?.priority || 'N/A'}</priority>
    <assigned_to>${doc.assigned_to || doc.metadata?.assigned_to || doc.metadata?.handler_name || 'N/A'}</assigned_to>
<status>${doc.status || 'N/A'}</status>
<resolution>${doc.resolution || 'N/A'}</resolution>
<steps_to_reproduce>${doc.steps_to_reproduce || 'N/A'}</steps_to_reproduce>
<content>${doc.content || doc.description || doc.summary || 'N/A'}</content>
<bug_updated_at>${doc.bug_updated_at || 'N/A'}</bug_updated_at>
</mantis_issue>`;
            }
        }).join('\n\n');

    } else {
        finalContext = "NO MANTIS ISSUES FOUND.";
    }

    let extraInstruction = "You are a Mantis Tracking Agent.\n";

    if (isProjectListing) {
        extraInstruction += "PROJECT LISTING RULE: The context contains aggregated project summaries, not individual bugs. Summarize the overall status of the requested projects. DO NOT try to format these as an issue list.\n";
    } else if (isMassiveListing) {
        extraInstruction += "MASSIVE LISTING FORMATTER RULE: Your ONLY job is to output a MARKDOWN TABLE of all provided tickets exactly once.\n" +
            "CRITICAL: DO NOT analyze. DO NOT summarize broadly. DO NOT output any introductory or concluding text (e.g. 'Here is the list', 'Now I will produce').\n" +
            "CRITICAL: DO NOT write any chain-of-thought or reasoning traces. Just immediately start printing the table.\n" +
            "Header MUST strictly be:\n| Ref ID | Project | Status | Summary | Updated |\n|---|---|---|---|---|\n" +
            "Ensure you list every single ref_id given in the XML as a separate table row without skipping or combining.\n";
    } else {
        extraInstruction += "CAUSE ANALYSIS RULE: If the user asks for causes, relationships, or an 'overview' of problems, you MUST analyze the descriptions and summaries of the tickets to find common patterns. Group bugs by module, error type, or technical root cause if possible.\n" +
        "COMPLETENESS RULE: Use <content> as the primary source for detailed answers. If fields conflict, trust content first, then description, then summary.\n";
    }

    extraInstruction += "CRITICAL TIME RULE: When identifying dates/months from the tickets (e.g., '03' or 'March'), you MUST secretly convert to the exact correct Thai month (e.g., 'มีนาคม'). NEVER output your reasoning process or translation step! Just output the final Thai date directly.\n";

    if (state.fallback_notice) {
        extraInstruction += `\nDATE FALLBACK RULE: Start your answer with this exact sentence before listing details: "${state.fallback_notice}"\n`;
        extraInstruction += "TEMPORAL TRUTH RULE: Do not imply results are from the requested date when fallback is active. Explicitly use each ticket's real bug_updated_at date.\n";
    }

    const workingMemory = {
        handled_ref_ids: handledRefIds,
        handled_projects: handledProjects
    };
    extraInstruction += `\nWORKING MEMORY (DO NOT REPEAT): ${JSON.stringify(workingMemory)}\n` +
        "ANTI-LOOP OUTPUT RULES:\n" +
        "1) Mention each ref_id at most once.\n" +
        "2) Do not output repetitive patterns like 'Also ... Ok.' loops.\n" +
        "3) Keep the answer exactly to the point.";

    // Inject resolved entity names so the LLM doesn't reject valid SQL returns!
    if (state.intent?.filters?.cag_filters?.included_projects?.length > 0) {
        const resolvedNames = state.intent.filters.cag_filters.included_projects.join(", ");
        extraInstruction += `\nENTITY MATCHING RULE: The search engine has safely mapped the user's intended projects to these exact database projects: [${resolvedNames}]. 
        - You MUST accept and summarize the provided tickets even if the project name in the tickets differs slightly from the user's spelling. 
        - TRUST the provided context as the source of truth. 
        - DO NOT state that you cannot find the requested project if data for the mapped projects is present.`;
    }

    const systemPrompt = SystemPrompts.RAG_SYSTEM_PROMPT_TEMPLATE(
        finalContext,
        extraInstruction
    );

    return {
        final_response: systemPrompt,
        retrieved_bugs: state.retrieved_bugs,
        thoughts: [{ id: 'agent-3', icon: 'pen-tool', description: 'Agent synthesizing the final answer from tickets...', status: 'active' }]
    };
}
