import * as SQLService from '../../services/sqlService.js';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * 🛠️ Data Analyst SQL Tool (LangChain Native)
 * Full Zod schema validation + native LangGraph integration
 */
export const sqlTool = tool(
    async ({ sql_request, project_name }) => {
        // Enforce string check manually just in case Zod is bypassed or handled loosely
        if (!sql_request) {
            return "Error: ขาดพารามิเตอร์ 'sql_request'. กรุณาระบุคำถามหรือ SQL ที่ต้องการรัน";
        }

        const filters = { project_name };
        const res = await SQLService.processSQLRequest(sql_request, filters);

        if (res.error) {
            return `SQL Error: ${res.error}`;
        }

        if (!res.results || res.results.length === 0) {
            return "Query สำเร็จแต่ไม่พบข้อมูล (No rows returned)";
        }

        // Return a clean summary of what was found
        const rowCount = res.results.length;
        const data = JSON.stringify(res.results.slice(0, 10), null, 2);

        return `พบข้อมูลทั้งหมด ${rowCount} รายการ (แสดง 10 รายการแรก):\n\n${data}`;
    },
    {
        name: "query_database_sql",
        description: `Useful for retrieving structured data, exact counts, numeric summaries, or raw data filtering across the PostgreSQL schema. Use this when the user needs exact numbers, structured reports, or filters by specific columns.
        
--- TABLES SCHEMA ---
1. documents (Knowledge Base):
   - columns: id, created_at, document_name, file_type, project_name, client_name, content
   - file_type: 'PDF', 'DOCX', 'EMAIL', 'IMAGE'
   
2. mantis_embeddings (Bug Tracker):
   - columns: id, ref_id (bug id), project_name, category_name, summary, description, status, resolution, bug_updated_at (text), created_at (timestamp)
   - status values: 'new', 'assigned', 'resolved', 'closed', 'feedback'
   - bug_updated_at note: Format 'YYYY-MM-DD', use SUBSTRING for filtering.`,
        schema: z.object({
            sql_request: z.string().describe("The SQL query or natural language description of the data needed (e.g., 'Show me all unresolved bugs for Project X')"),
            project_name: z.string().optional().describe("Optional project name filter"),
        }),
    }
);
