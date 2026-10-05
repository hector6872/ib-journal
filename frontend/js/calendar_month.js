/**
 * Month Calendar View Controller
 */
const CalendarMonth = {
    async load(year, month) {
        State.currentYear = year;
        State.currentMonth = month;
        const container = document.getElementById('calendar-view-container');
        if (!container) return;

        container.innerHTML = `<div style="text-align:center; padding: 60px; color: var(--text-muted);">${STRINGS.common.loading}</div>`;

        try {
            const data = await API.fetchMonthCalendar(year, month);
            State.currentMonthData = data;
            this.render(data, year, month);
        } catch (err) {
            console.error("Error loading month calendar:", err);
            container.innerHTML = `<div style="color: var(--color-red); padding: 40px;">${STRINGS.common.errorLoading}</div>`;
        }
    },

    render(data, year, month) {
        const container = document.getElementById('calendar-view-container');
        if (!container) return;

        const monthName = STRINGS.months.long[month - 1];
        const dailyMap = data.daily_map || {};
        const totalNetPnl = data.total_net_pnl || 0;
        const totalTrades = data.total_trades || 0;

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        // Days calculation
        const daysInMonth = new Date(year, month, 0).getDate();
        const firstDayObj = new Date(year, month - 1, 1);
        let firstDayOfWeek = firstDayObj.getDay() - 1;
        if (firstDayOfWeek < 0) firstDayOfWeek = 6; // Mon = 0 ... Sun = 6

        let daysGridHtml = '';

        // Empty cells before start of month
        for (let e = 0; e < firstDayOfWeek; e++) {
            const isWeekend = e === 5 || e === 6;
            daysGridHtml += `<div class="month-day-cell empty ${isWeekend ? 'weekend-cell' : ''}"></div>`;
        }

        // Real day cells
        for (let d = 1; d <= daysInMonth; d++) {
            const dow = (firstDayOfWeek + d - 1) % 7;
            const isWeekend = dow === 5 || dow === 6;
            const dStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayData = dailyMap[dStr];
            const isToday = dStr === todayStr;

            if (isWeekend) {
                daysGridHtml += `
                    <div class="month-day-cell weekend-cell ${isToday ? 'today' : ''}" data-date="${dStr}">
                        <div class="day-cell-header" style="justify-content: center; width: 100%;">
                            <span class="day-number mono">${d}</span>
                        </div>
                    </div>
                `;
            } else {
                let tradePill = '';
                let pnlHtml = '';

                if (dayData && dayData.count > 0) {
                    const pnl = dayData.pnl;
                    const pnlClass = pnl > 0 ? 'pnl-positive' : (pnl < 0 ? 'pnl-negative' : 'pnl-neutral');
                    const tradeCountText = `${dayData.count} ${dayData.count === 1 ? STRINGS.calendar.tradeSingleBadge : STRINGS.calendar.tradesBadge}`;
                    tradePill = `<span class="day-trade-pill mono">${tradeCountText}</span>`;
                    pnlHtml = `
                        <div class="day-pnl-summary">
                            <span class="day-pnl-amount mono ${pnlClass}">${State.formatCurrency(pnl)}</span>
                        </div>
                    `;
                }

                daysGridHtml += `
                    <div class="month-day-cell ${isToday ? 'today' : ''}" data-date="${dStr}">
                        <div class="day-cell-header">
                            <span class="day-number mono">${d}</span>
                            ${tradePill}
                        </div>
                        ${pnlHtml}
                    </div>
                `;
            }
        }

        container.innerHTML = `
            <div class="month-view-container">
                <div class="month-nav-bar">
                    <div class="nav-controls">
                        <button class="btn-icon" id="btn-prev-month">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <span class="year-title-label">${monthName} ${year}</span>
                        <button class="btn-icon" id="btn-next-month">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                        </button>
                        <button class="btn-secondary" id="btn-this-month">${STRINGS.calendar.thisMonth}</button>
                    </div>

                    <div class="month-totals-badge">
                        <span class="mono ${totalNetPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">${State.formatCurrency(totalNetPnl)}</span>
                    </div>
                </div>

                <div class="month-grid-container">
                    <div class="month-weekdays-header">
                        ${STRINGS.days.short3.map((d, idx) => `<span class="${idx >= 5 ? 'col-weekend' : ''}">${d}</span>`).join('')}
                    </div>
                    <div class="month-days-grid">
                        ${daysGridHtml}
                    </div>
                </div>
            </div>
        `;

        // Event listeners
        document.getElementById('btn-prev-month')?.addEventListener('click', () => {
            let nextM = month - 1;
            let nextY = year;
            if (nextM < 1) { nextM = 12; nextY--; }
            this.load(nextY, nextM);
        });

        document.getElementById('btn-next-month')?.addEventListener('click', () => {
            let nextM = month + 1;
            let nextY = year;
            if (nextM > 12) { nextM = 1; nextY++; }
            this.load(nextY, nextM);
        });

        document.getElementById('btn-this-month')?.addEventListener('click', () => {
            const now = new Date();
            this.load(now.getFullYear(), now.getMonth() + 1);
        });

        container.querySelectorAll('.month-day-cell:not(.empty):not(.weekend-cell)').forEach(cell => {
            cell.addEventListener('click', () => {
                const dStr = cell.getAttribute('data-date');
                if (dStr) DayModal.open(dStr);
            });
        });
    }
};

window.CalendarMonth = CalendarMonth;
