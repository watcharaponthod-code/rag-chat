import { vectorDb } from '../../config/db.js';
import RagConfig from '../../config/ragConfig.js';
import { tokenizeText } from '../../utils/tokenizer.js';
import { getEmbedding } from './embedding.js';
import Logger from '../loggerService.js';

function buildCagWhereClause(cag_filters, params) {
    let whereClause = "1=1";
    if (!cag_filters) return whereClause;

    const statusIn = Array.isArray(cag_filters.status_in) ? cag_filters.status_in : [];
    const statusNotIn = Array.isArray(cag_filters.status_not_in) ? cag_filters.status_not_in : [];

    if (cag_filters.included_projects?.length > 0) {
        const placeholders = cag_filters.included_projects.map(p => {
            params.push(p);
            return `$${params.length}`;
        });
        whereClause += ` AND project_name IN (${placeholders.join(', ')})`;
    }
    
    if (cag_filters.excluded_projects?.length > 0) {
        const placeholders = cag_filters.excluded_projects.map(p => {
            params.push(p);
            return `$${params.length}`;
        });
        whereClause += ` AND project_name NOT IN (${placeholders.join(', ')})`;
    }

    if (statusIn.length > 0) {
        const placeholders = statusIn.map(s => {
            params.push(s.toLowerCase());
            return `$${params.length}`;
        });
        whereClause += ` AND LOWER(status) IN (${placeholders.join(', ')})`;
    }

    // Avoid contradictory status filters: when status_in is explicit, ignore status_not_in.
    if (statusIn.length === 0 && statusNotIn.length > 0) {
        const placeholders = statusNotIn.map(s => {
            params.push(s.toLowerCase());
            return `$${params.length}`;
        });
        whereClause += ` AND LOWER(status) NOT IN (${placeholders.join(', ')})`;
    }

    // Backward-compatible fallback: open-status scope used by follow-up fallback path.
    if (cag_filters.mantis_status_open === true) {
        whereClause += " AND LOWER(status) IN ('new', 'assigned', 'feedback', 'acknowledged')";
    }

    if (cag_filters.included_categories?.length > 0) {
        const clauses = cag_filters.included_categories.map(c => {
            params.push(c);
            return `category_name ILIKE '%' || $${params.length} || '%'`;
        });
        whereClause += ` AND (${clauses.join(' OR ')})`;
    }

    if (cag_filters.excluded_categories?.length > 0) {
        cag_filters.excluded_categories.forEach(c => {
            params.push(c);
            whereClause += ` AND category_name NOT ILIKE '%' || $${params.length} || '%'`;
        });
    }

    if (cag_filters.excluded_ref_ids?.length > 0) {
        const placeholders = cag_filters.excluded_ref_ids.map(refId => {
            params.push(String(refId));
            return `$${params.length}`;
        });
        whereClause += ` AND CAST(ref_id AS TEXT) NOT IN (${placeholders.join(', ')})`;
    }

    if (cag_filters.date_range?.from) {
        const dType = cag_filters.date_type === 'created_at' ? 'created_at' : 'bug_updated_at';
        params.push(cag_filters.date_range.from);
        whereClause += ` AND LEFT(CAST(${dType} AS TEXT), 10) >= $${params.length} `;
    }
    
    if (cag_filters.date_range?.to) {
        const dType = cag_filters.date_type === 'created_at' ? 'created_at' : 'bug_updated_at';
        params.push(cag_filters.date_range.to);
        whereClause += ` AND LEFT(CAST(${dType} AS TEXT), 10) <= $${params.length} `;
    }

    return whereClause;
}

