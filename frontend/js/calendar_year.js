/**
 * Year Calendar Matrix Controller
 */
const CalendarYear = {
    async load(year) {
        State.currentYear = year;
        const container = document.getElementById('calendar-view-container');
        if (!container) return;

        container.innerHTML = `<div style="text-align:center; padding: 60px; color: var(--text-muted);">${STRINGS.common.loading}</div>`;

        try {
            const data = await API.fetchYearCalendar(year);
            State.currentYearData = data;
            this.render(data, year);
        } catch (err) {
            console.error("Error loading year calendar:", err);
            container.innerHTML = `<div style="color: var(--color-red); padding: 40px;">${STRINGS.common.errorLoading}</div>`;
        }
    },

    render(data, year) {
        const container = document.getElementById('calendar-view-container');
        if (!container) return;

        const dailyMap = data.daily || {};
        const monthlyTotals = data.monthly || [];
        const totalNetPnl = data.total_net_pnl || 0;
        const totalTrades = data.total_trades || 0;

        const now = new Date();
        const nowYear = now.getFullYear();
        const minDateStr = State.minTradeDate || (State.overviewStats && State.overviewStats.min_trade_date);
        const minYear = minDateStr ? parseInt(minDateStr.split('-')[0], 10) : nowYear;
        const canPrevYear = year > minYear;
        const canNextYear = year < nowYear;

        // Render 12 months HTML
        let monthsHtml = '';
        for (let m = 1; m <= 12; m++) {
            const monthName = STRINGS.months.short[m - 1];
            const mTotal = monthlyTotals.find(item => item.month === m) || { net_pnl: 0, trades_count: 0 };
            const mPnl = mTotal.net_pnl;
            const mPnlClass = mPnl > 0 ? 'pnl-positive' : (mPnl < 0 ? 'pnl-negative' : 'pnl-neutral');
            const mPnlFormatted = mPnl !== 0 ? State.formatCurrency(mPnl) : '--';

            // Generate days matrix for this month
            // Days in month
            const daysInMonth = new Date(year, m, 0).getDate();
            // First day of week (0=Sun, 1=Mon, ..., 6=Sat) -> Convert to Mon=0 ... Sun=6
            const firstDayObj = new Date(year, m - 1, 1);
            let firstDayOfWeek = firstDayObj.getDay() - 1;
            if (firstDayOfWeek < 0) firstDayOfWeek = 6; // Sunday becomes 6

            let daysHtml = '';
            // Empty placeholder cells before 1st of month
            for (let e = 0; e < firstDayOfWeek; e++) {
                const isWeekend = e === 5 || e === 6;
                daysHtml += `<div class="mini-day empty ${isWeekend ? 'weekend' : ''}"></div>`;
            }

            // Days of the month
            for (let d = 1; d <= daysInMonth; d++) {
                const dow = (firstDayOfWeek + d - 1) % 7;
                const isWeekend = dow === 5 || dow === 6;
                const dStr = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayData = dailyMap[dStr];

                let dayClass = 'mini-day';
                if (isWeekend) dayClass += ' weekend';
                let titleAttr = `${dStr}`;

                if (dayData && dayData.count > 0) {
                    dayClass += ' has-trades';
                    if (dayData.pnl > 0) dayClass += ' win';
                    else if (dayData.pnl < 0) dayClass += ' loss';
                    titleAttr = `${dStr}: ${State.formatCurrency(dayData.pnl)} (${dayData.count} trades)`;
                }

                daysHtml += `<div class="${dayClass}" data-date="${dStr}" title="${titleAttr}">${d}</div>`;
            }

            monthsHtml += `
                <div class="mini-month" data-month="${m}">
                    <div class="mini-month-header">
                        <span class="mini-month-title">${monthName}</span>
                        <span class="mini-month-pnl mono ${mPnlClass}">${mPnlFormatted}</span>
                    </div>
                    <div class="mini-weekdays">
                        ${STRINGS.days.shortMonSun.map((d, idx) => `<span class="${idx >= 5 ? 'col-weekend' : ''}">${d}</span>`).join('')}
                    </div>
                    <div class="mini-days-matrix">
                        ${daysHtml}
                    </div>
                </div>
            `;
        }

        // Render Bottom summary ribbon
        let ribbonHtml = '';
        for (let m = 1; m <= 12; m++) {
            const mTotal = monthlyTotals.find(item => item.month === m) || { net_pnl: 0 };
            const mPnl = mTotal.net_pnl;
            const pillClass = mPnl > 0 ? 'positive' : (mPnl < 0 ? 'negative' : '');
            const displayPnl = mPnl !== 0 ? State.formatCurrency(mPnl) : '--';
            ribbonHtml += `
                <div class="month-pill mono ${pillClass}" data-month="${m}">
                    ${displayPnl}
                </div>
            `;
        }

        container.innerHTML = `
            <div class="year-view-container">
                <div class="year-nav-bar">
                    <div class="nav-controls">
                        <span class="year-title-label mono">${year}</span>
                        <button class="btn-icon" id="btn-prev-year" ${!canPrevYear ? 'disabled' : ''}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <button class="btn-icon" id="btn-next-year" ${!canNextYear ? 'disabled' : ''}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                        </button>
                    </div>
                    <div class="year-legend">
                        <span class="legend-dot legend-loss"></span>
                        <span class="legend-dot legend-neutral"></span>
                        <span class="legend-dot legend-profit"></span>
                    </div>
                </div>

                <div class="year-grid">
                    ${monthsHtml}
                </div>

                <div class="year-summary-card">
                    <span class="year-tag mono">${year}</span>
                    <div class="months-pnl-ribbon">
                        ${ribbonHtml}
                    </div>
                    <div class="year-total-pill">
                        <span class="total-label">${STRINGS.calendar.totalHeader}</span>
                        <span class="total-value mono ${totalNetPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">
                            ${State.formatCurrency(totalNetPnl)}
                        </span>
                        <span style="font-size: 10px; color: var(--text-muted);">${totalTrades} ${STRINGS.calendar.tradesBadge}</span>
                    </div>
                </div>
            </div>
        `;

        // Attach Event Listeners
        document.getElementById('btn-prev-year')?.addEventListener('click', () => {
            if (!canPrevYear) return;
            this.load(year - 1);
        });
        document.getElementById('btn-next-year')?.addEventListener('click', () => {
            if (!canNextYear) return;
            this.load(year + 1);
        });

        // Click on days with trades
        container.querySelectorAll('.mini-day.has-trades').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const dStr = el.getAttribute('data-date');
                if (dStr) DayModal.open(dStr);
            });
        });

        // Click on a mini month or month pill to jump to Month view
        container.querySelectorAll('.mini-month, .month-pill').forEach(el => {
            el.addEventListener('click', () => {
                const m = parseInt(el.getAttribute('data-month'), 10);
                if (m) {
                    State.currentMonth = m;
                    window.App.switchView('month');
                }
            });
        });
    }
};

window.CalendarYear = CalendarYear;
