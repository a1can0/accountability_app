const express = require('express');
const app = express();
const RENDER_API_KEY = process.env.RENDER_API_KEY;
const RENDER_API_URL = 'https://api.render.com/v1';

app.use(express.json());

app.put('/backup/:token', async (req, res) => {
    try {
        const response = await fetch(`${RENDER_API_URL}/files/${req.params.token}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${RENDER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        res.json(await response.json());
    } catch (e) {
        res.status(500).json({ error: 'Backup failed' });
    }
});

app.get('/restore/:token', async (req, res) => {
    try {
        const response = await fetch(`${RENDER_API_URL}/files/${req.params.token}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${RENDER_API_KEY}` }
        });
        res.json(await response.json());
    } catch (e) {
        res.status(500).json({ error: 'Restore failed' });
    }
});

module.exports = app;
