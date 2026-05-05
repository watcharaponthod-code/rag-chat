import { searchMantis, listMantisBugs } from '../../services/retrievalService.js';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * 🛠️ Mantis Inspector Tool (LangChain Native)
 * Full Zod schema validation + native LangGraph integration
 */
export const mantisTool = tool(
    async ({ query, project_name, from_date, to_date }) => {
        const filters = { project_name, from_date, to_date };
        const isListingQuery = /มีอะไรบ้าง|มีบัคไรบ้าง|รายการบัค|list|ทั้งหมด|ทุกอัน|กี่อัน/.test(query.toLowerCase());

        let results = [];
        if (isListingQuery && project_name) {
            const listRes = await listMantisBugs(filters, 20);
            results = listRes.rows || [];
        } else {
            results = await searchMantis(query, filters);
        }

        if (!results || results.length === 0) {
            return "ไม่พบข้อมูลบั๊กที่เกี่ยวข้องในระบบ Mantis";
        }

        return results
            .slice(0, 5)
            .map((bug, i) => {
                const assignee = bug.assigned_to || bug.metadata?.assigned_to || bug.metadata?.handler_name || 'N/A';
                const priority = bug.priority || bug.metadata?.priority || 'N/A';
                return `[Bug-${i + 1}] ID: ${bug.ref_id || bug.id} | Project: ${bug.project_name}\nSummary: ${bug.summary}\nDate: ${bug.bug_updated_at || bug.created_at}\nStatus: ${bug.status} | Resolution: ${bug.resolution}\nPriority: ${priority} | Assignee: ${assignee}\nDescription: ${(bug.description || '').substring(0, 400)}`;
            })
            .join("\n\n");
    },
    {
        name: "search_mantis_bugs",
        description: "ใช้เมื่อต้องการข้อมูลเกี่ยวกับบั๊ก (Bugs), รายละเอียดการแจ้งซ่อม (Tickets), สถานะบั๊ก หรือความผิดพลาด (Errors) ที่เคยเกิดขึ้นในระบบ Mantis Bug Tracker",
        schema: z.object({
            query: z.string().describe("คำอธิบายบั๊กหรือ keywords เช่น 'login failed' หรือ 'NullPointerException'"),
            project_name: z.string().optional().describe("ชื่อโปรเจกต์ที่ต้องการค้นหาบั๊ก (optional)"),
            from_date: z.string().optional().describe("ค้นหาบั๊กตั้งแต่ช่วงเวลานี้ เช่น '2024-01-01' (optional)"),
            to_date: z.string().optional().describe("ค้นหาบั๊กถึงช่วงเวลานี้ เช่น '2024-12-31' (optional)"),
        }),
    }
);
