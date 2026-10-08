/**
 * Day Trades Modal Controller
 * Displays Round-Trip Trades (grouped fills) and Raw Executions
 * Follows the authentic Interactive Brokers (IBKR) design language.
 */
const DayModal = {
    backdrop: null,
    currentData: null,
    currentDate: null,
    activeView: 'executions', // Default to raw executions
    timezoneMode: 'local', // 'local' (CET/CEST - Europe/Madrid) | 'market' (EST/EDT - US/Eastern)
    expandedTradeIds: new Set(),

    loadSettings() {
        if (typeof SettingsManager !== 'undefined') {
            this.timezoneMode = String(SettingsManager.get('app_timezone', 'local'));
        }
    },

    setTimezone(mode, broadcast = true) {
        if (this.timezoneMode === mode) return;
        this.timezoneMode = mode;
        if (typeof SettingsManager !== 'undefined') {
            SettingsManager.set('app_timezone', mode);
        }
        if (broadcast) {
            window.dispatchEvent(new CustomEvent('appTimezoneChanged', { detail: { timezone: mode } }));
        }
        this.render();
    },

    formatTime(timeStr, dateStr = null) {
        if (!timeStr || timeStr === '--:--') return '--:--';
        const cleanTime = timeStr.trim();
        if (this.timezoneMode === 'market') return cleanTime;
        const dStr = dateStr || this.currentDate || new Date().toISOString().split('T')[0];
        try {
            const dt = new Date(dStr + "T" + cleanTime + "Z");
            const nyDate = new Date(dt.toLocaleString("en-US", { timeZone: "America/New_York" }));
            const utcDate = new Date(dt.toLocaleString("en-US", { timeZone: "UTC" }));
            const nyOffsetHours = Math.round((utcDate - nyDate) / (1000 * 60 * 60));

            const sign = nyOffsetHours >= 0 ? "-" : "+";
            const offsetStr = sign + String(Math.abs(nyOffsetHours)).padStart(2, "0") + ":00";
            const realDate = new Date(dStr + "T" + cleanTime + offsetStr);
            return realDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        } catch (e) {
            return cleanTime;
        }
    },

    getTimeTooltip(timeStr, dateStr = null) {
        if (!timeStr || timeStr === '--:--') return '';
        const cleanTime = timeStr.trim();
        const dStr = dateStr || this.currentDate || new Date().toISOString().split('T')[0];
        try {
            const dt = new Date(dStr + "T" + cleanTime + "Z");
            const nyDate = new Date(dt.toLocaleString("en-US", { timeZone: "America/New_York" }));
            const utcDate = new Date(dt.toLocaleString("en-US", { timeZone: "UTC" }));
            const nyOffsetHours = Math.round((utcDate - nyDate) / (1000 * 60 * 60));

            const sign = nyOffsetHours >= 0 ? "-" : "+";
            const offsetStr = sign + String(Math.abs(nyOffsetHours)).padStart(2, "0") + ":00";
            const realDate = new Date(dStr + "T" + cleanTime + offsetStr);

            const localTime = realDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
            return `Local: ${localTime} (${localTz}) · Market: ${cleanTime} (US/Eastern)`;
        } catch (e) {
            return `Market: ${cleanTime} (US/Eastern)`;
        }
    },

    init() {
        this.loadSettings();
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

        // Sync with global timezone switches
        window.addEventListener('appTimezoneChanged', (e) => {
            const newTz = e.detail?.timezone;
            if (newTz && this.timezoneMode !== newTz) {
                this.setTimezone(newTz, false);
            }
        });
    },

    async open(dateStr) {
        this.loadSettings();
        if (!this.backdrop) this.init();

        this.currentDate = dateStr;
        this.activeView = 'executions'; // Rule 1: Always default to raw executions
        this.expandedTradeIds.clear();

        const titleEl = document.getElementById('modal-date-title');
        const bodyEl = document.getElementById('modal-body-content');

        if (titleEl) titleEl.textContent = `${STRINGS.modal?.dayDetailsTitle || 'Trading details for'} ${dateStr}`;
        if (bodyEl) bodyEl.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-muted);">${STRINGS.common?.loading || 'Loading trades...'}</div>`;

        this.backdrop.classList.add('open');

        try {
            const data = await API.fetchDayTrades(dateStr);
            this.currentData = data;

            // Rule 2: Pre-expand all grouped trades by default
            const grouped = this.getGroupedTrades(data);
            grouped.forEach((_, idx) => this.expandedTradeIds.add(idx));

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
        // Rule 2: When switching to grouped, expand all by default
        if (view === 'grouped') {
            const grouped = this.getGroupedTrades(this.currentData);
            grouped.forEach((_, idx) => this.expandedTradeIds.add(idx));
        }
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

    detectOptionType(symbol, assetCategory = '') {
        const sym = (symbol || '').trim().toUpperCase();
        const cat = (assetCategory || '').trim().toUpperCase();
        if (cat !== 'OPT' && cat !== 'FOP' && !sym.includes(' C') && !sym.includes(' P') && !sym.includes('CALL') && !sym.includes('PUT')) {
            return null;
        }
        if (sym.endsWith(' C') || sym.includes(' C ') || sym.endsWith(' CALL') || sym.includes(' CALL ')) return 'CALL';
        if (sym.endsWith(' P') || sym.includes(' P ') || sym.endsWith(' PUT') || sym.includes(' PUT ')) return 'PUT';
        const osiMatch = sym.match(/\d{6}([CP])\d{8}/);
        if (osiMatch) return osiMatch[1] === 'C' ? 'CALL' : 'PUT';
        return null;
    },

    getTradeDirection(assetCategory, symbol, isBuy) {
        const cat = (assetCategory || '').trim().toUpperCase();
        const sym = (symbol || '').trim().toUpperCase();
        if (cat === 'CASH' || cat === 'FX' || (sym.includes('.') && sym.split('.').length === 2 && sym.split('.')[0].length === 3 && sym.split('.')[1].length === 3)) {
            return 'EXCHANGE';
        }
        const optType = this.detectOptionType(sym, cat);
        if (optType) {
            return isBuy ? `BUY ${optType}` : `SELL ${optType}`;
        }
        return isBuy ? 'LONG' : 'SHORT';
    },

    getDirectionBadgeInfo(direction) {
        const raw = (direction || '').toUpperCase();
        if (raw === 'BUY CALL') return { badgeClass: 'badge-buy-call', label: STRINGS.modal?.buyCall || 'BUY CALL' };
        if (raw === 'SELL CALL') return { badgeClass: 'badge-sell-call', label: STRINGS.modal?.sellCall || 'SELL CALL' };
        if (raw === 'BUY PUT') return { badgeClass: 'badge-buy-put', label: STRINGS.modal?.buyPut || 'BUY PUT' };
        if (raw === 'SELL PUT') return { badgeClass: 'badge-sell-put', label: STRINGS.modal?.sellPut || 'SELL PUT' };
        if (raw === 'EXCHANGE') return { badgeClass: 'badge-exchange', label: STRINGS.modal?.exchange || 'EXCHANGE' };
        if (raw === 'BUY') return { badgeClass: 'badge-buy', label: STRINGS.modal?.buy || 'BUY' };
        if (raw === 'SELL') return { badgeClass: 'badge-sell', label: STRINGS.modal?.sell || 'SELL' };
        if (raw === 'SHORT') return { badgeClass: 'badge-short', label: STRINGS.modal?.short || 'SHORT' };
        return { badgeClass: 'badge-long', label: STRINGS.modal?.long || 'LONG' };
    },

    getGroupedTrades(data) {
        let grouped = [];
        if (data && Array.isArray(data.grouped_trades) && data.grouped_trades.length > 0) {
            grouped = [...data.grouped_trades];
        } else {
            const rawTrades = (data && data.trades) ? data.trades : [];
            grouped = this.clientGroupTrades(rawTrades);
        }

        // Sort grouped trades descending by open_time (most recent first)
        grouped.sort((a, b) => {
            const timeA = a.open_time || '00:00:00';
            const timeB = b.open_time || '00:00:00';
            if (timeA !== timeB) return timeB.localeCompare(timeA);
            return (a.symbol || '').localeCompare(b.symbol || '');
        });

        // Ensure child fills inside each grouped trade are also sorted descending (most recent first)
        grouped.forEach(t => {
            if (Array.isArray(t.fills)) {
                t.fills.sort((a, b) => {
                    const timeA = a.trade_time || '00:00:00';
                    const timeB = b.trade_time || '00:00:00';
                    if (timeA !== timeB) return timeB.localeCompare(timeA);
                    return (b.id || 0) - (a.id || 0);
                });
            }
        });

        return grouped;
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
            // Sort fills ascending
            fills.sort((a, b) => (a.trade_time || '00:00:00').localeCompare(b.trade_time || '00:00:00'));

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
                const fillCat = fill.asset_category || 'STK';

                const ind = (fill.open_close_indicator || '').toUpperCase();
                const isBuy = bs === 'BUY' || qty > 0;
                const hasPnl = Math.abs(pnl) > 1e-6;

                if (!current) {
                    let isInitialBuy = isBuy;
                    let isEntry = true;
                    if (ind === 'C' && hasPnl) {
                        isInitialBuy = !isBuy;
                        isEntry = false;
                    }

                    current = {
                        trade_id: `tr_${fill.trade_date || ''}_${symbol}_${tradeIdx++}`,
                        symbol: symbol,
                        asset_category: fillCat,
                        direction: this.getTradeDirection(fillCat, symbol, isInitialBuy),
                        is_initial_buy: isInitialBuy,
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

                const isEntry = current.is_initial_buy ? isBuy : !isBuy;
                const absQty = Math.abs(qty);

                current.fills.push(fill);
                current.commission += comm;
                current.gross_pnl += pnl;

                if (isEntry) {
                    current.entry_qty += absQty;
                    current.entry_val += absQty * price;
                    pos += absQty;
                } else {
                    current.exit_qty += absQty;
                    current.exit_val += absQty * price;
                    current.close_time = timeStr;
                    if (pos <= 0) {
                        pos = 0.0;
                    } else {
                        pos -= absQty;
                    }
                }

                if (Math.abs(pos) < 1e-6) {
                    current.status = 'CLOSED';
                    const multiplier = current.asset_category === 'OPT' ? 100 : 1;
                    if (Math.abs(current.gross_pnl) < 1e-6 && (current.entry_val > 0 || current.exit_val > 0)) {
                        const rawPnl = current.is_initial_buy
                            ? (current.exit_val - current.entry_val) * multiplier
                            : (current.entry_val - current.exit_val) * multiplier;
                        current.raw_gross_pnl = rawPnl;
                        current.gross_pnl = rawPnl * (current.fx_rate_to_base || 1);
                    }
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
                const hasRealizedPnl = Math.abs(current.gross_pnl) > 1e-6;
                const isCloseIndicator = (current.fills || []).some(f => (f.open_close_indicator || '').toUpperCase() === 'C');
                if (isCloseIndicator || hasRealizedPnl) {
                    current.status = 'CLOSED';
                    current.net_pnl = current.gross_pnl - current.commission;
                    current.avg_entry_price = current.entry_qty > 0 ? (current.entry_val / current.entry_qty) : 0;
                    current.avg_exit_price = current.exit_qty > 0 ? (current.exit_val / current.exit_qty) : 0;
                    current.quantity = Math.max(current.entry_qty, current.exit_qty);
                    current.result = current.net_pnl > 0.005 ? 'WIN' : (current.net_pnl < -0.005 ? 'LOSS' : 'BREAKEVEN');
                    allGrouped.push(current);
                } else {
                    current.status = 'OPEN';
                    current.net_pnl = current.gross_pnl - current.commission;
                    current.avg_entry_price = current.entry_qty > 0 ? (current.entry_val / current.entry_qty) : 0;
                    current.avg_exit_price = current.exit_qty > 0 ? (current.exit_val / current.exit_qty) : 0;
                    current.quantity = Math.max(current.entry_qty, current.exit_qty);
                    current.result = 'OPEN';
                    allGrouped.push(current);
                }
            }
        });

        allGrouped.sort((a, b) => (b.open_time || '').localeCompare(a.open_time || ''));
        return allGrouped;
    },

    render() {
        const bodyEl = document.getElementById('modal-body-content');
        if (!bodyEl || !this.currentData) return;

        // Raw executions sorted descending by time (most recent first)
        const rawTrades = [...(this.currentData.trades || [])].sort((a, b) => {
            const timeA = a.trade_time || '00:00:00';
            const timeB = b.trade_time || '00:00:00';
            if (timeA !== timeB) return timeB.localeCompare(timeA);
            return (b.id || 0) - (a.id || 0);
        });

        const groupedTrades = this.getGroupedTrades(this.currentData);

        if (rawTrades.length === 0) {
            bodyEl.innerHTML = `
                <div class="modal-empty-state">
                    <p class="modal-empty-message">${STRINGS.modal?.noTradesFound || 'No trade executions recorded on this date.'}</p>
                </div>
            `;
            return;
        }

        // Totals calculation
        const tradingRawTrades = rawTrades.filter(t => (t.asset_category || '').toUpperCase() !== 'CASH' && (t.asset_category || '').toUpperCase() !== 'FX');
        const closedRawTrades = tradingRawTrades.filter(t => (t.open_close_indicator || '').toUpperCase() === 'C' || (t.realized_pnl !== 0 && t.realized_pnl !== null && t.realized_pnl !== undefined));
        const tradingGrouped = groupedTrades.filter(g => (g.asset_category || '').toUpperCase() !== 'CASH' && (g.asset_category || '').toUpperCase() !== 'FX' && g.direction !== 'EXCHANGE');
        const closedGrouped = tradingGrouped.filter(g => g.status === 'CLOSED');

        let grossPnl = closedRawTrades.reduce((acc, t) => acc + (t.realized_pnl || 0), 0);
        if (Math.abs(grossPnl) < 1e-6 && closedGrouped.length > 0) {
            grossPnl = closedGrouped.reduce((acc, g) => acc + (g.gross_pnl || 0), 0);
        }
        const totalComm = rawTrades.reduce((acc, t) => acc + (t.ib_commission || 0), 0);
        const netPnl = grossPnl - totalComm;

        // Grouped metrics
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
                    <span class="modal-kpi-val mono">${tradingGrouped.length} <span class="modal-kpi-sub">(${tradingRawTrades.length} fills)</span></span>
                </div>
                <div class="modal-kpi-card">
                    <span class="modal-kpi-label">${STRINGS.modal?.summaryWinRate || 'Win Rate'}</span>
                    <span class="modal-kpi-val mono ${winCount > lossCount ? 'pnl-positive' : (lossCount > winCount ? 'pnl-negative' : '')}">${winRate}% <span class="modal-kpi-sub">(${winCount}W / ${lossCount}L)</span></span>
                </div>
            </div>

            <!-- Modal Toolbar / View Switcher -->
            <div class="day-modal-toolbar">
                <div class="segmented-control">
                    <button class="segmented-btn ${!isGroupedView ? 'active' : ''}" id="btn-view-executions">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                        <span>${STRINGS.modal?.viewExecutions || 'Raw Executions'}</span>
                        <span class="badge-count">${rawTrades.length}</span>
                    </button>
                    <button class="segmented-btn ${isGroupedView ? 'active' : ''}" id="btn-view-grouped">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                        <span>${STRINGS.modal?.viewGrouped || 'Grouped Trades'}</span>
                        <span class="badge-count">${tradingGrouped.length > 0 && tradingGrouped.length !== groupedTrades.length ? `${tradingGrouped.length} + ${groupedTrades.length - tradingGrouped.length} FX` : groupedTrades.length}</span>
                    </button>
                </div>

                <div style="display: flex; align-items: center; gap: 8px;">
                    <!-- Timezone Switcher -->
                    <div class="segmented-control" id="modal-timezone-control">
                        <button class="segmented-btn ${this.timezoneMode === 'local' ? 'active' : ''}" data-tz="local" title="Local Time (Europe/Madrid / Browser)">
                            <span>${STRINGS.modal?.tzLocal || 'Local (CET)'}</span>
                        </button>
                        <button class="segmented-btn ${this.timezoneMode === 'market' ? 'active' : ''}" data-tz="market" title="US Market Time (Wall Street EST/EDT)">
                            <span>${STRINGS.modal?.tzMarket || 'Market (EST)'}</span>
                        </button>
                    </div>

                    ${isGroupedView && groupedTrades.length > 1 ? `
                        <button class="btn-pill" id="btn-toggle-all-trades">
                            ${allExpanded ? (STRINGS.modal?.collapseAll || 'Collapse All') : (STRINGS.modal?.expandAll || 'Expand All')}
                        </button>
                    ` : ''}
                </div>
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

        // Timezone switcher events
        document.querySelectorAll('#modal-timezone-control [data-tz]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tz = btn.getAttribute('data-tz');
                if (tz) this.setTimezone(tz);
            });
        });

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
        let tradingIndex = groupedTrades.filter(g => (g.asset_category || '').toUpperCase() !== 'CASH' && (g.asset_category || '').toUpperCase() !== 'FX' && g.direction !== 'EXCHANGE').length;

        return `
            <div class="grouped-trades-container">
                ${groupedTrades.map((t, idx) => {
                    const isExpanded = this.expandedTradeIds.has(idx);
                    const dirInfo = this.getDirectionBadgeInfo(t.direction);
                    const isCash = (t.asset_category || '').toUpperCase() === 'CASH' || (t.asset_category || '').toUpperCase() === 'FX' || t.direction === 'EXCHANGE';
                    const isWin = !isCash && t.result === 'WIN';
                    const isLoss = !isCash && t.result === 'LOSS';
                    const isOpen = !isCash && (t.status === 'OPEN' || t.result === 'OPEN');
                    const tradeNumber = isCash ? 'FX' : `#${tradingIndex--}`;

                    const resultBadgeClass = isCash ? 'badge-res-be' : (isOpen ? 'badge-res-open' : (isWin ? 'badge-res-win' : (isLoss ? 'badge-res-loss' : 'badge-res-be')));
                    const resultLabel = isCash ? (STRINGS.modal?.converted || 'CONVERTED') : (isOpen ? (STRINGS.modal?.open || 'OPEN') : (isWin ? (STRINGS.modal?.win || 'WIN') : (isLoss ? (STRINGS.modal?.loss || 'LOSS') : (STRINGS.modal?.breakeven || 'BE'))));

                    const pnlVal = t.net_pnl || 0;
                    const pnlClass = isCash ? (pnlVal !== 0 ? State.getPnlClass(pnlVal) : 'pnl-neutral') : (isOpen ? 'pnl-neutral' : State.getPnlClass(pnlVal));
                    const pnlDisplay = isCash ? (pnlVal !== 0 ? State.formatCurrency(pnlVal) : '<span style="color: var(--text-muted); font-size: 11px;">--</span>') : (isOpen && pnlVal === 0 ? '<span style="color: var(--text-muted); font-size: 11px;">(Open)</span>' : State.formatCurrency(pnlVal));

                    const curr = t.raw_currency || t.currency || '';
                    const currSym = curr === 'USD' ? '$' : (curr === 'EUR' ? '€' : (curr === 'GBP' ? '£' : (curr ? `${curr} ` : '')));

                    const entryPrice = typeof t.avg_entry_price === 'number' ? t.avg_entry_price : parseFloat(t.avg_entry_price || 0);
                    const entryPriceStr = entryPrice > 0 ? `${currSym}${entryPrice.toFixed(2)}` : '--';
                    const exitPrice = typeof t.avg_exit_price === 'number' ? t.avg_exit_price : parseFloat(t.avg_exit_price || 0);
                    const exitPriceStr = exitPrice > 0 ? `${currSym}${exitPrice.toFixed(2)}` : (isOpen ? 'Active' : '--');

                    const openTime = this.formatTime(t.open_time, this.currentDate);
                    const closeTime = t.close_time ? this.formatTime(t.close_time, this.currentDate) : null;
                    const tzSuffix = this.timezoneMode === 'local' ? 'CET' : 'EST';
                    const durationStr = isCash ? `${openTime} (${STRINGS.modal?.instant || 'Instant'})` : (t.duration || (closeTime ? `${openTime} → ${closeTime} (${tzSuffix})` : `${openTime} (Open)`));
                    const fillsCount = (t.fills || []).length;
                    const fillsLabel = fillsCount === 1 ? `1 ${STRINGS.modal?.fillSingle || 'fill'}` : `${fillsCount} ${STRINGS.modal?.fills || 'fills'}`;

                    // Sub-table of fills (numbered from bottom to top)
                    const fillsRowsHtml = (t.fills || []).map((f, fIdx) => {
                        const isBuy = (f.buy_sell || '').toUpperCase() === 'BUY';
                        const isCashFill = (f.asset_category || t.asset_category || '').toUpperCase() === 'CASH' || (f.asset_category || t.asset_category || '').toUpperCase() === 'FX';
                        const fPnl = (f.realized_pnl || 0) - (f.ib_commission || 0);
                        const fIsOpen = !isCashFill && (f.open_close_indicator || '').toUpperCase() === 'O' && (!f.realized_pnl);
                        const fPnlClass = fIsOpen ? 'pnl-neutral' : State.getPnlClass(fPnl);
                        const fPnlDisplay = isCashFill
                            ? (fPnl !== 0 ? State.formatCurrency(fPnl) : '<span style="color: var(--text-muted); font-size: 11px;">--</span>')
                            : (fIsOpen ? '<span style="color: var(--text-muted); font-size: 11px;">(Entry)</span>' : State.formatCurrency(fPnl));
                        const fPrice = currSym ? `${currSym}${parseFloat(f.trade_price).toFixed(2)}` : parseFloat(f.trade_price).toFixed(2);
                        const fillNumber = fillsCount - fIdx;
                        const fillTimeStr = this.formatTime(f.trade_time, f.trade_date);
                        const fillTimeTooltip = this.getTimeTooltip(f.trade_time, f.trade_date);

                        const sideBadgeHtml = isCashFill
                            ? `<span class="badge-side badge-exchange">${STRINGS.modal?.exchange || 'EXCHANGE'}</span>`
                            : `<span class="badge-side ${isBuy ? 'badge-buy' : 'badge-sell'}">${f.buy_sell}</span>`;

                        return `
                            <tr>
                                <td class="mono" style="font-size: 11px; color: var(--text-muted); width: 32px;">#${fillNumber}</td>
                                <td class="mono" ${fillTimeTooltip ? `title="${fillTimeTooltip}"` : ''}>${fillTimeStr}</td>
                                <td>${sideBadgeHtml}</td>
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
                                <!-- Left: Number, Direction, Symbol & Badges -->
                                <div class="trade-card-left">
                                    <span class="mono" style="font-size: 11px; font-weight: 800; color: var(--text-muted); min-width: 20px;">${tradeNumber}</span>
                                    <span class="badge-direction ${dirInfo.badgeClass}">${dirInfo.label}</span>
                                    <div class="trade-symbol-block">
                                        <div class="trade-symbol-line">
                                            <span class="trade-symbol-text">${t.symbol}</span>
                                            <span class="badge-category">${t.asset_category || 'STK'}</span>
                                            <span class="badge-result ${resultBadgeClass}">${resultLabel}</span>
                                        </div>
                                        <div class="trade-meta-sub">
                                            <span class="trade-time-chip">${durationStr}</span>
                                            <span class="meta-dot">·</span>
                                            <span>${t.quantity} qty (${fillsLabel})</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- Center: Price Progression -->
                                <div class="trade-card-center">
                                    ${isCash ? `
                                        <div class="price-flow">
                                            <span class="price-step"><span class="price-label">${STRINGS.modal?.spotRate || 'Rate'}:</span> <strong class="mono">${entryPriceStr}</strong></span>
                                        </div>
                                    ` : `
                                        <div class="price-flow">
                                            <span class="price-step"><span class="price-label">${STRINGS.modal?.entry || 'In'}:</span> <strong class="mono">${entryPriceStr}</strong></span>
                                            <span class="price-arrow">→</span>
                                            <span class="price-step"><span class="price-label">${STRINGS.modal?.exit || 'Out'}:</span> <strong class="mono">${exitPriceStr}</strong></span>
                                        </div>
                                    `}
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
                                                    <th>${this.timezoneMode === 'local' ? (STRINGS.modal?.tableTimeLocal || 'Time (CET)') : (STRINGS.modal?.tableTimeMarket || 'Time (EST)')}</th>
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
        const timeHeader = this.timezoneMode === 'local' ? (STRINGS.modal?.tableTimeLocal || 'Time (CET)') : (STRINGS.modal?.tableTimeMarket || 'Time (EST)');
        const rowsHtml = rawTrades.map((t, idx) => {
            const isBuy = (t.buy_sell || '').toUpperCase() === 'BUY';
            const isCash = (t.asset_category || '').toUpperCase() === 'CASH' || (t.asset_category || '').toUpperCase() === 'FX';
            const isOpen = !isCash && (t.open_close_indicator || '').toUpperCase() === 'O' && (t.realized_pnl === 0 || t.realized_pnl === null);
            const pnl = (t.realized_pnl || 0) - (t.ib_commission || 0);
            const pnlClass = isOpen ? 'pnl-neutral' : State.getPnlClass(pnl);
            const pnlDisplay = isCash
                ? (pnl !== 0 ? State.formatCurrency(pnl) : '<span style="color: var(--text-muted); font-size: 11px;">--</span>')
                : (isOpen
                    ? `<span style="color: var(--text-muted); font-size: 11px;">(Open)</span>`
                    : State.formatCurrency(pnl));
            const timeStr = this.formatTime(t.trade_time, t.trade_date);
            const timeTooltip = this.getTimeTooltip(t.trade_time, t.trade_date);

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

            const sideBadgeHtml = isCash
                ? `<span class="badge-side badge-exchange">${STRINGS.modal?.exchange || 'EXCHANGE'}</span>`
                : `<span class="badge-side ${isBuy ? 'badge-buy' : 'badge-sell'}">${t.buy_sell}</span>`;

            return `
                <tr>
                    <td class="mono" style="font-size: 11px; color: var(--text-muted); width: 32px;">#${rawTrades.length - idx}</td>
                    <td class="mono" ${timeTooltip ? `title="${timeTooltip}"` : ''}>${timeStr}</td>
                    <td>
                        <strong>${t.symbol}</strong>
                        <span class="badge-category" style="font-size: 9px; padding: 1px 4px; margin-left: 4px;">${t.asset_category}</span>
                    </td>
                    <td>${sideBadgeHtml}</td>
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
                            <th>${timeHeader}</th>
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
