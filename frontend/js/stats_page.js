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
    tableSort: {
        symbol: { col: 'net_pnl', dir: 'desc' },
        tag: { col: 'net_pnl', dir: 'desc' },
        dow: { col: 'net_pnl', dir: 'desc' },
        tod: { col: 'net_pnl', dir: 'desc' },
        duration: { col: 'net_pnl', dir: 'desc' },
        order_type: { col: 'net_pnl', dir: 'desc' },
        category: { col: 'net_pnl', dir: 'desc' },
        side: { col: 'net_pnl', dir: 'desc' }
    },
    equityCurveMetrics: {
        cum_pnl: true,
        daily_pnl: true
    },
    charts: {},

    loadSettings() {
        if (typeof SettingsManager !== 'undefined') {
            this.dateRange = String(SettingsManager.get('stats_date_range', this.dateRange));
            this.timeframe = String(SettingsManager.get('stats_timeframe', this.timeframe));
            this.rollingWindow = String(SettingsManager.get('stats_rolling_window', this.rollingWindow));
            this.activeMetrics = Object.assign({}, this.activeMetrics, SettingsManager.get('stats_active_metrics', null));
            this.viewModes = Object.assign({}, this.viewModes, SettingsManager.get('stats_view_modes', null));
            this.tableSort = Object.assign({}, this.tableSort, SettingsManager.get('stats_table_sort', null));
            this.equityCurveMetrics = Object.assign({}, this.equityCurveMetrics, SettingsManager.get('stats_equity_curve_metrics', null));
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

    renderInfoIcon(tooltipText) {
        if (!tooltipText) return '';
        return `<span class="stat-info-icon" data-tooltip="${tooltipText}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </span>`;
    },

    getSortThClass(tableTarget, col) {
        const config = this.tableSort[tableTarget];
        return (config && config.col === col) ? 'active-sort' : '';
    },

    getSortIndicator(tableTarget, col) {
        const config = this.tableSort[tableTarget];
        if (!config || config.col !== col) {
            return '<span class="sort-indicator">↕</span>';
        }
        return config.dir === 'asc'
            ? '<span class="sort-indicator active">▲</span>'
            : '<span class="sort-indicator active">▼</span>';
    },

    sortData(tableTarget, dataList) {
        if (!dataList || !dataList.length) return [];
        const config = this.tableSort[tableTarget] || { col: 'net_pnl', dir: 'desc' };
        const { col, dir } = config;
        const sorted = [...dataList];
        sorted.sort((a, b) => {
            let valA = a[col];
            let valB = b[col];
            if (typeof valA === 'string' || typeof valB === 'string') {
                valA = String(valA ?? '').toLowerCase();
                valB = String(valB ?? '').toLowerCase();
                return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            valA = Number(valA) || 0;
            valB = Number(valB) || 0;
            return dir === 'asc' ? valA - valB : valB - valA;
        });
        return sorted;
    },

    updateTable(tableTarget) {
        if (!this.data) return;
        const dataMap = {
            symbol: this.data.symbols,
            tag: this.data.tags,
            dow: this.data.day_of_week,
            tod: this.data.time_of_day,
            duration: this.data.holding_durations,
            order_type: this.data.order_types,
            category: this.data.categories,
            side: this.data.sides
        };
        const builderMap = {
            symbol: (items) => this.buildSymbolTableRows(items),
            tag: (items) => this.buildTagTableRows(items),
            dow: (items) => this.buildDowTableRows(items),
            tod: (items) => this.buildTodTableRows(items),
            duration: (items) => this.buildDurationTableRows(items),
            order_type: (items) => this.buildOrderTypeTableRows(items),
            category: (items) => this.buildCategoryTableRows(items),
            side: (items) => this.buildSideTableRows(items)
        };

        const tbody = document.getElementById(`tbody-table-${tableTarget}`);
        if (tbody && dataMap[tableTarget] && builderMap[tableTarget]) {
            const sorted = this.sortData(tableTarget, dataMap[tableTarget]);
            tbody.innerHTML = builderMap[tableTarget](sorted);
        }

        // Update header sort indicators
        document.querySelectorAll(`.sortable-th[data-sort-table="${tableTarget}"]`).forEach(th => {
            const col = th.getAttribute('data-sort-col');
            const isCurrent = this.tableSort[tableTarget]?.col === col;
            th.classList.toggle('active-sort', isCurrent);
            const ind = th.querySelector('.sort-indicator');
            if (ind) {
                ind.textContent = isCurrent ? (this.tableSort[tableTarget].dir === 'asc' ? '▲' : '▼') : '↕';
                ind.classList.toggle('active', isCurrent);
            }
        });
    },

    isAllMetricsActive() {
        return Object.values(this.activeMetrics).every(Boolean);
    },

    toggleAllMetrics() {
        const allActive = this.isAllMetricsActive();
        const targetState = !allActive;
        Object.keys(this.activeMetrics).forEach(k => {
            this.activeMetrics[k] = targetState;
        });

        const metricIdMap = {
            'win_rate': 'm-win-rate',
            'profit_factor': 'm-pf',
            'avg_win': 'm-avg-win',
            'avg_loss': 'm-avg-loss',
            'expectancy': 'm-exp',
            'avg_trade_pnl': 'm-avg-pnl',
            'cumulative_pnl': 'm-cum-pnl'
        };

        Object.entries(metricIdMap).forEach(([k, id]) => {
            const el = document.getElementById(id);
            if (el) el.checked = targetState;
        });

        const btn = document.getElementById('btn-toggle-all-metrics');
        const sp = STRINGS.statsPage;
        if (btn) {
            btn.textContent = targetState ? (sp.deselectAllMetrics || 'Deselect All') : (sp.selectAllMetrics || 'Select All');
        }

        if (typeof SettingsManager !== 'undefined') {
            SettingsManager.set('stats_active_metrics', this.activeMetrics);
        }
        this.renderMetricEvolutionChart();
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
                    <div class="stat-card is-clickable" data-scroll-sec="sec-equity-curve">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${STRINGS.kpi.netPnl}</span>
                            ${this.renderInfoIcon(sp.tipNetPnl)}
                        </div>
                        <span class="stat-card-value mono ${this.getPnlClass(ov.net_pnl)}">
                            ${State.formatCurrency(ov.net_pnl || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${sp.grossLabel} ${State.formatCurrency(ov.gross_pnl || 0)} · -${State.currency}${(ov.total_commissions || 0).toFixed(2)} ${sp.feesLabel}
                        </span>
                    </div>

                    <!-- 2. Win Rate -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-rolling-winrate">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${STRINGS.kpi.winRate}</span>
                            ${this.renderInfoIcon(sp.tipWinRate)}
                        </div>
                        <span class="stat-card-value mono ${this.getWinRateClass(ov.win_rate, ov.total_trades)}">
                            ${(ov.win_rate || 0).toFixed(2)}%
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${(ov.gross_win_rate || 0).toFixed(1)}% ${sp.beforeCosts} · ${ov.winning_trades_price || 0}W / ${ov.losing_trades_price || 0}L ${sp.onPrice}
                        </span>
                    </div>

                    <!-- 3. Profit Factor -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-metric-evolution" data-scroll-metric="pf">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${STRINGS.kpi.profitFactor}</span>
                            ${this.renderInfoIcon(sp.tipProfitFactor)}
                        </div>
                        <span class="stat-card-value mono ${this.getRatioClass(ov.profit_factor, ov.total_trades)}">
                            ${(ov.profit_factor || 0).toFixed(2)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${State.formatCurrency(ov.gross_profit || 0)} / ${State.formatCurrency(-(ov.gross_loss || 0))}
                        </span>
                    </div>

                    <!-- 4. Expectancy -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-metric-evolution" data-scroll-metric="exp">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${STRINGS.kpi.expectancy}</span>
                            ${this.renderInfoIcon(sp.tipExpectancy)}
                        </div>
                        <span class="stat-card-value mono ${this.getPnlClass(ov.expectancy)}">
                            ${State.formatCurrency(ov.expectancy || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            Expected value per trade
                        </span>
                    </div>

                    <!-- 5. Total Trades -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-pnl-symbol">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.totalTrades}</span>
                            ${this.renderInfoIcon(sp.tipTotalTrades)}
                        </div>
                        <span class="stat-card-value mono pnl-neutral">
                            ${State.formatNumber(ov.total_trades || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.winning_trades || 0}W · ${ov.losing_trades || 0}L · ${ov.breakeven_trades || 0}BE
                        </span>
                    </div>

                    <!-- 6. Avg Win -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-metric-evolution" data-scroll-metric="avg-win">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.avgWin}</span>
                            ${this.renderInfoIcon(sp.tipAvgWin)}
                        </div>
                        <span class="stat-card-value mono ${ov.avg_win > 0 ? 'pnl-positive' : 'pnl-neutral'}">
                            ${State.formatCurrency(ov.avg_win || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.winning_trades || 0} winning trades
                        </span>
                    </div>

                    <!-- 7. Avg Loss -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-metric-evolution" data-scroll-metric="avg-loss">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.avgLoss}</span>
                            ${this.renderInfoIcon(sp.tipAvgLoss)}
                        </div>
                        <span class="stat-card-value mono ${ov.avg_loss > 0 ? 'pnl-negative' : 'pnl-neutral'}">
                            ${State.formatCurrency(-(ov.avg_loss || 0))}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.losing_trades || 0} losing trades
                        </span>
                    </div>

                    <!-- 8. Largest Gain -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-pnl-symbol">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.largestWin}</span>
                            ${this.renderInfoIcon(sp.tipLargestWin)}
                        </div>
                        <span class="stat-card-value mono ${ov.largest_win > 0 ? 'pnl-positive' : 'pnl-neutral'}">
                            ${State.formatCurrency(ov.largest_win || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.largest_win_symbol ? `${ov.largest_win_symbol} · ` : ''}Single peak return
                        </span>
                    </div>

                    <!-- 9. Largest Loss -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-risk-drawdown">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.largestLoss}</span>
                            ${this.renderInfoIcon(sp.tipLargestLoss)}
                        </div>
                        <span class="stat-card-value mono ${ov.largest_loss < 0 ? 'pnl-negative' : 'pnl-neutral'}">
                            ${State.formatCurrency(ov.largest_loss || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.largest_loss_symbol ? `${ov.largest_loss_symbol} · ` : ''}Single worst loss
                        </span>
                    </div>

                    <!-- 10. Adj. Win/Loss Ratio -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-metric-evolution" data-scroll-metric="win-rate">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.adjWinLossRatio}</span>
                            ${this.renderInfoIcon(sp.tipAdjWinLossRatio)}
                        </div>
                        <span class="stat-card-value mono ${this.getRatioClass(ov.adj_win_loss_ratio, ov.total_trades)}">
                            ${(ov.adj_win_loss_ratio || 0).toFixed(2)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            Payoff ${(ov.avg_loss > 0 ? (ov.avg_win / ov.avg_loss).toFixed(2) : '--')}
                        </span>
                    </div>

                    <!-- 11. Sharpe Ratio -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-risk-drawdown">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.sharpeRatio}</span>
                            ${this.renderInfoIcon(sp.tipSharpeRatio)}
                        </div>
                        <span class="stat-card-value mono ${this.getPnlClass(ov.sharpe_per_trade)}">
                            ${(ov.sharpe_per_trade || 0).toFixed(2)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            Statistical efficiency
                        </span>
                    </div>

                    <!-- 12. Avg Win Hold -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-pnl-duration">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.avgWinHold}</span>
                            ${this.renderInfoIcon(sp.tipAvgWinHold)}
                        </div>
                        <span class="stat-card-value mono ${this.getHoldClass(ov.avg_win_hold, 'win')}">
                            ${ov.avg_win_hold || '--'}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.winning_trades || 0} wins duration
                        </span>
                    </div>

                    <!-- 13. Avg Loss Hold -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-pnl-duration">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.avgLossHold}</span>
                            ${this.renderInfoIcon(sp.tipAvgLossHold)}
                        </div>
                        <span class="stat-card-value mono ${this.getHoldClass(ov.avg_loss_hold, 'loss')}">
                            ${ov.avg_loss_hold || '--'}
                        </span>
                        <span class="stat-card-subtitle mono">
                            ${ov.losing_trades || 0} losses duration
                        </span>
                    </div>

                    <!-- 14. Gross Realized P&L -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-equity-curve">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.grossPnl}</span>
                            ${this.renderInfoIcon(sp.tipGrossPnl)}
                        </div>
                        <span class="stat-card-value mono ${this.getPnlClass(ov.gross_pnl)}">
                            ${State.formatCurrency(ov.gross_pnl || 0)}
                        </span>
                        <span class="stat-card-subtitle mono">
                            Total trading returns
                        </span>
                    </div>

                    <!-- 15. Total Commissions & Fees -->
                    <div class="stat-card is-clickable" data-scroll-sec="sec-pnl-symbol">
                        <div class="stat-card-header">
                            <span class="stat-card-label">${sp.totalCommissions}</span>
                            ${this.renderInfoIcon(sp.tipCommissions)}
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
                <div class="stats-section-box" id="sec-capital-overview">
                    <div class="stats-section-header">
                        <div class="stats-section-title-wrap">
                            <span>${sp.capitalStripTitle || 'Portfolio Capital & Equity Overview'}</span>
                        </div>
                        <button type="button" class="btn-pill" id="btn-stats-manage-cash" style="padding: 4px 12px; font-size: 11px;">
                            ${sp.manageCashBtn || 'Manage Capital & Cash Transfers'}
                        </button>
                    </div>
                    <div class="cash-summary-grid">
                        <div class="cash-card is-clickable" data-scroll-sec="sec-equity-curve">
                            <span class="cash-card-label">${STRINGS.cash?.accountEquity || 'ACCOUNT EQUITY (NAV)'}</span>
                            <span class="cash-card-value mono ${this.getPnlClass(ov.account_balance)}">
                                ${State.formatCurrency(ov.account_balance || 0)}
                            </span>
                            <span class="cash-card-sub">${STRINGS.cash?.accountEquitySub || 'Starting Capital + Net Flow + Realized P&L'}</span>
                        </div>
                        <div class="cash-card is-clickable" data-cash-modal="true">
                            <span class="cash-card-label">${STRINGS.cash?.startingCapital || 'STARTING CAPITAL'}</span>
                            <span class="cash-card-value mono pnl-neutral">
                                ${State.formatCurrency(ov.starting_capital || 0)}
                            </span>
                            <span class="cash-card-sub">${STRINGS.cash?.startingCapitalStatsSub || 'Configured baseline capital'}</span>
                        </div>
                        <div class="cash-card is-clickable" data-cash-modal="true">
                            <span class="cash-card-label">${STRINGS.cash?.netTransfersStats || 'NET CASH TRANSFERS'}</span>
                            <span class="cash-card-value mono ${this.getPnlClass(ov.net_cash_flow)}">
                                ${State.formatCurrency(ov.net_cash_flow || 0)}
                            </span>
                            <span class="cash-card-sub">In: ${State.currency}${(ov.total_deposits || 0).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})} · Out: ${State.currency}${(ov.total_withdrawals || 0).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})}</span>
                        </div>
                        <div class="cash-card is-clickable" data-scroll-sec="sec-equity-curve">
                            <span class="cash-card-label">${STRINGS.cash?.roi || 'RETURN ON CAPITAL (% ROI)'}</span>
                            <span class="cash-card-value mono ${this.getPnlClass(ov.roi_pct)}">
                                ${(ov.roi_pct || 0) > 0 ? '+' : ''}${(ov.roi_pct || 0).toFixed(2)}%
                            </span>
                            <span class="cash-card-sub">${STRINGS.cash?.roiSub || 'Realized P&L / Capital Base'}</span>
                        </div>
                    </div>
                </div>

                <!-- 2. Rolling Win Rate Section -->
                <div class="stats-section-box" id="sec-rolling-winrate">
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
                <div class="stats-section-box" id="sec-metric-evolution">
                    <div class="stats-section-header">
                        <div class="stats-section-title-wrap">
                            <span>${sp.metricEvolutionTitle}</span>
                        </div>

                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <button type="button" class="btn-pill" id="btn-toggle-all-metrics" style="padding: 4px 10px; font-size: 11px;">
                                ${this.isAllMetricsActive() ? (sp.deselectAllMetrics || 'Deselect All') : (sp.selectAllMetrics || 'Select All')}
                            </button>

                            <div class="segmented-control" id="metric-evolution-timeframe">
                                <button class="segmented-btn ${this.timeframe === 'day' ? 'active' : ''}" data-tf="day">${sp.day}</button>
                                <button class="segmented-btn ${this.timeframe === 'week' ? 'active' : ''}" data-tf="week">${sp.week}</button>
                                <button class="segmented-btn ${this.timeframe === 'month' ? 'active' : ''}" data-tf="month">${sp.month}</button>
                            </div>
                        </div>
                    </div>

                    <!-- Metric Selector Checkbox Toggles -->
                    <div class="metric-toggles-bar">
                        <label class="metric-toggle-label" style="--metric-color: #10b981;">
                            <input type="checkbox" id="m-win-rate" ${this.activeMetrics.win_rate ? 'checked' : ''}>
                            <span>${sp.winRateMetric}</span>
                        </label>

                        <label class="metric-toggle-label" style="--metric-color: #8b5cf6;">
                            <input type="checkbox" id="m-pf" ${this.activeMetrics.profit_factor ? 'checked' : ''}>
                            <span>${sp.profitFactorMetric}</span>
                        </label>

                        <label class="metric-toggle-label" style="--metric-color: #3b82f6;">
                            <input type="checkbox" id="m-avg-win" ${this.activeMetrics.avg_win ? 'checked' : ''}>
                            <span>${sp.avgWinMetric}</span>
                        </label>

                        <label class="metric-toggle-label" style="--metric-color: #ef4444;">
                            <input type="checkbox" id="m-avg-loss" ${this.activeMetrics.avg_loss ? 'checked' : ''}>
                            <span>${sp.avgLossMetric}</span>
                        </label>

                        <label class="metric-toggle-label" style="--metric-color: #f59e0b;">
                            <input type="checkbox" id="m-exp" ${this.activeMetrics.expectancy ? 'checked' : ''}>
                            <span>${sp.expectancyMetric}</span>
                        </label>

                        <label class="metric-toggle-label" style="--metric-color: #06b6d4;">
                            <input type="checkbox" id="m-avg-pnl" ${this.activeMetrics.avg_trade_pnl ? 'checked' : ''}>
                            <span>${sp.avgPnlTradeMetric}</span>
                        </label>

                        <label class="metric-toggle-label" style="--metric-color: #ec4899;">
                            <input type="checkbox" id="m-cum-pnl" ${this.activeMetrics.cumulative_pnl ? 'checked' : ''}>
                            <span>${sp.cumPnlMetric}</span>
                        </label>
                    </div>

                    <!-- Metric Evolution Canvas -->
                    <div class="chart-canvas-box tall">
                        <canvas id="chart-metric-evolution"></canvas>
                    </div>
                </div>

                <!-- 4. Equity Curve Section -->
                <div class="stats-section-box" id="sec-equity-curve">
                    <div class="stats-section-header">
                        <div class="stats-section-title-wrap">
                            <span>${sp.equityCurveTitle}</span>
                        </div>
                        <div class="metric-toggles-bar">
                            <label class="metric-toggle-label" style="--metric-color: #38bdf8;">
                                <input type="checkbox" id="eq-cum-pnl" ${this.equityCurveMetrics.cum_pnl ? 'checked' : ''}>
                                <span>${sp.cumPnlMetric}</span>
                            </label>

                            <label class="metric-toggle-label" style="--metric-color: #22c55e;">
                                <input type="checkbox" id="eq-daily-pnl" ${this.equityCurveMetrics.daily_pnl ? 'checked' : ''}>
                                <span>${sp.dailyPnlMetric}</span>
                            </label>
                        </div>
                    </div>
                    <div class="chart-canvas-box tall">
                        <canvas id="chart-equity-curve"></canvas>
                    </div>
                </div>

                <!-- 5. Risk & Drawdown Section -->
                <div class="stats-section-box" id="sec-risk-drawdown">
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
                    <div class="stats-section-box" id="sec-pnl-symbol">
                        <div class="stats-section-header">
                            <div class="stats-section-title-wrap">
                                <span>${sp.pnlBySymbolTitle}</span>
                            </div>
                            <div class="segmented-control">
                                <button class="segmented-btn ${this.viewModes.symbol === 'chart' ? 'active' : ''}" data-view-target="symbol" data-view-val="chart">${sp.chartView}</button>
                                <button class="segmented-btn ${this.viewModes.symbol === 'table' ? 'active' : ''}" data-view-target="symbol" data-view-val="table">${sp.tableView}</button>
                            </div>
                        </div>
                        <div id="wrap-symbol-chart" class="${this.viewModes.symbol === 'chart' ? '' : 'hidden'}">
                            <div class="chart-canvas-box">
                                <canvas id="chart-symbol"></canvas>
                            </div>
                            <div class="chart-footer-note">
                                <span>${sp.symbolChartNotice || 'Showing Top 10 Best & Top 10 Worst symbols'}</span>
                                <span class="chart-footer-link" data-switch-to-table="symbol">${sp.symbolChartNoticeLink || 'Switch to Table to view all'}</span>
                            </div>
                        </div>
                        <div id="wrap-symbol-table" class="stats-table-wrapper ${this.viewModes.symbol === 'table' ? '' : 'hidden'}">
                            <table class="institutional-table">
                                <thead>
                                    <tr>
                                        <th class="sortable-th ${this.getSortThClass('symbol', 'symbol')}" data-sort-table="symbol" data-sort-col="symbol">${sp.colSymbol} ${this.getSortIndicator('symbol', 'symbol')}</th>
                                        <th class="sortable-th ${this.getSortThClass('symbol', 'category')}" data-sort-table="symbol" data-sort-col="category">${sp.colCategory} ${this.getSortIndicator('symbol', 'category')}</th>
                                        <th class="sortable-th ${this.getSortThClass('symbol', 'trades_count')}" data-sort-table="symbol" data-sort-col="trades_count">${sp.colTrades} ${this.getSortIndicator('symbol', 'trades_count')}</th>
                                        <th class="sortable-th ${this.getSortThClass('symbol', 'win_rate')}" data-sort-table="symbol" data-sort-col="win_rate">${sp.colWinRate} ${this.getSortIndicator('symbol', 'win_rate')}</th>
                                        <th class="sortable-th ${this.getSortThClass('symbol', 'commissions')}" data-sort-table="symbol" data-sort-col="commissions">${sp.colCommissions} ${this.getSortIndicator('symbol', 'commissions')}</th>
                                        <th class="sortable-th ${this.getSortThClass('symbol', 'net_pnl')}" data-sort-table="symbol" data-sort-col="net_pnl">${sp.colNetPnl} ${this.getSortIndicator('symbol', 'net_pnl')}</th>
                                    </tr>
                                </thead>
                                <tbody id="tbody-table-symbol">
                                    ${this.buildSymbolTableRows(this.sortData('symbol', symbols))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- P&L by Tag -->
                    <div class="stats-section-box" id="sec-pnl-tag">
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
                                        <th class="sortable-th ${this.getSortThClass('tag', 'tag')}" data-sort-table="tag" data-sort-col="tag">${sp.colTag} ${this.getSortIndicator('tag', 'tag')}</th>
                                        <th class="sortable-th ${this.getSortThClass('tag', 'trades_count')}" data-sort-table="tag" data-sort-col="trades_count">${sp.colTrades} ${this.getSortIndicator('tag', 'trades_count')}</th>
                                        <th class="sortable-th ${this.getSortThClass('tag', 'win_rate')}" data-sort-table="tag" data-sort-col="win_rate">${sp.colWinRate} ${this.getSortIndicator('tag', 'win_rate')}</th>
                                        <th class="sortable-th ${this.getSortThClass('tag', 'net_pnl')}" data-sort-table="tag" data-sort-col="net_pnl">${sp.colNetPnl} ${this.getSortIndicator('tag', 'net_pnl')}</th>
                                    </tr>
                                </thead>
                                <tbody id="tbody-table-tag">
                                    ${this.buildTagTableRows(this.sortData('tag', tags))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Performance by Day of Week -->
                    <div class="stats-section-box" id="sec-pnl-dow">
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
                                        <th class="sortable-th ${this.getSortThClass('dow', 'day_name')}" data-sort-table="dow" data-sort-col="day_name">${sp.colDay} ${this.getSortIndicator('dow', 'day_name')}</th>
                                        <th class="sortable-th ${this.getSortThClass('dow', 'trades_count')}" data-sort-table="dow" data-sort-col="trades_count">${sp.colTrades} ${this.getSortIndicator('dow', 'trades_count')}</th>
                                        <th class="sortable-th ${this.getSortThClass('dow', 'win_rate')}" data-sort-table="dow" data-sort-col="win_rate">${sp.colWinRate} ${this.getSortIndicator('dow', 'win_rate')}</th>
                                        <th class="sortable-th ${this.getSortThClass('dow', 'net_pnl')}" data-sort-table="dow" data-sort-col="net_pnl">${sp.colNetPnl} ${this.getSortIndicator('dow', 'net_pnl')}</th>
                                    </tr>
                                </thead>
                                <tbody id="tbody-table-dow">
                                    ${this.buildDowTableRows(this.sortData('dow', dow))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Performance by Time of Day -->
                    <div class="stats-section-box" id="sec-pnl-tod">
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
                                        <th class="sortable-th ${this.getSortThClass('tod', 'label')}" data-sort-table="tod" data-sort-col="label">${sp.colHour} ${this.getSortIndicator('tod', 'label')}</th>
                                        <th class="sortable-th ${this.getSortThClass('tod', 'trades_count')}" data-sort-table="tod" data-sort-col="trades_count">${sp.colTrades} ${this.getSortIndicator('tod', 'trades_count')}</th>
                                        <th class="sortable-th ${this.getSortThClass('tod', 'win_rate')}" data-sort-table="tod" data-sort-col="win_rate">${sp.colWinRate} ${this.getSortIndicator('tod', 'win_rate')}</th>
                                        <th class="sortable-th ${this.getSortThClass('tod', 'net_pnl')}" data-sort-table="tod" data-sort-col="net_pnl">${sp.colNetPnl} ${this.getSortIndicator('tod', 'net_pnl')}</th>
                                    </tr>
                                </thead>
                                <tbody id="tbody-table-tod">
                                    ${this.buildTodTableRows(this.sortData('tod', tod))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- P&L by Holding Duration -->
                    <div class="stats-section-box" id="sec-pnl-duration">
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
                                        <th class="sortable-th ${this.getSortThClass('duration', 'duration')}" data-sort-table="duration" data-sort-col="duration">${sp.colDuration} ${this.getSortIndicator('duration', 'duration')}</th>
                                        <th class="sortable-th ${this.getSortThClass('duration', 'trades_count')}" data-sort-table="duration" data-sort-col="trades_count">${sp.colTrades} ${this.getSortIndicator('duration', 'trades_count')}</th>
                                        <th class="sortable-th ${this.getSortThClass('duration', 'win_rate')}" data-sort-table="duration" data-sort-col="win_rate">${sp.colWinRate} ${this.getSortIndicator('duration', 'win_rate')}</th>
                                        <th class="sortable-th ${this.getSortThClass('duration', 'net_pnl')}" data-sort-table="duration" data-sort-col="net_pnl">${sp.colNetPnl} ${this.getSortIndicator('duration', 'net_pnl')}</th>
                                    </tr>
                                </thead>
                                <tbody id="tbody-table-duration">
                                    ${this.buildDurationTableRows(this.sortData('duration', durations))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- P&L by Order Type -->
                    <div class="stats-section-box" id="sec-pnl-ordertype">
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
                                        <th class="sortable-th ${this.getSortThClass('order_type', 'order_type')}" data-sort-table="order_type" data-sort-col="order_type">${sp.colOrderType} ${this.getSortIndicator('order_type', 'order_type')}</th>
                                        <th class="sortable-th ${this.getSortThClass('order_type', 'trades_count')}" data-sort-table="order_type" data-sort-col="trades_count">${sp.colTrades} ${this.getSortIndicator('order_type', 'trades_count')}</th>
                                        <th class="sortable-th ${this.getSortThClass('order_type', 'win_rate')}" data-sort-table="order_type" data-sort-col="win_rate">${sp.colWinRate} ${this.getSortIndicator('order_type', 'win_rate')}</th>
                                        <th class="sortable-th ${this.getSortThClass('order_type', 'net_pnl')}" data-sort-table="order_type" data-sort-col="net_pnl">${sp.colNetPnl} ${this.getSortIndicator('order_type', 'net_pnl')}</th>
                                    </tr>
                                </thead>
                                <tbody id="tbody-table-order_type">
                                    ${this.buildOrderTypeTableRows(this.sortData('order_type', orderTypes))}
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
                                        <th class="sortable-th ${this.getSortThClass('category', 'category')}" data-sort-table="category" data-sort-col="category">${sp.colCategory} ${this.getSortIndicator('category', 'category')}</th>
                                        <th class="sortable-th ${this.getSortThClass('category', 'trades_count')}" data-sort-table="category" data-sort-col="trades_count">${sp.colTrades} ${this.getSortIndicator('category', 'trades_count')}</th>
                                        <th class="sortable-th ${this.getSortThClass('category', 'win_rate')}" data-sort-table="category" data-sort-col="win_rate">${sp.colWinRate} ${this.getSortIndicator('category', 'win_rate')}</th>
                                        <th class="sortable-th ${this.getSortThClass('category', 'net_pnl')}" data-sort-table="category" data-sort-col="net_pnl">${sp.colNetPnl} ${this.getSortIndicator('category', 'net_pnl')}</th>
                                    </tr>
                                </thead>
                                <tbody id="tbody-table-category">
                                    ${this.buildCategoryTableRows(this.sortData('category', categories))}
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
                                        <th class="sortable-th ${this.getSortThClass('side', 'side')}" data-sort-table="side" data-sort-col="side">${sp.colSide} ${this.getSortIndicator('side', 'side')}</th>
                                        <th class="sortable-th ${this.getSortThClass('side', 'trades_count')}" data-sort-table="side" data-sort-col="trades_count">${sp.colTrades} ${this.getSortIndicator('side', 'trades_count')}</th>
                                        <th class="sortable-th ${this.getSortThClass('side', 'win_rate')}" data-sort-table="side" data-sort-col="win_rate">${sp.colWinRate} ${this.getSortIndicator('side', 'win_rate')}</th>
                                        <th class="sortable-th ${this.getSortThClass('side', 'net_pnl')}" data-sort-table="side" data-sort-col="net_pnl">${sp.colNetPnl} ${this.getSortIndicator('side', 'net_pnl')}</th>
                                    </tr>
                                </thead>
                                <tbody id="tbody-table-side">
                                    ${this.buildSideTableRows(this.sortData('side', sides))}
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

    scrollToSection(secId, metricId = null) {
        const el = document.getElementById(secId);
        if (!el) return;

        if (metricId) {
            const metricKeyMap = {
                'win-rate': 'win_rate',
                'pf': 'profit_factor',
                'avg-win': 'avg_win',
                'avg-loss': 'avg_loss',
                'exp': 'expectancy',
                'avg-pnl': 'avg_trade_pnl',
                'cum-pnl': 'cumulative_pnl'
            };
            const chk = document.getElementById(`m-${metricId}`);
            if (chk && !chk.checked) {
                chk.checked = true;
                const mappedKey = metricKeyMap[metricId] || metricId;
                this.activeMetrics[mappedKey] = true;
                if (typeof SettingsManager !== 'undefined') {
                    SettingsManager.set('stats_active_metrics', this.activeMetrics);
                }
                this.renderMetricEvolutionChart();
            }
        }

        const headerOffset = 76;
        const elementPosition = el.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({
            top: Math.max(0, offsetPosition),
            behavior: 'smooth'
        });
        el.classList.remove('section-highlight-pulse');
        void el.offsetWidth;
        el.classList.add('section-highlight-pulse');
        setTimeout(() => el.classList.remove('section-highlight-pulse'), 1400);
    },

    bindEvents() {
        // Clickable stat cards & cash cards smooth scrolling
        document.querySelectorAll('.stat-card.is-clickable, .cash-card.is-clickable').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.stat-info-icon')) {
                    return; // Hover/tap tooltip without navigating
                }
                const isCashModal = card.getAttribute('data-cash-modal');
                if (isCashModal) {
                    if (typeof CashModal !== 'undefined' && CashModal.open) {
                        CashModal.open();
                    }
                    return;
                }

                const secId = card.getAttribute('data-scroll-sec');
                const metricId = card.getAttribute('data-scroll-metric');
                if (secId) {
                    this.scrollToSection(secId, metricId);
                }
            });
        });

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
                    const btn = document.getElementById('btn-toggle-all-metrics');
                    const sp = STRINGS.statsPage;
                    if (btn) {
                        btn.textContent = this.isAllMetricsActive() ? (sp.deselectAllMetrics || 'Deselect All') : (sp.selectAllMetrics || 'Select All');
                    }
                    this.renderMetricEvolutionChart();
                });
            }
        });

        const btnToggleMetrics = document.getElementById('btn-toggle-all-metrics');
        if (btnToggleMetrics) {
            btnToggleMetrics.addEventListener('click', () => this.toggleAllMetrics());
        }

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

        // Clickable sortable table headers (Red to Green & Green to Red sorting)
        document.querySelectorAll('.sortable-th').forEach(th => {
            th.addEventListener('click', () => {
                const tableTarget = th.getAttribute('data-sort-table');
                const colTarget = th.getAttribute('data-sort-col');
                if (!tableTarget || !colTarget) return;

                if (!this.tableSort[tableTarget]) {
                    this.tableSort[tableTarget] = { col: colTarget, dir: 'desc' };
                } else if (this.tableSort[tableTarget].col === colTarget) {
                    this.tableSort[tableTarget].dir = this.tableSort[tableTarget].dir === 'desc' ? 'asc' : 'desc';
                } else {
                    this.tableSort[tableTarget].col = colTarget;
                    const textCols = ['symbol', 'tag', 'category', 'duration', 'order_type', 'day_name', 'label', 'side'];
                    this.tableSort[tableTarget].dir = textCols.includes(colTarget) ? 'asc' : 'desc';
                }

                if (typeof SettingsManager !== 'undefined') {
                    SettingsManager.set('stats_table_sort', this.tableSort);
                }

                this.updateTable(tableTarget);
            });
        });

        // Equity Curve metric toggles (Cumulative P&L / Daily P&L)
        ['eq-cum-pnl', 'eq-daily-pnl'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', (e) => {
                    if (id === 'eq-cum-pnl') this.equityCurveMetrics.cum_pnl = e.target.checked;
                    if (id === 'eq-daily-pnl') this.equityCurveMetrics.daily_pnl = e.target.checked;
                    if (typeof SettingsManager !== 'undefined') {
                        SettingsManager.set('stats_equity_curve_metrics', this.equityCurveMetrics);
                    }
                    this.renderEquityCurveChart();
                });
            }
        });

        // Clickable switch-to-table link in chart footer
        document.querySelectorAll('[data-switch-to-table]').forEach(el => {
            el.addEventListener('click', () => {
                const target = el.getAttribute('data-switch-to-table');
                const tableBtn = document.querySelector(`.segmented-btn[data-view-target="${target}"][data-view-val="table"]`);
                if (tableBtn) tableBtn.click();
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

        const datasets = [];

        if (this.equityCurveMetrics.cum_pnl) {
            datasets.push({
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
            });
        }

        if (this.equityCurveMetrics.daily_pnl) {
            datasets.push({
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
            });
        }

        if (!datasets.length) {
            datasets.push({
                type: 'line',
                label: STRINGS.statsPage.cumPnlMetric,
                data: labels.map(() => 0),
                borderColor: 'transparent',
                backgroundColor: 'transparent',
                yAxisID: 'y'
            });
        }

        this.charts.equityCurve = new Chart(canvas, {
            data: {
                labels: labels.length ? labels : ['--'],
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: false
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
                                    return ` ${label}: ${State.formatCurrency(val)} (${count} trades)`;
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
                        suggestedMin: 0,
                        suggestedMax: 0,
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

    // 5. P&L by Symbol (Horizontal Bar - Top 10 Best & Top 10 Worst)
    renderSymbolChart() {
        const canvas = document.getElementById('chart-symbol');
        if (!canvas) return;
        if (this.charts.symbol) this.charts.symbol.destroy();

        const theme = this.getThemeColors();
        const rawSymbols = [...(this.data.symbols || [])];

        // Sort descending: best (+) to worst (-)
        rawSymbols.sort((a, b) => b.net_pnl - a.net_pnl);

        let displayedSymbols = rawSymbols;
        if (rawSymbols.length > 20) {
            const best10 = rawSymbols.slice(0, 10);
            const worst10 = rawSymbols.slice(-10);
            displayedSymbols = [...best10, ...worst10];
        }

        if (canvas.parentElement) {
            canvas.parentElement.style.height = `${Math.max(280, displayedSymbols.length * 24)}px`;
        }

        const labels = displayedSymbols.map(s => s.symbol);
        const values = displayedSymbols.map(s => s.net_pnl);
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
                                const s = displayedSymbols[idx];
                                const wr = s ? s.win_rate : 0;
                                const cnt = s ? s.trades_count : 0;
                                return ` Net P&L: ${State.formatCurrency(context.parsed.x)} | WR: ${wr}% (${cnt} trades)`;
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
                            autoSkip: false,
                            color: theme.textMain,
                            font: { weight: '700', size: 11 }
                        }
                    }
                }
            }
        });
    },

    // 6. P&L by Tag (Horizontal Bar - Full List)
    renderTagChart() {
        const canvas = document.getElementById('chart-tag');
        if (!canvas) return;
        if (this.charts.tag) this.charts.tag.destroy();

        const theme = this.getThemeColors();
        const tags = [...(this.data.tags || [])];

        // Sort tags descending: best (+) to worst (-)
        tags.sort((a, b) => b.net_pnl - a.net_pnl);

        if (canvas.parentElement) {
            canvas.parentElement.style.height = `${Math.max(280, tags.length * 26)}px`;
        }

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
                                return ` Net P&L: ${State.formatCurrency(context.parsed.x)} | WR: ${wr}% (${cnt} trades)`;
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
                            autoSkip: false,
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
                                return ` Net P&L: ${State.formatCurrency(context.parsed.y)} (${d.trades_count} trades, ${d.win_rate}% WR)`;
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
                                return ` Net P&L: ${State.formatCurrency(context.parsed.y)} (${t.trades_count} trades, ${t.win_rate}% WR)`;
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
                                return ` Net P&L: ${State.formatCurrency(context.parsed.y)} (${d ? d.trades_count : 0} trades, ${d ? d.win_rate : 0}% WR)`;
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
                                return ` Net P&L: ${State.formatCurrency(context.parsed.y)} (${o ? o.trades_count : 0} trades, ${o ? o.win_rate : 0}% WR)`;
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
        const sp = STRINGS.statsPage || {};
        return sides.map(s => {
            const sideUpper = (s.side || '').toUpperCase();
            const isLong = sideUpper === 'LONG' || sideUpper === 'BUY';
            const pnlClass = this.getPnlClass(s.net_pnl);
            const label = isLong ? (sp.longSideLabel || 'LONG (Buyer)') : (sp.shortSideLabel || 'SHORT (Seller)');
            return `
                <tr>
                    <td><span class="${isLong ? 'badge-pill-profit' : 'badge-pill-loss'}">${label}</span></td>
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
