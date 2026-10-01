/**
 * Main Application Orchestrator
 */
const App = {
    async init() {
        // 1. Fetch backend config
        try {
            const cfg = await API.fetchConfig();
            if (cfg.currency_symbol) {
                State.currency = cfg.currency_symbol;
                STRINGS.common.currency = cfg.currency_symbol;
            }
        } catch (e) {
            console.warn("Could not fetch app config, using defaults:", e);
        }

        // 2. Bind centralized strings into HTML elements
        this.applyTranslations();

        // 3. Setup global listeners
        this.setupNavigation();
        this.setupSyncButton();

        // 4. Initialize Sub-controllers
        DayModal.init();
        StatsController.startPolling();

        // 5. Render default view
        this.switchView('year');
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

    setupNavigation() {
        // Calendar tabs (Year / Month / Week)
        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const targetView = tab.getAttribute('data-view');
                if (targetView) this.switchView(targetView);
            });
        });

        // Sidebar calendar sub-items
        document.querySelectorAll('.nav-sub-item').forEach(item => {
            item.addEventListener('click', () => {
                const targetView = item.getAttribute('data-view');
                if (targetView) this.switchView(targetView);
            });
        });

        // Sidebar main items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const isCalendar = item.getAttribute('data-nav') === 'calendar';
                if (!isCalendar) {
                    // For Panel / Trades / Portfolio, set active and show coming soon or default
                    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                    item.classList.add('active');
                }
            });
        });
    },

    setupSyncButton() {
        const btnSync = document.getElementById('btn-sync');
        if (!btnSync) return;

        btnSync.addEventListener('click', async () => {
            try {
                btnSync.disabled = true;
                btnSync.classList.add('spinning');
                btnSync.querySelector('.btn-sync-label').textContent = STRINGS.sync.syncing;
                
                await API.triggerSync();
                
                // Refresh views and stats after sync
                await StatsController.updateOverview();
                await StatsController.updateSyncStatus();
                this.refreshCurrentView();
            } catch (err) {
                alert(`Sync failed: ${err.message}`);
                await StatsController.updateSyncStatus();
            }
        });
    },

    switchView(viewName) {
        State.activeView = viewName;

        // Update top tab buttons
        document.querySelectorAll('.view-tab').forEach(tab => {
            if (tab.getAttribute('data-view') === viewName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update sidebar sub-item active state
        document.querySelectorAll('.nav-sub-item').forEach(sub => {
            if (sub.getAttribute('data-view') === viewName) {
                sub.classList.add('active');
            } else {
                sub.classList.remove('active');
            }
        });

        // Load specific view data
        if (viewName === 'year') {
            CalendarYear.load(State.currentYear);
        } else if (viewName === 'month') {
            CalendarMonth.load(State.currentYear, State.currentMonth);
        } else if (viewName === 'week') {
            CalendarWeek.load(State.currentWeekDate);
        }
    },

    refreshCurrentView() {
        this.switchView(State.activeView);
    }
};

window.App = App;

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
