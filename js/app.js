let currentToken = null;
let appData = { calendars: [] };
const aesKey = new Uint8Array(32); // Will be derived from token
const RENDER_API_URL = 'https://api.render.com/v1/storage'; // Replace with actual Render storage API endpoint
const RENDER_API_KEY = 'your-render-api-key'; // Replace with your Render API key

// Initialize app
window.addEventListener('load', async function () {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token && token.length >= 64) {
        currentToken = token;
        await deriveKeyFromToken(token);
        await loadAppData();
        showMainApp();
        setupBackupReminder();
    }
});

// Crypto functions
async function deriveKeyFromToken(token) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(token),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
    );
    const key = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: encoder.encode("recovery-tracker"),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        256
    );
    aesKey.set(new Uint8Array(key));
}

async function encryptData(data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey(
        "raw",
        aesKey,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
    );
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoded
    );
    return { iv: Array.from(iv), encrypted: Array.from(new Uint8Array(encrypted)) };
}

async function decryptData(encryptedObj) {
    const key = await crypto.subtle.importKey(
        "raw",
        aesKey,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(encryptedObj.iv) },
        key,
        new Uint8Array(encryptedObj.encrypted)
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
}

function generateToken() {
    const array = new Uint8Array(64);
    crypto.getRandomValues(array);
    currentToken = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('token', currentToken);
    window.history.replaceState({}, '', newUrl);
    
    deriveKeyFromToken(currentToken).then(() => {
        loadAppData();
        showMainApp();
        setupBackupReminder();
    });
}

function showMainApp() {
    document.getElementById('welcomeScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('tokenDisplay').textContent = currentToken;
    renderCalendars();
}

async function loadAppData() {
    const stored = localStorage.getItem('recoveryTracker_' + currentToken);
    if (stored) {
        try {
            const encryptedObj = JSON.parse(stored);
            appData = await decryptData(encryptedObj);
        } catch (e) {
            appData = { calendars: [] };
        }
    } else {
        appData = { calendars: [] };
    }
}

async function saveAppData() {
    const encrypted = await encryptData(appData);
    localStorage.setItem('recoveryTracker_' + currentToken, JSON.stringify(encrypted));
}

function setTitle(title) {
    document.getElementById('calendarTitle').value = title;
}

async function createCalendar() {
    const title = document.getElementById('calendarTitle').value.trim();
    if (!title) {
        alert('Please enter a goal title!');
        return;
    }

    const calendar = {
        id: Date.now(),
        title: title,
        clicks: 0,
        createdAt: new Date().toISOString(),
        lastClick: null
    };

    appData.calendars.push(calendar);
    await saveAppData();
    renderCalendars();
    document.getElementById('calendarTitle').value = '';
}

async function clickCalendar(id) {
    const calendar = appData.calendars.find(c => c.id === id);
    if (calendar) {
        calendar.clicks++;
        calendar.lastClick = new Date().toISOString();
        await saveAppData();
        renderCalendars();
        playBlingSound();
    }
}

async function deleteCalendar(id) {
    if (confirm('Are you sure you want to delete this goal tracker?')) {
        appData.calendars = appData.calendars.filter(c => c.id !== id);
        await saveAppData();
        renderCalendars();
    }
}

function playBlingSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator1 = audioContext.createOscillator();
    const oscillator2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator1.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator2.frequency.setValueAtTime(1200, audioContext.currentTime);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator1.start(audioContext.currentTime);
    oscillator2.start(audioContext.currentTime);
    oscillator1.stop(audioContext.currentTime + 0.5);
    oscillator2.stop(audioContext.currentTime + 0.5);
}

function formatDate(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function getDaysSince(dateString) {
    if (!dateString) return 0;
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function renderCalendars() {
    const grid = document.getElementById('calendarsGrid');
    
    if (appData.calendars.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: #718096; grid-column: 1/-1;">No goal trackers yet. Create your first one above!</p>';
        return;
    }

    grid.innerHTML = appData.calendars.map(calendar => `
        <div class="calendar-card">
            <div class="calendar-title">${calendar.title}</div>
            <div class="calendar-stats">
                <span>Total: ${calendar.clicks}</span>
                <span>Days: ${getDaysSince(calendar.createdAt)}</span>
            </div>
            <div style="margin-bottom: 15px; font-size: 0.9rem; color: #718096; text-align: center;">
                Last click: ${formatDate(calendar.lastClick)}
            </div>
            <button class="click-btn" onclick="clickCalendar(${calendar.id})">
                ✨ Mark Progress ✨
            </button>
            <button class="delete-btn" onclick="deleteCalendar(${calendar.id})">Delete</button>
            <div style="clear: both;"></div>
        </div>
    `).join('');
}

async function exportData() {
    const encrypted = await encryptData(appData);
    const blob = new Blob([JSON.stringify(encrypted)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recovery-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const encryptedObj = JSON.parse(e.target.result);
            appData = await decryptData(encryptedObj);
            await saveAppData();
            renderCalendars();
            alert('Data imported successfully!');
        } catch (e) {
            alert('Error importing data. Please ensure the file is valid and matches your token.');
        }
    };
    reader.readAsText(file);
}

async function backupToCloud() {
    const encrypted = await encryptData(appData);
    try {
        const response = await fetch(`${RENDER_API_URL}/files/${currentToken}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${RENDER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(encrypted)
        });
        if (response.ok) {
            const result = await response.json();
            prompt('Your backup was successful! Save this token to restore:', currentToken);
        } else {
            throw new Error('Backup failed');
        }
    } catch (e) {
        alert('Cloud backup failed. Please try exporting to a file instead.');
    }
}

async function restoreFromCloud() {
    try {
        const response = await fetch(`${RENDER_API_URL}/files/${currentToken}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${RENDER_API_KEY}`
            }
        });
        if (response.ok) {
            const encryptedObj = await response.json();
            appData = await decryptData(encryptedObj);
            await saveAppData();
            renderCalendars();
            alert('Data restored successfully from cloud!');
        } else {
            throw new Error('Restore failed');
        }
    } catch (e) {
        alert('Cloud restore failed. Please ensure the token is correct.');
    }
}

function setupBackupReminder() {
    if (!("Notification" in window)) return;

    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            setInterval(() => {
                new Notification("Recovery Tracker", {
                    body: "Time to backup your data! Click 'Export Data' or 'Cloud Backup' to save your progress.",
                    icon: 'assets/favicon.ico'
                });
            }, 7 * 24 * 60 * 60 * 1000); // Weekly reminders
        }
    });
}
