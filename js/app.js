let currentToken = null;
let appData = { calendars: [] };
const aesKey = new Uint8Array(32); // Will be derived from token

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
        lastClick: null,
        days: {} // Store day states: { "YYYY-MM-DD": "green" | "red" | null }
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
        const today = new Date().toISOString().split('T')[0];
        calendar.days[today] = calendar.days[today] === 'green' ? 'red' : calendar.days[today] === 'red' ? null : 'green';
        await saveAppData();
        renderCalendars();
        playBlingSound();
    }
}

async function toggleDay(id, date) {
    const calendar = appData.calendars.find(c => c.id === id);
    if (calendar) {
        calendar.days[date] = calendar.days[date] === 'green' ? 'red' : calendar.days[date] === 'red' ? null : 'green';
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

function getCurrentStreak(calendar) {
    const today = new Date();
    let streak = 0;
    let currentDate = new Date(today);
    
    while (true) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (calendar.days[dateStr] === 'green') {
            streak++;
            currentDate.setDate(currentDate.getDate() - 1);
        } else {
            break;
        }
    }
    
    if (calendar.days[today.toISOString().split('T')[0]] !== 'green' && streak > 0) {
        streak--;
    }
    
    return streak;
}

function generateCalendarHTML(calendar) {
    const createdAt = new Date(calendar.createdAt);
    const today = new Date();
    const daysSince = getDaysSince(calendar.createdAt);
    const startDate = new Date(createdAt);
    startDate.setDate(1); // Start from the first of the month of creation
    
    let calendarHTML = '<div class="calendar-grid">';
    
    const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    daysOfWeek.forEach(day => {
        calendarHTML += `<div class="calendar-day day-header">${day}</div>`;
    });
    
    const firstDay = startDate.getDay();
    for (let i = 0; i < firstDay; i++) {
        calendarHTML += '<div class="calendar-day day-gray"></div>';
    }
    
    const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), day);
        const dateStr = currentDate.toISOString().split('T')[0];
        const isFuture = currentDate > today;
        const state = calendar.days[dateStr] || (isFuture ? 'future' : null);
        const className = isFuture ? 'day-gray' : state === 'green' ? 'day-green' : state === 'red' ? 'day-red' : 'day-gray';
        calendarHTML += `<div class="calendar-day ${className}" ${isFuture ? '' : `onclick="toggleDay(${calendar.id}, '${dateStr}')"`}>${day}</div>`;
    }
    
    calendarHTML += '</div>';
    return calendarHTML;
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
                <span>Total Clicks: ${calendar.clicks}</span>
                <span>Days: ${getDaysSince(calendar.createdAt)}</span>
                <span>Current Streak: ${getCurrentStreak(calendar)}</span>
            </div>
            <div style="margin-bottom: 15px; font-size: 0.9rem; color: #718096; text-align: center;">
                Last click: ${formatDate(calendar.lastClick)}
            </div>
            ${generateCalendarHTML(calendar)}
            <button class="click-btn" onclick="clickCalendar(${calendar.id})">
                ✨ Mark Today ✨
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
        const response = await fetch(`/backup/${currentToken}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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
        const response = await fetch(`/restore/${currentToken}`);
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
