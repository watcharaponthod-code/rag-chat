class SqlValidator {

    validate(sql) {
        const errors = [];

        if (!sql) {
            return { valid: false, errors: ['SQL is empty'] };
        }

        // 1. ต้องเริ่มด้วย SELECT
        if (!sql.trim().toUpperCase().startsWith('SELECT')) {
            errors.push('SQL must start with SELECT');
        }

        // 2. ห้ามมี dangerous keywords
        const dangerousKeywords = [
            'DROP', 'DELETE', 'TRUNCATE', 'ALTER',
            'CREATE', 'INSERT', 'UPDATE', 'GRANT', 'REVOKE'
        ];

        const upperSQL = sql.toUpperCase();
        dangerousKeywords.forEach(keyword => {
            // Use word boundaries for safety check
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            if (regex.test(sql)) {
                errors.push(`Forbidden keyword: ${keyword}`);
            }
        });

        // 3. ต้องมี table name ที่ถูกต้อง
        if (!upperSQL.includes('DOCUMENTS')) {
            errors.push('Query must reference documents table');
        }

        // 4. ห้ามมี multiple statements
        const statements = sql.split(';').filter(s => s.trim());
        if (statements.length > 1) {
            errors.push('Multiple statements not allowed');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    sanitize(sql) {
        if (!sql) return '';

        // ลบ markdown code blocks
        let newSql = sql.replace(/```sql\n?/g, '');
        newSql = newSql.replace(/```\n?/g, '');

        // ลบ comments
        newSql = newSql.replace(/--.*$/gm, '');

        // Trim
        newSql = newSql.trim();

        // เพิ่ม LIMIT ถ้าไม่มี (safety)
        // Check if LIMIT is present, but NOT in a subquery or strict logic if possible.
        // Simple check: if LIMIT is not in text, append it.
        if (!newSql.toUpperCase().includes('LIMIT')) {
            // Ensure it ends with ; if distinct query, but usually we handle it
            if (newSql.endsWith(';')) {
                newSql = newSql.slice(0, -1) + ' LIMIT 100;';
            } else {
                newSql = newSql + ' LIMIT 100';
            }
        }

        return newSql;
    }
}

export default new SqlValidator();
