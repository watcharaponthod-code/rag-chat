import { vectorDb } from '../../config/db.js';
import RagConfig from '../../config/ragConfig.js';
import { tokenizeText } from '../../utils/tokenizer.js';
import { getEmbedding } from './embedding.js';

export const searchImages = async (query, filters = {}, topK = 10) => {
    try {
        let vectorImages = [];
        let ftsImages = [];

        const embedding = await getEmbedding(query);
        if (embedding) {
            let whereClause = "i.embedding IS NOT NULL";
            const params = [`[${embedding.join(',')}]`, topK];

            if (filters.project_name) {
                whereClause += ` AND (d.project_name ILIKE '%' || $${params.length + 1} || '%' OR i.metadata->>'project_name' ILIKE '%' || $${params.length + 1} || '%')`;
                params.push(filters.project_name);
            }
            if (filters.client_name) {
                whereClause += ` AND d.client_name = $${params.length + 1}`;
                params.push(filters.client_name);
            }

            const sql = `
                SELECT i.id, i.doc_id, i.page_number, i.image_path, i.description, 
                       COALESCE(i.metadata->>'project_name', d.project_name) as project_name, 
                       d.client_name,
                       (i.embedding <#> $1) * -1 as similarity, 'vector' as source
                FROM document_images i
                LEFT JOIN documents d ON i.doc_id = d.id
                WHERE ${whereClause}
                ORDER BY i.embedding <#> $1
                LIMIT $2
            `;

            try {
                const res = await vectorDb.query(sql, params);
                vectorImages = res.rows.map(img => ({
                    ...img,
                    content: `[Image Content] Project: ${img.project_name} | Client: ${img.client_name} | Description: ${img.description}\n(Image ID: ${img.id})`,
                    type: 'image'
                }));
            } catch (e) { console.warn('[ImageSearch] Vector search failed:', e.message); }
        }

        let tokenizedQuery = tokenizeText(query);
        if (tokenizedQuery) {
            tokenizedQuery = tokenizedQuery.split(/\s+/).join(' | ');
            let ftsWhereClause = "i.fts @@ to_tsquery('simple', $1)";
            const ftsParams = [tokenizedQuery, topK];

            if (filters.project_name) {
                ftsWhereClause += ` AND (d.project_name ILIKE '%' || $${ftsParams.length + 1} || '%' OR i.metadata->>'project_name' ILIKE '%' || $${ftsParams.length + 1} || '%')`;
                ftsParams.push(filters.project_name);
            }
            if (filters.client_name) {
                ftsWhereClause += ` AND d.client_name = $${ftsParams.length + 1}`;
                ftsParams.push(filters.client_name);
            }

            const ftsSql = `
                SELECT i.id, i.doc_id, i.page_number, i.image_path, i.description, 
                       COALESCE(i.metadata->>'project_name', d.project_name) as project_name, 
                       d.client_name,
                       ts_rank_cd(i.fts, to_tsquery('simple', $1)) as similarity, 'keyword' as source
                FROM document_images i
                LEFT JOIN documents d ON i.doc_id = d.id
                WHERE ${ftsWhereClause}
                ORDER BY similarity DESC
                LIMIT $2
            `;
            try {
                const res = await vectorDb.query(ftsSql, ftsParams);
                ftsImages = res.rows.map(img => ({
                    ...img,
                    content: `[Image Content] Project: ${img.project_name} | Client: ${img.client_name} | Description: ${img.description}\n(Image ID: ${img.id})`,
                    type: 'image'
                }));
            } catch (e) { console.warn('[ImageSearch] FTS search failed:', e.message); }
        }

        const combined = new Map();
        [...vectorImages, ...ftsImages].forEach(img => {
            if (!combined.has(img.id)) {
                combined.set(img.id, img);
            } else {
                const existing = combined.get(img.id);
                existing.similarity = Math.max(existing.similarity, img.similarity) * 1.2;
                existing.source = 'hybrid';
            }
        });

        return Array.from(combined.values())
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);

    } catch (err) {
        console.error('Image search fatal error:', err);
        return [];
    }
};
