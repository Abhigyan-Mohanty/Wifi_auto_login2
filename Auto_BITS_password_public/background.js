chrome.runtime.onInstalled.addListener(() => {
    console.log("BITS WiFi Auto-Login Extension Installed.");
    chrome.storage.local.set({ currentIdx: 0, retryCount: 0, lastErrorUser: "" });
});
