/**
 * Cash and Capital Management Modal Controller
 * Manages Starting Capital, auto-imported and manual deposits/withdrawals, and Account Balance.
 */
const CashModal = {
    backdrop: null,
    closeBtn: null,
    openBtn: null,
    cashData: null,

    init() {
        this.backdrop = document.getElementById('cash-modal-backdrop');
        this.closeBtn = document.getElementById('cash-modal-close-btn');
        this.openBtn = document.getElementById('btn-open-cash');

        if (this.openBtn) {
            this.openBtn.addEventListener('click', () => this.open());
        }

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        if (this.backdrop) {
            this.backdrop.addEventListener('click', (e) => {
                if (e.target === this.backdrop) this.close();
            });
        }

        const footerClose = document.getElementById('cash-modal-footer-close-btn');
        if (footerClose) {
            footerClose.addEventListener('click', () => this.close());
        }

        // Global Esc key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.backdrop && this.backdrop.classList.contains('active')) {
                this.close();
            }
        });
    },

    async open() {
        if (!this.backdrop) return;
        this.backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
        await this.loadAndRender();
    },

    close() {
        if (!this.backdrop) return;
        this.backdrop.classList.remove('active');
        document.body.style.overflow = '';
    },

    async loadAndRender() {
        const body = document.getElementById('cash-modal-body');
        if (!body) return;

        body.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-muted);">${STRINGS.common?.loading || 'Loading...'}</div>`;

        try {
            const [cashSummary, settings, overview] = await Promise.all([
                API.fetchCashTransactions(),
                API.fetchSettings(),
                API.fetchOverviewStats()
            ]);

            this.cashData = cashSummary;
            this.render(body, cashSummary, settings, overview);
        } catch (err) {
            console.error("Error loading cash management data:", err);
            body.innerHTML = `<div style="color: var(--color-loss); padding: 30px; text-align:center;">${STRINGS.cash?.loadErrorMsg || 'Failed to load cash management details.'}</div>`;
        }
    },

    render(container, cashSummary, settings, overview) {
        const sc = STRINGS.cash || {};
        const startingCapital = Number(settings?.starting_capital !== undefined ? settings.starting_capital : (overview?.starting_capital || 0.0));
        const unrealizedPnl = Number(overview?.unrealized_pnl || 0.0);
        const totalDeposits = Number(cashSummary?.total_deposits || 0.0);
        const totalWithdrawals = Number(cashSummary?.total_withdrawals || 0.0);
        const totalDividends = Number(cashSummary?.total_dividends || 0.0);
        const totalWithholdingTax = Number(cashSummary?.total_withholding_tax || 0.0);
        const totalSubscriptions = Number(cashSummary?.total_subscriptions || 0.0);
        const totalFees = Number(cashSummary?.total_fees || 0.0);
        const totalAccountExpenses = totalSubscriptions + totalFees;
        const netTransfers = totalDeposits - totalWithdrawals;
        const netCashFlow = Number(cashSummary?.net_cash_flow || 0.0);
        const netPnl = Number(overview?.net_pnl || 0.0);
        const totalPnl = netPnl + unrealizedPnl;
        const capitalBase = startingCapital + totalDeposits + totalDividends;
        const realizedBalance = startingCapital + netCashFlow + netPnl;
        const accountBalance = realizedBalance + unrealizedPnl;
        const roiPct = capitalBase > 0 ? ((totalPnl / capitalBase) * 100).toFixed(2) : '0.00';

        const txs = cashSummary?.transactions || [];
        const today = new Date().toISOString().split('T')[0];

        container.innerHTML = `
            <div class="cash-manager-container">
                <!-- 1. Executive Account Balance & Capital Basis Summary Cards -->
                <div class="cash-summary-grid">
                    <div class="cash-card">
                        <span class="cash-card-label">${sc.accountEquity || 'ACCOUNT EQUITY (NAV)'}</span>
                        <span class="cash-card-value mono ${State.getPnlClass(accountBalance)}">
                            ${State.formatCurrency(accountBalance)}
                        </span>
                        <span class="cash-card-sub">Realized: ${State.formatCurrency(realizedBalance)} · Open: ${State.formatCurrency(unrealizedPnl)}</span>
                    </div>

                    <div class="cash-card">
                        <span class="cash-card-label">${sc.unrealizedPnl || 'UNREALIZED P&L'}</span>
                        <span class="cash-card-value mono ${State.getPnlClass(unrealizedPnl)}">
                            ${State.formatCurrency(unrealizedPnl)}
                        </span>
                        <span class="cash-card-sub">${sc.unrealizedPnlSub || 'Open positions valuation / MTM'}</span>
                    </div>

                    <div class="cash-card">
                        <span class="cash-card-label">${sc.netTransfers || 'NET TRANSFERS IN/OUT'}</span>
                        <span class="cash-card-value mono ${State.getPnlClass(netTransfers)}">
                            ${State.formatCurrency(netTransfers)}
                        </span>
                        <span class="cash-card-sub">In: ${State.currency}${totalDeposits.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})} · Out: ${State.currency}${totalWithdrawals.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})}</span>
                    </div>

                    <div class="cash-card">
                        <span class="cash-card-label">${sc.accountExpenses || 'SUBSCRIPTIONS & ACCOUNT FEES'}</span>
                        <span class="cash-card-value mono ${totalAccountExpenses > 0 ? 'pnl-negative' : 'pnl-neutral'}">
                            -${State.currency}${totalAccountExpenses.toFixed(2)}
                        </span>
                        <span class="cash-card-sub">${sc.accountExpensesSub || 'Market subscriptions & fees'}</span>
                    </div>

                    <div class="cash-card">
                        <span class="cash-card-label">${sc.roi || 'RETURN ON CAPITAL (% ROI)'}</span>
                        <span class="cash-card-value mono ${State.getPnlClass(Number(roiPct))}">
                            ${Number(roiPct) > 0 ? '+' : ''}${roiPct}%
                        </span>
                        <span class="cash-card-sub">${sc.roiSub || 'Total P&L / Capital Base'}</span>
                    </div>
                </div>

                <!-- 1b. Itemized Category Breakdown Strip -->
                <div class="cash-breakdown-bar">
                    <div class="cash-breakdown-item">
                        <span class="cash-breakdown-label">${sc.statDeposits || 'Deposits'}</span>
                        <span class="cash-breakdown-val mono pnl-positive">+${State.currency}${totalDeposits.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    <div class="cash-breakdown-item">
                        <span class="cash-breakdown-label">${sc.statWithdrawals || 'Withdrawals'}</span>
                        <span class="cash-breakdown-val mono ${totalWithdrawals > 0 ? 'pnl-negative' : 'pnl-neutral'}">-${State.currency}${totalWithdrawals.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    <div class="cash-breakdown-item">
                        <span class="cash-breakdown-label">${sc.statDividends || 'Dividends'}</span>
                        <span class="cash-breakdown-val mono ${totalDividends > 0 ? 'pnl-positive' : 'pnl-neutral'}">+${State.currency}${totalDividends.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    <div class="cash-breakdown-item">
                        <span class="cash-breakdown-label">${sc.statWithholdingTax || 'Withholding Tax'}</span>
                        <span class="cash-breakdown-val mono ${totalWithholdingTax > 0 ? 'pnl-negative' : 'pnl-neutral'}">-${State.currency}${totalWithholdingTax.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    <div class="cash-breakdown-item">
                        <span class="cash-breakdown-label">${sc.statSubscriptions || 'Subscriptions'}</span>
                        <span class="cash-breakdown-val mono ${totalSubscriptions > 0 ? 'pnl-negative' : 'pnl-neutral'}">-${State.currency}${totalSubscriptions.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    <div class="cash-breakdown-item">
                        <span class="cash-breakdown-label">${sc.statFees || 'Broker Fees'}</span>
                        <span class="cash-breakdown-val mono ${totalFees > 0 ? 'pnl-negative' : 'pnl-neutral'}">-${State.currency}${totalFees.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                </div>

                <!-- 2. Starting Capital Configuration Form -->
                <div class="cash-section-box">
                    <div class="cash-section-header">
                        <strong>${sc.configSectionTitle || 'Starting Capital Configuration'}</strong>
                        <span style="font-size: 11px; color: var(--text-muted);">${sc.configSectionSubtitle || 'Set your baseline portfolio balance before recorded transfers.'}</span>
                    </div>
                    <form id="starting-capital-form" class="cash-form-inline">
                        <div class="form-group" style="flex: 1;">
                            <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">${sc.inputCapitalLabel || 'STARTING CAPITAL'} (${State.currency})</label>
                            <input type="number" step="0.01" min="0" id="input-starting-capital" class="cash-input" value="${startingCapital}" placeholder="0.00">
                        </div>
                        <button type="submit" class="btn-pill btn-accent" style="margin-top: 18px; white-space: nowrap;">${sc.saveCapitalBtn || 'Save Capital'}</button>
                    </form>
                </div>

                <!-- 3. Add Manual Deposit / Withdrawal Form -->
                <div class="cash-section-box">
                    <div class="cash-section-header">
                        <strong>${sc.addTransferTitle || 'Add Manual Cash Transfer'}</strong>
                        <span style="font-size: 11px; color: var(--text-muted);">${sc.addTransferSubtitle || 'Transfers in IBKR statements are automatically imported. Use this for manual adjustments.'}</span>
                    </div>
                    <form id="add-cash-tx-form" class="cash-form-row">
                        <div class="form-group" style="width: 170px;">
                            <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">${sc.typeLabel || 'TYPE'}</label>
                            <select id="cash-tx-type" class="cash-input">
                                <option value="DEPOSIT">${sc.deposit || 'Deposit (+)'}</option>
                                <option value="WITHDRAWAL">${sc.withdrawal || 'Withdrawal (-)'}</option>
                                <option value="DIVIDEND">${sc.dividend || 'Dividend (+)'}</option>
                                <option value="SUBSCRIPTION">${sc.subscription || 'Market Data Subscription (-)'}</option>
                                <option value="WITHHOLDING TAX">${sc.withholdingTax || 'Withholding Tax (-)'}</option>
                                <option value="FEE">${sc.brokerFee || 'Broker Fee (-)'}</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex: 1;">
                            <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">${sc.amountLabel || 'AMOUNT'} (${State.currency})</label>
                            <input type="number" step="0.01" min="0.01" id="cash-tx-amount" class="cash-input" placeholder="5000.00" required>
                        </div>
                        <div class="form-group" style="width: 140px;">
                            <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">${sc.dateLabel || 'DATE'}</label>
                            <input type="date" id="cash-tx-date" class="cash-input" value="${today}" required>
                        </div>
                        <div class="form-group" style="flex: 1.5;">
                            <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">${sc.descLabel || 'DESCRIPTION'}</label>
                            <input type="text" id="cash-tx-desc" class="cash-input" placeholder="${sc.descPlaceholder || 'e.g. Bank wire deposit'}">
                        </div>
                        <button type="submit" class="btn-pill btn-accent" style="margin-top: 18px; white-space: nowrap;">${sc.addTransferBtn || 'Add Transfer'}</button>
                    </form>
                </div>

                <!-- 4. Transactions List Table -->
                <div class="cash-section-box">
                    <div class="cash-section-header">
                        <strong>${sc.tableTitle || 'Recorded Transfers & Cash Movements'} (${txs.length})</strong>
                    </div>

                    ${txs.length === 0 ? `
                        <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 12px;">
                            ${sc.emptyTransfers || 'No deposits or withdrawals recorded yet.'}
                        </div>
                    ` : `
                        <div class="cash-table-wrap">
                            <table class="cash-table">
                                <thead>
                                    <tr>
                                        <th>${sc.colDate || 'Date'}</th>
                                        <th style="white-space: nowrap;">${sc.colType || 'Type'}</th>
                                        <th>${sc.colDesc || 'Description'}</th>
                                        <th style="white-space: nowrap;">${sc.colSource || 'Source'}</th>
                                        <th style="text-align: right; white-space: nowrap;">${sc.colAmount || 'Amount'}</th>
                                        <th style="text-align: center; width: 60px;">${sc.colAction || 'Action'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${txs.map(tx => {
                                        const isDeposit = Number(tx.amount) >= 0;
                                        const upperType = (tx.type || '').toUpperCase();
                                        let badgeClass = isDeposit ? 'badge-deposit' : 'badge-withdrawal';
                                        if (upperType === 'SUBSCRIPTION') badgeClass = 'badge-subscription';
                                        else if (upperType.includes('TAX')) badgeClass = 'badge-tax';
                                        else if (upperType === 'FEE') badgeClass = 'badge-fee';
                                        else if (upperType === 'DIVIDEND' && isDeposit) badgeClass = 'badge-dividend';
                                        else if (upperType === 'TRANSFER') badgeClass = 'badge-transfer';

                                        const amountClass = isDeposit ? 'pnl-positive' : 'pnl-negative';
                                        const sourceLabel = tx.is_manual ? (sc.sourceManual || 'Manual') : (sc.sourceIbkr || 'IBKR Auto');
                                        const sourceClass = tx.is_manual ? 'source-manual' : 'source-ibkr';

                                        return `
                                            <tr>
                                                <td class="mono" style="white-space: nowrap;">${tx.transaction_date}</td>
                                                <td style="white-space: nowrap;"><span class="cash-badge ${badgeClass}">${tx.type || (isDeposit ? 'DEPOSIT' : 'WITHDRAWAL')}</span></td>
                                                <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${tx.description || ''}">${tx.description || '--'}</td>
                                                <td style="white-space: nowrap;"><span class="source-tag ${sourceClass}">${sourceLabel}</span></td>
                                                <td class="mono ${amountClass}" style="text-align: right; font-weight: 700; white-space: nowrap;">
                                                    ${State.formatCurrency(tx.amount)}
                                                </td>
                                                <td style="text-align: center;">
                                                    ${tx.is_manual ? `
                                                        <button type="button" class="btn-delete-tx" data-id="${tx.id || tx.transaction_id}" title="${sc.deleteTooltip || 'Delete this transfer'}">
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                                        </button>
                                                    ` : `<span style="color: var(--text-muted); font-size: 11px; opacity: 0.5; user-select: none;">—</span>`}
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>
        `;

        // Bind Starting Capital Form submit
        const capForm = container.querySelector('#starting-capital-form');
        if (capForm) {
            capForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const inputCapital = Number(container.querySelector('#input-starting-capital')?.value || 0);
                try {
                    await API.saveSettings({ starting_capital: inputCapital });
                    await this.loadAndRender();
                    StatsController.updateOverview();
                    if (typeof StatsPage !== 'undefined' && StatsPage.load) StatsPage.load();
                    if (typeof App !== 'undefined' && App.showAlertModal) {
                        App.showAlertModal({
                            title: sc.capitalSavedTitle || "Starting Capital Saved",
                            message: `${sc.capitalSavedMsg || 'Starting capital successfully updated.'} (${State.formatCurrency(inputCapital)})`,
                            isSuccess: true
                        });
                    }
                } catch (err) {
                    if (typeof App !== 'undefined' && App.showErrorModal) {
                        App.showErrorModal(sc.saveErrorTitle || "Save Error", err.message);
                    } else {
                        console.error("Failed to save starting capital:", err);
                    }
                }
            });
        }

        // Bind Add Transaction Form submit
        const addForm = container.querySelector('#add-cash-tx-form');
        if (addForm) {
            addForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const txType = container.querySelector('#cash-tx-type')?.value;
                const amt = Number(container.querySelector('#cash-tx-amount')?.value || 0);
                const dt = container.querySelector('#cash-tx-date')?.value;
                const desc = container.querySelector('#cash-tx-desc')?.value;

                if (!amt || amt <= 0) {
                    if (typeof App !== 'undefined' && App.showAlertModal) {
                        App.showAlertModal({
                            title: sc.invalidAmountTitle || "Invalid Transfer Amount",
                            message: sc.invalidAmountMsg || "Please enter a valid transfer amount greater than 0.",
                            isError: true
                        });
                    }
                    return;
                }

                try {
                    await API.addCashTransaction({
                        type: txType,
                        amount: amt,
                        transaction_date: dt,
                        description: desc,
                        currency: State.currency === '$' ? 'USD' : (State.currency === '£' ? 'GBP' : 'EUR')
                    });
                    await this.loadAndRender();
                    StatsController.updateOverview();
                    if (typeof StatsPage !== 'undefined' && StatsPage.load) StatsPage.load();
                    if (typeof App !== 'undefined' && App.showAlertModal) {
                        App.showAlertModal({
                            title: sc.transferRecordedTitle || "Transfer Recorded",
                            message: `${txType === 'DEPOSIT' ? (sc.deposit || 'Deposit') : (sc.withdrawal || 'Withdrawal')} (${State.formatCurrency(amt)}) ${sc.capitalSavedMsg || 'successfully recorded.'}`,
                            isSuccess: true
                        });
                    }
                } catch (err) {
                    if (typeof App !== 'undefined' && App.showErrorModal) {
                        App.showErrorModal(sc.recordErrorTitle || "Record Transfer Error", err.message);
                    } else {
                        console.error("Failed to record cash transfer:", err);
                    }
                }
            });
        }

        // Bind Delete buttons
        container.querySelectorAll('.btn-delete-tx').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = btn.getAttribute('data-id');
                if (!id) return;

                let confirmed = false;
                if (typeof App !== 'undefined' && App.showConfirmModal) {
                    confirmed = await App.showConfirmModal({
                        title: sc.deleteConfirmTitle || "Delete Cash Transfer",
                        message: sc.deleteConfirmMsg || "Are you sure you want to delete this cash transfer? Your account equity and returns will be automatically recalculated.",
                        confirmText: sc.deleteBtn || "Delete",
                        cancelText: STRINGS.dialog?.cancel || "Cancel",
                        isDanger: true
                    });
                } else {
                    confirmed = window.confirm("Are you sure you want to delete this cash transfer?");
                }

                if (!confirmed) return;

                try {
                    await API.deleteCashTransaction(id);
                    await this.loadAndRender();
                    StatsController.updateOverview();
                    if (typeof StatsPage !== 'undefined' && StatsPage.load) StatsPage.load();
                } catch (err) {
                    if (typeof App !== 'undefined' && App.showErrorModal) {
                        App.showErrorModal(sc.deleteErrorTitle || "Delete Transfer Error", err.message);
                    } else {
                        console.error("Failed to delete cash transaction:", err);
                    }
                }
            });
        });
    }
};

window.CashModal = CashModal;
