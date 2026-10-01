/**
 * REST API Client for Trading Journal
 */
const API = {
    async fetchConfig() {
        const res = await fetch('/api/config');
        return await res.json();
    },

    async fetchOverviewStats() {
        const res = await fetch('/api/stats/overview');
        if (!res.ok) throw new Error("Failed to fetch overview stats");
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
    }
};

window.API = API;
