"use strict";
// background.ts (MV3 service worker)
// Global state
let tabToTitle = {};
let titleTimers = {};
let currentActiveTabId = null;
// Initialize listeners
chrome.runtime.onStartup.addListener(loadState);
chrome.runtime.onInstalled.addListener(loadState);
loadState();
function loadState() {
    chrome.storage.local.get(['titleTimers', 'tabToTitle'], (res) => {
        titleTimers = res.titleTimers || {};
        tabToTitle = res.tabToTitle || {};
    });
}
function saveState() {
    chrome.storage.local.set({ titleTimers, tabToTitle });
}
function ensureTitleTimer(title) {
    if (!titleTimers[title]) {
        titleTimers[title] = { accumulated: 0, runningSince: null, activeCount: 0 };
    }
    return titleTimers[title];
}
function startTitleIfNeeded(title) {
    const timer = ensureTitleTimer(title);
    if (timer.activeCount === 0 && !timer.runningSince) {
        timer.runningSince = Date.now();
    }
    timer.activeCount++;
    saveState();
}
function stopTitleIfNeeded(title) {
    const timer = titleTimers[title];
    if (!timer)
        return;
    if (timer.activeCount > 0)
        timer.activeCount--;
    if (timer.activeCount <= 0) {
        // Accumulate elapsed time and stop runningSince
        if (timer.runningSince) {
            timer.accumulated += Date.now() - timer.runningSince;
            timer.runningSince = null;
        }
        timer.activeCount = 0;
    }
    saveState();
}
function pauseAllTitles() {
    for (const title in titleTimers) {
        const timer = titleTimers[title];
        if (timer.runningSince) {
            timer.accumulated += Date.now() - timer.runningSince;
            timer.runningSince = null;
        }
        timer.activeCount = 0;
    }
    saveState();
}
function handleTabChange(newTabId) {
    // If same tab, nothing to do
    if (currentActiveTabId === newTabId)
        return;
    // Pause previous active tab's title
    if (currentActiveTabId !== null) {
        const prevTitle = tabToTitle[String(currentActiveTabId)];
        if (prevTitle)
            stopTitleIfNeeded(prevTitle);
    }
    currentActiveTabId = newTabId;
    if (newTabId === null || typeof newTabId === 'undefined')
        return;
    const title = tabToTitle[String(newTabId)];
    if (title) {
        startTitleIfNeeded(title);
    }
    // If we don't have the title yet, we'll wait until the content script reports it
}
function handleTabRemoved(tabId) {
    const id = String(tabId);
    const title = tabToTitle[id];
    // Remove mapping
    delete tabToTitle[id];
    // If removed tab was active, decrement count for its title
    if (String(currentActiveTabId) === id) {
        if (title)
            stopTitleIfNeeded(title);
        currentActiveTabId = null;
    }
    saveState();
}
// Chrome tab/window event listeners
chrome.tabs.onActivated.addListener((activeInfo) => {
    handleTabChange(activeInfo.tabId);
});
chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Window lost focus
        pauseAllTitles();
        currentActiveTabId = null;
    }
    else {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0] && tabs[0].id) {
                handleTabChange(tabs[0].id);
            }
            else {
                pauseAllTitles();
                currentActiveTabId = null;
            }
        });
    }
});
chrome.tabs.onRemoved.addListener((tabId) => {
    handleTabRemoved(tabId);
});
// Message listener from content scripts reporting title
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!sender.tab || typeof sender.tab.id === 'undefined') {
        return; // Ignore messages not from tabs
    }
    const tabId = String(sender.tab.id);
    if (msg.action === 'reportTitle') {
        const title = msg.title || null;
        if (title) {
            tabToTitle[tabId] = title;
            // Ensure there is a timer entry
            ensureTitleTimer(title);
            // If this tab is currently active, start timer for the title
            if (currentActiveTabId && String(currentActiveTabId) === tabId) {
                startTitleIfNeeded(title);
            }
        }
        else {
            // No title reported: remove mapping
            delete tabToTitle[tabId];
        }
        saveState();
        sendResponse({ ok: true });
    }
});
