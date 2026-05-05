import { vectorDb } from '../../config/db.js';

export const getImage = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await vectorDb.query('SELECT image_data FROM document_images WHERE id = $1', [id]);
        if (result.rows.length === 0 || !result.rows[0].image_data) {
            return res.status(404).send('Image not found');
        }
        res.setHeader('Content-Type', 'image/png');
        res.send(result.rows[0].image_data);
    } catch (e) {
        console.error('[ResourceController] API Error:', e);
        res.status(500).send('Error retrieving image');
    }
};

export const getClients = async (req, res) => {
    try {
        const result = await vectorDb.query(
            'SELECT DISTINCT client_name FROM documents WHERE client_name IS NOT NULL AND client_name != \'\' ORDER BY client_name ASC'
        );
        res.json(result.rows.map(r => r.client_name));
    } catch (e) {
        console.error('[GetClients] Error:', e);
        res.status(500).json([]);
    }
};
