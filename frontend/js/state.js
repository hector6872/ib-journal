/**
 * Application State
 */
const State = {
    // Current active view: 'year', 'month', 'week'
    activeView: 'year',
    
    // Date pointers
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1, // 1 - 12
    currentWeekDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    
    // App Config & Symbols
    currency: "$",

    // Cached Data
    overviewStats: null,
    syncStatus: null,
    currentYearData: null,
    currentMonthData: null,
    currentWeekData: null,

    // Helpers
    formatCurrency(amount, includeSymbol = true) {
        if (amount === undefined || amount === null || isNaN(amount)) amount = 0;
        const sign = amount > 0 ? "+" : (amount < 0 ? "-" : "");
        const formatted = Math.abs(amount).toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
        return includeSymbol ? `${sign}${this.currency}${formatted}` : `${sign}${formatted}`;
    },

    formatNumber(num) {
        if (num === undefined || num === null) return "0";
        return num.toLocaleString();
    },

    getPnlClass(amount) {
        if (amount === undefined || amount === null || isNaN(amount)) return 'pnl-neutral';
        const rounded = Math.round(amount * 100) / 100;
        if (rounded > 0) return 'pnl-positive';
        if (rounded < 0) return 'pnl-negative';
        return 'pnl-neutral';
    }
};

/**
 * Application Settings Manager (Local & Cross-Device Persisted)
 */
const SERVER_SYNC_KEYS = new Set(['starting_capital']);

const SettingsManager = {
    settings: {},
    saveTimeout: null,

    async init() {
        // 1. Read local storage first for UI preferences and offline cache
        try {
            const raw = localStorage.getItem('ib_journal_settings');
            if (raw) {
                this.settings = JSON.parse(raw);
            }
        } catch (e) {
            console.warn("Could not read local settings:", e);
        }

        // 2. Fetch server-persisted account settings (like starting_capital) to sync cross-device
        try {
            const remote = await API.fetchSettings();
            if (remote && typeof remote === 'object') {
                for (const key of SERVER_SYNC_KEYS) {
                    if (remote[key] !== undefined && remote[key] !== null) {
                        this.settings[key] = remote[key];
                    }
                }
                localStorage.setItem('ib_journal_settings', JSON.stringify(this.settings));
            }
        } catch (e) {
            console.warn("Could not sync remote settings:", e);
        }
    },

    get(key, defaultValue = null) {
        if (this.settings && this.settings[key] !== undefined && this.settings[key] !== null) {
            return this.settings[key];
        }
        return defaultValue;
    },

    set(key, value) {
        this.settings[key] = value;
        try {
            localStorage.setItem('ib_journal_settings', JSON.stringify(this.settings));
        } catch (e) {
            console.warn("Could not save to localStorage:", e);
        }

        // Only sync account/portfolio settings to server, keep UI state purely in browser localStorage
        if (SERVER_SYNC_KEYS.has(key)) {
            if (this.saveTimeout) clearTimeout(this.saveTimeout);
            this.saveTimeout = setTimeout(async () => {
                await API.saveSettings({ [key]: value });
            }, 300);
        }
    }
};

window.SettingsManager = SettingsManager;
window.State = State;
