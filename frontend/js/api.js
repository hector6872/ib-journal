/**
 * REST API Client for Trading Journal
 */
const API = {
    async _fetch(url, options = {}) {
        const res = await fetch(url, options);
        if (res.status === 503) {
            console.warn(`[WARNING] HTTP 503 Service Unavailable on ${url}: Backend container or server is not running or starting up. Check 'docker ps' or service logs.`);
        } else if (res.status === 502) {
            console.warn(`[WARNING] HTTP 502 Bad Gateway on ${url}: Reverse proxy cannot reach the backend service.`);
        }
        return res;
    },

    _checkError(res, fallbackMessage) {
        if (res.status === 503) {
            return (typeof STRINGS !== 'undefined' && STRINGS?.errors?.ERR_BACKEND_UNAVAILABLE) ||
                "Service Unavailable (HTTP 503): Backend container or server is not running. Check 'docker ps'.";
        }
        if (res.status === 502) {
            return (typeof STRINGS !== 'undefined' && STRINGS?.errors?.ERR_IBKR_BAD_GATEWAY) ||
                "Bad Gateway (HTTP 502): Cannot connect to backend service.";
        }
        return fallbackMessage;
    },

    async fetchConfig() {
        const res = await this._fetch('/api/config');
        if (!res.ok) throw new Error(this._checkError(res, "Failed to fetch config"));
        return await res.json();
    },

    async fetchSettings() {
        try {
            const res = await this._fetch('/api/settings');
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn("Could not fetch remote settings:", e);
        }
        return {};
    },

    async saveSettings(settings) {
        try {
            const res = await this._fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn("Could not save remote settings:", e);
        }
        return null;
    },

    async fetchOverviewStats(startDate = null, endDate = null) {
        let url = '/api/stats/overview';
        const params = [];
        if (startDate) params.push(`start_date=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`end_date=${encodeURIComponent(endDate)}`);
        if (params.length) url += `?${params.join('&')}`;

        const res = await this._fetch(url);
        if (!res.ok) throw new Error(this._checkError(res, "Failed to fetch overview stats"));
        return await res.json();
    },

    async fetchDetailedStats(startDate = null, endDate = null) {
        let url = '/api/stats/detailed';
        const params = [];
        if (startDate) params.push(`start_date=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`end_date=${encodeURIComponent(endDate)}`);
        if (params.length) url += `?${params.join('&')}`;

        const res = await this._fetch(url);
        if (!res.ok) throw new Error(this._checkError(res, "Failed to fetch detailed statistics"));
        return await res.json();
    },

    async fetchYearCalendar(year) {
        const res = await this._fetch(`/api/calendar/year?year=${year}`);
        if (!res.ok) throw new Error(this._checkError(res, `Failed to fetch calendar for year ${year}`));
        return await res.json();
    },

    async fetchMonthCalendar(year, month) {
        const res = await this._fetch(`/api/calendar/month?year=${year}&month=${month}`);
        if (!res.ok) throw new Error(this._checkError(res, `Failed to fetch calendar for ${year}-${month}`));
        return await res.json();
    },

    async fetchWeekCalendar(dateStr) {
        const res = await this._fetch(`/api/calendar/week?date=${dateStr}`);
        if (!res.ok) throw new Error(this._checkError(res, `Failed to fetch calendar for week ${dateStr}`));
        return await res.json();
    },

    async fetchDayTrades(dateStr) {
        const res = await this._fetch(`/api/trades/day?date=${dateStr}`);
        if (!res.ok) throw new Error(this._checkError(res, `Failed to fetch trades for date ${dateStr}`));
        return await res.json();
    },

    async fetchSyncStatus() {
        const res = await this._fetch('/api/sync/status');
        if (!res.ok) throw new Error(this._checkError(res, "Failed to fetch sync status"));
        return await res.json();
    },

    async triggerSync() {
        const res = await this._fetch('/api/sync/trigger', { method: 'POST' });
        if (!res.ok) {
            let data = null;
            try {
                data = await res.json();
            } catch (e) {
                // Ignore parse error
            }
            const detailMsg = data?.detail?.message || data?.detail || this._checkError(res, "Sync failed");
            throw new Error(detailMsg);
        }
        return await res.json();
    },

    async importTrades(content, signal = null) {
        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: content
        };
        if (signal) {
            fetchOptions.signal = signal;
        }
        const res = await this._fetch('/api/trades/import', fetchOptions);
        const text = await res.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch (e) {
            // Not valid JSON (e.g. server error text)
        }
        if (!res.ok) {
            const fallback = text || `Import failed (HTTP ${res.status})`;
            throw new Error(data?.detail || this._checkError(res, fallback));
        }
        return data || { status: 'success', message: 'Import completed.' };
    },

    async resolveSyncGap() {
        const res = await this._fetch('/api/sync/gap/resolve', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data?.detail || this._checkError(res, "Failed to resolve sync gap"));
        }
        return data;
    },

    async fetchCashTransactions() {
        const res = await this._fetch('/api/cash/transactions');
        if (!res.ok) throw new Error(this._checkError(res, "Failed to fetch cash transactions"));
        return await res.json();
    },

    async addCashTransaction(payload) {
        const res = await this._fetch('/api/cash/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || this._checkError(res, "Failed to add cash transaction"));
        return data;
    },

    async deleteCashTransaction(id) {
        const res = await this._fetch(`/api/cash/transactions/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || this._checkError(res, "Failed to delete cash transaction"));
        return data;
    },

    async fetchOpenPositions() {
        const res = await this._fetch('/api/positions/open');
        if (!res.ok) throw new Error(this._checkError(res, "Failed to fetch open positions"));
        return await res.json();
    },

    async clearOpenPositions() {
        const res = await this._fetch('/api/positions/open', {
            method: 'DELETE'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || this._checkError(res, "Failed to clear open positions"));
        return data;
    },

    async reconcileOpenPositions() {
        const res = await this._fetch('/api/positions/open/reconcile', {
            method: 'POST'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || this._checkError(res, "Failed to reconcile open positions"));
        return data;
    }
};

window.API = API;
