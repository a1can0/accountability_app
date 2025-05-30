const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

// Enable CORS for your static site's domain
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.STATIC_SITE_URL || '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// In-memory store (replace with a database in production)
const dataStore = {};

// Backup endpoint
app.put('/backup/:token', (req, res) => {
    try {
        const token = req.params.token;
        if (!token || token.length < 64) {
            return res.status(400).json({ error: 'Invalid token' });
        }
        dataStore[token] = req.body; // Store encrypted data
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Backup failed' });
    }
});

// Restore endpoint
app.get('/restore/:token', (req, res) => {
    try {
        const token = req.params.token;
        if (!token || token.length < 64) {
            return res.status(400).json({ error: 'Invalid token' });
        }
        const data = dataStore[token];
        if (!data) {
            return res.status(404).json({ error: 'No data found for this token' });
        }
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Restore failed' });
    }
});

app.listen(port, () => {
    console.log(`App listening on port ${port}`);
});
