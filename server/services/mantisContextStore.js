const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const mantisContextCache = new Map();
const TURN_SCOPED_TOP_LEVEL_KEYS = new Set([
    'other_bugs_mode',
    'is_listing_query'
]);
const TURN_SCOPED_CAG_KEYS = new Set([
    'excluded_ref_ids'
]);

const isEmptyValue = (value) => {
    if (value === undefined || value === null || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
};

const compactObject = (value) => {
    if (Array.isArray(value)) {
        const compacted = value
            .map(compactObject)
            .filter(v => !isEmptyValue(v));
        return compacted;
    }

    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            const compacted = compactObject(v);
            if (!isEmptyValue(compacted)) out[k] = compacted;
        }
        return out;
    }

    return value;
};

const normalizeLegacyFlatKeys = (filters = {}) => {
    const normalized = { ...filters };
    const cag = { ...(normalized.cag_filters || {}) };

    if (normalized.project_name && (!Array.isArray(cag.included_projects) || cag.included_projects.length === 0)) {
        cag.included_projects = [normalized.project_name];
    }

    if (!cag.date_range) cag.date_range = { from: null, to: null };
    if (normalized.from_date && !cag.date_range.from) cag.date_range.from = normalized.from_date;
    if (normalized.to_date && !cag.date_range.to) cag.date_range.to = normalized.to_date;

    if (Object.keys(cag).length > 0) {
        normalized.cag_filters = cag;
    }

    return normalized;
};

const normalizeFilters = (filters = {}) => {
    const normalized = normalizeLegacyFlatKeys(filters);

    // Do not persist one-turn execution controls across turns.
    for (const key of TURN_SCOPED_TOP_LEVEL_KEYS) {
        delete normalized[key];
    }

    if (normalized.cag_filters && typeof normalized.cag_filters === 'object') {
        for (const key of TURN_SCOPED_CAG_KEYS) {
            delete normalized.cag_filters[key];
        }
    }

    return compactObject(normalized);
};

export const getMantisContext = (sessionId) => {
    if (!sessionId) return null;

    const record = mantisContextCache.get(sessionId);
    if (!record) return null;

    const isExpired = Date.now() - record.updatedAt > CACHE_TTL_MS;
    if (isExpired) {
        mantisContextCache.delete(sessionId);
        return null;
    }

    // Guard old cache entries: normalize on read so legacy turn-scoped keys are dropped.
    const normalizedFilters = normalizeFilters(record.filters || {});
    if (JSON.stringify(normalizedFilters) !== JSON.stringify(record.filters || {})) {
        record.filters = normalizedFilters;
        record.updatedAt = Date.now();
        mantisContextCache.set(sessionId, record);
    }

    return record;
};

export const setMantisContext = (sessionId, filters = {}) => {
    if (!sessionId) return null;

    const normalized = normalizeFilters(filters);
    if (Object.keys(normalized).length === 0) {
        return null;
    }

    const record = {
        filters: normalized,
        updatedAt: Date.now()
    };

    mantisContextCache.set(sessionId, record);
    return record;
};

export const mergeMantisFilters = (baseFilters = {}, overrideFilters = {}) => {
    const base = normalizeFilters(baseFilters);
    const override = normalizeFilters(overrideFilters);

    const mergeDeep = (a, b) => {
        if (Array.isArray(b)) return [...b];
        if (!b || typeof b !== 'object') return b;

        const out = { ...(a && typeof a === 'object' ? a : {}) };
        for (const [k, v] of Object.entries(b)) {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                out[k] = mergeDeep(out[k], v);
            } else {
                out[k] = v;
            }
        }
        return out;
    };

    return mergeDeep(base, override);
};
