import { BaseStrategy } from '../baseStrategy.js';
import * as SQLService from '../../services/sqlService.js';
import * as LLMService from '../../services/llmService.js';
import * as RetrievalService from '../../services/retrievalService.js';
import RagConfig from '../../config/ragConfig.js';
import StrategyConfig from '../../config/strategies.config.js';

export class SqlStrategy extends BaseStrategy {
    async execute(query, intent, sessionId, user, res, history) {
        this.log('info', `Executing Chained SQL-to-Vector search for: "${query}"`);

        const thoughts = [
            { id: '1', icon: 'database', description: `Executing SQL for metadata search...`, status: 'active' }
        ];
        this.sendThoughts(res, thoughts);

        try {
            const { timeout, vectorContextLimit } = StrategyConfig.sql;

            // 🧠 STEP 1: Execute SQL (Prepared or Agent)
            let sqlResponse;
            const projectListRegex = /มีโปรเจ็ค(ไหน|อะไร|ไร)บ้าง|รายชื่อโปรเจ็ค|ขอ(ลิสต์|list)โปรเจ็ค|ลิสต์โปรเจ็ค|ลิสต์งาน/i;
            const docListRegex = /มี(เอกสาร|ไฟล์)(อะไร|ไหน|ไร)บ้าง|ขอดูเอกสาร|ลิสต์เอกสาร|list documents/i;

            if (projectListRegex.test(query) || docListRegex.test(query)) {
                this.log('info', 'Detected Metadata List query. Using prepared SQL.');
                const clientName = intent.filters?.client_name;
                const projectName = intent.filters?.project_name;

                let preparedSql, params = [];

                if (docListRegex.test(query)) {
                    // Scenario A: List Documents (Filtered by Project/Client)
                    thoughts[0].description = `Listing documents for ${projectName || clientName || 'All'}`;
                    preparedSql = `SELECT document_name, file_type, project_name, created_at FROM documents WHERE 1=1`;
                    if (clientName) {
                        preparedSql += ` AND client_name = $${params.length + 1}`;
                        params.push(clientName);
                    }
                    if (projectName && projectName !== 'ALL' && projectName !== 'ทั้งหมด') {
                        preparedSql += ` AND project_name = $${params.length + 1}`;
                        params.push(projectName);
                    }
                    preparedSql += ` ORDER BY created_at DESC LIMIT 100`;
                } else {
                    // Scenario B: List Projects
                    thoughts[0].description = `Listing projects for ${clientName || 'All Clients'}`;
                    if (clientName) {
                        preparedSql = `SELECT DISTINCT project_name FROM documents WHERE client_name = $1 AND project_name IS NOT NULL ORDER BY project_name ASC LIMIT 100`;
                        params = [clientName];
                    } else {
                        preparedSql = `SELECT DISTINCT project_name, client_name FROM documents WHERE project_name IS NOT NULL ORDER BY client_name, project_name ASC LIMIT 100`;
                        params = [];
                    }
                }

                try {
                    const dbRes = await SQLService.db.query(preparedSql, params);
                    sqlResponse = { results: dbRes.rows, sql: preparedSql, rowCount: dbRes.rowCount };
                } catch (dbErr) {
                    this.log('error', `Prepared Query Error: ${dbErr.message}`);
                    sqlResponse = { results: [], sql: preparedSql, rowCount: 0, error: dbErr.message };
                }
            } else {
                sqlResponse = await Promise.race([
                    SQLService.processSQLRequest(intent.extracted_query || query, intent.filters || {}),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('SQL Timeout')), timeout))
                ]);
            }

            let sqlContext = "";
            let sqlEntities = { projects: [], docs: [] };

            if (sqlResponse.error) {
                thoughts[0].status = 'completed';
                thoughts.push({ id: '2', icon: 'alert-triangle', description: 'SQL failed, attempting broad semantic search...', status: 'completed' });
                sqlContext = `### SQL Search (Failed)\nError: ${sqlResponse.error}`;
            } else if (sqlResponse.results && sqlResponse.results.length > 0) {
                thoughts[0].status = 'completed';
                thoughts.push({ id: '2', icon: 'check', description: `Found ${sqlResponse.rowCount} database records`, status: 'completed' });
                const tableMd = SQLService.formatSQLResultsToMarkdown(sqlResponse.results);
                sqlContext = `### 📊 Database Records (SQL):\nSQL: \`${sqlResponse.sql}\`\n\n${tableMd}`;

                // Extract Entities for Chained Search
                sqlResponse.results.forEach(row => {
                    if (row.project_name) sqlEntities.projects.push(row.project_name);
                    if (row.document_name) sqlEntities.docs.push(row.document_name);
                });
            } else {
                thoughts[0].status = 'completed';
                thoughts.push({ id: '2', icon: 'x', description: 'No records found in database.', status: 'completed' });
                sqlContext = `### Database Search (Zero Results)\nSQL: \`${sqlResponse.sql}\``;
            }
            this.sendThoughts(res, thoughts);

            // 🧠 STEP 2: Chained Vector Search (The "Expanding" Step)
            thoughts.push({ id: '3', icon: 'search', description: 'Fetching detailed content for found items...', status: 'active' });
            this.sendThoughts(res, thoughts);

            // Dynamically adjust filters for vector search based on SQL results
            const chainedFilters = { ...intent.filters };

            // FIX: Only anchor if there is EXACTLY one project clearly identified, otherwise it restricts results too much.
            if (sqlEntities.projects.length === 1) {
                chainedFilters.project_name = sqlEntities.projects[0];
                this.log('info', `Chaining: Anchoring Vector Search to Project: "${chainedFilters.project_name}"`);
            }

            const searchRes = await RetrievalService.unifiedSearch(query, chainedFilters, intent, vectorContextLimit);
            let vectorContext = "";
            let finalDocs = [];
            let imageResults = [];

            if (searchRes.textResults && searchRes.textResults.length > 0) {
                // Process through filter for consistency
                const filterRes = RetrievalService.processResponseAndSources(searchRes.textResults);
                finalDocs = filterRes.filteredDocs.slice(0, vectorContextLimit);

                thoughts[2].description = `Found ${finalDocs.length} relevant semantic details`;
                thoughts[2].status = 'completed';

                vectorContext = "### 📄 Semantic Content Details (Vector Search):\n" +
                    finalDocs.map((doc, i) => `[S${i + 1}] ${doc.document_name} (${doc.project_name || 'General'}): ${doc.content}`).join('\n\n');
            } else {
                thoughts[2].description = 'No additional semantic details found.';
                thoughts[2].status = 'completed';
            }
            this.sendThoughts(res, thoughts);

            // Handle Images in SQL Strategy
            imageResults = searchRes.imageResults || [];
            const formattedImages = imageResults.slice(0, 5).map((img, idx) => ({
                id: img.id.toString(),
                refIndex: idx + 1,
                url: `/api/chat/images/${img.id}`,
                description: img.description || 'Image'
            }));

            if (formattedImages.length > 0) {
                res.write(`data: ${JSON.stringify({ type: 'related_images', images: formattedImages })} \n\n`);
            }

            const imageCtx = formattedImages.length > 0
                ? `\n\n### 🖼️ Available Visuals:\n${formattedImages.map(img => `- [Figure ${img.refIndex}] ${img.description}`).join('\n')}`
                : '';

            // 🧠 STEP 3: Synthesize Final Answer
            thoughts.push({ id: 'sum', icon: 'pen-tool', description: 'Synthesizing combined answer...', status: 'active' });
            this.sendThoughts(res, thoughts);

            const now = new Date().toLocaleString('th-TH', { dateStyle: 'full', timeStyle: 'short' });
            const systemPrompt = `You are a Data Analyst for Sycapt. 
            วันเวลาปัจจุบัน: ${now}
            ${intent.roleHint ? `\nROLE CONTEXT: ${intent.roleHint}\n` : ''}
            You have three sources of context:
            1. DATABASE RECORDS (SQL): Precise metadata, dates, IDs, name lists.
            2. SEMANTIC CONTENT (Vector): Detailed text from within the documents found.
            3. VISUALS (Images): Screenshots or diagrams related to the query.
            
            Context:
            ${sqlContext}
            
            ${vectorContext}
            
            ${imageCtx}
            
            ### Instructions:
            - Use the Database Records to answer "who/what/when/how many".
            - Use the Semantic Content to explain the "what/details/content".
            - Link information between both sources (e.g. if SQL lists a file, and Vector shows its content).
            - **Visuals**: If images are available, refer to them as [Figure X]. Do not use raw links.
            - Be concise and accurate.
            - If data is inconsistent or missing, state that clearly.`;

            const fullContent = await LLMService.streamResponse(
                RagConfig.llm.model,
                history,
                systemPrompt,
                { temperature: 0.1 },
                res,
                thoughts
            );

            this.endStream(res);
            return {
                content: fullContent,
                thoughts: thoughts,
                citations: { sources: finalDocs, related_images: formattedImages }
            };

        } catch (err) {
            this.handleError(res, err);
        }
    }
}
