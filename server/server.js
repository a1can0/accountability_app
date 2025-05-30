const express = require('express');
const app = express();
const RENDER_API_KEY = process.env.RENDER_API_KEY;
const RENDER_API_URL = 'https://api.render.com/v1'; // Replace with actual Render storage API endpoint

app.use(express.json());

// Enable CORS for your static site's domain
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.STATIC_SITE_URL || '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

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
        if (response.ok) {
            res.json(await response.json());
        } else {
            res.status(response.status).json({ error: 'Backup failed' });
        }
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
        if (response.ok) {
            res.json(await response.json());
        } else {
            res.status(response.status).json({ error: 'Restore failed' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Restore failed' });
    }
});

module.exports = app;
