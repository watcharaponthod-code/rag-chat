import { unifiedSearch } from '../../services/retrievalService.js';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * 🛠️ Codebase Retrieval Tool (LangChain Native)
 * Full Zod schema validation + native LangGraph integration
 */
export const codebaseTool = tool(
    async ({ query, project_name }) => {
        const filters = { project_name };
        const results = await unifiedSearch(query, filters, { search_text: true, search_images: true });

        if (!results.textResults || results.textResults.length === 0) {
            return "ไม่พบเอกสารที่เกี่ยวข้องในฐานข้อมูล";
        }

        return results.textResults
            .slice(0, 8)
            .map((doc, i) => `[Doc-${i + 1}] Source: ${doc.document_name}\nContent: ${doc.content.substring(0, 800)}`)
            .join("\n\n");
    },
    {
        name: "search_codebase",
        description: "Useful for searching knowledge base documents, user manuals, flowcharts, specifications, and project-related images in the SYCAPT database. Use this tool when the user asks questions about HOW things work, system logic, or requests documentation.",
        schema: z.object({
            query: z.string().describe("Semantic search query, e.g. 'How does the login system work?'"),
            project_name: z.string().optional().describe("Optional project name to restrict search context"),
        })
    }
);
