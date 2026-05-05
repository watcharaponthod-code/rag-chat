import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const entityMapping = require('../config/entityMapping.json');

export function expandEntityQuery(query) {
    let expandedQuery = query;

    // ตรวจหา entities ในคำถาม
    Object.entries(entityMapping.clients).forEach(([key, entity]) => {
        entity.variations.forEach(variation => {
            // Create a regex that matches the variation as a whole word, roughly
            // We escape the variation string to handle special charaters if any
            const escapedVariation = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedVariation}\\b`, 'gi');

            if (regex.test(query)) {
                // พบ entity - เพิ่มข้อมูลให้ SQLCoder
                expandedQuery += `\n(Note: "${variation}" refers to ${entity.variations.join(', ')})`;
            }
        });
    });

    return expandedQuery;
}
