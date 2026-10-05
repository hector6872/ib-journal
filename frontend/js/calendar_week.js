/**
 * Week Calendar View Controller
 */
const CalendarWeek = {
    async load(dateStr) {
        if (!dateStr) dateStr = State.currentWeekDate;
        State.currentWeekDate = dateStr;

        const container = document.getElementById('calendar-view-container');
        if (!container) return;

        container.innerHTML = `<div style="text-align:center; padding: 60px; color: var(--text-muted);">${STRINGS.common.loading}</div>`;

        try {
            const data = await API.fetchWeekCalendar(dateStr);
            State.currentWeekData = data;
            this.render(data);
        } catch (err) {
            console.error("Error loading week calendar:", err);
            container.innerHTML = `<div style="color: var(--color-red); padding: 40px;">${STRINGS.common.errorLoading}</div>`;
        }
    },

    formatWeekHeader(startDateStr, endDateStr) {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);

        const startMonth = STRINGS.months.short[start.getMonth()];
        const endMonth = STRINGS.months.short[end.getMonth()];
        const year = start.getFullYear();

        if (startMonth === endMonth) {
            return `${STRINGS.calendar.weekOf} ${startMonth} ${start.getDate()} – ${end.getDate()}, ${year}`;
        } else {
            return `${STRINGS.calendar.weekOf} ${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${year}`;
        }
    },

    render(data) {
        const container = document.getElementById('calendar-view-container');
        if (!container) return;

        const days = data.days || [];
        const totalNetPnl = data.total_net_pnl || 0;
        const totalTrades = data.total_trades || 0;
        const headerText = this.formatWeekHeader(data.start_date, data.end_date);

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        let cardsHtml = days.map(day => {
            const isToday = day.date === todayStr;
            const dayName = STRINGS.days.short3[day.weekday_index];
            const hasTrades = day.trades_count > 0;
            const pnlClass = day.pnl > 0 ? 'pnl-positive' : (day.pnl < 0 ? 'pnl-negative' : 'pnl-neutral');

            let bodyContent = '';
            if (hasTrades) {
                bodyContent = `
                    <div class="week-card-pnl mono ${pnlClass}">${State.formatCurrency(day.pnl)}</div>
                    <div class="week-card-trade-count">${day.trades_count} ${day.trades_count === 1 ? STRINGS.calendar.tradeSingleBadge : STRINGS.calendar.tradesBadge}</div>
                `;
            } else {
                bodyContent = `<div class="week-card-empty">${STRINGS.calendar.noTradesDay}</div>`;
            }

            return `
                <div class="week-day-card ${isToday ? 'today' : ''}" data-date="${day.date}">
                    <div class="week-card-header">
                        <span class="week-card-dayname">${dayName}</span>
                        <span class="week-card-daynum mono">${day.day_number}</span>
                    </div>
                    <div class="week-card-body">
                        ${bodyContent}
                    </div>
                </div>
            `;
        }).join('');

        const start = new Date(data.start_date + 'T00:00:00');
        const nowWeekStart = new Date(today);
        const nowDow = (nowWeekStart.getDay() + 6) % 7;
        nowWeekStart.setDate(nowWeekStart.getDate() - nowDow);
        nowWeekStart.setHours(0, 0, 0, 0);

        const minDateStr = State.minTradeDate || (State.overviewStats && State.overviewStats.min_trade_date);
        let minWeekStart = nowWeekStart;
        if (minDateStr) {
            const minParts = minDateStr.split('-');
            const minDate = new Date(parseInt(minParts[0], 10), parseInt(minParts[1], 10) - 1, parseInt(minParts[2], 10));
            const minDow = (minDate.getDay() + 6) % 7;
            minWeekStart = new Date(minDate);
            minWeekStart.setDate(minWeekStart.getDate() - minDow);
            minWeekStart.setHours(0, 0, 0, 0);
        }

        const canPrevWeek = start > minWeekStart;
        const canNextWeek = start < nowWeekStart;
        const isCurrentWeek = start.getTime() === nowWeekStart.getTime();

        container.innerHTML = `
            <div class="week-view-container">
                <div class="month-nav-bar">
                    <div class="nav-controls">
                        <button class="btn-icon" id="btn-prev-week" ${!canPrevWeek ? 'disabled' : ''}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <span class="year-title-label">${headerText}</span>
                        <button class="btn-icon" id="btn-next-week" ${!canNextWeek ? 'disabled' : ''}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                        </button>
                        <button class="btn-secondary" id="btn-this-week" ${isCurrentWeek ? 'disabled' : ''}>${STRINGS.calendar.thisWeek}</button>
                    </div>

                    <div class="month-totals-badge">
                        <span class="mono ${totalNetPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">${State.formatCurrency(totalNetPnl)}</span>
                    </div>
                </div>

                <div class="week-cards-grid">
                    ${cardsHtml}
                </div>
            </div>
        `;

        // Event Listeners for Navigation
        document.getElementById('btn-prev-week')?.addEventListener('click', () => {
            if (!canPrevWeek) return;
            const cur = new Date(data.start_date + 'T00:00:00');
            cur.setDate(cur.getDate() - 7);
            this.load(cur.toISOString().split('T')[0]);
        });

        document.getElementById('btn-next-week')?.addEventListener('click', () => {
            if (!canNextWeek) return;
            const cur = new Date(data.start_date + 'T00:00:00');
            cur.setDate(cur.getDate() + 7);
            this.load(cur.toISOString().split('T')[0]);
        });

        document.getElementById('btn-this-week')?.addEventListener('click', () => {
            const now = new Date();
            this.load(now.toISOString().split('T')[0]);
        });

        // Click on day card
        container.querySelectorAll('.week-day-card').forEach(card => {
            card.addEventListener('click', () => {
                const dStr = card.getAttribute('data-date');
                if (dStr) DayModal.open(dStr);
            });
        });
    }
};

window.CalendarWeek = CalendarWeek;
