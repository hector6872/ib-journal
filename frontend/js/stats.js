/**
 * Stats and Top Bar Header Controller
 */
const StatsController = {
    timerInterval: null,

    async updateOverview() {
        try {
            const data = await API.fetchOverviewStats();
            State.overviewStats = data;
            this.renderOverview(data);
        } catch (err) {
            console.error("Error updating overview stats:", err);
        }
    },

    renderOverview(data) {
        if (!data) return;

        // Elements
        const elWr = document.getElementById('kpi-wr');
        const elOps = document.getElementById('kpi-ops');
        const elPf = document.getElementById('kpi-pf');
        const elExp = document.getElementById('kpi-exp');
        const elPnl = document.getElementById('kpi-pnl');

        if (elWr) elWr.textContent = `${data.win_rate.toFixed(1)}%`;
        if (elOps) elOps.textContent = State.formatNumber(data.total_trades);
        if (elPf) elPf.textContent = data.profit_factor.toFixed(2);
        
        if (elExp) {
            elExp.textContent = State.formatCurrency(data.expectancy);
            elExp.className = `kpi-value mono ${data.expectancy >= 0 ? 'green' : 'red'}`;
        }

        if (elPnl) {
            elPnl.textContent = State.formatCurrency(data.net_pnl);
            elPnl.className = `kpi-value mono ${data.net_pnl >= 0 ? 'green' : 'red'}`;
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

        // Last sync text
        if (elLast) {
            if (status.last_sync_time) {
                const lastDate = new Date(status.last_sync_time);
                elLast.textContent = `${STRINGS.sync.lastUpdated}: ${lastDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } else {
                elLast.textContent = `${STRINGS.sync.lastUpdated}: --:--`;
            }
        }

        // Next sync text
        if (elNext) {
            if (status.next_sync_time) {
                const nextDate = new Date(status.next_sync_time);
                const diffMs = nextDate - new Date();
                const diffMins = Math.max(0, Math.round(diffMs / 60000));
                elNext.textContent = `${STRINGS.sync.nextSync} ${diffMins}m`;
            }
        }

        // Cooldown button handling
        const cooldownSec = status.cooldown_remaining_seconds || 0;
        if (status.is_syncing) {
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
    },

    startPolling() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        // Initial calls
        this.updateOverview();
        this.updateSyncStatus();

        // Ticking loop every 5 seconds for live countdowns & sync status
        this.timerInterval = setInterval(() => {
            this.updateSyncStatus();
        }, 5000);
    }
};

window.StatsController = StatsController;
