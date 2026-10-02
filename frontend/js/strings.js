/**
 * Centralized Copy & Text Dictionary
 * Single Source of Truth for all UI text, labels, buttons, headers, and messages.
 */
const STRINGS = {
    // Brand & App
    appName: "IBKR JOURNAL",
    appSubtitle: "Trading Execution & Performance",

    // Header Main Tabs
    tabs: {
        calendar: "Calendar",
        stats: "Stats"
    },

    // Theme Switcher
    theme: {
        light: "Light",
        dark: "Dark",
        system: "System"
    },

    // Header & KPIs
    kpi: {
        winRate: "Win Rate",
        operations: "Operations",
        profitFactor: "Profit Factor",
        expectancy: "Expectancy",
        netPnl: "Net P&L",
        total: "Total",
    },

    // Sync Widget & Rate Limiting
    sync: {
        syncNow: "Sync Now",
        syncing: "Syncing...",
        cooldownPrefix: "Available in",
        lastUpdated: "Last update at",
        nextSync: "Next in",
        notConfiguredTitle: "Not configured",
        notConfiguredSubtitle: "Set credentials in .env",
        syncFailed: "Sync Failed",
        marketClosed: "Market Closed",
        marketOpen: "Market Open",
        success: "Sync completed successfully",
        error: "Sync error",
    },

    // Calendar Section Headers
    calendar: {
        pageTitle: "Trading Calendar",
        pageSubtitle: "Continuous chronological overview of weekly, monthly, and annual trading performance.",
        weekSectionTitle: "Weekly Performance",
        monthSectionTitle: "Monthly Calendar Grid",
        yearSectionTitle: "Annual Performance Matrix",
        tabYear: "Year",
        tabMonth: "Month",
        tabWeek: "Week",
        today: "Today",
        thisMonth: "This Month",
        thisWeek: "This Week",
        weekOf: "Week of",
        weekTotal: "WEEK TOTAL",
        weekCol: "WEEK TOTAL",
        noTradesDay: "No operations",
        tradesBadge: "trades",
        tradeSingleBadge: "trade",
        yearHeader: "YEAR",
        totalHeader: "ANNUAL TOTAL",
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

    // Detailed Stats Tab
    statsPage: {
        title: "Trading Analytics & Distribution",
        subtitle: "In-depth breakdown by instrument, asset category, execution side, and trading days.",
        kpiSummary: "Executive Summary",
        grossProfit: "Gross Profit",
        grossLoss: "Gross Loss",
        totalCommissions: "Commissions & Fees",
        grossPnl: "Gross P&L",
        avgWin: "Average Win",
        avgLoss: "Average Loss",
        winLossRatio: "Win / Loss Ratio",
        largestWin: "Largest Gain",
        largestLoss: "Largest Loss",
        symbolTableTitle: "Performance by Symbol",
        categoryTableTitle: "Asset Category Allocation",
        sideTableTitle: "Long vs Short Breakdown",
        dowTableTitle: "Day of Week Distribution",
        colSymbol: "Symbol",
        colCategory: "Category",
        colTrades: "Trades",
        colWinRate: "Win Rate",
        colNetPnl: "Net P&L",
        colCommissions: "Commissions",
        colVolume: "Volume",
        colSide: "Side",
        colDay: "Day",
        colTag: "Tag / Setup",
        colHour: "Hour",
        
        // Risk & Drawdown
        riskTitle: "RISK & DRAWDOWN",
        maxDrawdown: "Max Drawdown",
        currentDrawdown: "Current Drawdown",
        longestLosingStreak: "Longest Losing Streak",
        longestWinningStreak: "Longest Winning Streak",
        avgRiskTrade: "Avg Risk / Trade",
        avgTradePnl: "Avg P&L / Trade",
        currentStreak: "Current",
        noStopLoss: "No stop loss on closed trades",
        drawdownChartTitle: "DRAWDOWN",
        
        // Detailed KPIs
        adjWinLossRatio: "Adj. Win/Loss Ratio",
        sharpeRatio: "Sharpe (per trade)",
        totalTrades: "Total Trades",
        avgWinHold: "Avg Win Hold",
        avgLossHold: "Avg Loss Hold",
        beforeCosts: "before costs",
        onPrice: "on price",
        grossLabel: "Gross",
        feesLabel: "fees",
        vsPrior: "vs prior",

        // Rolling Win Rate
        rollingWinRateTitle: "ROLLING WIN RATE",
        filter1W: "1W",
        filter1M: "1M",
        filter3M: "3M",
        filterYTD: "YTD",
        filterAll: "ALL",
        
        // Metric Evolution & Equity
        metricEvolutionTitle: "METRIC EVOLUTION",
        equityCurveTitle: "EQUITY CURVE",
        day: "Day",
        week: "Week",
        month: "Month",
        winRateMetric: "Win %",
        profitFactorMetric: "Profit Factor",
        avgWinMetric: "Avg Win",
        avgLossMetric: "Avg Loss",
        expectancyMetric: "Expectancy",
        avgPnlTradeMetric: "Avg P&L / Trade",
        cumPnlMetric: "Cumulative P&L",
        dailyPnlMetric: "Daily P&L",
        chartView: "Chart",
        tableView: "Table",
        
        // Breakdowns
        pnlBySymbolTitle: "P&L BY SYMBOL",
        pnlByTagTitle: "P&L BY TAG",
        perfByDowTitle: "PERFORMANCE BY DAY OF WEEK",
        perfByTodTitle: "PERFORMANCE BY TIME OF DAY",
        pnlByDurationTitle: "P&L BY HOLDING DURATION",
        pnlByOrderTypeTitle: "P&L BY ORDER TYPE",
        colDuration: "Holding Duration",
        colOrderType: "Order Type"
    },

    // Day Trade Modal
    modal: {
        dayDetailsTitle: "Execution Details for",
        summaryPnl: "Net Realized P&L",
        summaryGross: "Gross P&L",
        summaryCommissions: "Commissions",
        summaryCount: "Trades Executed",
        tableTime: "Time",
        tableSymbol: "Symbol",
        tableSide: "Side",
        tableQty: "Volume",
        tablePrice: "Price",
        tableCommission: "Commission",
        tablePnl: "Realized P&L",
        closeBtn: "Close",
        noTradesFound: "No trade executions recorded on this date."
    },

    // Generic Placeholders & States
    common: {
        loading: "Loading trading data...",
        errorLoading: "Failed to load data. Please verify your backend connection.",
        currency: "€"
    }
};

window.STRINGS = STRINGS;
