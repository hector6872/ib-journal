/**
 * Stats and Top Bar Header Controller
 */
const StatsController = {
    timerInterval: null,

    async updateOverview() {
        try {
            const data = await API.fetchOverviewStats();
            State.overviewStats = data;
            if (data) {
                State.minTradeDate = data.min_trade_date;
                State.maxTradeDate = data.max_trade_date;
            }
            this.renderOverview(data);
        } catch (err) {
            console.error("Error updating overview stats:", err);
        }
    },

    renderOverview(data) {
        if (!data) return;

        const sp = STRINGS.statsPage || {};

        // 1. Full Body Banner (Calendar view)
        const elNav = document.getElementById('banner-nav');
        const elNavSub = document.getElementById('banner-nav-sub');
        const elNetPnl = document.getElementById('banner-net-pnl');
        const elNetPnlSub = document.getElementById('banner-net-pnl-sub');
        const elWr = document.getElementById('banner-wr');
        const elWrSub = document.getElementById('banner-wr-sub');
        const elPf = document.getElementById('banner-pf');
        const elPfSub = document.getElementById('banner-pf-sub');
        const elExp = document.getElementById('banner-expectancy');
        const elExpSub = document.getElementById('banner-expectancy-sub');

        if (elNav) {
            elNav.textContent = State.formatCurrency(data.account_balance || 0, true, false);
            elNav.className = `stat-card-value mono ${State.getPnlClass(data.account_balance || 0)}`;
        }
        if (elNavSub) {
            const realBal = data.realized_balance !== undefined ? data.realized_balance : (data.account_balance || 0);
            const openPnl = data.unrealized_pnl || 0;
            elNavSub.textContent = `Realized: ${State.formatCurrency(realBal, true, false)} · Open: ${State.formatCurrency(openPnl)}`;
        }

        if (elNetPnl) {
            elNetPnl.textContent = State.formatCurrency(data.net_pnl || 0);
            elNetPnl.className = `stat-card-value mono ${State.getPnlClass(data.net_pnl)}`;
        }
        if (elNetPnlSub) {
            elNetPnlSub.textContent = `${sp.grossLabel || 'Gross'} ${State.formatCurrency(data.gross_pnl || 0)} · -${State.currency}${(data.total_commissions || 0).toFixed(2)} ${sp.feesLabel || 'fees'}`;
        }

        if (elWr) {
            elWr.textContent = `${(data.win_rate || 0).toFixed(2)}%`;
            elWr.className = `stat-card-value mono ${State.getWinRateClass(data.win_rate, data.total_trades)}`;
        }
        if (elWrSub) {
            elWrSub.textContent = `${(data.gross_win_rate || 0).toFixed(1)}% ${sp.beforeCosts || 'before costs'} · ${data.winning_trades_price || 0}W / ${data.losing_trades_price || 0}L ${sp.onPrice || 'on price'}`;
        }

        if (elPf) {
            elPf.textContent = (data.profit_factor || 0).toFixed(2);
            elPf.className = `stat-card-value mono ${State.getRatioClass(data.profit_factor, data.total_trades)}`;
        }
        if (elPfSub) {
            elPfSub.textContent = `${State.formatCurrency(data.gross_profit || 0)} / ${State.formatCurrency(-(data.gross_loss || 0))}`;
        }

        if (elExp) {
            elExp.textContent = State.formatCurrency(data.expectancy || 0);
            elExp.className = `stat-card-value mono ${State.getPnlClass(data.expectancy)}`;
        }
        if (elExpSub) {
            elExpSub.textContent = 'Expected value per trade';
        }

        // 2. Compact Header Mini KPI (Tucked into header on scroll)
        const miniNav = document.getElementById('mini-nav');
        const miniNetPnl = document.getElementById('mini-net-pnl');
        const miniWr = document.getElementById('mini-wr');
        const miniPf = document.getElementById('mini-pf');
        const miniExp = document.getElementById('mini-expectancy');

        if (miniNav) {
            miniNav.textContent = State.formatCurrency(data.account_balance || 0, true, false);
            miniNav.className = `mini-kpi-value mono ${State.getPnlClass(data.account_balance || 0)}`;
        }
        if (miniNetPnl) {
            miniNetPnl.textContent = State.formatCurrency(data.net_pnl || 0);
            miniNetPnl.className = `mini-kpi-value mono ${State.getPnlClass(data.net_pnl)}`;
        }
        if (miniWr) {
            miniWr.textContent = `${(data.win_rate || 0).toFixed(1)}%`;
            miniWr.className = `mini-kpi-value mono ${State.getWinRateClass(data.win_rate, data.total_trades)}`;
        }
        if (miniPf) {
            miniPf.textContent = (data.profit_factor || 0).toFixed(2);
            miniPf.className = `mini-kpi-value mono ${State.getRatioClass(data.profit_factor, data.total_trades)}`;
        }
        if (miniExp) {
            miniExp.textContent = State.formatCurrency(data.expectancy || 0);
            miniExp.className = `mini-kpi-value mono ${State.getPnlClass(data.expectancy)}`;
        }
    },

    initScrollDock() {
        const headerMini = document.getElementById('header-mini-kpi');
        if (headerMini) {
            headerMini.addEventListener('click', () => {
                if (typeof App !== 'undefined' && App.switchTab) {
                    App.switchTab('stats');
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        const banner = document.getElementById('global-kpi-banner');
        if (banner) {
            banner.querySelectorAll('.kpi-banner-item').forEach(item => {
                item.addEventListener('click', () => {
                    if (typeof App !== 'undefined' && App.switchTab) {
                        App.switchTab('stats');
                    }
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
            });
        }

        const updateVisibility = () => {
            let bannerCard = null;
            if (typeof App !== 'undefined' && App.activeTab === 'stats') {
                bannerCard = document.getElementById('stats-kpi-grid');
            } else {
                bannerCard = document.getElementById('global-kpi-banner');
            }

            if (!bannerCard) {
                headerMini.classList.remove('visible');
                return;
            }

            const rect = bannerCard.getBoundingClientRect();
            // When the card bottom scrolls above the 56px sticky top header
            if (rect.bottom <= 56) {
                headerMini.classList.add('visible');
            } else {
                headerMini.classList.remove('visible');
            }
        };

        window.addEventListener('scroll', updateVisibility, { passive: true });
        window.addEventListener('resize', updateVisibility, { passive: true });
        this.updateScrollDockVisibility = updateVisibility;
    },

    updateScrollDockVisibility() {
        const headerMini = document.getElementById('header-mini-kpi');
        if (!headerMini) return;

        let bannerCard = null;
        if (typeof App !== 'undefined' && App.activeTab === 'stats') {
            bannerCard = document.getElementById('stats-kpi-grid');
        } else {
            bannerCard = document.getElementById('global-kpi-banner');
        }

        if (!bannerCard) {
            headerMini.classList.remove('visible');
            return;
        }

        const rect = bannerCard.getBoundingClientRect();
        if (rect.bottom <= 56) {
            headerMini.classList.add('visible');
        } else {
            headerMini.classList.remove('visible');
        }
    },


    async updateSyncStatus() {
        try {
            const status = await API.fetchSyncStatus();
            State.syncStatus = status;
            this.renderSyncWidget(status);
        } catch (err) {
            console.error("Error updating sync status:", err);
        }
    },

    renderSyncWidget(status) {
        const btnSync = document.getElementById('btn-sync');
        const elLast = document.getElementById('sync-last-time');
        const elNext = document.getElementById('sync-next-time');

        if (!btnSync || !status) return;

        // 1. Sync Button & Status Text State
        if (status.is_configured === false || status.status === 'unconfigured') {
            if (elLast) elLast.textContent = STRINGS.sync.notConfiguredTitle;
            if (elNext) elNext.textContent = STRINGS.getSyncSubtitle(status);
            btnSync.disabled = true;
            btnSync.classList.add('disabled');
            btnSync.classList.remove('spinning');
            btnSync.title = STRINGS.getSyncTooltip(status);
            btnSync.querySelector('.btn-sync-label').textContent = STRINGS.sync.syncNow;
        } else if (status.status === 'failed') {
            btnSync.classList.remove('disabled');
            btnSync.title = STRINGS.getSyncTooltip(status);
            if (elLast) {
                if (status.last_sync_time) {
                    const lastDate = new Date(status.last_sync_time);
                    elLast.textContent = `${STRINGS.sync.lastUpdated} ${lastDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                } else {
                    elLast.textContent = STRINGS.sync.syncFailed;
                }
            }
            if (elNext) {
                elNext.textContent = STRINGS.getSyncSubtitle(status);
            }
        } else {
            // Normal / Success / Idle / Partial Success State
            btnSync.classList.remove('disabled');
            btnSync.title = STRINGS.getSyncTooltip(status);

            if (elLast) {
                if (status.last_sync_time) {
                    const lastDate = new Date(status.last_sync_time);
                    elLast.textContent = `${STRINGS.sync.lastUpdated} ${lastDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                } else {
                    elLast.textContent = `${STRINGS.sync.lastUpdated} --:--`;
                }
            }
            if (elNext) {
                elNext.textContent = STRINGS.getSyncSubtitle(status);
            }
        }

        // 2. Desync Gap Warning Badge (Always evaluated regardless of configuration)
        const btnGap = document.getElementById('btn-sync-gap');
        const gapLabel = document.getElementById('sync-gap-label');
        if (btnGap) {
            if (status.has_sync_gap) {
                btnGap.classList.remove('hidden');
                if (gapLabel) gapLabel.textContent = STRINGS.format(STRINGS.sync.desyncBadge, { days: status.gap_days });
                btnGap.onclick = () => {
                    if (typeof ImportModal !== 'undefined') {
                        ImportModal.show({ 
                            has_gap: true, 
                            days: status.gap_days,
                            from: status.gap_from,
                            to: status.gap_to
                        });
                    }
                };
            } else {
                btnGap.classList.add('hidden');
            }
        }

        // 3. Manual Import Button Handler
        const btnOpenImport = document.getElementById('btn-open-import');
        if (btnOpenImport) {
            btnOpenImport.onclick = () => {
                if (typeof ImportModal !== 'undefined') {
                    ImportModal.show({ 
                        has_gap: status.has_sync_gap, 
                        days: status.gap_days,
                        from: status.gap_from,
                        to: status.gap_to
                    });
                }
            };
        }

        // 4. Cooldown and Import locking for Sync Now button (only when configured)
        if (status.is_configured !== false && status.status !== 'unconfigured') {
            const cooldownSec = status.cooldown_remaining_seconds || 0;
            const isImporting = (typeof State !== 'undefined' && State.isImporting) || status.is_importing;

            if (isImporting) {
                btnSync.disabled = true;
                btnSync.classList.remove('spinning');
                btnSync.title = "Statement import in progress. Sync is paused.";
                btnSync.querySelector('.btn-sync-label').textContent = STRINGS.import?.importingFiles || "Importing...";
            } else if (status.is_syncing) {
                btnSync.disabled = true;
                btnSync.classList.add('spinning');
                btnSync.querySelector('.btn-sync-label').textContent = STRINGS.sync.syncing;
            } else if (cooldownSec > 0) {
                btnSync.disabled = true;
                btnSync.classList.remove('spinning');
                const mins = Math.floor(cooldownSec / 60);
                const secs = cooldownSec % 60;
                const formatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
                btnSync.querySelector('.btn-sync-label').textContent = `${STRINGS.sync.cooldownPrefix} ${formatted}`;
            } else {
                btnSync.disabled = false;
                btnSync.classList.remove('spinning');
                btnSync.querySelector('.btn-sync-label').textContent = STRINGS.sync.syncNow;
            }
        }
    },

    startPolling() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        // Initial fetch ONCE on load (No network polling loop)
        this.updateOverview();
        this.updateSyncStatus();
        this.initScrollDock();
        if (typeof ImportModal !== 'undefined') {
            ImportModal.init();
        }

        // Local 1-second in-memory countdown (0 HTTP requests sent over network)
        this.timerInterval = setInterval(() => {
            if (State.syncStatus && State.syncStatus.cooldown_remaining_seconds > 0) {
                State.syncStatus.cooldown_remaining_seconds--;
                this.renderSyncWidget(State.syncStatus);
            }
        }, 1000);
    }
};

window.StatsController = StatsController;

