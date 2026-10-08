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
        realizedRr: "R:R",
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
        rr: "R:R",
        exp: "EXP",
        trades: "TRADES"
    },

    // Structured Error Codes & Machine-Readable Errors
    errors: {
        ERR_CONNECTION_FAILED: "Connection failed (Check internet or DNS)",
        ERR_IBKR_IP_UNAUTHORIZED: "IBKR Error 1018: IP address not authorized in Flex Web Service",
        ERR_IBKR_INVALID_TOKEN: "IBKR Error 1014: Invalid or expired token",
        ERR_IBKR_STATEMENT_GENERATING: "Statement is generating (Try again shortly)",
        ERR_IBKR_TIMEOUT: "IBKR request timed out",
        ERR_COOLDOWN_ACTIVE: "Rate limit cooldown active. Please wait {seconds}s",
        ERR_UNCONFIGURED: "Configure IBKR credentials in .env",
        ERR_SYNC_IN_PROGRESS: "Synchronization is already in progress",
        ERR_HTTP_ERROR: "HTTP Error: {detail}",
        ERR_GENERIC_SYNC: "Sync error: {detail}",
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
        notConfiguredTooltip: "Configure IBKR_TOKEN and IBKR_ACTIVITY_QUERY_ID in .env to enable automated sync",
        syncFailed: "Sync Failed",
        marketClosed: "Market Closed",
        marketClosedWithTime: "Market Closed (Opens {time})",
        marketOpen: "Market Open",
        success: "Sync completed successfully",
        error: "Sync error",
        devMode: "Dev Mode (Manual only)",
        devModeHour: "Dev Mode ({hour})",
        dailyHour: "Daily {hour}",
        nextInMinutes: "Next in {minutes}m",
        activityOnlyTooltip: "Activity sync active (Daily {hour}). Set IBKR_TRADE_QUERY_ID for intraday fills.",
        dualSyncTooltip: "Dual-sync active (Intraday fills every {interval}m during market hours + Daily EOD at {hour}).",
        dualSyncClosedTooltip: "Market is closed. Intraday fills will resume at market open ({openTime}). Daily EOD at {hour}.",
        defaultTooltip: "Click to synchronize trades from IBKR",
        syncSuccess: "Synchronized {trades} trades, {cash} transfers ({scope})",
        syncWarning: "Synchronized with warnings: {warning}",
        importBtn: "Import",
        desync: "Desync",
        desyncBadge: "Desync ({days}d)",
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
        symbolTableTitle: "PERFORMANCE BY SYMBOL",
        categoryTableTitle: "ASSET CATEGORY ALLOCATION",
        sideTableTitle: "LONG VS SHORT BREAKDOWN",
        optionsTableTitle: "OPTIONS STRATEGY BREAKDOWN",
        dowTableTitle: "DAY OF WEEK DISTRIBUTION",
        colSymbol: "Symbol",
        colCategory: "Category",
        colStrategy: "Strategy",
        colTrades: "Trades",
        colWinRate: "Win Rate",
        colCommissions: "Commissions",
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
        optionExpirationsTitle: "Option Exit Discipline & Expirations",
        optionExpirationsTooltip: "Analysis of how your option positions were closed:\n\n• Expired at $0.00 (Auto-Settled): Contracts held through expiration and settled at $0.00 by IBKR at 16:20 EST. (For option buyers, this represents 100% loss of paid premium; for option sellers, 100% max profit retained).\n• Closed in Market (Active Exit): Contracts actively closed with orders before expiry to manage risk or lock in profit.",
        expiredLabel: "Expired at $0.00",
        manualLabel: "Closed in Market",
        expiredBadge: "Auto-Settled ($0.00)",
        manualBadge: "Active Market Exit",
        expiredSubNotice: "held to expiration ($0.00 auto-settlement)",
        manualSubNotice: "actively closed in the market before expiry",
        heldToExpiryHint: "Held to 0 DTE settlement ($0.00 auto-close)",
        activeExitHint: "Actively managed & closed before expiry",
        
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
        realizedRr: "R:R",
        realizedRrMetric: "R:R",
        realizedRrSubtitle: "Avg Win / Avg Loss",
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
        tipNetPnl: "Total realized P&L after deducting all commissions. Subtitle shows gross trading returns and total IBKR fees paid.",
        tipWinRate: "Net Win Rate (% of trades profitable after fees). Subtitle shows gross win rate before fees and price-based W/L counts.",
        tipProfitFactor: "Ratio of total gains to total losses (Gross Profit / Gross Loss). Values > 1.0 indicate profitability.",
        tipRealizedRr: "Risk/Reward Ratio (R:R): Ratio of Average Win to Average Loss (1:X). Values > 1.0 indicate average profits are larger than average losses.",
        tipExpectancy: "Expected average return per trade: (Win % × Avg Win) - (Loss % × Avg Loss).",
        tipTotalTrades: "Total number of closed round-trip trades (Winning, Losing, and Breakeven after fees).",
        tipAvgWin: "Average net profit per winning trade after deducting commissions.",
        tipAvgLoss: "Average net loss per losing trade after deducting commissions.",
        tipLargestWin: "Highest net profit achieved on a single closed trade.",
        tipLargestLoss: "Largest single net loss incurred on a closed trade.",
        tipAdjWinLossRatio: "Adjusted Win/Loss Ratio measuring total trading edge: (Win % × Avg Win) / (Loss % × Avg Loss).",
        tipSharpeRatio: "Sharpe ratio per trade (Mean P&L / Std Dev), measuring risk-adjusted returns relative to volatility.",
        tipAvgWinHold: "Average holding duration for winning trades.",
        tipAvgLossHold: "Average holding duration for losing trades.",
        tipGrossPnl: "Total realized trading P&L before deducting broker commissions.",
        tipCommissions: "Cumulative IBKR execution commissions and exchange fees paid.",

        // Rolling Win Rate
        rollingWinRateTitle: "ROLLING WIN RATE",
        tipRollingWinRate: "Win rate calculated across a rolling window of your most recent N closed trades (10, 20, 50, or 100). The trend indicator compares your current window against the prior block of N trades to track momentum.",
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
        colOrderType: "Order Type",

        // Position Sizing
        positionSizingTitle: "POSITION SIZING & RISK EXPOSURE",
        tipPositionSizing: "Analyze trading performance and psychological edge based on position sizing. Tracks Win Rate, Profit Factor, and Net P&L distribution across share count, capital invested, contract count, and total option premium.",
        stocksSizingTitle: "STOCKS POSITION SIZING",
        optionsSizingTitle: "OPTIONS POSITION SIZING",
        tipStocksSizing: "Analyze performance on stocks/ETFs broken down by capital invested ($/€) or share count.",
        tipOptionsSizing: "Analyze performance on options broken down by total premium invested ($/€) or contract count.",
        stockMetricCapital: "Capital",
        stockMetricShares: "Shares",
        optionMetricPremium: "Total Premium",
        optionMetricContracts: "Contracts",
        colBracket: "Size Bracket",
        colAvgTradePnl: "Avg P&L / Trade",
        colProfitFactor: "Profit Factor",
        sizingWinVsLossTitle: "Size Asymmetry (Wins vs Losses)",
        sizingWinAvgLabel: "Avg Winner Size",
        sizingLossAvgLabel: "Avg Loser Size",
        sharesUnit: "shares",
        contractsUnit: "contracts"
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
        converted: "CONVERTED",
        spotRate: "Rate",
        instant: "Instant",
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
        netTransfersStatsSub: "User deposits vs withdrawals",
        accountExpenses: "SUBSCRIPTIONS & ACCOUNT FEES",
        accountExpensesSub: "Market subscriptions & fees",
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
        dividend: "Dividend (+)",
        subscription: "Market Data Subscription (-)",
        withholdingTax: "Withholding Tax (-)",
        brokerFee: "Broker Fee (-)",
        breakdownTitle: "Cash Flow Breakdown by Category",
        statDeposits: "Deposits",
        statWithdrawals: "Withdrawals",
        statDividends: "Dividends",
        statWithholdingTax: "Withholding Tax",
        statSubscriptions: "Subscriptions",
        statFees: "Broker Fees",
        statNetFlow: "Net Cash Flow",
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
    },

    /**
     * String template interpolation: replaces {param} with params[param]
     */
    format(template, params = {}) {
        if (!template || typeof template !== 'string') return '';
        return template.replace(/\{(\w+)\}/g, (match, key) => {
            return params[key] !== undefined ? params[key] : match;
        });
    },

    /**
     * Resolves a localized error message from an error code or error object
     */
    getErrorMessage(err) {
        if (!err) return this.sync.error;
        if (typeof err === 'string') return err;
        const code = err.error_code || err.code;
        const params = err.error_params || err.params || {};
        if (code && this.errors[code]) {
            return this.format(this.errors[code], params);
        }
        return err.message || err.detail || this.sync.error;
    },

    /**
     * Resolves a localized tooltip for the sync widget
     */
    getSyncTooltip(status) {
        if (!status) return this.sync.defaultTooltip;
        if (status.is_configured === false || status.status === 'unconfigured') {
            return this.sync.notConfiguredTooltip;
        }
        if (status.status === 'failed') {
            return this.getErrorMessage(status);
        }
        const dailyHour = status.daily_activity_sync_hour_utc !== undefined ? status.daily_activity_sync_hour_utc : 6;
        const hourFormatted = `${String(dailyHour).padStart(2, '0')}:00 UTC`;
        if (status.has_trade_query === false && status.has_activity_query === true) {
            return this.format(this.sync.activityOnlyTooltip, { hour: hourFormatted });
        }
        if (status.has_trade_query === true && status.has_activity_query === true) {
            if (status.is_market_hours === false && status.next_sync_time) {
                const nextDate = new Date(status.next_sync_time);
                const openTimeFormatted = nextDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return this.format(this.sync.dualSyncClosedTooltip, {
                    openTime: openTimeFormatted,
                    hour: hourFormatted
                });
            }
            return this.format(this.sync.dualSyncTooltip, {
                interval: status.sync_interval_minutes || 15,
                hour: hourFormatted
            });
        }
        return status.message || this.sync.defaultTooltip;
    },

    /**
     * Resolves a localized subtitle countdown/info for the sync widget
     */
    getSyncSubtitle(status) {
        if (!status) return '';
        if (status.is_configured === false || status.status === 'unconfigured') {
            return this.sync.notConfiguredSubtitle;
        }
        if (status.status === 'failed') {
            const err = this.getErrorMessage(status);
            return err.length > 25 ? err.slice(0, 25) + '...' : err;
        }
        const dailyHour = status.daily_activity_sync_hour_utc !== undefined ? status.daily_activity_sync_hour_utc : 6;
        const hourFormatted = `${String(dailyHour).padStart(2, '0')}:00 UTC`;

        if (status.is_auto_sync_enabled === false) {
            return status.has_trade_query === false
                ? this.format(this.sync.devModeHour, { hour: hourFormatted })
                : this.sync.devMode;
        }
        if (status.has_trade_query === false) {
            return this.format(this.sync.dailyHour, { hour: hourFormatted });
        }
        if (status.next_sync_time) {
            const nextDate = new Date(status.next_sync_time);
            const diffMs = nextDate - new Date();
            const diffMins = Math.max(0, Math.round(diffMs / 60000));
            if (status.is_market_hours === false) {
                const openTimeFormatted = nextDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return this.format(this.sync.marketClosedWithTime, { time: openTimeFormatted });
            }
            return this.format(this.sync.nextInMinutes, { minutes: diffMins });
        }
        return '';
    }
};

window.STRINGS = STRINGS;
