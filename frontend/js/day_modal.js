/**
 * Day Trades Modal / Drawer Controller
 */
const DayModal = {
    backdrop: null,
    
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
        
        const titleEl = document.getElementById('modal-date-title');
        const bodyEl = document.getElementById('modal-body-content');

        if (titleEl) titleEl.textContent = `${STRINGS.modal.dayDetailsTitle} ${dateStr}`;
        if (bodyEl) bodyEl.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-muted);">${STRINGS.common.loading}</div>`;

        this.backdrop.classList.add('open');

        try {
            const data = await API.fetchDayTrades(dateStr);
            this.render(data, dateStr);
        } catch (err) {
            console.error("Error loading day trades:", err);
            if (bodyEl) bodyEl.innerHTML = `<div style="color: var(--color-red); padding: 20px;">${STRINGS.common.errorLoading}</div>`;
        }
    },

    close() {
        if (this.backdrop) this.backdrop.classList.remove('open');
    },

    render(data, dateStr) {
        const bodyEl = document.getElementById('modal-body-content');
        if (!bodyEl) return;

        const trades = data.trades || [];
        if (trades.length === 0) {
            bodyEl.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                    <svg style="width: 48px; height: 48px; stroke: var(--text-muted); fill: none; stroke-width: 1.5; margin-bottom: 12px;" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                    </svg>
                    <p>${STRINGS.modal.noTradesFound}</p>
                </div>
            `;
            return;
        }

        // Calculate totals
        const closedTrades = trades.filter(t => (t.open_close_indicator || '').toUpperCase() === 'C' || (t.realized_pnl !== 0 && t.realized_pnl !== null && t.realized_pnl !== undefined));
        const grossPnl = closedTrades.reduce((acc, t) => acc + (t.realized_pnl || 0), 0);
        const closedComm = closedTrades.reduce((acc, t) => acc + (t.ib_commission || 0), 0);
        const totalComm = trades.reduce((acc, t) => acc + (t.ib_commission || 0), 0);
        const netPnl = grossPnl - closedComm;

        let tableRowsHtml = trades.map(t => {
            const isBuy = (t.buy_sell || '').toUpperCase() === 'BUY';
            const isOpen = (t.open_close_indicator || '').toUpperCase() === 'O' && (t.realized_pnl === 0 || t.realized_pnl === null);
            const pnl = (t.realized_pnl || 0) - (t.ib_commission || 0);
            const pnlClass = isOpen ? 'pnl-neutral' : (pnl > 0 ? 'pnl-positive' : (pnl < 0 ? 'pnl-negative' : 'pnl-neutral'));
            const pnlDisplay = isOpen
                ? `<span style="color: var(--text-muted); font-size: 11px; font-weight: 500;">(Open)</span>`
                : State.formatCurrency(pnl);
            const timeStr = t.trade_time || '--:--';

            const curr = t.raw_currency || t.currency || '';
            const currPrefix = curr === 'USD' ? '$' : (curr === 'EUR' ? '€' : (curr === 'GBP' ? '£' : ''));
            const priceDisplay = currPrefix ? `${currPrefix}${t.trade_price.toFixed(2)}` : (curr ? `${t.trade_price.toFixed(2)} ${curr}` : t.trade_price.toFixed(2));

            let commTitle = '';
            if (t.raw_currency && t.base_currency && t.raw_currency !== t.base_currency && t.raw_commission) {
                commTitle = `Original: ${t.raw_commission.toFixed(2)} ${t.raw_currency} (FX ${t.fx_rate_to_base || 1})`;
            }

            let pnlTitle = '';
            if (t.raw_currency && t.base_currency && t.raw_currency !== t.base_currency && t.raw_realized_pnl !== undefined && t.raw_realized_pnl !== null) {
                pnlTitle = `Original: ${t.raw_realized_pnl >= 0 ? '+' : ''}${t.raw_realized_pnl.toFixed(2)} ${t.raw_currency} (FX ${t.fx_rate_to_base || 1})`;
            }

            return `
                <tr>
                    <td class="mono">${timeStr}</td>
                    <td><strong>${t.symbol}</strong> <span style="font-size: 10px; color: var(--text-muted);">(${t.asset_category})</span></td>
                    <td><span class="badge-side ${isBuy ? 'badge-buy' : 'badge-sell'}">${t.buy_sell}</span></td>
                    <td class="mono">${Math.abs(t.quantity)}</td>
                    <td class="mono" title="${curr ? `Currency: ${curr}` : ''}">${priceDisplay}</td>
                    <td class="mono" ${commTitle ? `title="${commTitle}"` : ''}>${State.currency}${t.ib_commission.toFixed(2)}</td>
                    <td class="mono ${pnlClass}" style="font-weight: 700;" ${pnlTitle ? `title="${pnlTitle}"` : ''}>${pnlDisplay}</td>
                </tr>
            `;
        }).join('');

        bodyEl.innerHTML = `
            <div class="modal-summary-bar">
                <div class="summary-block">
                    <span class="summary-block-label">${STRINGS.modal.summaryCount}</span>
                    <span class="summary-block-val mono">${trades.length}</span>
                </div>
                <div class="summary-block">
                    <span class="summary-block-label">${STRINGS.modal.summaryGross}</span>
                    <span class="summary-block-val mono ${State.getPnlClass(grossPnl)}">${State.formatCurrency(grossPnl)}</span>
                </div>
                <div class="summary-block">
                    <span class="summary-block-label">${STRINGS.modal.summaryCommissions}</span>
                    <span class="summary-block-val mono">${State.currency}${totalComm.toFixed(2)}</span>
                </div>
                <div class="summary-block" style="margin-left: auto;">
                    <span class="summary-block-label">${STRINGS.modal.summaryPnl}</span>
                    <span class="summary-block-val mono ${State.getPnlClass(netPnl)}" style="font-size: 18px;">${State.formatCurrency(netPnl)}</span>
                </div>
            </div>

            <div class="trades-table-wrapper">
                <table class="trades-table">
                    <thead>
                        <tr>
                            <th>${STRINGS.modal.tableTime}</th>
                            <th>${STRINGS.modal.tableSymbol}</th>
                            <th>${STRINGS.modal.tableSide}</th>
                            <th>${STRINGS.modal.tableQty}</th>
                            <th>${STRINGS.modal.tablePrice}</th>
                            <th>${STRINGS.modal.tableCommission}</th>
                            <th>${STRINGS.modal.tablePnl}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>
        `;
    }
};

window.DayModal = DayModal;