export const searchMantis = async (query, filters = {}, topK = 10) => {
    try {
        if (filters.exactRefId) {
            const exactSql = `
                SELECT id, ref_id, content, metadata, 
                       project_name, category_name, summary, description, steps_to_reproduce, additional_information, comments, status, resolution, bug_updated_at
                FROM mantis_embeddings
                WHERE ref_id = $1
                LIMIT 1
            `;
            const exactRes = await vectorDb.query(exactSql, [filters.exactRefId]);
            if (exactRes.rows.length > 0) {
                return exactRes.rows.map(row => ({
                    ...row,
                    similarity: 1.0,
                    v_score: 1.0,
                    t_score: 1.0,
                    source: 'exact',
                    document_name: `Work Item #${row.ref_id} (${row.project_name || row.metadata?.project_name || 'Unknown'})`,
                    content: `[Work Item] Project: ${row.project_name || row.metadata?.project_name || 'N/A'} | Status: ${row.status || 'N/A'} | ID: ${row.ref_id}\nSummary: ${row.summary || 'N/A'}\n${row.content}`
                }));
            }

            Logger.warn(`[MantisSearch] Exact ref lookup miss: ref_id=${filters.exactRefId}`);

            const fallbackParams = [];
            const fallbackWhere = buildCagWhereClause(filters.cag_filters, fallbackParams);
            fallbackParams.push(String(filters.exactRefId));
            fallbackParams.push(`%${String(filters.exactRefId)}%`);
            fallbackParams.push(topK);

            const fallbackSql = `
                SELECT id, ref_id, content, metadata,
                       project_name, category_name, summary, description, steps_to_reproduce, additional_information, comments, status, resolution, bug_updated_at,
                       0.95 as similarity,
                       0.95 as v_score,
                       0.95 as t_score,
                       'exact_fallback' as source
                FROM mantis_embeddings
                WHERE ${fallbackWhere}
                  AND (
                    CAST(ref_id AS TEXT) = $${fallbackParams.length - 2}
                    OR summary ILIKE $${fallbackParams.length - 1}
                    OR description ILIKE $${fallbackParams.length - 1}
                  )
                ORDER BY bug_updated_at DESC NULLS LAST
                LIMIT $${fallbackParams.length}
            `;

            const fallbackRes = await vectorDb.query(fallbackSql, fallbackParams);
            if (fallbackRes.rows.length > 0) {
                Logger.info(`[MantisSearch] Exact fallback recovered ${fallbackRes.rows.length} rows for ref=${filters.exactRefId}`);
                return fallbackRes.rows.map(row => ({
                    ...row,
                    document_name: `Work Item #${row.ref_id} (${row.project_name || row.metadata?.project_name || 'Unknown'})`,
                    content: `[Work Item] Project: ${row.project_name || row.metadata?.project_name || 'N/A'} | Status: ${row.status || 'N/A'} | ID: ${row.ref_id}\nSummary: ${row.summary || 'N/A'}\n${row.content}`
                }));
            }
        }

        const semanticQuery = filters.rag_search?.semantic_keyword || query;
        const embedding = await getEmbedding(semanticQuery);
        if (!embedding) return [];

        let tokenizedQuery = tokenizeText(semanticQuery);
        if (tokenizedQuery) tokenizedQuery = tokenizedQuery.split(/\s+/).join(' | ');

        const params = [JSON.stringify(embedding), tokenizedQuery || '', topK];
        let whereClause = buildCagWhereClause(filters.cag_filters, params);

        // Fallback backward compatibility maps
        if (filters.client_name) {
            whereClause += ` AND metadata->>'client_name' = $${params.length + 1}`;
            params.push(filters.client_name);
        }

        const sql = `
            WITH vector_matches AS(
                SELECT id, ref_id, content, metadata, GREATEST(1.0 - (embedding <=> $1), 0.0) as vector_score,
                       project_name, category_name, summary, description, steps_to_reproduce, additional_information, comments, status, resolution, bug_updated_at
                FROM mantis_embeddings
                WHERE ${whereClause}
                ORDER BY embedding <=> $1
                LIMIT $3 * 2
            ),
            keyword_matches AS (
                SELECT id, ref_id, content, metadata, 
                       ts_rank_cd(fts, to_tsquery('simple', NULLIF($2, ''))) as text_score,
                       project_name, category_name, summary, description, steps_to_reproduce, additional_information, comments, status, resolution, bug_updated_at
                FROM mantis_embeddings
                WHERE ${whereClause} 
                AND fts @@ to_tsquery('simple', NULLIF($2, ''))
                LIMIT $3 * 2
            )
            SELECT
                COALESCE(v.id, k.id) as id,
                COALESCE(v.ref_id, k.ref_id) as ref_id,
                COALESCE(v.content, k.content) as content,
                COALESCE(v.metadata, k.metadata) as metadata,
                COALESCE(v.vector_score, 0) as v_score,
                COALESCE(k.text_score, 0) as t_score,
                COALESCE(v.project_name, k.project_name) as project_name,
                COALESCE(v.category_name, k.category_name) as category_name,
                COALESCE(v.summary, k.summary) as summary,
                COALESCE(v.description, k.description) as description,
                COALESCE(v.steps_to_reproduce, k.steps_to_reproduce) as steps_to_reproduce,
                COALESCE(v.additional_information, k.additional_information) as additional_information,
                COALESCE(v.comments, k.comments) as comments,
                COALESCE(v.status, k.status) as status,
                COALESCE(v.resolution, k.resolution) as resolution,
                COALESCE(v.bug_updated_at, k.bug_updated_at) as bug_updated_at,
                (COALESCE(v.vector_score, 0) * ${RagConfig.search.vectorWeight}) + (LEAST(COALESCE(k.text_score, 0), 1.0) * ${RagConfig.search.keywordWeight}) as similarity,
                CASE WHEN k.text_score IS NOT NULL THEN 'hybrid' ELSE 'vector' END as source
            FROM vector_matches v
            FULL OUTER JOIN keyword_matches k ON v.id = k.id
            ORDER BY similarity DESC
            LIMIT $3
        `;

        const res = await vectorDb.query(sql, params);
        return res.rows.map(row => ({
            ...row,
            document_name: `Work Item #${row.ref_id} (${row.project_name || row.metadata?.project_name || 'Unknown'})`,
            content: `[Work Item] Project: ${row.project_name || row.metadata?.project_name || 'N/A'} | Status: ${row.status || 'N/A'} | ID: ${row.ref_id}\nSummary: ${row.summary || 'N/A'}\n${row.content}`
        }));

    } catch (e) {
        console.error('[MantisSearch] Error:', e.message);
        return [];
    }
};

