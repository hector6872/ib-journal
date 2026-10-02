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
    currency: "€",

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
const SettingsManager = {
    settings: {},
    saveTimeout: null,

    async init() {
        // 1. Read local storage first for instant response
        try {
            const raw = localStorage.getItem('ib_journal_settings');
            if (raw) {
                this.settings = JSON.parse(raw);
            }
        } catch (e) {
            console.warn("Could not read local settings:", e);
        }

        // 2. Fetch remote settings from server (database) to sync cross-device
        try {
            const remote = await API.fetchSettings();
            if (remote && Object.keys(remote).length > 0) {
                this.settings = { ...this.settings, ...remote };
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

        // Debounce sync to server
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(async () => {
            await API.saveSettings({ [key]: value });
        }, 300);
    }
};

window.SettingsManager = SettingsManager;
window.State = State;
