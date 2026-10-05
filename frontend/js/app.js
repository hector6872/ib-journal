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
                btnSync.querySelector('.btn-sync-label').textContent = STRINGS.sync.syncing;
                
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
                alert(`Sync failed: ${err.message}`);
                await StatsController.updateSyncStatus();
            }
        });
    }
};

window.App = App;

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
