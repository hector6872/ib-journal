/**
 * Day Trades Modal Controller
 * Displays Round-Trip Trades (grouped fills) and Raw Executions
 * Follows the authentic Interactive Brokers (IBKR) design language.
 */
const DayModal = {
    backdrop: null,
    currentData: null,
    currentDate: null,
    activeView: 'grouped', // 'grouped' | 'executions'
    expandedTradeIds: new Set(),

    init() {
        this.backdrop = document.getElementById('day-modal-backdrop');
        const closeBtn = document.getElementById('modal-close-btn');
        const footerCloseBtn = document.getElementById('modal-footer-close-btn');

        if (closeBtn) closeBtn.addEventListener('click', () => this.close());
        if (footerCloseBtn) footerCloseBtn.addEventListener('click', () => this.close());
        if (this.backdrop) {
            this.backdrop.addEventListener('click', (e) => {
                if (e.target === this.backdrop) this.close();
            });
        }

        // Close on ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.backdrop && this.backdrop.classList.contains('open')) {
                this.close();
            }
        });
    },

    async open(dateStr) {
        if (!this.backdrop) this.init();

        this.currentDate = dateStr;
        this.activeView = 'grouped';
        this.expandedTradeIds.clear();

        const titleEl = document.getElementById('modal-date-title');
        const bodyEl = document.getElementById('modal-body-content');

        if (titleEl) titleEl.textContent = `${STRINGS.modal?.dayDetailsTitle || 'Trading details for'} ${dateStr}`;
        if (bodyEl) bodyEl.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-muted);">${STRINGS.common?.loading || 'Loading trades...'}</div>`;

        this.backdrop.classList.add('open');

        try {
            const data = await API.fetchDayTrades(dateStr);
            this.currentData = data;

            // By default expand all grouped trades if 4 or fewer, otherwise expand first
            const grouped = this.getGroupedTrades(data);
            if (grouped.length <= 4) {
                grouped.forEach((_, idx) => this.expandedTradeIds.add(idx));
            } else if (grouped.length > 0) {
                this.expandedTradeIds.add(0);
            }

            this.render();
        } catch (err) {
            console.error("Error loading day trades:", err);
            if (bodyEl) bodyEl.innerHTML = `<div style="color: var(--color-loss); padding: 24px; text-align: center;">${STRINGS.common?.errorLoading || 'Failed to load trade data.'}</div>`;
        }
    },

    close() {
        if (this.backdrop) this.backdrop.classList.remove('open');
    },

    setView(view) {
        if (this.activeView === view) return;
        this.activeView = view;
        this.render();
    },

    toggleTrade(idx) {
        if (this.expandedTradeIds.has(idx)) {
            this.expandedTradeIds.delete(idx);
        } else {
            this.expandedTradeIds.add(idx);
        }
        this.render();
    },

    expandAll() {
        const grouped = this.getGroupedTrades(this.currentData);
        grouped.forEach((_, idx) => this.expandedTradeIds.add(idx));
        this.render();
    },

    collapseAll() {
        this.expandedTradeIds.clear();
        this.render();
    },

    getGroupedTrades(data) {
        if (data && Array.isArray(data.grouped_trades) && data.grouped_trades.length > 0) {
            return data.grouped_trades;
        }
        // Fallback client-side grouping
        const rawTrades = (data && data.trades) ? data.trades : [];
        return this.clientGroupTrades(rawTrades);
    },

    clientGroupTrades(trades) {
        if (!trades || trades.length === 0) return [];
        const bySymbol = {};
        trades.forEach(t => {
            const sym = t.symbol || 'UNKNOWN';
            if (!bySymbol[sym]) bySymbol[sym] = [];
            bySymbol[sym].push(t);
        });

        const allGrouped = [];
        Object.entries(bySymbol).forEach(([symbol, fills]) => {
            let pos = 0.0;
            let current = null;
            let tradeIdx = 1;

            fills.forEach(fill => {
                const qty = parseFloat(fill.quantity || 0);
                const bs = (fill.buy_sell || '').toUpperCase();
                const price = parseFloat(fill.trade_price || 0);
                const comm = parseFloat(fill.ib_commission || 0);
                const pnl = parseFloat(fill.realized_pnl || 0);
                const timeStr = fill.trade_time || '--:--';

                if (!current) {
                    current = {
                        trade_id: `tr_${fill.trade_date || ''}_${symbol}_${tradeIdx++}`,
                        symbol: symbol,
                        asset_category: fill.asset_category || 'STK',
                        direction: (qty > 0 || bs === 'BUY') ? 'LONG' : 'SHORT',
                        currency: fill.raw_currency || fill.currency || 'EUR',
                        raw_currency: fill.raw_currency || fill.currency || 'EUR',
                        base_currency: fill.base_currency || 'EUR',
                        fx_rate_to_base: parseFloat(fill.fx_rate_to_base || 1),
                        open_time: timeStr,
                        close_time: null,
                        duration: null,
                        entry_qty: 0,
                        entry_val: 0,
                        exit_qty: 0,
                        exit_val: 0,
                        gross_pnl: 0,
                        commission: 0,
                        fills: []
                    };
                }

                const isEntry = (current.direction === 'LONG' && qty > 0) || (current.direction === 'SHORT' && qty < 0);
                const absQty = Math.abs(qty);

                current.fills.push(fill);
                current.commission += comm;
                current.gross_pnl += pnl;

                if (isEntry) {
                    current.entry_qty += absQty;
                    current.entry_val += absQty * price;
                } else {
                    current.exit_qty += absQty;
                    current.exit_val += absQty * price;
                    current.close_time = timeStr;
                }

                pos += qty;

                if (Math.abs(pos) < 1e-6) {
                    current.status = 'CLOSED';
                    current.net_pnl = current.gross_pnl - current.commission;
                    current.avg_entry_price = current.entry_qty > 0 ? (current.entry_val / current.entry_qty) : 0;
                    current.avg_exit_price = current.exit_qty > 0 ? (current.exit_val / current.exit_qty) : 0;
                    current.quantity = Math.max(current.entry_qty, current.exit_qty);
                    current.result = current.net_pnl > 0.005 ? 'WIN' : (current.net_pnl < -0.005 ? 'LOSS' : 'BREAKEVEN');
                    allGrouped.push(current);
                    current = null;
                    pos = 0.0;
                }
            });

            if (current) {
                current.status = 'OPEN';
                current.net_pnl = current.gross_pnl - current.commission;
                current.avg_entry_price = current.entry_qty > 0 ? (current.entry_val / current.entry_qty) : 0;
                current.avg_exit_price = current.exit_qty > 0 ? (current.exit_val / current.exit_qty) : 0;
                current.quantity = Math.max(current.entry_qty, current.exit_qty);
                current.result = 'OPEN';
                allGrouped.push(current);
            }
        });

        allGrouped.sort((a, b) => (a.open_time || '').localeCompare(b.open_time || ''));
        return allGrouped;
    },

    render() {
        const bodyEl = document.getElementById('modal-body-content');
        if (!bodyEl || !this.currentData) return;

        const rawTrades = this.currentData.trades || [];
        const groupedTrades = this.getGroupedTrades(this.currentData);

        if (rawTrades.length === 0) {
            bodyEl.innerHTML = `
                <div class="modal-empty-state">
                    <div class="empty-icon">📂</div>
                    <h4>${STRINGS.modal?.noTradesFound || 'No trade executions recorded on this date.'}</h4>
                    <p>There are no executions or positions recorded for this trading session.</p>
                </div>
            `;
            return;
        }

        // Totals calculation
        const closedRawTrades = rawTrades.filter(t => (t.open_close_indicator || '').toUpperCase() === 'C' || (t.realized_pnl !== 0 && t.realized_pnl !== null && t.realized_pnl !== undefined));
        const grossPnl = closedRawTrades.reduce((acc, t) => acc + (t.realized_pnl || 0), 0);
        const totalComm = rawTrades.reduce((acc, t) => acc + (t.ib_commission || 0), 0);
        const netPnl = grossPnl - totalComm;

        // Grouped metrics
        const closedGrouped = groupedTrades.filter(g => g.status === 'CLOSED');
        const winCount = closedGrouped.filter(g => (g.net_pnl || 0) > 0).length;
        const lossCount = closedGrouped.filter(g => (g.net_pnl || 0) < 0).length;
        const winRate = closedGrouped.length > 0 ? ((winCount / closedGrouped.length) * 100).toFixed(0) : '--';

        const netPnlClass = State.getPnlClass(netPnl);
        const grossPnlClass = State.getPnlClass(grossPnl);

        const isGroupedView = this.activeView === 'grouped';
        const allExpanded = groupedTrades.length > 0 && this.expandedTradeIds.size === groupedTrades.length;

        bodyEl.innerHTML = `
            <!-- Top Summary KPI Banner -->
            <div class="modal-summary-banner">
                <div class="modal-kpi-card primary">
                    <span class="modal-kpi-label">${STRINGS.modal?.summaryPnl || 'Net Realized P&L'}</span>
                    <span class="modal-kpi-val mono ${netPnlClass}">${State.formatCurrency(netPnl)}</span>
                </div>
                <div class="modal-kpi-card">
                    <span class="modal-kpi-label">${STRINGS.modal?.summaryGross || 'Gross P&L'}</span>
                    <span class="modal-kpi-val mono ${grossPnlClass}">${State.formatCurrency(grossPnl)}</span>
                </div>
                <div class="modal-kpi-card">
                    <span class="modal-kpi-label">${STRINGS.modal?.summaryCommissions || 'Commissions'}</span>
                    <span class="modal-kpi-val mono">${State.currency}${totalComm.toFixed(2)}</span>
                </div>
                <div class="modal-kpi-card">
                    <span class="modal-kpi-label">${STRINGS.modal?.summaryCount || 'Round-Trip Trades'}</span>
                    <span class="modal-kpi-val mono">${groupedTrades.length} <span class="modal-kpi-sub">(${rawTrades.length} fills)</span></span>
                </div>
                <div class="modal-kpi-card">
                    <span class="modal-kpi-label">${STRINGS.modal?.summaryWinRate || 'Win Rate'}</span>
                    <span class="modal-kpi-val mono ${winCount > lossCount ? 'pnl-positive' : (lossCount > winCount ? 'pnl-negative' : '')}">${winRate}% <span class="modal-kpi-sub">(${winCount}W / ${lossCount}L)</span></span>
                </div>
            </div>

            <!-- Modal Toolbar / View Switcher -->
            <div class="day-modal-toolbar">
                <div class="segmented-control">
                    <button class="segmented-btn ${isGroupedView ? 'active' : ''}" id="btn-view-grouped">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                        <span>${STRINGS.modal?.viewGrouped || 'Grouped Trades'}</span>
                        <span class="badge-count">${groupedTrades.length}</span>
                    </button>
                    <button class="segmented-btn ${!isGroupedView ? 'active' : ''}" id="btn-view-executions">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                        <span>${STRINGS.modal?.viewExecutions || 'Raw Executions'}</span>
                        <span class="badge-count">${rawTrades.length}</span>
                    </button>
                </div>

                ${isGroupedView && groupedTrades.length > 1 ? `
                    <button class="btn-pill" id="btn-toggle-all-trades">
                        ${allExpanded ? (STRINGS.modal?.collapseAll || 'Collapse All') : (STRINGS.modal?.expandAll || 'Expand All')}
                    </button>
                ` : ''}
            </div>

            <!-- Content Area: Grouped Trades or Raw Executions Table -->
            <div class="day-modal-content-area">
                ${isGroupedView ? this.renderGroupedTradesHtml(groupedTrades) : this.renderRawExecutionsHtml(rawTrades)}
            </div>
        `;

        // Bind interactive events
        const btnGrouped = document.getElementById('btn-view-grouped');
        const btnExec = document.getElementById('btn-view-executions');
        const btnToggleAll = document.getElementById('btn-toggle-all-trades');

        if (btnGrouped) btnGrouped.addEventListener('click', () => this.setView('grouped'));
        if (btnExec) btnExec.addEventListener('click', () => this.setView('executions'));
        if (btnToggleAll) {
            btnToggleAll.addEventListener('click', () => {
                if (allExpanded) this.collapseAll();
                else this.expandAll();
            });
        }

        // Accordion headers
        if (isGroupedView) {
            const cardHeaders = bodyEl.querySelectorAll('.trade-card-header');
            cardHeaders.forEach(header => {
                header.addEventListener('click', () => {
                    const idx = parseInt(header.getAttribute('data-trade-idx'), 10);
                    if (!isNaN(idx)) this.toggleTrade(idx);
                });
            });
        }
    },

    renderGroupedTradesHtml(groupedTrades) {
        return `
            <div class="grouped-trades-container">
                ${groupedTrades.map((t, idx) => {
                    const isExpanded = this.expandedTradeIds.has(idx);
                    const isLong = t.direction === 'LONG';
                    const isWin = t.result === 'WIN';
                    const isLoss = t.result === 'LOSS';
                    const isOpen = t.status === 'OPEN' || t.result === 'OPEN';

                    const resultBadgeClass = isOpen ? 'badge-res-open' : (isWin ? 'badge-res-win' : (isLoss ? 'badge-res-loss' : 'badge-res-be'));
                    const resultLabel = isOpen ? (STRINGS.modal?.open || 'OPEN') : (isWin ? (STRINGS.modal?.win || 'WIN') : (isLoss ? (STRINGS.modal?.loss || 'LOSS') : (STRINGS.modal?.breakeven || 'BE')));

                    const pnlVal = t.net_pnl || 0;
                    const pnlClass = isOpen ? 'pnl-neutral' : State.getPnlClass(pnlVal);
                    const pnlDisplay = isOpen && pnlVal === 0 ? '<span style="color: var(--text-muted); font-size: 11px;">(Open)</span>' : State.formatCurrency(pnlVal);

                    const curr = t.raw_currency || t.currency || '';
                    const currSym = curr === 'USD' ? '$' : (curr === 'EUR' ? '€' : (curr === 'GBP' ? '£' : (curr ? `${curr} ` : '')));

                    const entryPriceStr = t.avg_entry_price ? `${currSym}${t.avg_entry_price.toFixed(2)}` : '--';
                    const exitPriceStr = t.avg_exit_price ? `${currSym}${t.avg_exit_price.toFixed(2)}` : (isOpen ? 'Active' : '--');

                    const durationStr = t.duration || (t.close_time ? `${t.open_time} → ${t.close_time}` : `${t.open_time} (Open)`);
                    const fillsCount = (t.fills || []).length;
                    const fillsLabel = fillsCount === 1 ? `1 ${STRINGS.modal?.fillSingle || 'fill'}` : `${fillsCount} ${STRINGS.modal?.fills || 'fills'}`;

                    // Sub-table of fills
                    const fillsRowsHtml = (t.fills || []).map((f, fIdx) => {
                        const isBuy = (f.buy_sell || '').toUpperCase() === 'BUY';
                        const fPnl = (f.realized_pnl || 0) - (f.ib_commission || 0);
                        const fIsOpen = (f.open_close_indicator || '').toUpperCase() === 'O' && (!f.realized_pnl);
                        const fPnlClass = fIsOpen ? 'pnl-neutral' : State.getPnlClass(fPnl);
                        const fPnlDisplay = fIsOpen ? '<span style="color: var(--text-muted); font-size: 11px;">(Entry)</span>' : State.formatCurrency(fPnl);
                        const fPrice = currSym ? `${currSym}${parseFloat(f.trade_price).toFixed(2)}` : parseFloat(f.trade_price).toFixed(2);

                        return `
                            <tr>
                                <td class="mono" style="font-size: 11px; color: var(--text-muted); width: 32px;">#${fIdx + 1}</td>
                                <td class="mono">${f.trade_time || '--:--'}</td>
                                <td><span class="badge-side ${isBuy ? 'badge-buy' : 'badge-sell'}">${f.buy_sell}</span></td>
                                <td class="mono">${Math.abs(f.quantity)}</td>
                                <td class="mono">${fPrice}</td>
                                <td class="mono" style="color: var(--text-muted);">${State.currency}${parseFloat(f.ib_commission || 0).toFixed(2)}</td>
                                <td class="mono ${fPnlClass}" style="font-weight: 700;">${fPnlDisplay}</td>
                                <td style="text-align: center;"><span class="badge-indicator">${f.open_close_indicator || 'C'}</span></td>
                            </tr>
                        `;
                    }).join('');

                    return `
                        <div class="trade-card ${isExpanded ? 'expanded' : ''}">
                            <div class="trade-card-header" data-trade-idx="${idx}">
                                <!-- Left: Direction, Symbol & Badges -->
                                <div class="trade-card-left">
                                    <span class="badge-direction ${isLong ? 'badge-long' : 'badge-short'}">${isLong ? (STRINGS.modal?.long || 'LONG') : (STRINGS.modal?.short || 'SHORT')}</span>
                                    <div class="trade-symbol-block">
                                        <div class="trade-symbol-line">
                                            <span class="trade-symbol-text">${t.symbol}</span>
                                            <span class="badge-category">${t.asset_category || 'STK'}</span>
                                            <span class="badge-result ${resultBadgeClass}">${resultLabel}</span>
                                        </div>
                                        <div class="trade-meta-sub">
                                            <span class="trade-time-chip">⏱ ${durationStr}</span>
                                            <span class="meta-dot">·</span>
                                            <span>${t.quantity} qty (${fillsLabel})</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- Center: Price Progression -->
                                <div class="trade-card-center">
                                    <div class="price-flow">
                                        <span class="price-step"><span class="price-label">${STRINGS.modal?.entry || 'In'}:</span> <strong class="mono">${entryPriceStr}</strong></span>
                                        <span class="price-arrow">→</span>
                                        <span class="price-step"><span class="price-label">${STRINGS.modal?.exit || 'Out'}:</span> <strong class="mono">${exitPriceStr}</strong></span>
                                    </div>
                                </div>

                                <!-- Right: Financials & Chevron -->
                                <div class="trade-card-right">
                                    <div class="trade-pnl-block">
                                        <div class="trade-pnl-val mono ${pnlClass}">${pnlDisplay}</div>
                                        <div class="trade-pnl-breakdown mono">
                                            <span>${STRINGS.modal?.summaryGross || 'Gross'}: ${State.formatCurrency(t.gross_pnl || 0)}</span>
                                            <span class="meta-dot">·</span>
                                            <span>${STRINGS.modal?.summaryCommissions || 'Comm'}: ${State.currency}${(t.commission || 0).toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div class="chevron-icon ${isExpanded ? 'rotated' : ''}">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                                    </div>
                                </div>
                            </div>

                            <!-- Expandable Body: Child Executions Fills -->
                            ${isExpanded ? `
                                <div class="trade-card-body">
                                    <div class="trade-fills-header">
                                        <span class="fills-title">${STRINGS.modal?.fills || 'Execution Fills'} (${fillsCount})</span>
                                    </div>
                                    <div class="trade-fills-table-wrap">
                                        <table class="trade-fills-table">
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    <th>${STRINGS.modal?.tableTime || 'Time'}</th>
                                                    <th>${STRINGS.modal?.tableSide || 'Side'}</th>
                                                    <th>${STRINGS.modal?.tableQty || 'Volume'}</th>
                                                    <th>${STRINGS.modal?.tablePrice || 'Price'}</th>
                                                    <th>${STRINGS.modal?.tableCommission || 'Commission'}</th>
                                                    <th>${STRINGS.modal?.tablePnl || 'Net P&L'}</th>
                                                    <th style="text-align: center;">Code</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${fillsRowsHtml}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    renderRawExecutionsHtml(rawTrades) {
        const rowsHtml = rawTrades.map((t, idx) => {
            const isBuy = (t.buy_sell || '').toUpperCase() === 'BUY';
            const isOpen = (t.open_close_indicator || '').toUpperCase() === 'O' && (t.realized_pnl === 0 || t.realized_pnl === null);
            const pnl = (t.realized_pnl || 0) - (t.ib_commission || 0);
            const pnlClass = isOpen ? 'pnl-neutral' : State.getPnlClass(pnl);
            const pnlDisplay = isOpen
                ? `<span style="color: var(--text-muted); font-size: 11px;">(Open)</span>`
                : State.formatCurrency(pnl);
            const timeStr = t.trade_time || '--:--';

            const curr = t.raw_currency || t.currency || '';
            const currSym = curr === 'USD' ? '$' : (curr === 'EUR' ? '€' : (curr === 'GBP' ? '£' : ''));
            const priceDisplay = currSym ? `${currSym}${parseFloat(t.trade_price).toFixed(2)}` : (curr ? `${parseFloat(t.trade_price).toFixed(2)} ${curr}` : parseFloat(t.trade_price).toFixed(2));

            let commTitle = '';
            if (t.raw_currency && t.base_currency && t.raw_currency !== t.base_currency && t.raw_commission) {
                commTitle = `Original: ${parseFloat(t.raw_commission).toFixed(2)} ${t.raw_currency} (FX ${t.fx_rate_to_base || 1})`;
            }

            let pnlTitle = '';
            if (t.raw_currency && t.base_currency && t.raw_currency !== t.base_currency && t.raw_realized_pnl !== undefined && t.raw_realized_pnl !== null) {
                const rawVal = parseFloat(t.raw_realized_pnl);
                pnlTitle = `Original: ${rawVal >= 0 ? '+' : ''}${rawVal.toFixed(2)} ${t.raw_currency} (FX ${t.fx_rate_to_base || 1})`;
            }

            return `
                <tr>
                    <td class="mono" style="font-size: 11px; color: var(--text-muted); width: 32px;">#${idx + 1}</td>
                    <td class="mono">${timeStr}</td>
                    <td>
                        <strong>${t.symbol}</strong>
                        <span class="badge-category" style="font-size: 9px; padding: 1px 4px; margin-left: 4px;">${t.asset_category}</span>
                    </td>
                    <td><span class="badge-side ${isBuy ? 'badge-buy' : 'badge-sell'}">${t.buy_sell}</span></td>
                    <td class="mono">${Math.abs(t.quantity)}</td>
                    <td class="mono" title="${curr ? `Currency: ${curr}` : ''}">${priceDisplay}</td>
                    <td class="mono" ${commTitle ? `title="${commTitle}"` : ''} style="color: var(--text-muted);">${State.currency}${parseFloat(t.ib_commission || 0).toFixed(2)}</td>
                    <td class="mono ${pnlClass}" style="font-weight: 700;" ${pnlTitle ? `title="${pnlTitle}"` : ''}>${pnlDisplay}</td>
                    <td style="text-align: center;"><span class="badge-indicator">${t.open_close_indicator || 'C'}</span></td>
                </tr>
            `;
        }).join('');

        return `
            <div class="trades-table-wrapper">
                <table class="trades-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>${STRINGS.modal?.tableTime || 'Time'}</th>
                            <th>${STRINGS.modal?.tableSymbol || 'Symbol'}</th>
                            <th>${STRINGS.modal?.tableSide || 'Side'}</th>
                            <th>${STRINGS.modal?.tableQty || 'Volume'}</th>
                            <th>${STRINGS.modal?.tablePrice || 'Price'}</th>
                            <th>${STRINGS.modal?.tableCommission || 'Commission'}</th>
                            <th>${STRINGS.modal?.tablePnl || 'Net P&L'}</th>
                            <th style="text-align: center;">Code</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
        `;
    }
};

window.DayModal = DayModal;
