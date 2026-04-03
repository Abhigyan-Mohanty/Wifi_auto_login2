const credentials = window.BITS_CREDENTIALS || [];

if (credentials.length === 0) {
    console.error("BITS Auto-Login: No credentials found in config/credentials.js!");
}

function showBanner(text) {
    let banner = document.getElementById("bits-auto-login-banner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "bits-auto-login-banner";
        banner.style.position = "fixed";
        banner.style.top = "0";
        banner.style.width = "100%";
        banner.style.backgroundColor = "#ff9800";
        banner.style.color = "white";
        banner.style.textAlign = "center";
        banner.style.padding = "10px";
        banner.style.zIndex = "9999";
        banner.style.fontSize = "18px";
        banner.style.fontWeight = "bold";
        document.body.prepend(banner);
    }
    banner.innerText = text;
}

async function startAutoLogin() {
    console.log("BITS Auto-Login: Start polling for status...");

    let isProcessing = false;

    // Check the page every 0.5 seconds. This catches errors that appear dynamically via AJAX
    setInterval(async () => {
        if (isProcessing) return;

        const bodyText = document.body.innerText;
        const lowerBodyText = bodyText.toLowerCase();

        // 1. Success Check
        if (lowerBodyText.includes("log out") || lowerBodyText.includes("logout") || lowerBodyText.includes("signed in") || lowerBodyText.includes("welcome")) {
            showBanner("BITS Auto-Login: Connected successfully!");
            await chrome.storage.local.set({ retryCount: 0 });
            return; // Successful, stop trying
        }

        // 2. Error Check
        const loginFailed = lowerBodyText.includes("failed") ||
            lowerBodyText.includes("invalid") ||
            lowerBodyText.includes("exceeded") ||
            lowerBodyText.includes("contact ccit");

        if (loginFailed) {
            isProcessing = true; // Pause polling so we don't trigger this 10 times a second
            console.log("BITS Auto-Login: [ERROR DETECTED] dynamically via poller.");

            const storage = await chrome.storage.local.get(["currentIdx", "retryCount"]);
            const currentIdx = storage.currentIdx || 0;
            const retryCount = storage.retryCount || 0;

            if (retryCount < credentials.length - 1) {
                const nextIdx = (currentIdx + 1) % credentials.length;
                const nextUser = credentials[nextIdx].user;

                showBanner(`Found Error! Cycling to next user: ${nextUser} (${retryCount + 2}/${credentials.length})`);

                // Update storage for the next attempt
                await chrome.storage.local.set({
                    currentIdx: nextIdx,
                    retryCount: retryCount + 1
                });

                // Clear out the error text from DOM safely so the next poll doesn't instantly double-trigger on the old error text
                const redFonts = document.querySelectorAll('font[color="red"], .error, #status, div[style*="color: red"]');
                redFonts.forEach(el => el.innerText = "Attempting next...");

                // Wait 0.5s for user to read the banner, then attempt login
                setTimeout(() => {
                    attemptLogin(nextIdx);
                    // Resume polling after 1 second (giving the portal time to show a NEW error if it fails again)
                    setTimeout(() => { isProcessing = false; }, 1000);
                }, 500);

            } else {
                showBanner("BITS Auto-Login: All accounts have hit their limit. Stopped.");
                await chrome.storage.local.set({ retryCount: 0 });
            }
        }
        // 3. Initial Login Attempt
        else if (!document.bitsLoginAttempted) {
            // First run, no error on screen
            document.bitsLoginAttempted = true;
            isProcessing = true;

            const storage = await chrome.storage.local.get(["currentIdx"]);
            const currentIdx = storage.currentIdx || 0;
            const currentUser = credentials[currentIdx];

            if (currentUser) {
                showBanner(`BITS Auto-Login: Attempting login for ${currentUser.user}...`);
                // Wait 0.5 second before doing the first attempt
                setTimeout(() => {
                    attemptLogin(currentIdx);
                    // Resume polling after 1 second
                    setTimeout(() => { isProcessing = false; }, 1000);
                }, 500);
            }
        }
    }, 500);
}

function attemptLogin(idx) {
    const cred = credentials[idx];
    if (!cred) return;

    console.log(`BITS Auto-Login: [UI] Entering credentials for ${cred.user}`);

    const userInput = document.querySelector('input[id="username"], input[name="username"], input[name="user"], #f_user, input[type="text"]');
    const passInput = document.querySelector('input[id="password"], input[name="password"], input[name="pass"], #f_pass, input[type="password"]');

    if (userInput && passInput) {
        userInput.value = cred.user;
        passInput.value = cred.pass;

        // Dispatch events to satisfy any page listeners
        const trigger = (el) => {
            ['input', 'change', 'blur'].forEach(ev => el.dispatchEvent(new Event(ev, { bubbles: true })));
        };
        trigger(userInput);
        trigger(passInput);

        // Find button
        let loginBtn = document.querySelector('#loginbutton, #btnSubmit, .login-btn, input[type="submit"], button[type="submit"]');
        if (!loginBtn) {
            const elements = Array.from(document.querySelectorAll('a, button, div, span'));
            loginBtn = elements.find(el => {
                const text = el.innerText.trim().toLowerCase();
                return text === "sign in" || text === "login";
            });
        }

        console.log("BITS Auto-Login: [UI] Attempting submission...");

        // Try submitting with a minimal 100ms delay to ensure fields are registered
        setTimeout(() => {
            const inject = document.createElement('script');
            inject.textContent = `
                if (typeof submitRequest === 'function') {
                    submitRequest();
                } else if (typeof login === 'function') {
                    login();
                }
            `;
            (document.head || document.documentElement).appendChild(inject);
            inject.remove();

            if (loginBtn) {
                loginBtn.click();
            }

            const enter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
            passInput.dispatchEvent(enter);
        }, 100);

    } else {
        console.warn("BITS Auto-Login: [UI] Could not find Username or Password fields.");
    }
}

// Run logic
startAutoLogin();
