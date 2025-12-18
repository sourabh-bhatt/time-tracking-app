const { ipcRenderer } = require('electron');

// DOM Elements
const loginContainer = document.getElementById('login-container');
const mainContainer = document.getElementById('main-container');
const toggleBtn = document.getElementById('toggleBtn');
const timerDisplay = document.getElementById('timer');
const todayTotalDisplay = document.getElementById('todayTotal');
const weekTotalDisplay = document.getElementById('weekTotal');
const todayDayDisplay = document.getElementById('todayDay');
const footerUserName = document.getElementById('footerUserName');
const memoInput = document.getElementById('memoInput');
const screenshotPreview = document.getElementById('screenshotPreview');
const noPreviewMsg = document.getElementById('noPreviewMsg');
const lastCaptureTime = document.getElementById('lastCaptureTime');

let isTracking = false;
let sessionInterval;
let sessionSeconds = 0;

// Set Today's Day Name
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
todayDayDisplay.textContent = days[new Date().getDay()];

// Login Logic
let currentUser = 'sourabh'; // Default fallback

// Login Logic
window.login = (userId) => {
    currentUser = userId; // Store for link
    ipcRenderer.send('user-login', userId);
};

window.openDiary = () => {
    // Open the Public Diary Route
    const url = `https://time-tracking-app-two-nu.vercel.app/diary?user=${currentUser}`;
    ipcRenderer.send('open-external', url);
};

// Initialize UI after login
ipcRenderer.on('init-user', (event, userId) => {
    currentUser = userId;
    // Format Name: sourabh -> Sourabh Sourabh
    const formattedName = userId.charAt(0).toUpperCase() + userId.slice(1);
    footerUserName.textContent = `${formattedName} ${formattedName}`; // Mockup style

    loginContainer.style.display = 'none';
    mainContainer.style.display = 'flex'; // Changed to flex for the column layout
});

// Toggle Tracking
toggleBtn.addEventListener('change', (e) => {
    if (e.target.checked) {
        startTracking();
    } else {
        stopTracking();
    }
});

// Memo Updates
memoInput.addEventListener('change', () => {
    const memo = memoInput.value;
    localStorage.setItem('lastMemo', memo); // Persist
    ipcRenderer.send('update-memo', memo);
});

// Load saved memo
const savedMemo = localStorage.getItem('lastMemo');
if (savedMemo) {
    memoInput.value = savedMemo;
    ipcRenderer.send('update-memo', savedMemo); // Sync immediately
}

function startTracking() {
    isTracking = true;
    sessionSeconds = 0;
    updateTimerDisplay(); // Reset immediately

    // Sync memo before starting
    ipcRenderer.send('update-memo', memoInput.value);
    ipcRenderer.send('start-tracking');

    sessionInterval = setInterval(() => {
        sessionSeconds++;
        updateTimerDisplay();
    }, 1000); // UI updates every second
}

function stopTracking() {
    isTracking = false;
    ipcRenderer.send('stop-tracking');
    clearInterval(sessionInterval);
    sessionSeconds = 0;
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const hrs = Math.floor(sessionSeconds / 3600);
    const mins = Math.floor((sessionSeconds % 3600) / 60);
    const secs = sessionSeconds % 60;

    // Format: HH:MM:SS
    timerDisplay.innerHTML = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

function pad(num) {
    return num.toString().padStart(2, '0');
}

// Handle Stats Updates from Main (Today/Week totals)
ipcRenderer.on('update-stats', (event, stats) => {
    // stats = { todaySeconds, weekSeconds, todayEarnings, weekEarnings }
    todayTotalDisplay.textContent = formatHrs(stats.todaySeconds);
    weekTotalDisplay.textContent = formatDecimalHrs(stats.weekSeconds);

    // Update Earnings if elements exist (will add to HTML next)
    const todayEarningsEl = document.getElementById('todayEarnings');
    const weekEarningsEl = document.getElementById('weekEarnings');

    if (todayEarningsEl) todayEarningsEl.textContent = `$${stats.todayEarnings.toFixed(2)}`;
    if (weekEarningsEl) weekEarningsEl.textContent = `$${stats.weekEarnings.toFixed(2)}`;
});

// Handle Sound
ipcRenderer.on('play-sound', () => {
    const audio = new Audio('assets/shutter.mp3'); // We'll need to ensure this exists or use a base64 default
    // Fallback if file doesn't exist: Simple beep or encoded sound
    // Using a short base64 beep for reliability if file is missing
    const beep = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"; // Very short/empty, replacing with real simple beep logic or just HTML5 default if available
    // Better: Just use a system notification sound or standard UI sound. 
    // For now, let's try a standard HTML5 beep if possible or just log it. 
    // Actually, let's play a simple created tone or just use a placeholder file path and I'll create the file.
    // I'll create a 'shutter.mp3' or 'notification.wav' in assets.

    // Let's assume we will create 'notification.mp3' in a new assets folder.
    const notificationAudio = new Audio('./assets/notification.mp3');
    notificationAudio.volume = 0.5;
    notificationAudio.play().catch(e => console.log('Audio play failed', e));
});

// Handle Notification
ipcRenderer.on('show-notification', (event, data) => {
    const notification = new Notification(data.title, {
        body: data.body
    });
});

// Handle New Screenshot for Preview
ipcRenderer.on('new-screenshot', (event, data) => {
    screenshotPreview.src = data.image;
    screenshotPreview.style.display = 'block';
    noPreviewMsg.style.display = 'none';

    // Update "15 hours ago" style text (Mock logic for now, just shows time)
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    lastCaptureTime.textContent = `Today at ${time}`;
});

function formatHrs(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

function formatDecimalHrs(totalSeconds) {
    const hrs = (totalSeconds / 3600).toFixed(2); // Example: 31.10
    // Replace dot with colon if preferred, but Upwork uses decimal or HH:MM. 
    // The screenshot shows "31:10 of 30", which looks like MM:SS or HH:MM. 
    // "0 hrs 00 m" is the timer. 
    // "31:10" usually means HH:MM in tracker contexts for totals.
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return `${h}:${pad(m)}`;
}
