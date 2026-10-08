/**
 * REST API Client for Trading Journal
 */
const API = {
    async fetchConfig() {
        const res = await fetch('/api/config');
        return await res.json();
    },

    async fetchSettings() {
        try {
            const res = await fetch('/api/settings');
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn("Could not fetch remote settings:", e);
        }
        return {};
    },

    async saveSettings(settings) {
        try {
            const res = await fetch('/api/settings', {
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

        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch overview stats");
        return await res.json();
    },

    async fetchDetailedStats(startDate = null, endDate = null) {
        let url = '/api/stats/detailed';
        const params = [];
        if (startDate) params.push(`start_date=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`end_date=${encodeURIComponent(endDate)}`);
        if (params.length) url += `?${params.join('&')}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch detailed statistics");
        return await res.json();
    },


    async fetchYearCalendar(year) {
        const res = await fetch(`/api/calendar/year?year=${year}`);
        if (!res.ok) throw new Error(`Failed to fetch calendar for year ${year}`);
        return await res.json();
    },

    async fetchMonthCalendar(year, month) {
        const res = await fetch(`/api/calendar/month?year=${year}&month=${month}`);
        if (!res.ok) throw new Error(`Failed to fetch calendar for ${year}-${month}`);
        return await res.json();
    },

    async fetchWeekCalendar(dateStr) {
        const res = await fetch(`/api/calendar/week?date=${dateStr}`);
        if (!res.ok) throw new Error(`Failed to fetch calendar for week ${dateStr}`);
        return await res.json();
    },

    async fetchDayTrades(dateStr) {
        const res = await fetch(`/api/trades/day?date=${dateStr}`);
        if (!res.ok) throw new Error(`Failed to fetch trades for date ${dateStr}`);
        return await res.json();
    },

    async fetchSyncStatus() {
        const res = await fetch('/api/sync/status');
        if (!res.ok) throw new Error("Failed to fetch sync status");
        return await res.json();
    },

    async triggerSync() {
        const res = await fetch('/api/sync/trigger', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || "Sync failed");
        }
        return data;
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
        const res = await fetch('/api/trades/import', fetchOptions);
        const text = await res.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch (e) {
            // Not valid JSON (e.g. server error text)
        }
        if (!res.ok) {
            throw new Error(data?.detail || text || `Import failed (HTTP ${res.status})`);
        }
        return data || { status: 'success', message: 'Import completed.' };
    },

    async resolveSyncGap() {
        const res = await fetch('/api/sync/gap/resolve', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || "Failed to resolve sync gap");
        }
        return data;
    },

    async fetchCashTransactions() {
        const res = await fetch('/api/cash/transactions');
        if (!res.ok) throw new Error("Failed to fetch cash transactions");
        return await res.json();
    },

    async addCashTransaction(payload) {
        const res = await fetch('/api/cash/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to add cash transaction");
        return data;
    },

    async deleteCashTransaction(id) {
        const res = await fetch(`/api/cash/transactions/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to delete cash transaction");
        return data;
    }
};

window.API = API;
