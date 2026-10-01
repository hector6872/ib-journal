/**
 * Centralized Copy & Text Dictionary
 * 
 * Edit any UI string, label, button, or message in this single file.
 */
const STRINGS = {
    // Brand & App
    appName: "TRADING JOURNAL",
    appSubtitle: "Tortuga Trades",

    // Navigation Menu
    nav: {
        panel: "Panel",
        operations: "Operations",
        calendar: "Calendar",
        calendarYear: "Year",
        calendarMonth: "Month",
        calendarWeek: "Week",
        portfolio: "Portfolio",
    },

    // Header & KPIs
    kpi: {
        winRate: "WR",
        operations: "OPERATIONS",
        profitFactor: "PF",
        expectancy: "EXPECTANCY",
        netPnl: "NET P&L",
        total: "TOTAL",
    },

    // Sync Widget & Rate Limiting
    sync: {
        syncNow: "Sync Now",
        syncing: "Syncing...",
        cooldownPrefix: "Available in",
        lastUpdated: "Updated",
        nextSync: "Next sync in",
        marketClosed: "Market Closed",
        marketOpen: "Market Open",
        success: "Sync completed successfully",
        error: "Sync error",
    },

    // Calendar Titles & Subtitles
    calendar: {
        title: "Calendar",
        subtitle: "Annual, monthly and weekly views of your P&L.",
        tabYear: "Year",
        tabMonth: "Month",
        tabWeek: "Week",
        today: "Today",
        thisMonth: "This Month",
        thisWeek: "This Week",
        weekOf: "Week of",
        noTradesDay: "No operations",
        tradesBadge: "trades",
        tradeSingleBadge: "trade",
        yearHeader: "YEAR",
        totalHeader: "TOTAL",
    },

    // Months & Days
    months: {
        short: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
        long: [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ]
    },
    days: {
        shortMonSun: ["M", "T", "W", "T", "F", "S", "S"],
        short3: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
        long: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    },

    // Day Trade Modal
    modal: {
        dayDetailsTitle: "Trades for",
        summaryPnl: "Net P&L",
        summaryGross: "Gross P&L",
        summaryCommissions: "Commissions",
        summaryCount: "Trades Executed",
        tableTime: "Time",
        tableSymbol: "Symbol",
        tableSide: "Side",
        tableQty: "Qty",
        tablePrice: "Price",
        tableCommission: "Comm",
        tablePnl: "Realized P&L",
        tableAction: "Action",
        closeBtn: "Close",
        noTradesFound: "No trade executions recorded on this day."
    },

    // Generic Placeholders & States
    common: {
        loading: "Loading data...",
        errorLoading: "Failed to load data. Please check your backend connection.",
        currency: "€"
    }
};

// Expose globally
window.STRINGS = STRINGS;
