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
        stats: "Statistics"
    },

    // Theme Switcher
    theme: {
        light: "Light",
        dark: "Dark",
        system: "System",
        lightTitle: "Light Theme",
        darkTitle: "Dark Theme",
        systemTitle: "Follow System"
    },

    // Header & KPIs
    kpi: {
        winRate: "Win Rate",
        trades: "Total Trades",
        operations: "Total Trades",
        profitFactor: "Profit Factor",
        expectancy: "Expectancy",
        netPnl: "Net P&L",
        netRealizedPnl: "Net Realized P&L",
        total: "Total",
        clickToTop: "Click to scroll to top"
    },

    // Docked Mini KPIs in Sticky Header (Abbreviated)
    miniKpi: {
        pnl: "P&L",
        wr: "WR",
        pf: "PF",
        exp: "EXP",
        trades: "TRADES"
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
        devMode: "Dev Mode (Manual only)",
        importBtn: "Import",
        desync: "Desync",
        desyncTitle: "Desync detected. Click to import manual statement.",
        importTitle: "Import manual statement (CSV / XML)",
        cashTitle: "Capital & Cash Transfers"
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
        thisYear: "This Year",
        thisMonth: "This Month",
        thisWeek: "This Week",
        weekOf: "Week of",
        weekTotal: "WEEK TOTAL",
        weekCol: "WEEK TOTAL",
        noTradesDay: "No trades",
        tradesBadge: "trades",
        tradeSingleBadge: "trade",
        yearHeader: "YEAR",
        totalHeader: "ANNUAL TOTAL",
        evolutionTitle: "Performance & Volume Evolution",
        cumPnlLabel: "Cumulative P&L",
        tradesLabel: "Trades",
        statsTitle: "Period Stats",
        expectancyLabel: "Expectancy / Op",
        winRateLabel: "Win Rate",
        profitFactorLabel: "Profit Factor",
        avgWinLossLabel: "Avg Win / Loss",
        bestWorstTradeLabel: "Best / Worst",
        maxDrawdownLabel: "Max Drawdown",
        activityLabel: "Activity Rate",
        tradesPerDayUnit: "trades/day",
        noTradesPeriod: "No operations recorded for this period."
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
        capitalStripTitle: "Portfolio Capital & Equity Overview",
        manageCashBtn: "⚙ Manage Capital & Cash Transfers",
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

        // KPI Tooltips
        tipNetPnl: "Total realized P&L after deducting IBKR execution commissions and exchange fees.",
        tipWinRate: "Win Rate % is Net (after commissions). 'On price' shows Gross win/loss rate and trade counts based purely on price difference.",
        tipProfitFactor: "Gross Profit divided by Gross Loss (after fees). A factor > 1.0 indicates overall trading profitability.",
        tipExpectancy: "Expected dollar return per trade based on historical win/loss probabilities and payoff: (Win % × Avg Win) - (Loss % × Avg Loss).",
        tipTotalTrades: "Total closed trades. Breakdown shows Net Wins (Net > 0), Net Losses (Net < 0), and Breakeven (Net = 0).",
        tipAvgWin: "Average net profit across all winning trades (after deducting commissions).",
        tipAvgLoss: "Average net loss across all losing trades (after deducting commissions).",
        tipLargestWin: "Largest single winning trade return after commissions.",
        tipLargestLoss: "Largest single losing trade loss after commissions.",
        tipAdjWinLossRatio: "Adjusted Win/Loss Ratio measuring overall edge: (Win % × Avg Win) / (Loss % × Avg Loss).",
        tipSharpeRatio: "Sharpe ratio per trade (Mean P&L / Std Dev), measuring risk-adjusted consistency per closed trade.",
        tipGrossPnl: "Total realized gross profit/loss before deducting broker commissions.",
        tipCommissions: "Cumulative IBKR commissions and regulatory fees paid across all executions.",

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
        dayDetailsTitle: "Trading details for",
        summaryPnl: "Net Realized P&L",
        summaryGross: "Gross P&L",
        summaryCommissions: "Commissions",
        summaryCount: "Round-Trip Trades",
        summaryFills: "Total Executions",
        summaryWinRate: "Win Rate",
        viewGrouped: "Grouped Trades",
        viewExecutions: "Raw Executions",
        expandAll: "Expand All",
        collapseAll: "Collapse All",
        trade: "Trade",
        trades: "Trades",
        fills: "fills",
        fillSingle: "fill",
        entry: "Entry",
        exit: "Exit",
        duration: "Duration",
        long: "LONG",
        short: "SHORT",
        buy: "BUY",
        sell: "SELL",
        exchange: "EXCHANGE",
        buyCall: "BUY CALL",
        sellCall: "SELL CALL",
        buyPut: "BUY PUT",
        sellPut: "SELL PUT",
        win: "WIN",
        loss: "LOSS",
        breakeven: "BE",
        open: "OPEN",
        tableTime: "Time",
        tableSymbol: "Symbol",
        tableSide: "Side",
        tableQty: "Volume",
        tablePrice: "Price",
        tableCommission: "Commission",
        tableGrossPnl: "Gross P&L",
        tablePnl: "Net P&L",
        tableAction: "Action",
        closeBtn: "Close",
        noTradesFound: "No trade executions recorded on this date."
    },

    // Import Modal & Dropzone
    import: {
        title: "Import Historical IBKR Statements",
        gapTitle: "Desynchronization detected (>7 days without recorded trades)",
        gapDesc: "Your last sync or recorded trade was over 7 days ago. If your IBKR Flex Query covers 7 days, please import your CSV or XML statement to prevent missing past trades.",
        gapDismissBtn: "✓ No trades during this period (Dismiss warning)",
        dropzoneTitle: "Drag and drop your IBKR CSV or XML files here",
        dropzoneSubtitle: "Compatible with Activity Statements and Flex Queries (multi-year)",
        selectFilesBtn: "Select Files",
        cliLabel: "Or import via Terminal CLI:",
        closeBtn: "Close",
        importingFiles: "Importing file(s)...",
        errorsTitle: "Import finished with errors:",
        successMsg: "Successfully processed statement."
    },

    // Cash & Capital Management
    cash: {
        title: "Capital & Cash Management",
        accountEquity: "ACCOUNT EQUITY (NAV)",
        accountEquitySub: "Starting Capital + Net Flow + Realized P&L",
        startingCapital: "STARTING CAPITAL",
        startingCapitalSub: "Initial configured balance",
        startingCapitalStatsSub: "Configured baseline capital",
        netTransfers: "NET TRANSFERS IN/OUT",
        netTransfersStats: "NET CASH TRANSFERS",
        roi: "RETURN ON CAPITAL (% ROI)",
        roiSub: "Realized P&L / Capital Base",
        configSectionTitle: "Starting Capital Configuration",
        configSectionSubtitle: "Set your baseline portfolio balance before recorded transfers.",
        inputCapitalLabel: "STARTING CAPITAL",
        saveCapitalBtn: "Save Capital",
        addTransferTitle: "Add Manual Cash Transfer",
        addTransferSubtitle: "Transfers in IBKR statements are automatically imported. Use this for manual adjustments.",
        typeLabel: "TYPE",
        amountLabel: "AMOUNT",
        dateLabel: "DATE",
        descLabel: "DESCRIPTION",
        descPlaceholder: "e.g. Bank wire deposit",
        addTransferBtn: "Add Transfer",
        tableTitle: "Recorded Transfers & Cash Movements",
        emptyTransfers: "No deposits or withdrawals recorded yet. Transfers in IBKR activity statements are auto-imported or can be added manually above.",
        colDate: "Date",
        colType: "Type",
        colDesc: "Description",
        colSource: "Source",
        colAmount: "Amount",
        colAction: "Action",
        deposit: "Deposit (+)",
        withdrawal: "Withdrawal (-)",
        sourceManual: "Manual",
        sourceIbkr: "IBKR Auto",
        deleteTooltip: "Delete this transfer",
        deleteConfirmTitle: "Delete Cash Transfer",
        deleteConfirmMsg: "Are you sure you want to delete this cash transfer? Your account equity and returns will be automatically recalculated.",
        deleteBtn: "Delete",
        capitalSavedTitle: "Starting Capital Saved",
        capitalSavedMsg: "Starting capital successfully updated.",
        transferRecordedTitle: "Transfer Recorded",
        invalidAmountTitle: "Invalid Transfer Amount",
        invalidAmountMsg: "Please enter a valid transfer amount greater than 0.",
        saveErrorTitle: "Save Capital Error",
        recordErrorTitle: "Record Transfer Error",
        deleteErrorTitle: "Delete Transfer Error",
        loadErrorMsg: "Failed to load cash management details."
    },

    // Dialogs & Modals
    dialog: {
        notification: "Notification",
        confirmAction: "Confirm Action",
        ok: "OK",
        cancel: "Cancel",
        confirm: "Confirm",
        close: "Close"
    },

    // Generic Placeholders & States
    common: {
        loading: "Loading trading data...",
        errorLoading: "Failed to load data. Please verify your backend connection.",
        currency: "$"
    }
};

window.STRINGS = STRINGS;
