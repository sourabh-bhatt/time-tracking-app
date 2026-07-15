/* eslint-disable @typescript-eslint/no-require-imports */
const { ipcRenderer } = require('electron');

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
const presenceBadge = document.getElementById('presenceBadge');
const presenceLabel = document.getElementById('presenceLabel');
const presenceMeta = document.getElementById('presenceMeta');
const timeZoneHint = document.getElementById('timeZoneHint');
const flagsSection = document.getElementById('flagsSection');
const flagsList = document.getElementById('flagsList');
const flagsCount = document.getElementById('flagsCount');

const earningsModal = document.getElementById('earnings-modal');
const closeEarningsModal = document.getElementById('closeEarningsModal');
const weeklyPaidInput = document.getElementById('weeklyPaidInput');
const weeklyPendingInput = document.getElementById('weeklyPendingInput');
const totalPendingInput = document.getElementById('totalPendingInput');
const saveEarningsBtn = document.getElementById('saveEarningsBtn');
const usersSettingsIcon = document.querySelector('.settings-icon');

let currentUser = 'sourabh';
let envUser = 'sourabh';
let isTracking = false;
let trackingTimeZone = 'America/New_York';
let trackingTimeLabel = 'Eastern Time';
let idleThresholdSeconds = 300;
let knownFlagIds = new Set();

function pad(num) {
    return num.toString().padStart(2, '0');
}

function formatClock(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

function formatDurationShort(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
        return '0s';
    }

    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hrs > 0) {
        return `${hrs}h ${mins}m`;
    }

    if (mins > 0) {
        return `${mins}m ${secs}s`;
    }

    return `${secs}s`;
}

function formatTrackingTime(date, options = {}) {
    return new Date(date).toLocaleTimeString('en-US', {
        timeZone: trackingTimeZone,
        hour: 'numeric',
        minute: '2-digit',
        ...options,
    });
}

function getTimeZoneAbbreviation(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: trackingTimeZone,
        timeZoneName: 'short',
    }).formatToParts(new Date(date));

    return parts.find((part) => part.type === 'timeZoneName')?.value || '';
}

function getTimeZoneOffsetLabel(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: trackingTimeZone,
        timeZoneName: 'shortOffset',
    }).formatToParts(new Date(date));
    const raw = parts.find((part) => part.type === 'timeZoneName')?.value || '';
    const normalized = raw.replace(/^GMT/, 'UTC');
    const match = normalized.match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/);

    if (!match) {
        return normalized || 'UTC';
    }

    const [, sign, hours, minutes = '00'] = match;
    return `UTC${sign === '-' ? '−' : '+'}${hours.padStart(2, '0')}:${minutes}`;
}

