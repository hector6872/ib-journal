/**
 * Unified Continuous Calendar Page Controller
 * Displays Week, Month, and Year flowing sequentially downwards.
 */
const CalendarPage = {
    async loadAll() {
        const container = document.getElementById('view-calendar');
        if (!container) return;

        // Render skeleton / containers inside calendar-page-inner if not present
        let inner = document.getElementById('calendar-page-inner');
        if (!inner) {
            inner = document.createElement('div');
            inner.className = 'page-view';
            inner.id = 'calendar-page-inner';
            container.appendChild(inner);
        }

        if (!document.getElementById('sec-week-container')) {
            inner.innerHTML = `
                <!-- 1. Week Section -->
                <div class="section-week-container" id="sec-week-container">
                    <div style="text-align:center; padding: 20px; color: var(--text-muted);">${STRINGS.common.loading}</div>
                </div>

                <!-- 2. Month Section -->
                <div class="section-month-container" id="sec-month-container">
                    <div style="text-align:center; padding: 20px; color: var(--text-muted);">${STRINGS.common.loading}</div>
                </div>

                <!-- 3. Year Section -->
                <div class="section-year-container" id="sec-year-container">
                    <div style="text-align:center; padding: 20px; color: var(--text-muted);">${STRINGS.common.loading}</div>
                </div>
            `;
        }

        // Fetch overview metrics for sticky banner and all 3 calendar sections concurrently
        await Promise.all([
            StatsController.updateOverview(),
            this.loadWeek(State.currentWeekDate),
            this.loadMonth(State.currentYear, State.currentMonth),
            this.loadYear(State.currentYear)
        ]);
    },

    // -------------------------------------------------------------
    // 1. WEEK SECTION
    // -------------------------------------------------------------
    async loadWeek(dateStr) {
        State.currentWeekDate = dateStr;
        const container = document.getElementById('sec-week-container');
        if (!container) return;

        try {
            const data = await API.fetchWeekCalendar(dateStr);
            this.renderWeek(data, container);
        } catch (err) {
            console.error("Error loading week:", err);
            container.innerHTML = `<div style="color: var(--color-loss); padding: 20px;">${STRINGS.common.errorLoading}</div>`;
        }
    },

    renderWeek(data, container) {
        const days = data.days || [];
        const totalNetPnl = data.total_net_pnl || 0;
        const totalTrades = data.total_trades || 0;

        const start = new Date(data.start_date);
        const end = new Date(data.end_date);
        const startM = STRINGS.months.short[start.getMonth()];
        const endM = STRINGS.months.short[end.getMonth()];
        const year = start.getFullYear();
        const headerText = startM === endM
            ? `${STRINGS.calendar.weekOf} ${startM} ${start.getDate()} – ${end.getDate()}, ${year}`
            : `${STRINGS.calendar.weekOf} ${startM} ${start.getDate()} – ${endM} ${end.getDate()}, ${year}`;

        const todayStr = new Date().toISOString().split('T')[0];

        let cardsHtml = days.map(d => {
            const isToday = d.date === todayStr;
            const dayName = STRINGS.days.short3[d.weekday_index];
            const hasTrades = d.trades_count > 0;
            const pnlClass = State.getPnlClass(d.pnl);
            const cardTintClass = hasTrades ? (d.pnl > 0 ? 'card-win' : (d.pnl < 0 ? 'card-loss' : '')) : '';

            let bodyContent = hasTrades
                ? `
                    <div class="week-card-pnl mono ${pnlClass}">${State.formatCurrency(d.pnl)}</div>
                    <div class="week-card-count mono">${d.trades_count} ${d.trades_count === 1 ? STRINGS.calendar.tradeSingleBadge : STRINGS.calendar.tradesBadge}</div>
                  `
                : '';

            return `
                <div class="week-card ${isToday ? 'today' : ''} ${cardTintClass}" data-date="${d.date}">
                    <div class="week-card-top">
                        <span class="week-card-weekday">${dayName}</span>
                        <span class="week-card-daynumber mono">${d.day_number}</span>
                    </div>
                    <div class="week-card-main">
                        ${bodyContent}
                    </div>
                </div>
            `;
        }).join('');

        // 8th Card: Weekly Total Summary Card
        const totalCardHtml = `
            <div class="week-card total-card">
                <div class="week-card-top">
                    <span class="week-card-weekday" style="color: var(--color-accent);">${STRINGS.calendar.weekTotal}</span>
                </div>
                <div class="week-card-main">
                    <div class="week-card-pnl mono ${State.getPnlClass(totalNetPnl)}" style="font-size: 16px;">
                        ${State.formatCurrency(totalNetPnl)}
                    </div>
                    <div class="week-card-count mono" style="font-weight: 600;">
                        ${totalTrades} ${totalTrades === 1 ? STRINGS.calendar.tradeSingleBadge : STRINGS.calendar.tradesBadge}
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = `
            <div class="week-nav-bar">
                <div class="nav-controls-group">
                    <button class="btn-ctrl" id="btn-week-prev" title="Previous Week">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <span class="nav-title-text">${headerText}</span>
                    <button class="btn-ctrl" id="btn-week-next" title="Next Week">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                    <button class="btn-pill" id="btn-week-today">${STRINGS.calendar.thisWeek}</button>
                </div>
            </div>
            <div class="week-cards-row">
                ${cardsHtml}
                ${totalCardHtml}
            </div>
        `;

        // Event listeners
        document.getElementById('btn-week-prev')?.addEventListener('click', () => {
            const cur = new Date(data.start_date);
            cur.setDate(cur.getDate() - 7);
            this.loadWeek(cur.toISOString().split('T')[0]);
        });
        document.getElementById('btn-week-next')?.addEventListener('click', () => {
            const cur = new Date(data.start_date);
            cur.setDate(cur.getDate() + 7);
            this.loadWeek(cur.toISOString().split('T')[0]);
        });
        document.getElementById('btn-week-today')?.addEventListener('click', () => {
            this.loadWeek(new Date().toISOString().split('T')[0]);
        });

        container.querySelectorAll('.week-card:not(.total-card)').forEach(card => {
            card.addEventListener('click', () => {
                const dStr = card.getAttribute('data-date');
                if (dStr) DayModal.open(dStr);
            });
        });
    },

    // -------------------------------------------------------------
    // 2. MONTH SECTION (8 Columns: Mon-Sun + Weekly Total)
    // -------------------------------------------------------------
    async loadMonth(year, month) {
        State.currentYear = year;
        State.currentMonth = month;
        const container = document.getElementById('sec-month-container');
        if (!container) return;

        try {
            const data = await API.fetchMonthCalendar(year, month);
            this.renderMonth(data, container, year, month);
        } catch (err) {
            console.error("Error loading month:", err);
            container.innerHTML = `<div style="color: var(--color-loss); padding: 20px;">${STRINGS.common.errorLoading}</div>`;
        }
    },

    renderMonth(data, container, year, month) {
        const monthName = STRINGS.months.long[month - 1];
        const dailyMap = data.daily_map || {};
        const totalNetPnl = data.total_net_pnl || 0;
        const totalTrades = data.total_trades || 0;
        const todayStr = new Date().toISOString().split('T')[0];

        const daysInMonth = new Date(year, month, 0).getDate();
        const firstDayObj = new Date(year, month - 1, 1);
        let firstDayOfWeek = firstDayObj.getDay() - 1;
        if (firstDayOfWeek < 0) firstDayOfWeek = 6; // Mon=0 ... Sun=6

        // Build list of cells row by row (7 days + 1 weekly total)
        let matrixHtml = '';
        let currentDay = 1;
        let weekRowIndex = 1;

        while (currentDay <= daysInMonth) {
            let rowDaysHtml = '';
            let rowNetPnl = 0;
            let rowTradesCount = 0;

            for (let dow = 0; dow < 7; dow++) {
                const isWeekend = dow === 5 || dow === 6;

                if (weekRowIndex === 1 && dow < firstDayOfWeek) {
                    // Empty placeholder before start of month
                    rowDaysHtml += `<div class="month-day-cell empty ${isWeekend ? 'weekend-cell' : ''}"></div>`;
                } else if (currentDay > daysInMonth) {
                    // Empty placeholder after end of month
                    rowDaysHtml += `<div class="month-day-cell empty ${isWeekend ? 'weekend-cell' : ''}"></div>`;
                } else {
                    const dStr = `${year}-${String(month).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
                    const dayData = dailyMap[dStr];
                    const isToday = dStr === todayStr;

                    if (isWeekend) {
                        rowDaysHtml += `
                            <div class="month-day-cell weekend-cell ${isToday ? 'today' : ''}" data-date="${dStr}">
                                <div class="cell-top" style="justify-content: center; width: 100%;">
                                    <span class="cell-day-num mono">${currentDay}</span>
                                </div>
                            </div>
                        `;
                    } else {
                        let badgeHtml = '';
                        let pnlHtml = '';
                        let cellTintClass = '';

                        if (dayData && dayData.count > 0) {
                            const pnl = dayData.pnl;
                            const pnlClass = State.getPnlClass(pnl);
                            cellTintClass = pnl > 0 ? 'cell-win' : (pnl < 0 ? 'cell-loss' : '');
                            const tradeCountText = `${dayData.count} ${dayData.count === 1 ? STRINGS.calendar.tradeSingleBadge : STRINGS.calendar.tradesBadge}`;
                            badgeHtml = `<span class="cell-badge-count mono">${tradeCountText}</span>`;
                            pnlHtml = `<span class="cell-pnl-val mono ${pnlClass}">${State.formatCurrency(pnl)}</span>`;
                            rowNetPnl += pnl;
                            rowTradesCount += dayData.count;
                        }

                        rowDaysHtml += `
                            <div class="month-day-cell ${isToday ? 'today' : ''} ${cellTintClass}" data-date="${dStr}">
                                <div class="cell-top">
                                    <span class="cell-day-num mono">${currentDay}</span>
                                    ${badgeHtml}
                                </div>
                                <div class="cell-bottom">
                                    ${pnlHtml}
                                </div>
                            </div>
                        `;
                    }
                    currentDay++;
                }
            }

            // 8th Cell: Weekly Total for this row
            const rowPnlClass = State.getPnlClass(rowNetPnl);
            const rowPnlText = State.formatCurrency(rowNetPnl);
            const rowTradesBadge = `${rowTradesCount} ${rowTradesCount === 1 ? STRINGS.calendar.tradeSingleBadge : STRINGS.calendar.tradesBadge}`;

            const rowTotalCellHtml = `
                <div class="month-day-cell week-total-cell">
                    <div class="cell-top">
                        <span style="font-size: 11px; font-weight: 800; color: var(--color-accent);">WEEK ${weekRowIndex}</span>
                        <span class="cell-badge-count mono">${rowTradesBadge}</span>
                    </div>
                    <div class="cell-bottom">
                        <span class="cell-pnl-val mono ${rowPnlClass}">${rowPnlText}</span>
                    </div>
                </div>
            `;

            matrixHtml += rowDaysHtml + rowTotalCellHtml;
            weekRowIndex++;
        }

        container.innerHTML = `
            <div class="week-nav-bar">
                <div class="nav-controls-group">
                    <button class="btn-ctrl" id="btn-month-prev" title="Previous Month">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <span class="nav-title-text">${monthName} ${year}</span>
                    <button class="btn-ctrl" id="btn-month-next" title="Next Month">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                    <button class="btn-pill" id="btn-month-today">${STRINGS.calendar.thisMonth}</button>
                </div>
                <div class="section-summary-badge">
                    <span class="mono ${State.getPnlClass(totalNetPnl)}" style="font-size: 15px; font-weight: 800;">${State.formatCurrency(totalNetPnl)}</span>
                    <span class="mono" style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">· ${totalTrades} ${totalTrades === 1 ? STRINGS.calendar.tradeSingleBadge : STRINGS.calendar.tradesBadge}</span>
                </div>
            </div>
            <div class="month-grid-wrapper">
                <div class="month-weekdays-row">
                    ${STRINGS.days.short3.map((d, idx) => `<span class="${idx >= 5 ? 'col-weekend' : ''}">${d}</span>`).join('')}
                    <span class="col-week">${STRINGS.calendar.weekCol}</span>
                </div>
                <div class="month-days-matrix">
                    ${matrixHtml}
                </div>
            </div>
        `;

        document.getElementById('btn-month-prev')?.addEventListener('click', () => {
            let nextM = month - 1, nextY = year;
            if (nextM < 1) { nextM = 12; nextY--; }
            this.loadMonth(nextY, nextM);
        });
        document.getElementById('btn-month-next')?.addEventListener('click', () => {
            let nextM = month + 1, nextY = year;
            if (nextM > 12) { nextM = 1; nextY++; }
            this.loadMonth(nextY, nextM);
        });
        document.getElementById('btn-month-today')?.addEventListener('click', () => {
            const now = new Date();
            this.loadMonth(now.getFullYear(), now.getMonth() + 1);
        });

        container.querySelectorAll('.month-day-cell:not(.empty):not(.week-total-cell):not(.weekend-cell)').forEach(cell => {
            cell.addEventListener('click', () => {
                const dStr = cell.getAttribute('data-date');
                if (dStr) DayModal.open(dStr);
            });
        });
    },

    // -------------------------------------------------------------
    // 3. YEAR SECTION
    // -------------------------------------------------------------
    async loadYear(year) {
        State.currentYear = year;
        const container = document.getElementById('sec-year-container');
        if (!container) return;

        try {
            const data = await API.fetchYearCalendar(year);
            this.renderYear(data, container, year);
        } catch (err) {
            console.error("Error loading year:", err);
            container.innerHTML = `<div style="color: var(--color-loss); padding: 20px;">${STRINGS.common.errorLoading}</div>`;
        }
    },

    renderYear(data, container, year) {
        const dailyMap = data.daily || {};
        const monthlyTotals = data.monthly || [];
        const totalNetPnl = data.total_net_pnl || 0;
        const totalTrades = data.total_trades || 0;

        let monthsHtml = '';
        for (let m = 1; m <= 12; m++) {
            const monthName = STRINGS.months.short[m - 1];
            const mTotal = monthlyTotals.find(item => item.month === m) || { net_pnl: 0, trades_count: 0 };
            const mPnl = mTotal.net_pnl;
            const mTrades = mTotal.trades_count || 0;
            const mTradesBadge = `${mTrades} ${mTrades === 1 ? STRINGS.calendar.tradeSingleBadge : STRINGS.calendar.tradesBadge}`;
            const mPnlClass = State.getPnlClass(mPnl);

            const daysInMonth = new Date(year, m, 0).getDate();
            const firstDayObj = new Date(year, m - 1, 1);
            let firstDayOfWeek = firstDayObj.getDay() - 1;
            if (firstDayOfWeek < 0) firstDayOfWeek = 6;

            let daysHtml = '';
            for (let e = 0; e < firstDayOfWeek; e++) {
                daysHtml += `<div class="annual-day-dot empty"></div>`;
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const dStr = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayData = dailyMap[dStr];

                let dotClass = 'annual-day-dot';
                let titleAttr = `${dStr}`;

                if (dayData && dayData.count > 0) {
                    dotClass += ' has-trades';
                    if (dayData.pnl > 0) dotClass += ' win';
                    else if (dayData.pnl < 0) dotClass += ' loss';
                    titleAttr = `${dStr}: ${State.formatCurrency(dayData.pnl)} (${dayData.count} trades)`;
                }

                daysHtml += `<div class="${dotClass}" data-date="${dStr}" title="${titleAttr}">${d}</div>`;
            }

            monthsHtml += `
                <div class="annual-mini-month" data-month="${m}">
                    <div class="annual-month-header">
                        <span>${monthName}</span>
                        <span class="mono">
                            <span class="${mPnlClass}">${State.formatCurrency(mPnl)}</span>
                            <span style="font-size: 10px; font-weight: 600; color: var(--text-secondary);"> · ${mTradesBadge}</span>
                        </span>
                    </div>
                    <div class="annual-weekdays">
                        ${STRINGS.days.shortMonSun.map(d => `<span>${d}</span>`).join('')}
                    </div>
                    <div class="annual-days-grid">
                        ${daysHtml}
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="week-nav-bar">
                <div class="nav-controls-group">
                    <button class="btn-ctrl" id="btn-year-prev" title="Previous Year">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <span class="nav-title-text">${STRINGS.calendar.yearHeader} ${year}</span>
                    <button class="btn-ctrl" id="btn-year-next" title="Next Year">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                </div>
                <div class="section-summary-badge">
                    <span class="mono ${State.getPnlClass(totalNetPnl)}" style="font-size: 15px; font-weight: 800;">${State.formatCurrency(totalNetPnl)}</span>
                    <span class="mono" style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">· ${totalTrades} ${totalTrades === 1 ? STRINGS.calendar.tradeSingleBadge : STRINGS.calendar.tradesBadge}</span>
                </div>
            </div>

            <div class="annual-months-grid">
                ${monthsHtml}
            </div>
        `;

        document.getElementById('btn-year-prev')?.addEventListener('click', () => {
            this.loadYear(year - 1);
        });
        document.getElementById('btn-year-next')?.addEventListener('click', () => {
            this.loadYear(year + 1);
        });

        container.querySelectorAll('.annual-day-dot.has-trades').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const dStr = el.getAttribute('data-date');
                if (dStr) DayModal.open(dStr);
            });
        });

        container.querySelectorAll('.annual-mini-month').forEach(el => {
            el.addEventListener('click', () => {
                const m = parseInt(el.getAttribute('data-month'), 10);
                if (m) {
                    this.loadMonth(year, m);
                    // Smooth scroll to month section
                    const monthSec = document.getElementById('sec-month-container');
                    if (monthSec) {
                        monthSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            });
        });
    }
};

window.CalendarPage = CalendarPage;
