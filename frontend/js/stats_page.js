/**
 * Detailed Statistics Page Controller
 * Institutional Analytics, Equity Curves, Drawdowns, Metric Evolutions, Breakdowns & Rolling Metrics
 * Persisted locally and synced across devices via SettingsManager
 */
const StatsPage = {
    data: null,
    dateRange: 'ALL', // '1W' | '1M' | '3M' | 'YTD' | 'ALL'
    timeframe: 'day', // 'day' | 'week' | 'month'
    rollingWindow: '20', // '10' | '20' | '50' | '100'
    activeMetrics: {
        win_rate: true,
        profit_factor: true,
        avg_win: true,
        avg_loss: true,
        expectancy: true,
        avg_trade_pnl: true,
        cumulative_pnl: true
    },
    viewModes: {
        symbol: 'chart',
        tag: 'chart',
        dow: 'chart',
        tod: 'chart',
        duration: 'chart',
        order_type: 'chart'
    },
    charts: {},

    loadSettings() {
        if (typeof SettingsManager !== 'undefined') {
            this.dateRange = String(SettingsManager.get('stats_date_range', this.dateRange));
            this.timeframe = String(SettingsManager.get('stats_timeframe', this.timeframe));
            this.rollingWindow = String(SettingsManager.get('stats_rolling_window', this.rollingWindow));
            this.activeMetrics = SettingsManager.get('stats_active_metrics', this.activeMetrics);
            this.viewModes = SettingsManager.get('stats_view_modes', this.viewModes);
        }
    },

    async load(showSpinner = false) {
        const container = document.getElementById('view-stats');
        if (!container) return;

        this.loadSettings();

        if (showSpinner || !container.querySelector('.stats-main-container')) {
            container.innerHTML = `<div style="text-align:center; padding: 60px; color: var(--text-muted);">${STRINGS.common.loading}</div>`;
        }

        try {
            const { startDate, endDate } = this.calculateDateRange(this.dateRange);
            this.data = await API.fetchDetailedStats(startDate, endDate);
            this.render(this.data, container);
        } catch (err) {
            console.error("Error loading detailed stats:", err);
            if (!container.querySelector('.stats-main-container')) {
                container.innerHTML = `<div style="color: var(--color-loss); padding: 40px; text-align:center;">${STRINGS.common.errorLoading}</div>`;
            }
        }
    },

    calculateDateRange(range) {
        if (range === 'ALL') return { startDate: null, endDate: null };
        const now = new Date();
        const endDate = now.toISOString().split('T')[0];
        let start = new Date();

        if (range === '1W') {
            start.setDate(now.getDate() - 7);
        } else if (range === '1M') {
            start.setMonth(now.getMonth() - 1);
        } else if (range === '3M') {
            start.setMonth(now.getMonth() - 3);
        } else if (range === 'YTD') {
            start = new Date(now.getFullYear(), 0, 1);
        }

        return {
            startDate: start.toISOString().split('T')[0],
            endDate: endDate
        };
    },

    getThemeColors() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
            (document.documentElement.getAttribute('data-theme') === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

        return {
            isDark,
            text: isDark ? '#94a3b8' : '#64748b',
            textMain: isDark ? '#f8fafc' : '#1a1e24',
            grid: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
            border: isDark ? '#314261' : '#dee2e6',
            cardBg: isDark ? '#182030' : '#ffffff',
            profit: isDark ? '#22c55e' : '#00875a',
            profitBar: isDark ? 'rgba(34, 197, 94, 0.7)' : 'rgba(0, 135, 90, 0.7)',
            loss: isDark ? '#ef4444' : '#d32f2f',
            lossBar: isDark ? 'rgba(239, 68, 68, 0.7)' : 'rgba(211, 47, 47, 0.7)',
            equityLine: isDark ? '#38bdf8' : '#0066cc',
            equityArea: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(0, 102, 204, 0.06)',
            drawdownLine: '#ef4444',
            drawdownArea: isDark ? 'rgba(239, 68, 68, 0.18)' : 'rgba(211, 47, 47, 0.14)',
            metricColors: {
                win_rate: '#10b981',
                profit_factor: '#8b5cf6',
                avg_win: '#3b82f6',
                avg_loss: '#ef4444',
                expectancy: '#f59e0b',
                avg_trade_pnl: '#06b6d4',
                cumulative_pnl: '#ec4899'
            }
        };
    },

    destroyCharts() {
        Object.keys(this.charts).forEach(key => {
            if (this.charts[key] && typeof this.charts[key].destroy === 'function') {
                this.charts[key].destroy();
            }
        });
        this.charts = {};
    },

    getPnlClass(val) {
        if (val === undefined || val === null || isNaN(val)) return 'pnl-neutral';
        const num = Number(val);
        if (num > 0) return 'pnl-positive';
        if (num < 0) return 'pnl-negative';
        return 'pnl-neutral';
    },

    getWinRateClass(wr, totalTrades) {
        if (!totalTrades || !wr || wr === 0) return 'pnl-neutral';
        if (wr > 50) return 'pnl-positive';
        if (wr < 50) return 'pnl-negative';
        return 'pnl-neutral';
    },

    getRatioClass(ratio, totalTrades) {
        if (!totalTrades || !ratio || ratio === 0) return 'pnl-neutral';
        if (ratio > 1.0) return 'pnl-positive';
        if (ratio < 1.0) return 'pnl-negative';
        return 'pnl-neutral';
    },

    getStreakLossClass(streak) {
        if (!streak || streak <= 0) return 'pnl-neutral';
        return 'pnl-negative';
    },

    getStreakWinClass(streak) {
        if (!streak || streak <= 0) return 'pnl-neutral';
        return 'pnl-positive';
    },

    getHoldClass(hold, type) {
        if (!hold || hold === '--') return 'pnl-neutral';
        return type === 'win' ? 'pnl-positive' : 'pnl-negative';
    },

    render(data, container) {
        this.destroyCharts();

        const ov = data.overview || {};
        const rolling = data.rolling_win_rate || {};
        const symbols = data.symbols || [];
        const tags = data.tags || [];
        const dow = data.day_of_week || [];
        const tod = data.time_of_day || [];
        const durations = data.holding_durations || [];
        const orderTypes = data.order_types || [];
        const categories = data.categories || [];
        const sides = data.sides || [];

        // Update global header banner
        if (typeof StatsController !== 'undefined' && StatsController.renderOverview) {
            StatsController.renderOverview(ov);
        }

        const sp = STRINGS.statsPage;
        const currentRolling = rolling[this.rollingWindow] || {
            win_rate: 0,
            wins: 0,
            losses: 0,
            total: 0,
            prior_win_rate: null,
            delta: 0
        };

        // Rolling Delta string formatted
        let deltaHtml = '';
        if (currentRolling.prior_win_rate !== null) {
            const delta = currentRolling.delta || 0;
            const isZero = Math.abs(delta) < 0.001;
            const isPos = delta > 0;
            const arrow = isZero ? '→' : (isPos ? '↗' : '↘');
            const sign = isPos ? '+' : '';
            const colorClass = isZero ? 'pnl-neutral' : (isPos ? 'pnl-positive' : 'pnl-negative');
            deltaHtml = `
                <span class="trend-delta-text ${colorClass}">
                    ${arrow} ${sign}${delta.toFixed(1)} ${sp.vsPrior} ${this.rollingWindow} (${currentRolling.prior_win_rate.toFixed(1)}%)
                </span>
            `;
        }

        const rollingWrClass = currentRolling.total > 0
            ? (currentRolling.win_rate > 50 ? 'pnl-positive' : (currentRolling.win_rate < 50 ? 'pnl-negative' : 'pnl-neutral'))
            : 'pnl-neutral';

        container.innerHTML = `
            <div class="stats-main-container">
                <!-- Top Statistics Bar with Date Range Filters -->
                <div class="stats-header-bar">
                    <div class="segmented-control" id="stats-date-range-filter">
                        <button class="segmented-btn ${this.dateRange === '1W' ? 'active' : ''}" data-range="1W">${sp.filter1W}</button>
                        <button class="segmented-btn ${this.dateRange === '1M' ? 'active' : ''}" data-range="1M">${sp.filter1M}</button>
                        <button class="segmented-btn ${this.dateRange === '3M' ? 'active' : ''}" data-range="3M">${sp.filter3M}</button>
                        <button class="segmented-btn ${this.dateRange === 'YTD' ? 'active' : ''}" data-range="YTD">${sp.filterYTD}</button>
                        <button class="segmented-btn ${this.dateRange === 'ALL' ? 'active' : ''}" data-range="ALL">${sp.filterAll}</button>
                    </div>
                </div>

                <!-- 1. Primary Executive KPI Cards Grid (5 Columns - Matching Calendar Initial Order) -->
                <div class="stats-kpi-grid" id="stats-kpi-grid">
                    <!-- 1. Net Realized P&L -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${STRINGS.kpi.netPnl}</span>
                        </div>
                        <span class="stat-card-value mono ${this.getPnlClass(ov.net_pnl)}">
                            ${State.formatCurrency(ov.net_pnl || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${sp.grossLabel} ${State.formatCurrency(ov.gross_pnl || 0)} · -${State.currency}${(ov.total_commissions || 0).toFixed(2)} ${sp.feesLabel}
                        </span>
                    </div>

                    <!-- 2. Win Rate -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${STRINGS.kpi.winRate}</span>
                        </div>
                        <span class="stat-card-value mono ${this.getWinRateClass(ov.win_rate, ov.total_trades)}">
                            ${(ov.win_rate || 0).toFixed(2)}%
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${(ov.gross_win_rate || 0).toFixed(1)}% ${sp.beforeCosts} · ${ov.winning_trades_price || 0}W / ${ov.losing_trades_price || 0}L ${sp.onPrice}
                        </span>
                    </div>

                    <!-- 3. Profit Factor -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${STRINGS.kpi.profitFactor}</span>
                        </div>
                        <span class="stat-card-value mono ${this.getRatioClass(ov.profit_factor, ov.total_trades)}">
                            ${(ov.profit_factor || 0).toFixed(2)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${State.formatCurrency(ov.gross_profit || 0)} / ${State.formatCurrency(ov.gross_loss || 0)}
                        </span>
                    </div>

                    <!-- 4. Expectancy -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${STRINGS.kpi.expectancy}</span>
                        </div>
                        <span class="stat-card-value mono ${this.getPnlClass(ov.expectancy)}">
                            ${State.formatCurrency(ov.expectancy || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            Expected value per trade
                        </span>
                    </div>

                    <!-- 5. Total Trades -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.totalTrades}</span>
                        </div>
                        <span class="stat-card-value mono pnl-neutral">
                            ${State.formatNumber(ov.total_trades || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.winning_trades || 0}W · ${ov.losing_trades || 0}L · ${ov.breakeven_trades || 0}BE
                        </span>
                    </div>

                    <!-- 6. Avg Win -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.avgWin}</span>
                        </div>
                        <span class="stat-card-value mono ${ov.avg_win > 0 ? 'pnl-positive' : 'pnl-neutral'}">
                            ${State.formatCurrency(ov.avg_win || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.winning_trades || 0} winning trades
                        </span>
                    </div>

                    <!-- 7. Avg Loss -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.avgLoss}</span>
                        </div>
                        <span class="stat-card-value mono ${ov.avg_loss > 0 ? 'pnl-negative' : 'pnl-neutral'}">
                            ${State.formatCurrency(-(ov.avg_loss || 0))}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.losing_trades || 0} losing trades
                        </span>
                    </div>

                    <!-- 8. Largest Gain -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.largestWin}</span>
                        </div>
                        <span class="stat-card-value mono ${ov.largest_win > 0 ? 'pnl-positive' : 'pnl-neutral'}">
                            ${State.formatCurrency(ov.largest_win || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.largest_win_symbol ? `${ov.largest_win_symbol} · ` : ''}Single peak return
                        </span>
                    </div>

                    <!-- 9. Largest Loss -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.largestLoss}</span>
                        </div>
                        <span class="stat-card-value mono ${ov.largest_loss < 0 ? 'pnl-negative' : 'pnl-neutral'}">
                            ${State.formatCurrency(ov.largest_loss || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.largest_loss_symbol ? `${ov.largest_loss_symbol} · ` : ''}Single worst loss
                        </span>
                    </div>

                    <!-- 10. Adj. Win/Loss Ratio -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.adjWinLossRatio}</span>
                        </div>
                        <span class="stat-card-value mono ${this.getRatioClass(ov.adj_win_loss_ratio, ov.total_trades)}">
                            ${(ov.adj_win_loss_ratio || 0).toFixed(2)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            Payoff ${(ov.avg_loss > 0 ? (ov.avg_win / ov.avg_loss).toFixed(2) : '--')}
                        </span>
                    </div>

                    <!-- 11. Sharpe Ratio -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.sharpeRatio}</span>
                        </div>
                        <span class="stat-card-value mono ${this.getPnlClass(ov.sharpe_per_trade)}">
                            ${(ov.sharpe_per_trade || 0).toFixed(2)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            Statistical efficiency
                        </span>
                    </div>

                    <!-- 12. Avg Win Hold -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.avgWinHold}</span>
                        </div>
                        <span class="stat-card-value mono ${this.getHoldClass(ov.avg_win_hold, 'win')}">
                            ${ov.avg_win_hold || '--'}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.winning_trades || 0} wins duration
                        </span>
                    </div>

                    <!-- 13. Avg Loss Hold -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.avgLossHold}</span>
                        </div>
                        <span class="stat-card-value mono ${this.getHoldClass(ov.avg_loss_hold, 'loss')}">
                            ${ov.avg_loss_hold || '--'}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.losing_trades || 0} losses duration
                        </span>
                    </div>

                    <!-- 14. Gross Realized P&L -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.grossPnl}</span>
                        </div>
                        <span class="stat-card-value mono ${this.getPnlClass(ov.gross_pnl)}">
                            ${State.formatCurrency(ov.gross_pnl || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            Total trading returns
                        </span>
                    </div>

                    <!-- 15. Total Commissions & Fees -->
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.totalCommissions}</span>
                        </div>
                        <span class="stat-card-value mono ${(ov.total_commissions || 0) > 0 ? 'pnl-negative' : 'pnl-neutral'}">
                            -${State.currency}${(ov.total_commissions || 0).toFixed(2)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            IBKR execution costs
                        </span>
                    </div>
                </div>

                <!-- Portfolio Capital & Equity Overview Strip -->
                <div class="stats-section-box">
                    <div class="stats-section-header">
                        <div class="stats-section-title-wrap">
                            <span>${sp.capitalStripTitle || 'Portfolio Capital & Equity Overview'}</span>
                        </div>
                        <button type="button" class="btn-pill" id="btn-stats-manage-cash" style="padding: 4px 12px; font-size: 11px;">
                            ${sp.manageCashBtn || '⚙ Manage Capital & Cash Transfers'}
                        </button>
                    </div>
                    <div class="cash-summary-grid">
                        <div class="cash-card">
                            <span class="cash-card-label">${STRINGS.cash?.accountEquity || 'ACCOUNT EQUITY (NAV)'}</span>
                            <span class="cash-card-value mono ${this.getPnlClass(ov.account_balance)}">
                                ${State.formatCurrency(ov.account_balance || 0)}
                            </span>
                            <span class="cash-card-sub">${STRINGS.cash?.accountEquitySub || 'Starting Capital + Net Flow + Realized P&L'}</span>
                        </div>
                        <div class="cash-card">
                            <span class="cash-card-label">${STRINGS.cash?.startingCapital || 'STARTING CAPITAL'}</span>
                            <span class="cash-card-value mono pnl-neutral">
                                ${State.formatCurrency(ov.starting_capital || 0)}
                            </span>
                            <span class="cash-card-sub">${STRINGS.cash?.startingCapitalStatsSub || 'Configured baseline capital'}</span>
                        </div>
                        <div class="cash-card">
                            <span class="cash-card-label">${STRINGS.cash?.netTransfersStats || 'NET CASH TRANSFERS'}</span>
                            <span class="cash-card-value mono ${this.getPnlClass(ov.net_cash_flow)}">
                                ${State.formatCurrency(ov.net_cash_flow || 0)}
                            </span>
                            <span class="cash-card-sub">In: ${State.currency}${(ov.total_deposits || 0).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})} · Out: ${State.currency}${(ov.total_withdrawals || 0).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})}</span>
                        </div>
                        <div class="cash-card">
                            <span class="cash-card-label">${STRINGS.cash?.roi || 'RETURN ON CAPITAL (% ROI)'}</span>
                            <span class="cash-card-value mono ${this.getPnlClass(ov.roi_pct)}">
                                ${(ov.roi_pct || 0) > 0 ? '+' : ''}${(ov.roi_pct || 0).toFixed(2)}%
                            </span>
                            <span class="cash-card-sub">${STRINGS.cash?.roiSub || 'Realized P&L / Capital Base'}</span>
                        </div>
                    </div>
                </div>

                <!-- 2. Rolling Win Rate Section -->
                <div class="stats-section-box">
                    <div class="stats-section-header">
                        <div class="stats-section-title-wrap">
                            <span>${sp.rollingWinRateTitle}</span>
                        </div>

                        <div class="segmented-control" id="rolling-winrate-window">
                            <button class="segmented-btn ${this.rollingWindow === '10' ? 'active' : ''}" data-window="10">10</button>
                            <button class="segmented-btn ${this.rollingWindow === '20' ? 'active' : ''}" data-window="20">20</button>
                            <button class="segmented-btn ${this.rollingWindow === '50' ? 'active' : ''}" data-window="50">50</button>
                            <button class="segmented-btn ${this.rollingWindow === '100' ? 'active' : ''}" data-window="100">100</button>
                        </div>
                    </div>

                    <div class="rolling-winrate-box">
                        <div class="rolling-winrate-left">
                            <span class="rolling-winrate-val mono ${rollingWrClass}">
                                ${currentRolling.win_rate.toFixed(1)}%
                            </span>
                            <span class="rolling-winrate-record mono">
                                ${currentRolling.wins}W · ${currentRolling.losses}L
                            </span>
                            ${deltaHtml}
                        </div>
                    </div>
                </div>

                <!-- 3. Metric Evolution Section -->
                <div class="stats-section-box">
                    <div class="stats-section-header">
                        <div class="stats-section-title-wrap">
                            <span>${sp.metricEvolutionTitle}</span>
                        </div>

                        <div class="segmented-control" id="metric-evolution-timeframe">
                            <button class="segmented-btn ${this.timeframe === 'day' ? 'active' : ''}" data-tf="day">${sp.day}</button>
                            <button class="segmented-btn ${this.timeframe === 'week' ? 'active' : ''}" data-tf="week">${sp.week}</button>
                            <button class="segmented-btn ${this.timeframe === 'month' ? 'active' : ''}" data-tf="month">${sp.month}</button>
                        </div>
                    </div>

                    <!-- Metric Selector Checkbox Toggles -->
                    <div class="metric-toggles-bar">
                        <label class="metric-toggle-label" style="--metric-color: #10b981;">
                            <input type="checkbox" id="m-win-rate" ${this.activeMetrics.win_rate ? 'checked' : ''}>
                            <span class="metric-color-dot" style="background: #10b981;"></span>
                            <span>${sp.winRateMetric}</span>
                        </label>

                        <label class="metric-toggle-label" style="--metric-color: #8b5cf6;">
                            <input type="checkbox" id="m-pf" ${this.activeMetrics.profit_factor ? 'checked' : ''}>
                            <span class="metric-color-dot" style="background: #8b5cf6;"></span>
                            <span>${sp.profitFactorMetric}</span>
                        </label>

                        <label class="metric-toggle-label" style="--metric-color: #3b82f6;">
                            <input type="checkbox" id="m-avg-win" ${this.activeMetrics.avg_win ? 'checked' : ''}>
                            <span class="metric-color-dot" style="background: #3b82f6;"></span>
                            <span>${sp.avgWinMetric}</span>
                        </label>

                        <label class="metric-toggle-label" style="--metric-color: #ef4444;">
                            <input type="checkbox" id="m-avg-loss" ${this.activeMetrics.avg_loss ? 'checked' : ''}>
                            <span class="metric-color-dot" style="background: #ef4444;"></span>
                            <span>${sp.avgLossMetric}</span>
                        </label>

                        <label class="metric-toggle-label" style="--metric-color: #f59e0b;">
                            <input type="checkbox" id="m-exp" ${this.activeMetrics.expectancy ? 'checked' : ''}>
                            <span class="metric-color-dot" style="background: #f59e0b;"></span>
                            <span>${sp.expectancyMetric}</span>
                        </label>

                        <label class="metric-toggle-label" style="--metric-color: #06b6d4;">
                            <input type="checkbox" id="m-avg-pnl" ${this.activeMetrics.avg_trade_pnl ? 'checked' : ''}>
                            <span class="metric-color-dot" style="background: #06b6d4;"></span>
                            <span>${sp.avgPnlTradeMetric}</span>
                        </label>

                        <label class="metric-toggle-label" style="--metric-color: #ec4899;">
                            <input type="checkbox" id="m-cum-pnl" ${this.activeMetrics.cumulative_pnl ? 'checked' : ''}>
                            <span class="metric-color-dot" style="background: #ec4899;"></span>
                            <span>${sp.cumPnlMetric}</span>
                        </label>
                    </div>

                    <!-- Metric Evolution Canvas -->
                    <div class="chart-canvas-box tall">
                        <canvas id="chart-metric-evolution"></canvas>
                    </div>
                </div>

                <!-- 4. Equity Curve Section -->
                <div class="stats-section-box">
                    <div class="stats-section-header">
                        <div class="stats-section-title-wrap">
                            <span>${sp.equityCurveTitle}</span>
                        </div>
                    </div>
                    <div class="chart-canvas-box tall">
                        <canvas id="chart-equity-curve"></canvas>
                    </div>
                </div>

                <!-- 5. Risk & Drawdown Section -->
                <div class="stats-section-box">
                    <div class="stats-section-header">
                        <div class="stats-section-title-wrap">
                            <span>${sp.riskTitle}</span>
                        </div>
                    </div>
                    <div class="risk-drawdown-grid">
                        <div class="risk-stat-card">
                            <div class="risk-stat-label-row">
                                <span>${sp.maxDrawdown}</span>
                            </div>
                            <span class="risk-stat-value mono ${ov.max_drawdown_pct < 0 ? 'pnl-negative' : 'pnl-neutral'}">
                                ${ov.max_drawdown_pct ? ov.max_drawdown_pct.toFixed(2) : '0.00'}%
                            </span>
                            <span class="risk-stat-subvalue mono ${ov.max_drawdown_amount < 0 ? 'pnl-negative' : 'pnl-neutral'}">
                                ${State.formatCurrency(ov.max_drawdown_amount || 0)}
                            </span>
                        </div>

                        <div class="risk-stat-card">
                            <div class="risk-stat-label-row">
                                <span>${sp.currentDrawdown}</span>
                            </div>
                            <span class="risk-stat-value mono ${ov.current_drawdown_pct < 0 ? 'pnl-negative' : 'pnl-neutral'}">
                                ${ov.current_drawdown_pct ? ov.current_drawdown_pct.toFixed(2) : '0.00'}%
                            </span>
                            <span class="risk-stat-subvalue mono ${ov.current_drawdown_amount < 0 ? 'pnl-negative' : 'pnl-neutral'}">
                                ${State.formatCurrency(ov.current_drawdown_amount || 0)}
                            </span>
                        </div>

                        <div class="risk-stat-card">
                            <div class="risk-stat-label-row">
                                <span>${sp.longestLosingStreak}</span>
                            </div>
                            <span class="risk-stat-value mono ${this.getStreakLossClass(ov.longest_losing_streak)}">
                                ${ov.longest_losing_streak || 0} ${STRINGS.calendar.tradesBadge}
                            </span>
                            <span class="risk-stat-subvalue">
                                ${sp.currentStreak}: <strong class="mono ${this.getStreakLossClass(ov.current_losing_streak)}">${ov.current_losing_streak || 0}</strong>
                            </span>
                        </div>

                        <div class="risk-stat-card">
                            <div class="risk-stat-label-row">
                                <span>${sp.longestWinningStreak}</span>
                            </div>
                            <span class="risk-stat-value mono ${this.getStreakWinClass(ov.longest_winning_streak)}">
                                ${ov.longest_winning_streak || 0} ${STRINGS.calendar.tradesBadge}
                            </span>
                            <span class="risk-stat-subvalue">
                                ${sp.currentStreak}: <strong class="mono ${this.getStreakWinClass(ov.current_winning_streak)}">${ov.current_winning_streak || 0}</strong>
                            </span>
                        </div>
                    </div>

                    <!-- Drawdown Curve Chart -->
                    <div style="margin-top: 8px;">
                        <div class="stats-section-title-wrap" style="font-size: 11px; margin-bottom: 8px; color: var(--text-muted);">
                            <span>${sp.drawdownChartTitle}</span>
                        </div>
                        <div class="chart-canvas-box compact">
                            <canvas id="chart-drawdown"></canvas>
                        </div>
                    </div>
                </div>

                <!-- 6. 2x2 Breakdowns Grid (Symbol, Tag, Day of Week, Time of Day) -->
                <div class="breakdowns-2x2-grid">
                    <!-- P&L by Symbol -->
                    <div class="stats-section-box">
                        <div class="stats-section-header">
                            <div class="stats-section-title-wrap">
                                <span>${sp.pnlBySymbolTitle}</span>
                            </div>
                            <div class="segmented-control">
                                <button class="segmented-btn ${this.viewModes.symbol === 'chart' ? 'active' : ''}" data-view-target="symbol" data-view-val="chart">${sp.chartView}</button>
                                <button class="segmented-btn ${this.viewModes.symbol === 'table' ? 'active' : ''}" data-view-target="symbol" data-view-val="table">${sp.tableView}</button>
                            </div>
                        </div>
                        <div id="wrap-symbol-chart" class="chart-canvas-box ${this.viewModes.symbol === 'chart' ? '' : 'hidden'}">
                            <canvas id="chart-symbol"></canvas>
                        </div>
                        <div id="wrap-symbol-table" class="stats-table-wrapper ${this.viewModes.symbol === 'table' ? '' : 'hidden'}">
                            <table class="institutional-table">
                                <thead>
                                    <tr>
                                        <th>${sp.colSymbol}</th>
                                        <th>${sp.colCategory}</th>
                                        <th>${sp.colTrades}</th>
                                        <th>${sp.colWinRate}</th>
                                        <th>${sp.colCommissions}</th>
                                        <th>${sp.colNetPnl}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.buildSymbolTableRows(symbols)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- P&L by Tag -->
                    <div class="stats-section-box">
                        <div class="stats-section-header">
                            <div class="stats-section-title-wrap">
                                <span>${sp.pnlByTagTitle}</span>
                            </div>
                            <div class="segmented-control">
                                <button class="segmented-btn ${this.viewModes.tag === 'chart' ? 'active' : ''}" data-view-target="tag" data-view-val="chart">${sp.chartView}</button>
                                <button class="segmented-btn ${this.viewModes.tag === 'table' ? 'active' : ''}" data-view-target="tag" data-view-val="table">${sp.tableView}</button>
                            </div>
                        </div>
                        <div id="wrap-tag-chart" class="chart-canvas-box ${this.viewModes.tag === 'chart' ? '' : 'hidden'}">
                            <canvas id="chart-tag"></canvas>
                        </div>
                        <div id="wrap-tag-table" class="stats-table-wrapper ${this.viewModes.tag === 'table' ? '' : 'hidden'}">
                            <table class="institutional-table">
                                <thead>
                                    <tr>
                                        <th>${sp.colTag}</th>
                                        <th>${sp.colTrades}</th>
                                        <th>${sp.colWinRate}</th>
                                        <th>${sp.colNetPnl}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.buildTagTableRows(tags)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Performance by Day of Week -->
                    <div class="stats-section-box">
                        <div class="stats-section-header">
                            <div class="stats-section-title-wrap">
                                <span>${sp.perfByDowTitle}</span>
                            </div>
                            <div class="segmented-control">
                                <button class="segmented-btn ${this.viewModes.dow === 'chart' ? 'active' : ''}" data-view-target="dow" data-view-val="chart">${sp.chartView}</button>
                                <button class="segmented-btn ${this.viewModes.dow === 'table' ? 'active' : ''}" data-view-target="dow" data-view-val="table">${sp.tableView}</button>
                            </div>
                        </div>
                        <div id="wrap-dow-chart" class="chart-canvas-box ${this.viewModes.dow === 'chart' ? '' : 'hidden'}">
                            <canvas id="chart-dow"></canvas>
                        </div>
                        <div id="wrap-dow-table" class="stats-table-wrapper ${this.viewModes.dow === 'table' ? '' : 'hidden'}">
                            <table class="institutional-table">
                                <thead>
                                    <tr>
                                        <th>${sp.colDay}</th>
                                        <th>${sp.colTrades}</th>
                                        <th>${sp.colWinRate}</th>
                                        <th>${sp.colNetPnl}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.buildDowTableRows(dow)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Performance by Time of Day -->
                    <div class="stats-section-box">
                        <div class="stats-section-header">
                            <div class="stats-section-title-wrap">
                                <span>${sp.perfByTodTitle}</span>
                            </div>
                            <div class="segmented-control">
                                <button class="segmented-btn ${this.viewModes.tod === 'chart' ? 'active' : ''}" data-view-target="tod" data-view-val="chart">${sp.chartView}</button>
                                <button class="segmented-btn ${this.viewModes.tod === 'table' ? 'active' : ''}" data-view-target="tod" data-view-val="table">${sp.tableView}</button>
                            </div>
                        </div>
                        <div id="wrap-tod-chart" class="chart-canvas-box ${this.viewModes.tod === 'chart' ? '' : 'hidden'}">
                            <canvas id="chart-tod"></canvas>
                        </div>
                        <div id="wrap-tod-table" class="stats-table-wrapper ${this.viewModes.tod === 'table' ? '' : 'hidden'}">
                            <table class="institutional-table">
                                <thead>
                                    <tr>
                                        <th>${sp.colHour}</th>
                                        <th>${sp.colTrades}</th>
                                        <th>${sp.colWinRate}</th>
                                        <th>${sp.colNetPnl}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.buildTodTableRows(tod)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- P&L by Holding Duration -->
                    <div class="stats-section-box">
                        <div class="stats-section-header">
                            <div class="stats-section-title-wrap">
                                <span>${sp.pnlByDurationTitle}</span>
                            </div>
                            <div class="segmented-control">
                                <button class="segmented-btn ${this.viewModes.duration === 'chart' ? 'active' : ''}" data-view-target="duration" data-view-val="chart">${sp.chartView}</button>
                                <button class="segmented-btn ${this.viewModes.duration === 'table' ? 'active' : ''}" data-view-target="duration" data-view-val="table">${sp.tableView}</button>
                            </div>
                        </div>
                        <div id="wrap-duration-chart" class="chart-canvas-box ${this.viewModes.duration === 'chart' ? '' : 'hidden'}">
                            <canvas id="chart-duration"></canvas>
                        </div>
                        <div id="wrap-duration-table" class="stats-table-wrapper ${this.viewModes.duration === 'table' ? '' : 'hidden'}">
                            <table class="institutional-table">
                                <thead>
                                    <tr>
                                        <th>${sp.colDuration}</th>
                                        <th>${sp.colTrades}</th>
                                        <th>${sp.colWinRate}</th>
                                        <th>${sp.colNetPnl}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.buildDurationTableRows(durations)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- P&L by Order Type -->
                    <div class="stats-section-box">
                        <div class="stats-section-header">
                            <div class="stats-section-title-wrap">
                                <span>${sp.pnlByOrderTypeTitle}</span>
                            </div>
                            <div class="segmented-control">
                                <button class="segmented-btn ${this.viewModes.order_type === 'chart' ? 'active' : ''}" data-view-target="order_type" data-view-val="chart">${sp.chartView}</button>
                                <button class="segmented-btn ${this.viewModes.order_type === 'table' ? 'active' : ''}" data-view-target="order_type" data-view-val="table">${sp.tableView}</button>
                            </div>
                        </div>
                        <div id="wrap-order_type-chart" class="chart-canvas-box ${this.viewModes.order_type === 'chart' ? '' : 'hidden'}">
                            <canvas id="chart-order_type"></canvas>
                        </div>
                        <div id="wrap-order_type-table" class="stats-table-wrapper ${this.viewModes.order_type === 'table' ? '' : 'hidden'}">
                            <table class="institutional-table">
                                <thead>
                                    <tr>
                                        <th>${sp.colOrderType}</th>
                                        <th>${sp.colTrades}</th>
                                        <th>${sp.colWinRate}</th>
                                        <th>${sp.colNetPnl}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.buildOrderTypeTableRows(orderTypes)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- 7. Category Allocation & Long/Short Side Tables -->
                <div class="stats-tables-grid">
                    <div class="stats-panel">
                        <div class="section-header">
                            <h3 class="section-title">${sp.categoryTableTitle}</h3>
                        </div>
                        <div class="stats-table-wrapper">
                            <table class="institutional-table">
                                <thead>
                                    <tr>
                                        <th>${sp.colCategory}</th>
                                        <th>${sp.colTrades}</th>
                                        <th>${sp.colWinRate}</th>
                                        <th>${sp.colNetPnl}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.buildCategoryTableRows(categories)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="stats-panel">
                        <div class="section-header">
                            <h3 class="section-title">${sp.sideTableTitle}</h3>
                        </div>
                        <div class="stats-table-wrapper">
                            <table class="institutional-table">
                                <thead>
                                    <tr>
                                        <th>${sp.colSide}</th>
                                        <th>${sp.colTrades}</th>
                                        <th>${sp.colWinRate}</th>
                                        <th>${sp.colNetPnl}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.buildSideTableRows(sides)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
        this.initAllCharts();
        if (typeof StatsController !== 'undefined' && StatsController.updateScrollDockVisibility) {
            StatsController.updateScrollDockVisibility();
        }
    },

    bindEvents() {
        const btnManageCash = document.getElementById('btn-stats-manage-cash');
        if (btnManageCash) {
            btnManageCash.addEventListener('click', () => {
                if (typeof CashModal !== 'undefined' && CashModal.open) {
                    CashModal.open();
                }
            });
        }

        // Date range filter buttons
        const rangeBtns = document.querySelectorAll('#stats-date-range-filter .segmented-btn');
        rangeBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                const targetRange = btn.getAttribute('data-range') || 'ALL';
                if (targetRange === this.dateRange && this.data) return;

                rangeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.dateRange = targetRange;
                if (typeof SettingsManager !== 'undefined') {
                    SettingsManager.set('stats_date_range', this.dateRange);
                }
                await this.load(false);
            });
        });

        // Rolling win rate window buttons
        const winBtns = document.querySelectorAll('#rolling-winrate-window .segmented-btn');
        winBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                winBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.rollingWindow = btn.getAttribute('data-window') || '20';
                if (typeof SettingsManager !== 'undefined') {
                    SettingsManager.set('stats_rolling_window', this.rollingWindow);
                }
                this.updateRollingWinRateUI();
            });
        });

        // Timeframe selector
        const tfButtons = document.querySelectorAll('#metric-evolution-timeframe .segmented-btn');
        tfButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tfButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.timeframe = btn.getAttribute('data-tf') || 'day';
                if (typeof SettingsManager !== 'undefined') {
                    SettingsManager.set('stats_timeframe', this.timeframe);
                }
                this.renderMetricEvolutionChart();
            });
        });

        // Metric checkboxes
        const metricMap = {
            'm-win-rate': 'win_rate',
            'm-pf': 'profit_factor',
            'm-avg-win': 'avg_win',
            'm-avg-loss': 'avg_loss',
            'm-exp': 'expectancy',
            'm-avg-pnl': 'avg_trade_pnl',
            'm-cum-pnl': 'cumulative_pnl'
        };
        Object.keys(metricMap).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', (e) => {
                    this.activeMetrics[metricMap[id]] = e.target.checked;
                    if (typeof SettingsManager !== 'undefined') {
                        SettingsManager.set('stats_active_metrics', this.activeMetrics);
                    }
                    this.renderMetricEvolutionChart();
                });
            }
        });

        // Chart / Table view switchers in 2x2 breakdowns
        document.querySelectorAll('[data-view-target]').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-view-target');
                const val = btn.getAttribute('data-view-val');
                this.viewModes[target] = val;
                if (typeof SettingsManager !== 'undefined') {
                    SettingsManager.set('stats_view_modes', this.viewModes);
                }

                // Update segmented button UI
                const group = btn.closest('.segmented-control');
                if (group) {
                    group.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }

                // Toggle visibility
                const chartWrap = document.getElementById(`wrap-${target}-chart`);
                const tableWrap = document.getElementById(`wrap-${target}-table`);
                if (val === 'chart') {
                    if (chartWrap) chartWrap.classList.remove('hidden');
                    if (tableWrap) tableWrap.classList.add('hidden');
                    if (target === 'symbol') this.renderSymbolChart();
                    if (target === 'tag') this.renderTagChart();
                    if (target === 'dow') this.renderDowChart();
                    if (target === 'tod') this.renderTodChart();
                    if (target === 'duration') this.renderDurationChart();
                    if (target === 'order_type') this.renderOrderTypeChart();
                } else {
                    if (chartWrap) chartWrap.classList.add('hidden');
                    if (tableWrap) tableWrap.classList.remove('hidden');
                }
            });
        });
    },

    updateRollingWinRateUI() {
        if (!this.data || !this.data.rolling_win_rate) return;
        const currentRolling = this.data.rolling_win_rate[this.rollingWindow] || {
            win_rate: 0,
            wins: 0,
            losses: 0,
            total: 0,
            prior_win_rate: null,
            delta: 0
        };

        const valEl = document.querySelector('.rolling-winrate-val');
        const recEl = document.querySelector('.rolling-winrate-record');
        const deltaEl = document.querySelector('.trend-delta-text');
        const sp = STRINGS.statsPage;

        const rollingWrClass = currentRolling.total > 0
            ? (currentRolling.win_rate > 50 ? 'pnl-positive' : (currentRolling.win_rate < 50 ? 'pnl-negative' : 'pnl-neutral'))
            : 'pnl-neutral';

        if (valEl) {
            valEl.textContent = `${currentRolling.win_rate.toFixed(1)}%`;
            valEl.className = `rolling-winrate-val mono ${rollingWrClass}`;
        }

        if (recEl) {
            recEl.textContent = `${currentRolling.wins}W · ${currentRolling.losses}L`;
        }

        if (deltaEl && currentRolling.prior_win_rate !== null) {
            const delta = currentRolling.delta || 0;
            const isZero = Math.abs(delta) < 0.001;
            const isPos = delta > 0;
            const arrow = isZero ? '→' : (isPos ? '↗' : '↘');
            const sign = isPos ? '+' : '';
            const colorClass = isZero ? 'pnl-neutral' : (isPos ? 'pnl-positive' : 'pnl-negative');
            deltaEl.className = `trend-delta-text ${colorClass}`;
            deltaEl.innerHTML = `${arrow} ${sign}${delta.toFixed(1)} ${sp.vsPrior} ${this.rollingWindow} (${currentRolling.prior_win_rate.toFixed(1)}%)`;
        }
    },

    initAllCharts() {
        if (typeof Chart === 'undefined') {
            setTimeout(() => this.initAllCharts(), 200);
            return;
        }

        this.renderDrawdownChart();
        this.renderMetricEvolutionChart();
        this.renderEquityCurveChart();
        this.renderSymbolChart();
        this.renderTagChart();
        this.renderDowChart();
        this.renderTodChart();
        this.renderDurationChart();
        this.renderOrderTypeChart();
    },

    reRenderCharts() {
        if (!this.data) return;
        this.initAllCharts();
    },

    // 1. Drawdown Chart
    renderDrawdownChart() {
        const canvas = document.getElementById('chart-drawdown');
        if (!canvas) return;
        if (this.charts.drawdown) this.charts.drawdown.destroy();

        const theme = this.getThemeColors();
        const ddData = this.data.drawdown_series || [];

        const labels = ddData.map(d => d.date);
        const values = ddData.map(d => d.drawdown_pct);

        this.charts.drawdown = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels.length ? labels : ['--'],
                datasets: [{
                    label: 'Drawdown %',
                    data: values.length ? values : [0],
                    borderColor: theme.drawdownLine,
                    backgroundColor: theme.drawdownArea,
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2,
                    pointRadius: labels.length > 30 ? 0 : 2,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const idx = context.dataIndex;
                                const item = ddData[idx];
                                const amt = item ? State.formatCurrency(item.drawdown_amount) : '';
                                return ` Drawdown: ${context.parsed.y.toFixed(2)}% (${amt})`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: theme.grid },
                        ticks: { color: theme.text, font: { family: 'SF Mono, monospace', size: 10 } }
                    },
                    y: {
                        grid: { color: theme.grid },
                        ticks: {
                            color: theme.text,
                            font: { family: 'SF Mono, monospace', size: 10 },
                            callback: (val) => `${val}%`
                        }
                    }
                }
            }
        });
    },

    // 2. Metric Evolution Chart (Multi-axis, toggleable metrics, timeframe)
    renderMetricEvolutionChart() {
        const canvas = document.getElementById('chart-metric-evolution');
        if (!canvas) return;
        if (this.charts.metricEvolution) this.charts.metricEvolution.destroy();

        const theme = this.getThemeColors();
        const tf = this.timeframe || 'day';
        const series = (this.data.metric_evolution && this.data.metric_evolution[tf]) || [];

        const labels = series.map(s => s.period || s.date);
        const datasets = [];

        if (this.activeMetrics.win_rate) {
            datasets.push({
                label: STRINGS.statsPage.winRateMetric,
                data: series.map(s => s.win_rate),
                borderColor: theme.metricColors.win_rate,
                backgroundColor: theme.metricColors.win_rate,
                tension: 0.35,
                borderWidth: 2,
                pointRadius: labels.length > 35 ? 0 : 3,
                yAxisID: 'yPercent'
            });
        }

        if (this.activeMetrics.profit_factor) {
            datasets.push({
                label: STRINGS.statsPage.profitFactorMetric,
                data: series.map(s => s.profit_factor),
                borderColor: theme.metricColors.profit_factor,
                backgroundColor: theme.metricColors.profit_factor,
                tension: 0.35,
                borderWidth: 2,
                pointRadius: labels.length > 35 ? 0 : 3,
                yAxisID: 'yRatio'
            });
        }

        if (this.activeMetrics.avg_win) {
            datasets.push({
                label: STRINGS.statsPage.avgWinMetric,
                data: series.map(s => s.avg_win),
                borderColor: theme.metricColors.avg_win,
                backgroundColor: theme.metricColors.avg_win,
                tension: 0.35,
                borderWidth: 2,
                pointRadius: labels.length > 35 ? 0 : 3,
                yAxisID: 'yCurrency'
            });
        }

        if (this.activeMetrics.avg_loss) {
            datasets.push({
                label: STRINGS.statsPage.avgLossMetric,
                data: series.map(s => s.avg_loss),
                borderColor: theme.metricColors.avg_loss,
                backgroundColor: theme.metricColors.avg_loss,
                tension: 0.35,
                borderWidth: 2,
                pointRadius: labels.length > 35 ? 0 : 3,
                yAxisID: 'yCurrency'
            });
        }

        if (this.activeMetrics.expectancy) {
            datasets.push({
                label: STRINGS.statsPage.expectancyMetric,
                data: series.map(s => s.expectancy),
                borderColor: theme.metricColors.expectancy,
                backgroundColor: theme.metricColors.expectancy,
                tension: 0.35,
                borderWidth: 2,
                pointRadius: labels.length > 35 ? 0 : 3,
                yAxisID: 'yCurrency'
            });
        }

        if (this.activeMetrics.avg_trade_pnl) {
            datasets.push({
                label: STRINGS.statsPage.avgPnlTradeMetric,
                data: series.map(s => s.avg_trade_pnl),
                borderColor: theme.metricColors.avg_trade_pnl,
                backgroundColor: theme.metricColors.avg_trade_pnl,
                tension: 0.35,
                borderWidth: 2,
                pointRadius: labels.length > 35 ? 0 : 3,
                yAxisID: 'yCurrency'
            });
        }

        if (this.activeMetrics.cumulative_pnl) {
            datasets.push({
                label: STRINGS.statsPage.cumPnlMetric,
                data: series.map(s => s.cumulative_pnl),
                borderColor: theme.metricColors.cumulative_pnl,
                backgroundColor: theme.metricColors.cumulative_pnl,
                tension: 0.35,
                borderWidth: 2,
                pointRadius: labels.length > 35 ? 0 : 3,
                yAxisID: 'yCurrency'
            });
        }

        const scales = {
            x: {
                grid: { color: theme.grid },
                ticks: { color: theme.text, font: { family: 'SF Mono, monospace', size: 10 } }
            }
        };

        const needsPercent = this.activeMetrics.win_rate;
        const needsRatio = this.activeMetrics.profit_factor;
        const needsCurrency = this.activeMetrics.avg_win || this.activeMetrics.avg_loss ||
            this.activeMetrics.expectancy || this.activeMetrics.avg_trade_pnl || this.activeMetrics.cumulative_pnl;

        if (needsPercent) {
            scales.yPercent = {
                type: 'linear',
                position: 'left',
                grid: { color: theme.grid },
                ticks: {
                    color: theme.text,
                    font: { family: 'SF Mono, monospace', size: 10 },
                    callback: (val) => `${val}%`
                }
            };
        }

        if (needsRatio) {
            scales.yRatio = {
                type: 'linear',
                position: needsPercent ? 'right' : 'left',
                grid: { drawOnChartArea: !needsPercent, color: theme.grid },
                ticks: {
                    color: theme.text,
                    font: { family: 'SF Mono, monospace', size: 10 },
                    callback: (val) => val.toFixed(1)
                }
            };
        }

        if (needsCurrency) {
            scales.yCurrency = {
                type: 'linear',
                position: (needsPercent && needsRatio) ? 'right' : (needsPercent ? 'right' : 'left'),
                grid: { drawOnChartArea: (!needsPercent && !needsRatio), color: theme.grid },
                ticks: {
                    color: theme.text,
                    font: { family: 'SF Mono, monospace', size: 10 },
                    callback: (val) => `${State.currency}${val}`
                }
            };
        }

        if (!datasets.length) {
            scales.y = { grid: { color: theme.grid }, ticks: { color: theme.text } };
        }

        this.charts.metricEvolution = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels.length ? labels : ['--'],
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const datasetLabel = context.dataset.label || '';
                                const val = context.parsed.y;
                                if (datasetLabel.includes('%')) return ` ${datasetLabel}: ${val.toFixed(1)}%`;
                                if (datasetLabel.includes('Factor')) return ` ${datasetLabel}: ${val.toFixed(2)}`;
                                return ` ${datasetLabel}: ${State.formatCurrency(val)}`;
                            }
                        }
                    }
                },
                scales: scales
            }
        });
    },

    // 4. Equity Curve (Line with Daily P&L Bars overlay)
    renderEquityCurveChart() {
        const canvas = document.getElementById('chart-equity-curve');
        if (!canvas) return;
        if (this.charts.equityCurve) this.charts.equityCurve.destroy();

        const theme = this.getThemeColors();
        const eqData = this.data.equity_curve || [];

        const labels = eqData.map(d => d.date);
        const cumPnl = eqData.map(d => d.cumulative_pnl);
        const dailyPnl = eqData.map(d => d.pnl);

        const barColors = dailyPnl.map(p => p >= 0 ? theme.profitBar : theme.lossBar);
        const barBorders = dailyPnl.map(p => p >= 0 ? theme.profit : theme.loss);

        this.charts.equityCurve = new Chart(canvas, {
            data: {
                labels: labels.length ? labels : ['--'],
                datasets: [
                    {
                        type: 'line',
                        label: STRINGS.statsPage.cumPnlMetric,
                        data: cumPnl.length ? cumPnl : [0],
                        borderColor: theme.equityLine,
                        backgroundColor: theme.equityArea,
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2.5,
                        pointRadius: labels.length > 35 ? 0 : 3,
                        pointHoverRadius: 6,
                        yAxisID: 'y',
                        order: 1
                    },
                    {
                        type: 'bar',
                        label: STRINGS.statsPage.dailyPnlMetric,
                        data: dailyPnl.length ? dailyPnl : [0],
                        backgroundColor: barColors,
                        borderColor: barBorders,
                        borderWidth: 1,
                        borderRadius: 2,
                        barPercentage: 0.5,
                        yAxisID: 'y',
                        order: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            color: theme.text,
                            boxWidth: 10,
                            font: { size: 11, weight: '600' }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const idx = context.dataIndex;
                                const item = eqData[idx];
                                const label = context.dataset.label;
                                const val = context.parsed.y;
                                if (context.dataset.type === 'bar') {
                                    const count = item ? item.trades_count : 0;
                                    return ` ${label}: ${State.formatCurrency(val)} (${count} ops)`;
                                }
                                return ` ${label}: ${State.formatCurrency(val)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: theme.grid },
                        ticks: { color: theme.text, font: { family: 'SF Mono, monospace', size: 10 } }
                    },
                    y: {
                        grid: { color: theme.grid },
                        ticks: {
                            color: theme.text,
                            font: { family: 'SF Mono, monospace', size: 10 },
                            callback: (val) => `${State.currency}${val}`
                        }
                    }
                }
            }
        });
    },

    // 5. P&L by Symbol (Horizontal Bar)
    renderSymbolChart() {
        const canvas = document.getElementById('chart-symbol');
        if (!canvas) return;
        if (this.charts.symbol) this.charts.symbol.destroy();

        const theme = this.getThemeColors();
        const symbols = this.data.symbols || [];

        const labels = symbols.map(s => s.symbol);
        const values = symbols.map(s => s.net_pnl);
        const colors = values.map(v => v >= 0 ? theme.profitBar : theme.lossBar);
        const borders = values.map(v => v >= 0 ? theme.profit : theme.loss);

        this.charts.symbol = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['--'],
                datasets: [{
                    label: 'Net P&L',
                    data: values.length ? values : [0],
                    backgroundColor: colors,
                    borderColor: borders,
                    borderWidth: 1,
                    borderRadius: 3
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const idx = context.dataIndex;
                                const s = symbols[idx];
                                const wr = s ? s.win_rate : 0;
                                const cnt = s ? s.trades_count : 0;
                                return ` Net P&L: ${State.formatCurrency(context.parsed.x)} | WR: ${wr}% (${cnt} ops)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: theme.grid },
                        ticks: {
                            color: theme.text,
                            font: { family: 'SF Mono, monospace', size: 10 },
                            callback: (val) => `${State.currency}${val}`
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            color: theme.textMain,
                            font: { weight: '700', size: 11 }
                        }
                    }
                }
            }
        });
    },

    // 6. P&L by Tag (Horizontal Bar)
    renderTagChart() {
        const canvas = document.getElementById('chart-tag');
        if (!canvas) return;
        if (this.charts.tag) this.charts.tag.destroy();

        const theme = this.getThemeColors();
        const tags = this.data.tags || [];

        const labels = tags.map(t => t.tag);
        const values = tags.map(t => t.net_pnl);
        const colors = values.map(v => v >= 0 ? theme.profitBar : theme.lossBar);
        const borders = values.map(v => v >= 0 ? theme.profit : theme.loss);

        this.charts.tag = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['--'],
                datasets: [{
                    label: 'Net P&L',
                    data: values.length ? values : [0],
                    backgroundColor: colors,
                    borderColor: borders,
                    borderWidth: 1,
                    borderRadius: 3
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const idx = context.dataIndex;
                                const t = tags[idx];
                                const wr = t ? t.win_rate : 0;
                                const cnt = t ? t.trades_count : 0;
                                return ` Net P&L: ${State.formatCurrency(context.parsed.x)} | WR: ${wr}% (${cnt} ops)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: theme.grid },
                        ticks: {
                            color: theme.text,
                            font: { family: 'SF Mono, monospace', size: 10 },
                            callback: (val) => `${State.currency}${val}`
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            color: theme.textMain,
                            font: { weight: '600', size: 11 }
                        }
                    }
                }
            }
        });
    },

    // 7. Performance by Day of Week (Vertical Bar)
    renderDowChart() {
        const canvas = document.getElementById('chart-dow');
        if (!canvas) return;
        if (this.charts.dow) this.charts.dow.destroy();

        const theme = this.getThemeColors();
        const dow = this.data.day_of_week || [];

        const labels = dow.map(d => d.short_name);
        const values = dow.map(d => d.net_pnl);
        const colors = values.map(v => v >= 0 ? theme.profitBar : theme.lossBar);
        const borders = values.map(v => v >= 0 ? theme.profit : theme.loss);

        this.charts.dow = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Net P&L',
                    data: values,
                    backgroundColor: colors,
                    borderColor: borders,
                    borderWidth: 1,
                    borderRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const idx = context.dataIndex;
                                const d = dow[idx];
                                return ` Net P&L: ${State.formatCurrency(context.parsed.y)} (${d.trades_count} ops, ${d.win_rate}% WR)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: theme.textMain, font: { weight: '700', size: 11 } }
                    },
                    y: {
                        grid: { color: theme.grid },
                        ticks: {
                            color: theme.text,
                            font: { family: 'SF Mono, monospace', size: 10 },
                            callback: (val) => `${State.currency}${val}`
                        }
                    }
                }
            }
        });
    },

    // 8. Performance by Time of Day (Hourly Vertical Bar)
    renderTodChart() {
        const canvas = document.getElementById('chart-tod');
        if (!canvas) return;
        if (this.charts.tod) this.charts.tod.destroy();

        const theme = this.getThemeColors();
        const tod = this.data.time_of_day || [];

        const labels = tod.map(t => t.label);
        const values = tod.map(t => t.net_pnl);
        const colors = values.map(v => v >= 0 ? theme.profitBar : theme.lossBar);
        const borders = values.map(v => v >= 0 ? theme.profit : theme.loss);

        this.charts.tod = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Net P&L',
                    data: values,
                    backgroundColor: colors,
                    borderColor: borders,
                    borderWidth: 1,
                    borderRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const idx = context.dataIndex;
                                const t = tod[idx];
                                return ` Net P&L: ${State.formatCurrency(context.parsed.y)} (${t.trades_count} ops, ${t.win_rate}% WR)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: theme.text, font: { size: 10 } }
                    },
                    y: {
                        grid: { color: theme.grid },
                        ticks: {
                            color: theme.text,
                            font: { family: 'SF Mono, monospace', size: 10 },
                            callback: (val) => `${State.currency}${val}`
                        }
                    }
                }
            }
        });
    },

    // 9. Performance by Holding Duration (Scalp vs Day Trade vs Swing)
    renderDurationChart() {
        const canvas = document.getElementById('chart-duration');
        if (!canvas) return;
        if (this.charts.duration) this.charts.duration.destroy();

        const theme = this.getThemeColors();
        const durations = (this.data && this.data.holding_durations) || [];

        const labels = durations.map(d => d.duration);
        const values = durations.map(d => d.net_pnl);
        const colors = values.map(v => v >= 0 ? theme.profitBar : theme.lossBar);
        const borders = values.map(v => v >= 0 ? theme.profit : theme.loss);

        this.charts.duration = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['--'],
                datasets: [{
                    label: 'Net P&L',
                    data: values.length ? values : [0],
                    backgroundColor: colors,
                    borderColor: borders,
                    borderWidth: 1,
                    borderRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const idx = context.dataIndex;
                                const d = durations[idx];
                                return ` Net P&L: ${State.formatCurrency(context.parsed.y)} (${d ? d.trades_count : 0} ops, ${d ? d.win_rate : 0}% WR)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: theme.textMain, font: { weight: '700', size: 11 } }
                    },
                    y: {
                        grid: { color: theme.grid },
                        ticks: {
                            color: theme.text,
                            font: { family: 'SF Mono, monospace', size: 10 },
                            callback: (val) => `${State.currency}${val}`
                        }
                    }
                }
            }
        });
    },

    // 10. Performance by Order Type (Limit vs Market vs Stop)
    renderOrderTypeChart() {
        const canvas = document.getElementById('chart-order_type');
        if (!canvas) return;
        if (this.charts.orderType) this.charts.orderType.destroy();

        const theme = this.getThemeColors();
        const orderTypes = (this.data && this.data.order_types) || [];

        const labels = orderTypes.map(o => o.order_type);
        const values = orderTypes.map(o => o.net_pnl);
        const colors = values.map(v => v >= 0 ? theme.profitBar : theme.lossBar);
        const borders = values.map(v => v >= 0 ? theme.profit : theme.loss);

        this.charts.orderType = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['--'],
                datasets: [{
                    label: 'Net P&L',
                    data: values.length ? values : [0],
                    backgroundColor: colors,
                    borderColor: borders,
                    borderWidth: 1,
                    borderRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const idx = context.dataIndex;
                                const o = orderTypes[idx];
                                return ` Net P&L: ${State.formatCurrency(context.parsed.y)} (${o ? o.trades_count : 0} ops, ${o ? o.win_rate : 0}% WR)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: theme.textMain, font: { weight: '700', size: 11 } }
                    },
                    y: {
                        grid: { color: theme.grid },
                        ticks: {
                            color: theme.text,
                            font: { family: 'SF Mono, monospace', size: 10 },
                            callback: (val) => `${State.currency}${val}`
                        }
                    }
                }
            }
        });
    },

    // Table Row Builders
    buildSymbolTableRows(symbols) {
        if (!symbols || !symbols.length) {
            return `<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No symbols recorded</td></tr>`;
        }
        return symbols.map(s => {
            const pnlClass = this.getPnlClass(s.net_pnl);
            return `
                <tr>
                    <td><strong>${s.symbol}</strong></td>
                    <td><span style="font-size: 10px; color: var(--text-muted);">${s.category}</span></td>
                    <td class="mono">${s.trades_count}</td>
                    <td class="mono">${s.win_rate}%</td>
                    <td class="mono">${State.currency}${s.commissions.toFixed(2)}</td>
                    <td class="mono ${pnlClass}" style="font-weight: 700;">${State.formatCurrency(s.net_pnl)}</td>
                </tr>
            `;
        }).join('');
    },

    buildTagTableRows(tags) {
        if (!tags || !tags.length) {
            return `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No tags recorded</td></tr>`;
        }
        return tags.map(t => {
            const pnlClass = this.getPnlClass(t.net_pnl);
            return `
                <tr>
                    <td><strong>${t.tag}</strong></td>
                    <td class="mono">${t.trades_count}</td>
                    <td class="mono">${t.win_rate}%</td>
                    <td class="mono ${pnlClass}" style="font-weight: 700;">${State.formatCurrency(t.net_pnl)}</td>
                </tr>
            `;
        }).join('');
    },

    buildDowTableRows(dow) {
        if (!dow || !dow.length) return '';
        return dow.map(d => {
            const pnlClass = this.getPnlClass(d.net_pnl);
            return `
                <tr>
                    <td><strong>${d.day_name}</strong></td>
                    <td class="mono">${d.trades_count}</td>
                    <td class="mono">${d.win_rate}%</td>
                    <td class="mono ${pnlClass}" style="font-weight: 700;">${State.formatCurrency(d.net_pnl)}</td>
                </tr>
            `;
        }).join('');
    },

    buildTodTableRows(tod) {
        if (!tod || !tod.length) return '';
        return tod.map(t => {
            const pnlClass = this.getPnlClass(t.net_pnl);
            return `
                <tr>
                    <td><strong class="mono">${t.label}</strong></td>
                    <td class="mono">${t.trades_count}</td>
                    <td class="mono">${t.win_rate}%</td>
                    <td class="mono ${pnlClass}" style="font-weight: 700;">${State.formatCurrency(t.net_pnl)}</td>
                </tr>
            `;
        }).join('');
    },

    buildDurationTableRows(durations) {
        if (!durations || !durations.length) {
            return `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No duration records</td></tr>`;
        }
        return durations.map(d => {
            const pnlClass = this.getPnlClass(d.net_pnl);
            return `
                <tr>
                    <td><strong>${d.duration}</strong></td>
                    <td class="mono">${d.trades_count}</td>
                    <td class="mono">${d.win_rate}%</td>
                    <td class="mono ${pnlClass}" style="font-weight: 700;">${State.formatCurrency(d.net_pnl)}</td>
                </tr>
            `;
        }).join('');
    },

    buildOrderTypeTableRows(orderTypes) {
        if (!orderTypes || !orderTypes.length) {
            return `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No order type records</td></tr>`;
        }
        return orderTypes.map(ot => {
            const pnlClass = this.getPnlClass(ot.net_pnl);
            return `
                <tr>
                    <td><strong>${ot.order_type}</strong></td>
                    <td class="mono">${ot.trades_count}</td>
                    <td class="mono">${ot.win_rate}%</td>
                    <td class="mono ${pnlClass}" style="font-weight: 700;">${State.formatCurrency(ot.net_pnl)}</td>
                </tr>
            `;
        }).join('');
    },

    buildCategoryTableRows(categories) {
        if (!categories || !categories.length) {
            return `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No categories</td></tr>`;
        }
        return categories.map(c => {
            const pnlClass = this.getPnlClass(c.net_pnl);
            return `
                <tr>
                    <td><strong>${c.category}</strong></td>
                    <td class="mono">${c.trades_count}</td>
                    <td class="mono">${c.win_rate}%</td>
                    <td class="mono ${pnlClass}" style="font-weight: 700;">${State.formatCurrency(c.net_pnl)}</td>
                </tr>
            `;
        }).join('');
    },

    buildSideTableRows(sides) {
        if (!sides || !sides.length) {
            return `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No trades</td></tr>`;
        }
        return sides.map(s => {
            const isBuy = s.side === 'BUY';
            const pnlClass = this.getPnlClass(s.net_pnl);
            return `
                <tr>
                    <td><span class="${isBuy ? 'badge-pill-profit' : 'badge-pill-loss'}">${isBuy ? 'LONG (BUY)' : 'SHORT (SELL)'}</span></td>
                    <td class="mono">${s.trades_count}</td>
                    <td class="mono">${s.win_rate}%</td>
                    <td class="mono ${pnlClass}" style="font-weight: 700;">${State.formatCurrency(s.net_pnl)}</td>
                </tr>
            `;
        }).join('');
    }
};

// Global theme change listener for instantaneous charts update
window.addEventListener('themeChanged', () => {
    if (typeof StatsPage !== 'undefined' && StatsPage.reRenderCharts) {
        StatsPage.reRenderCharts();
    }
});

window.StatsPage = StatsPage;
