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
        manageCashBtn: "Manage Capital & Cash Transfers",
        symbolChartNotice: "Showing Top 10 Best & Top 10 Worst symbols",
        symbolChartNoticeLink: "Switch to Table to view all",
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
        optionsTableTitle: "Options Strategy Breakdown",
        dowTableTitle: "Day of Week Distribution",
        colSymbol: "Symbol",
        colCategory: "Category",
        colStrategy: "Strategy",
        colTrades: "Trades",
        colWinRate: "Win Rate",
        colNetPnl: "Net P&L",
        colSide: "Side",
        colDay: "Day",
        colTag: "Tag / Setup",
        colHour: "Hour",
        longSideLabel: "LONG (Buyer)",
        shortSideLabel: "SHORT (Seller)",
        noOptionsRecorded: "No options trades recorded in this period",
        longCallLabel: "Long Call (Buy Call)",
        longPutLabel: "Long Put (Buy Put)",
        shortCallLabel: "Short Call (Sell Call)",
        shortPutLabel: "Short Put (Sell Put)",
        
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

        // KPI Tooltips (Main KPI + Subtitle Explanations)
        tipNetPnl: "Main: Total realized P&L after deducting all commissions.\n• Subtitle: Gross trading P&L (before commissions) and total IBKR fees paid.",
        tipWinRate: "Main: Net Win Rate (% of trades profitable after fees).\n• Subtitle: Gross win rate before fees, and winning (W) vs losing (L) trade count based purely on price difference.",
        tipProfitFactor: "Main: Ratio of total gains to total losses (Gross Profit / Gross Loss). Values > 1.0 indicate profitability.\n• Subtitle: Total cumulative dollar profits (+Gain) vs total cumulative dollar losses (-Loss).",
        tipExpectancy: "Main: Expected average dollar return per trade: (Win % × Avg Win) - (Loss % × Avg Loss).\n• Subtitle: Long-term statistical expected edge per closed trade.",
        tipTotalTrades: "Main: Total number of closed round-trip trades.\n• Subtitle: Net outcome breakdown of Winning (W: Net > 0), Losing (L: Net < 0), and Breakeven (BE: Net = 0) trades after fees.",
        tipAvgWin: "Main: Average net profit per winning trade.\n• Subtitle: Number of net winning trades (after deducting commissions) used to calculate this average.",
        tipAvgLoss: "Main: Average net loss per losing trade.\n• Subtitle: Number of net losing trades (after deducting commissions) used to calculate this average.",
        tipLargestWin: "Main: Highest net profit achieved on a single closed trade.\n• Subtitle: Instrument symbol and confirmation of single-trade peak gain.",
        tipLargestLoss: "Main: Largest single net loss incurred on a closed trade.\n• Subtitle: Instrument symbol and confirmation of single worst trade loss.",
        tipAdjWinLossRatio: "Main: Adjusted Win/Loss Ratio measuring total trading edge: (Win % × Avg Win) / (Loss % × Avg Loss).\n• Subtitle: Payoff ratio (Avg Win / Avg Loss), showing average gain relative to average loss.",
        tipSharpeRatio: "Main: Sharpe ratio per trade (Mean P&L / Std Dev), measuring risk-adjusted returns per closed position.\n• Subtitle: Statistical indicator of return consistency relative to volatility.",
        tipAvgWinHold: "Main: Average holding duration for winning trades.\n• Subtitle: Total count of winning positions tracked for hold duration.",
        tipAvgLossHold: "Main: Average holding duration for losing trades.\n• Subtitle: Total count of losing positions tracked for hold duration.",
        tipGrossPnl: "Main: Total realized trading P&L before deducting broker commissions.\n• Subtitle: Pure gross market returns generated solely from buy vs sell price difference.",
        tipCommissions: "Main: Cumulative IBKR execution commissions and exchange fees paid.\n• Subtitle: Total broker transaction overhead deducted from your trading account.",

        // Rolling Win Rate
        rollingWinRateTitle: "ROLLING WIN RATE",
        filter1W: "1W",
        filter1M: "1M",
        filter3M: "3M",
        filterYTD: "YTD",
        filterAll: "ALL",
        
        // Metric Evolution & Equity
        metricEvolutionTitle: "METRIC EVOLUTION",
        selectAllMetrics: "Select All",
        deselectAllMetrics: "Deselect All",
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
        tzLocal: "Local (CET)",
        tzMarket: "Market (EST)",
        tableTime: "Time",
        tableTimeLocal: "Time (CET)",
        tableTimeMarket: "Time (EST)",
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
