/**
 * Detailed Statistics Page Controller
 */
const StatsPage = {
    async load() {
        const container = document.getElementById('view-stats');
        if (!container) return;

        container.innerHTML = `<div style="text-align:center; padding: 60px; color: var(--text-muted);">${STRINGS.common.loading}</div>`;

        try {
            const data = await API.fetchDetailedStats();
            this.render(data, container);
        } catch (err) {
            console.error("Error loading detailed stats:", err);
            container.innerHTML = `<div style="color: var(--color-loss); padding: 40px;">${STRINGS.common.errorLoading}</div>`;
        }
    },

    render(data, container) {
        const ov = data.overview || {};
        const symbols = data.symbols || [];
        const categories = data.categories || [];
        const sides = data.sides || [];
        const dow = data.day_of_week || [];

        // Update global top banner as well
        if (ov) StatsController.renderOverview(ov);

        const winLossRatio = ov.avg_loss > 0 ? (ov.avg_win / ov.avg_loss).toFixed(2) : '--';

        // 1. Executive Summary Cards
        const kpisHtml = `
            <div class="stats-kpi-grid">
                <div class="stat-card">
                    <span class="stat-card-label">${STRINGS.kpi.netPnl}</span>
                    <span class="stat-card-value mono ${ov.net_pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">${State.formatCurrency(ov.net_pnl)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card-label">${STRINGS.kpi.winRate}</span>
                    <span class="stat-card-value mono">${ov.win_rate.toFixed(1)}%</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card-label">${STRINGS.kpi.operations}</span>
                    <span class="stat-card-value mono">${State.formatNumber(ov.total_trades)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card-label">${STRINGS.kpi.profitFactor}</span>
                    <span class="stat-card-value mono">${ov.profit_factor.toFixed(2)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card-label">${STRINGS.kpi.expectancy}</span>
                    <span class="stat-card-value mono ${ov.expectancy >= 0 ? 'pnl-positive' : 'pnl-negative'}">${State.formatCurrency(ov.expectancy)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card-label">${STRINGS.statsPage.grossProfit}</span>
                    <span class="stat-card-value mono pnl-positive">${State.formatCurrency(ov.gross_profit)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card-label">${STRINGS.statsPage.grossLoss}</span>
                    <span class="stat-card-value mono pnl-negative">${State.formatCurrency(-ov.gross_loss)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card-label">${STRINGS.statsPage.totalCommissions}</span>
                    <span class="stat-card-value mono">${State.currency}${ov.total_commissions.toFixed(2)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card-label">${STRINGS.statsPage.avgWin}</span>
                    <span class="stat-card-value mono pnl-positive">${State.formatCurrency(ov.avg_win)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card-label">${STRINGS.statsPage.avgLoss}</span>
                    <span class="stat-card-value mono pnl-negative">${State.formatCurrency(-ov.avg_loss)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card-label">${STRINGS.statsPage.winLossRatio}</span>
                    <span class="stat-card-value mono">${winLossRatio}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card-label">${STRINGS.statsPage.largestWin}</span>
                    <span class="stat-card-value mono pnl-positive">${State.formatCurrency(ov.largest_win)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card-label">${STRINGS.statsPage.largestLoss}</span>
                    <span class="stat-card-value mono pnl-negative">${State.formatCurrency(ov.largest_loss)}</span>
                </div>
            </div>
        `;


        // 2. Symbols Table
        const symbolRows = symbols.map(s => {
            const pnlClass = s.net_pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
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

        // 3. Asset Categories Table
        const categoryRows = categories.map(c => {
            const pnlClass = c.net_pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
            return `
                <tr>
                    <td><strong>${c.category}</strong></td>
                    <td class="mono">${c.trades_count}</td>
                    <td class="mono">${c.win_rate}%</td>
                    <td class="mono ${pnlClass}" style="font-weight: 700;">${State.formatCurrency(c.net_pnl)}</td>
                </tr>
            `;
        }).join('');

        // 4. Long vs Short Table
        const sideRows = sides.map(s => {
            const isBuy = s.side === 'BUY';
            const pnlClass = s.net_pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
            return `
                <tr>
                    <td><span class="${isBuy ? 'badge-profit' : 'badge-loss'}">${isBuy ? 'LONG (BUY)' : 'SHORT (SELL)'}</span></td>
                    <td class="mono">${s.trades_count}</td>
                    <td class="mono">${s.win_rate}%</td>
                    <td class="mono ${pnlClass}" style="font-weight: 700;">${State.formatCurrency(s.net_pnl)}</td>
                </tr>
            `;
        }).join('');

        // 5. Day of Week Table
        const dowRows = dow.map(d => {
            const pnlClass = d.net_pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
            return `
                <tr>
                    <td><strong>${d.day_name}</strong></td>
                    <td class="mono">${d.trades_count}</td>
                    <td class="mono">${d.win_rate}%</td>
                    <td class="mono ${pnlClass}" style="font-weight: 700;">${State.formatCurrency(d.net_pnl)}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <div class="stats-container">
                ${kpisHtml}

                <div class="stats-tables-grid">
                    <!-- Left: Symbol Breakdown -->
                    <div class="stats-panel">
                        <div class="section-header">
                            <h3 class="section-title">${STRINGS.statsPage.symbolTableTitle}</h3>
                        </div>
                        <div class="stats-table-wrapper">
                            <table class="institutional-table">
                                <thead>
                                    <tr>
                                        <th>${STRINGS.statsPage.colSymbol}</th>
                                        <th>${STRINGS.statsPage.colCategory}</th>
                                        <th>${STRINGS.statsPage.colTrades}</th>
                                        <th>${STRINGS.statsPage.colWinRate}</th>
                                        <th>${STRINGS.statsPage.colCommissions}</th>
                                        <th>${STRINGS.statsPage.colNetPnl}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${symbolRows || '<tr><td colspan="6" style="text-align:center;">No data</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Right: Allocation & Day of Week -->
                    <div style="display: flex; flex-direction: column; gap: 24px;">
                        <!-- Category Allocation -->
                        <div class="stats-panel">
                            <div class="section-header">
                                <h3 class="section-title">${STRINGS.statsPage.categoryTableTitle}</h3>
                            </div>
                            <div class="stats-table-wrapper">
                                <table class="institutional-table">
                                    <thead>
                                        <tr>
                                            <th>${STRINGS.statsPage.colCategory}</th>
                                            <th>${STRINGS.statsPage.colTrades}</th>
                                            <th>${STRINGS.statsPage.colWinRate}</th>
                                            <th>${STRINGS.statsPage.colNetPnl}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${categoryRows}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Side Breakdown -->
                        <div class="stats-panel">
                            <div class="section-header">
                                <h3 class="section-title">${STRINGS.statsPage.sideTableTitle}</h3>
                            </div>
                            <div class="stats-table-wrapper">
                                <table class="institutional-table">
                                    <thead>
                                        <tr>
                                            <th>${STRINGS.statsPage.colSide}</th>
                                            <th>${STRINGS.statsPage.colTrades}</th>
                                            <th>${STRINGS.statsPage.colWinRate}</th>
                                            <th>${STRINGS.statsPage.colNetPnl}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${sideRows}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Day of Week -->
                        <div class="stats-panel">
                            <div class="section-header">
                                <h3 class="section-title">${STRINGS.statsPage.dowTableTitle}</h3>
                            </div>
                            <div class="stats-table-wrapper">
                                <table class="institutional-table">
                                    <thead>
                                        <tr>
                                            <th>${STRINGS.statsPage.colDay}</th>
                                            <th>${STRINGS.statsPage.colTrades}</th>
                                            <th>${STRINGS.statsPage.colWinRate}</th>
                                            <th>${STRINGS.statsPage.colNetPnl}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${dowRows}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
};

window.StatsPage = StatsPage;
