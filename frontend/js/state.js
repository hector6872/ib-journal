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
    }
};

window.State = State;
