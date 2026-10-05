/**
 * Main Application Orchestrator
 */
const App = {
    activeTab: 'calendar', // 'calendar' | 'stats'

    async init() {
        // 1. Initialize Settings Manager (Loads local + fetches remote settings)
        if (typeof SettingsManager !== 'undefined') {
            await SettingsManager.init();
        }

        // 2. Initialize Theme Manager (Light by default, Dark, System)
        ThemeManager.init();

        // 3. Fetch runtime backend config
        try {
            const cfg = await API.fetchConfig();
            if (cfg.currency_symbol) {
                State.currency = cfg.currency_symbol;
                STRINGS.common.currency = cfg.currency_symbol;
            }
            if (cfg.is_configured === false) {
                const btnSync = document.getElementById('btn-sync');
                if (btnSync) {
                    btnSync.disabled = true;
                    btnSync.classList.add('disabled');
                    btnSync.title = "Configure IBKR_TOKEN and IBKR_QUERY_ID in .env to enable sync";
                }
            }
        } catch (e) {
            console.warn("Could not fetch app config, using defaults:", e);
        }

        // 4. Apply centralized translations to static HTML
        this.applyTranslations();

        // 5. Setup Main Tab Navigation (Calendar / Stats)
        this.setupTabNavigation();

        // 6. Setup Sync Button
        this.setupSyncButton();

        // 7. Initialize Modals & Top Stats Polling
        DayModal.init();
        ImportModal.init();
        if (typeof CashModal !== 'undefined' && CashModal.init) {
            CashModal.init();
        }
        StatsController.startPolling();

        // 8. Restore persisted tab (default to Calendar)
        const savedTab = typeof SettingsManager !== 'undefined' ? SettingsManager.get('activeTab', 'calendar') : 'calendar';
        this.switchTab(savedTab);
    },

    applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const value = this.resolveString(key);
            if (value !== undefined) {
                el.textContent = value;
            }
        });
    },

    resolveString(path) {
        return path.split('.').reduce((acc, part) => acc && acc[part], STRINGS);
    },

    setupTabNavigation() {
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.getAttribute('data-tab');
                if (target) this.switchTab(target);
            });
        });
    },

    switchTab(tabName) {
        this.activeTab = tabName;
        if (typeof SettingsManager !== 'undefined') {
            SettingsManager.set('activeTab', tabName);
        }

        // Update active tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Hide/Show page containers
        const calContainer = document.getElementById('view-calendar');
        const statsContainer = document.getElementById('view-stats');

        if (tabName === 'calendar') {
            if (calContainer) calContainer.classList.remove('hidden');
            if (statsContainer) statsContainer.classList.add('hidden');
            CalendarPage.loadAll();
        } else if (tabName === 'stats') {
            if (calContainer) calContainer.classList.add('hidden');
            if (statsContainer) statsContainer.classList.remove('hidden');
            StatsPage.load();
        }

        if (typeof StatsController !== 'undefined' && StatsController.updateScrollDockVisibility) {
            StatsController.updateScrollDockVisibility();
        }
    },

    formatUserFriendlyError(rawMsg) {
        if (!rawMsg) return "An unexpected error occurred. Please try again.";
        const msg = String(rawMsg);

        if (
            msg.includes("nodename nor servname") ||
            msg.includes("gaierror") ||
            msg.includes("Failed to resolve") ||
            msg.includes("getaddrinfo") ||
            msg.includes("Name or service not known") ||
            msg.includes("Network is unreachable") ||
            msg.includes("Connection refused") ||
            msg.includes("ConnectError")
        ) {
            return "Unable to connect to Interactive Brokers servers. Please check your internet connection and DNS settings.";
        }

        if (msg.includes("1018") || msg.includes("IP address not allowed") || msg.includes("IP not allowed")) {
            return "IBKR Server Error (Code 1018): Your current IP address is not authorized in IBKR Account Management. Please ensure 'Allow all IP addresses' is enabled for your Flex Web Service Token.";
        }
        if (msg.includes("1014") || msg.includes("Token is invalid") || msg.includes("invalid token")) {
            return "IBKR Authentication Error: The Flex Web Service Token configured in your .env file is invalid or expired. Please generate a new Token in IBKR Portal.";
        }
        if (msg.includes("1019") || msg.includes("Statement is being generated") || msg.includes("timed out")) {
            return "IBKR Statement Timeout: Interactive Brokers is still generating your report. Please wait a minute and try again.";
        }
        if (msg.includes("Rate limit") || msg.includes("cooldown") || msg.includes("Too Many Requests")) {
            return "IBKR Rate Limit: Interactive Brokers restricts Flex queries to once every few minutes. Please wait before syncing again.";
        }

        return msg;
    },

    showErrorModal(title, rawMsg) {
        const backdrop = document.getElementById('error-modal-backdrop');
        const titleEl = document.getElementById('error-modal-title');
        const bodyEl = document.getElementById('error-modal-body');
        const closeBtn = document.getElementById('error-modal-close-btn');
        const okBtn = document.getElementById('error-modal-ok-btn');

        const friendlyMessage = this.formatUserFriendlyError(rawMsg);

        if (!backdrop || !bodyEl) {
            console.error(title, friendlyMessage, rawMsg);
            return;
        }

        if (titleEl) titleEl.textContent = title || "Error";
        
        bodyEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <p style="margin: 0; font-size: 13px; font-weight: 500; color: var(--text-main);">${friendlyMessage}</p>
                ${rawMsg && rawMsg !== friendlyMessage ? `<div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); background: var(--bg-subtle); padding: 6px 8px; border-radius: var(--radius-xs); word-break: break-word; margin-top: 4px;">Technical details: ${rawMsg}</div>` : ''}
            </div>
        `;

        const closeModal = () => {
            backdrop.classList.remove('open');
            backdrop.classList.remove('active');
        };

        if (closeBtn) closeBtn.onclick = closeModal;
        if (okBtn) okBtn.onclick = closeModal;
        backdrop.onclick = (e) => {
            if (e.target === backdrop) closeModal();
        };

        const escHandler = (e) => {
            if (e.key === 'Escape' && backdrop.classList.contains('open')) {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        backdrop.classList.add('open');
        backdrop.classList.add('active');
    },

    setupSyncButton() {
        const btnSync = document.getElementById('btn-sync');
        if (!btnSync) return;

        btnSync.addEventListener('click', async () => {
            if (btnSync.disabled || btnSync.classList.contains('disabled') || (State.syncStatus && State.syncStatus.is_configured === false)) {
                return;
            }
            try {
                btnSync.disabled = true;
                btnSync.classList.add('spinning');
                const label = btnSync.querySelector('.btn-sync-label');
                if (label) label.textContent = STRINGS.sync.syncing;
                
                await API.triggerSync();
                
                // Refresh overview stats and current active page
                await StatsController.updateOverview();
                await StatsController.updateSyncStatus();
                
                if (this.activeTab === 'calendar') {
                    CalendarPage.loadAll();
                } else {
                    StatsPage.load();
                }
            } catch (err) {
                this.showErrorModal("Sync Failed", err.message);
                await StatsController.updateSyncStatus();
            } finally {
                btnSync.classList.remove('spinning');
            }
        });
    }
};

window.App = App;

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