function getTimeZoneHintText(date = new Date()) {
    const currentDate = new Date(date);
    const timeText = currentDate.toLocaleTimeString('en-US', {
        timeZone: trackingTimeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

    return `${timeText} ${trackingTimeLabel} ${getTimeZoneAbbreviation(currentDate)} · ${getTimeZoneOffsetLabel(currentDate)}`;
}

function updateTimeZoneHint(date = new Date()) {
    timeZoneHint.textContent = getTimeZoneHintText(date);
}

function updateTodayLabel() {
    todayDayDisplay.textContent = new Intl.DateTimeFormat('en-US', {
        timeZone: trackingTimeZone,
        weekday: 'short',
    }).format(new Date());
}

function setPresenceTheme(theme) {
    presenceBadge.classList.remove('presence-active', 'presence-idle', 'presence-offline', 'presence-paused');
    presenceBadge.classList.add(theme);
}

function renderPresence(presence) {
    isTracking = Boolean(presence.isTracking);
    toggleBtn.checked = isTracking;
    timerDisplay.textContent = formatClock(Number(presence.sessionWorkedSeconds || 0));

    let nextLabel = 'Offline';
    let nextMeta = `Waiting for ${trackingTimeLabel} heartbeat`;
    let nextTheme = 'presence-offline';

    if (presence.isOnline && !presence.isTracking) {
        nextLabel = 'Tracker Off';
        nextMeta = `Connected. Turn tracking on to start logging in ${trackingTimeLabel}.`;
        nextTheme = 'presence-paused';
    } else if (presence.isTracking && presence.isIdle) {
        nextLabel = 'Idle';
        nextMeta = `Idle for ${formatDurationShort(presence.idleDurationSeconds)}. Screenshots and time are paused.`;
        nextTheme = 'presence-idle';
    } else if (presence.isTracking) {
        nextLabel = 'Active';
        const trackingSince = presence.trackingStartedAt ? formatTrackingTime(presence.trackingStartedAt) : 'now';
        nextMeta = `Active for ${formatDurationShort(presence.activeDurationSeconds)}. Tracking since ${trackingSince}.`;
        nextTheme = 'presence-active';
    }

    presenceLabel.textContent = nextLabel;
    presenceMeta.textContent = nextMeta;
    setPresenceTheme(nextTheme);
    updateTimeZoneHint();
}

function updateTimerDisplay(totalSeconds = 0) {
    timerDisplay.textContent = formatClock(totalSeconds);
}

ipcRenderer.on('tracking-config', (_event, config) => {
    trackingTimeZone = config.trackingTimeZone || trackingTimeZone;
    trackingTimeLabel = config.trackingTimeLabel || trackingTimeLabel;
    idleThresholdSeconds = Number(config.idleThresholdSeconds || idleThresholdSeconds);
    updateTodayLabel();
    updateTimeZoneHint();
});

ipcRenderer.on('set-env-user', (_event, userId) => {
    envUser = userId.toLowerCase();

    const btnContainer = document.getElementById('user-select-buttons');
    if (envUser === 'prayash') {
        btnContainer.innerHTML = `
            <button class="btn user-btn" onclick="login('prayash')" style="background-color: #2c2c2c; width: 200px;">
                <i class="fas fa-user-circle" style="margin-right: 10px;"></i> Prayash
            </button>
        `;
    } else {
        btnContainer.innerHTML = `
            <button class="btn user-btn" onclick="login('sourabh')" style="width: 200px;">
                <i class="fas fa-user-circle" style="margin-right: 10px;"></i> Admin
            </button>
        `;
    }
});

window.login = (userId) => {
    currentUser = userId;
    ipcRenderer.send('user-login', userId);
};

window.openDiary = () => {
    const url = `https://time-tracking-app-two-nu.vercel.app/diary?user=${currentUser}`;
    ipcRenderer.send('open-external', url);
};

ipcRenderer.on('init-user', (_event, userId) => {
    currentUser = userId;
    const formattedName = userId.charAt(0).toUpperCase() + userId.slice(1);
    footerUserName.textContent = `${formattedName} ${formattedName}`;

    loginContainer.style.display = 'none';
    mainContainer.style.display = 'flex';

    const todayEarningsEl = document.getElementById('todayEarnings');
    const weekEarningsEl = document.getElementById('weekEarnings');
    const earningsToggleIcon = document.querySelector('.settings-icon');

    if (currentUser === 'prayash') {
        if (todayEarningsEl) todayEarningsEl.parentElement.style.display = 'none';
        if (weekEarningsEl) weekEarningsEl.parentElement.style.display = 'none';
        if (earningsToggleIcon) earningsToggleIcon.style.display = 'none';
    } else {
        if (todayEarningsEl) todayEarningsEl.parentElement.style.display = 'block';
        if (weekEarningsEl) weekEarningsEl.parentElement.style.display = 'block';
        if (earningsToggleIcon) earningsToggleIcon.style.display = 'inline-block';
    }
});

toggleBtn.addEventListener('change', (event) => {
    if (event.target.checked) {
        startTracking();
    } else {
        stopTracking();
    }
});

memoInput.addEventListener('change', () => {
    const memo = memoInput.value;
    localStorage.setItem('lastMemo', memo);
    ipcRenderer.send('update-memo', memo);
});

const savedMemo = localStorage.getItem('lastMemo');
if (savedMemo) {
    memoInput.value = savedMemo;
    ipcRenderer.send('update-memo', savedMemo);
}

function startTracking() {
    ipcRenderer.send('update-memo', memoInput.value);
    ipcRenderer.send('start-tracking');
}

function stopTracking() {
    ipcRenderer.send('stop-tracking');
}

ipcRenderer.on('update-stats', (_event, stats) => {
    todayTotalDisplay.textContent = formatClock(stats.todaySeconds);
    weekTotalDisplay.textContent = formatWeekHours(stats.weekSeconds);

    const todayEarningsEl = document.getElementById('todayEarnings');
    const weekEarningsEl = document.getElementById('weekEarnings');

    if (todayEarningsEl) todayEarningsEl.textContent = `$${stats.todayEarnings.toFixed(2)}`;
    if (weekEarningsEl) weekEarningsEl.textContent = `$${stats.weekEarnings.toFixed(2)}`;
});

ipcRenderer.on('presence-update', (_event, presence) => {
    renderPresence(presence);
});

ipcRenderer.on('flags-update', (_event, flags) => {
    const visibleFlags = Array.isArray(flags) ? flags.filter((flag) => !flag.hidden) : [];
    flagsSection.style.display = visibleFlags.length ? 'block' : 'none';
    flagsCount.textContent = String(visibleFlags.length);
    flagsList.innerHTML = visibleFlags.map((flag) => `<article class="flag-item"><div class="flag-kind">${flag.targetType === 'time-block' ? 'TIME BLOCK' : 'SCREENSHOT'}</div><div class="flag-reason"></div>${flag.employeeResponse ? '<div class="flag-response"></div>' : ''}</article>`).join('');
    visibleFlags.forEach((flag, index) => {
        const item = flagsList.children[index];
        item.querySelector('.flag-reason').textContent = flag.reason;
        const response = item.querySelector('.flag-response');
        if (response) response.textContent = `Your response: ${flag.employeeResponse}`;
        if (!knownFlagIds.has(flag._id)) new Notification('Admin review flag', { body: flag.reason });
    });
    knownFlagIds = new Set(visibleFlags.map((flag) => flag._id));
});

ipcRenderer.on('play-sound', () => {
    const notificationAudio = new Audio('./assets/notification.mp3');
    notificationAudio.volume = 0.5;
    notificationAudio.play().catch((error) => console.log('Audio play failed', error));
});

ipcRenderer.on('update-manual-earnings-data', (_event, data) => {
    if (weeklyPaidInput) weeklyPaidInput.value = data.weeklyPaid;
    if (weeklyPendingInput) weeklyPendingInput.value = data.weeklyPending;
    if (totalPendingInput) totalPendingInput.value = data.totalPending;
});

if (usersSettingsIcon) {
    usersSettingsIcon.addEventListener('click', () => {
        ipcRenderer.send('get-manual-earnings');
        earningsModal.style.display = 'block';
    });
}

if (closeEarningsModal) {
    closeEarningsModal.addEventListener('click', () => {
        earningsModal.style.display = 'none';
    });
}

window.onclick = (event) => {
    if (event.target === earningsModal) {
        earningsModal.style.display = 'none';
    }
};

if (saveEarningsBtn) {
    saveEarningsBtn.addEventListener('click', () => {
        ipcRenderer.send('update-manual-earnings', {
            weeklyPaid: weeklyPaidInput.value,
            weeklyPending: weeklyPendingInput.value,
            totalPending: totalPendingInput.value,
        });
        earningsModal.style.display = 'none';
    });
}

ipcRenderer.on('show-notification', (_event, data) => {
    new Notification(data.title, {
        body: data.body,
        silent: Boolean(data.silent),
    });
});

ipcRenderer.on('new-screenshot', (_event, data) => {
    screenshotPreview.src = data.image;
    screenshotPreview.style.display = 'block';
    noPreviewMsg.style.display = 'none';

    const time = formatTrackingTime(data.timestamp, { hour: '2-digit', minute: '2-digit' });
    lastCaptureTime.textContent = `Captured at ${time} ${trackingTimeLabel}`;
});

function formatWeekHours(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}:${pad(minutes)}`;
}

updateTodayLabel();
updateTimerDisplay(0);
updateTimeZoneHint();
