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

    async importTrades(content) {
        const res = await fetch('/api/trades/import', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: content
        });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || "Import failed");
        }
        return data;
    }
};

window.API = API;