export const listMantisProjects = async (filters = {}) => {
    try {
        const params = [];
        let whereClause = buildCagWhereClause(filters.cag_filters, params);

        const sql = `
            WITH unique_bugs AS (
                SELECT DISTINCT ON (ref_id) 
                    project_name, 
                    ref_id, 
                    status
                FROM mantis_embeddings
                WHERE ${whereClause}
            )
            SELECT
                project_name,
                COUNT(ref_id) AS total_bugs,
                SUM(CASE WHEN LOWER(status) IN ('new', 'assigned', 'feedback', 'acknowledged') THEN 1 ELSE 0 END) AS open_bugs,
                SUM(CASE WHEN LOWER(status) IN ('resolved', 'closed', 'fixed') THEN 1 ELSE 0 END) AS closed_bugs
            FROM unique_bugs
            GROUP BY project_name
            ORDER BY open_bugs DESC, total_bugs DESC
        `;


        return await vectorDb.query(sql, params);
    } catch (e) {
        console.error('[MantisSearch] List Error:', e.message);
        return { rows: [] };
    }
};

export const listMantisBugs = async (filters = {}, limit = 20) => {
    try {
        const params = [];
        let whereClause = buildCagWhereClause(filters.cag_filters, params);

        params.push(limit);

        const sql = `
            WITH unique_bugs AS (
                SELECT DISTINCT ON (ref_id)
                    id,
                    ref_id,
                    content,
                    metadata,
                    project_name,
                    category_name,
                    summary,
                    description,
                    steps_to_reproduce,
                    additional_information,
                    comments,
                    status,
                    resolution,
                    bug_updated_at,
                    created_at,
                    metadata->>'priority' AS priority,
                    COALESCE(metadata->>'assigned_to', metadata->>'handler_name') AS assigned_to
                FROM mantis_embeddings
                WHERE ${whereClause}
                ORDER BY ref_id, bug_updated_at DESC
            )
            SELECT *
            FROM unique_bugs
            ORDER BY bug_updated_at DESC NULLS LAST
            LIMIT $${params.length}
        `;

        const res = await vectorDb.query(sql, params);
        return {
            rows: res.rows.map(row => ({
                ...row,
                similarity: 1.0,
                document_name: `Work Item #${row.ref_id} (${row.project_name || row.metadata?.project_name || 'Unknown'})`,
                content: `[Work Item] Project: ${row.project_name || row.metadata?.project_name || 'N/A'} | Status: ${row.status || 'N/A'} | ID: ${row.ref_id}\nSummary: ${row.summary || 'N/A'}\n${row.content}`
            }))
        };
    } catch (e) {
        console.error('[MantisSearch] List Bugs Error:', e.message);
        return { rows: [] };
    }
};

