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

        if (!this._themeBound) {
            this._themeBound = true;
            window.addEventListener('themeChanged', () => {
                this.updateAllChartsTheme();
            });
        }
    },

    charts: {},

    updateAllChartsTheme() {
        Object.keys(this.charts).forEach(k => {
            if (this.charts[k]) {
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                const textColor = isDark ? '#94a3b8' : '#868e96';
                const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

                if (this.charts[k].options?.scales?.x) {
                    this.charts[k].options.scales.x.ticks.color = textColor;
                }
                if (this.charts[k].options?.scales?.yPnl) {
                    this.charts[k].options.scales.yPnl.ticks.color = textColor;
                    this.charts[k].options.scales.yPnl.grid.color = gridColor;
                }
                if (this.charts[k].options?.scales?.yTrades) {
                    this.charts[k].options.scales.yTrades.ticks.color = textColor;
                }
                this.charts[k].update('none');
            }
        });
    },

    computePeriodStats(items, fallbackDays = null, extraStats = {}) {
        let totalTrades = 0;
        let totalNetPnl = 0;
        let grossProfit = 0;
        let grossLoss = 0;
        let winningTrades = 0;
        let losingTrades = 0;
        let activeDays = 0;

        let runningCum = 0;
        let peak = 0;
        let maxDrawdown = 0;

        items.forEach(item => {
            const pnl = item.pnl !== undefined ? item.pnl : (item.net_pnl || 0);
            const count = item.count !== undefined ? item.count : (item.trades_count || 0);
            totalTrades += count;
            totalNetPnl += pnl;

            if (count > 0 || pnl !== 0) {
                activeDays++;
            }

            if (pnl > 0) {
                grossProfit += pnl;
                winningTrades += (item.wins !== undefined ? item.wins : (count > 0 ? count : 1));
            } else if (pnl < 0) {
                grossLoss += Math.abs(pnl);
                losingTrades += (item.losses !== undefined ? item.losses : (count > 0 ? count : 1));
            }

            runningCum += pnl;
            if (runningCum > peak) peak = runningCum;
            const dd = peak - runningCum;
            if (dd > maxDrawdown) maxDrawdown = dd;
        });

        const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100) : 0;
        const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? grossProfit : 0);
        const avgWin = winningTrades > 0 ? (grossProfit / winningTrades) : 0;
        const avgLoss = losingTrades > 0 ? (grossLoss / losingTrades) : 0;
        const expectancy = totalTrades > 0 ? (totalNetPnl / totalTrades) : 0;
        const daysDivisor = fallbackDays || (activeDays > 0 ? activeDays : 1);
        const activity = totalTrades > 0 ? (totalTrades / daysDivisor).toFixed(1) : "0.0";

        const largestWin = extraStats.largestWin !== undefined ? extraStats.largestWin : 0;
        const largestLoss = extraStats.largestLoss !== undefined ? extraStats.largestLoss : 0;

        return {
            totalTrades,
            totalNetPnl: roundVal(totalNetPnl),
            grossProfit: roundVal(grossProfit),
            grossLoss: roundVal(grossLoss),
            winRate: winRate.toFixed(1),
            profitFactor: profitFactor.toFixed(2),
            avgWin: roundVal(avgWin),
            avgLoss: roundVal(avgLoss),
            largestWin: roundVal(largestWin),
            largestLoss: roundVal(largestLoss),
            expectancy: roundVal(expectancy),
            maxDrawdown: roundVal(maxDrawdown),
            activity,
            activeDays
        };

        function roundVal(v) {
            return Math.round(v * 100) / 100;
        }
    },

    buildDockHtml(sectionId, stats) {
        const hasTrades = stats.totalTrades > 0;
        let pnlColorVar = 'var(--text-muted)';
        if (hasTrades) {
            if (stats.totalNetPnl > 0) pnlColorVar = 'var(--color-profit)';
            else if (stats.totalNetPnl < 0) pnlColorVar = 'var(--color-loss)';
        }

        const expClass = State.getPnlClass(stats.expectancy);
        const winRateClass = !hasTrades ? 'pnl-neutral' : (parseFloat(stats.winRate) > 50 ? 'pnl-positive' : (parseFloat(stats.winRate) < 50 && parseFloat(stats.winRate) > 0 ? 'pnl-negative' : 'pnl-neutral'));
        const pfClass = !hasTrades ? 'pnl-neutral' : (parseFloat(stats.profitFactor) >= 1 ? 'pnl-positive' : 'pnl-negative');

        const avgWinDisplay = stats.avgWin > 0
            ? `<span class="pnl-positive">+${State.currency}${stats.avgWin.toFixed(2)}</span>`
            : `<span class="pnl-neutral">${State.currency}0.00</span>`;

        const avgLossDisplay = stats.avgLoss > 0
            ? `<span class="pnl-negative">-${State.currency}${stats.avgLoss.toFixed(2)}</span>`
            : `<span class="pnl-neutral">${State.currency}0.00</span>`;

        let riskStatHtml = '';
        if (sectionId === 'year') {
            const maxDdDisplay = stats.maxDrawdown > 0
                ? `<span class="pnl-negative">-${State.currency}${stats.maxDrawdown.toFixed(2)}</span>`
                : `<span class="pnl-neutral">${State.currency}0.00</span>`;

            riskStatHtml = `
                <div class="dock-stat-item">
                    <span class="dock-stat-label">${STRINGS.calendar.maxDrawdownLabel || "Max Drawdown"}</span>
                    <span class="dock-stat-val mono">${maxDdDisplay}</span>
                </div>
            `;
        } else {
            // Week and Month views: Best / Worst Trade
            const bestWin = stats.largestWin || 0;
            const worstLoss = stats.largestLoss || 0;

            const bestWinDisplay = bestWin > 0
                ? `<span class="pnl-positive">+${State.currency}${bestWin.toFixed(2)}</span>`
                : `<span class="pnl-neutral">${State.currency}0.00</span>`;

            const worstLossDisplay = worstLoss < 0
                ? `<span class="pnl-negative">-${State.currency}${Math.abs(worstLoss).toFixed(2)}</span>`
                : (worstLoss > 0
                    ? `<span class="pnl-negative">-${State.currency}${worstLoss.toFixed(2)}</span>`
                    : `<span class="pnl-neutral">${State.currency}0.00</span>`);

            riskStatHtml = `
                <div class="dock-stat-item">
                    <span class="dock-stat-label">${STRINGS.calendar.bestWorstTradeLabel || "Best / Worst"}</span>
                    <span class="dock-stat-val mono" style="font-size: 11px;">
                        ${bestWinDisplay} / ${worstLossDisplay}
                    </span>
                </div>
            `;
        }

        return `
            <div class="section-analytics-dock">
                <div class="analytics-dock-header">
                    <div class="analytics-dock-title">
                        <span>${STRINGS.calendar.evolutionTitle || "Performance & Volume Evolution"}</span>
                    </div>
                    <div class="analytics-dock-legend">
                        <div class="dock-legend-item">
                            <span class="dock-legend-line" style="background-color: ${pnlColorVar};"></span>
                            <span>${STRINGS.calendar.cumPnlLabel || "Cumulative P&L"}</span>
                        </div>
                        <div class="dock-legend-item">
                            <span class="dock-legend-bar"></span>
                            <span>${STRINGS.calendar.tradesLabel || "Trades"}</span>
                        </div>
                    </div>
                </div>

                <div class="analytics-dock-body">
                    <div class="dock-chart-wrapper">
                        <canvas id="chart-cal-${sectionId}"></canvas>
                    </div>
                    <div class="dock-stats-panel">
                        <div class="dock-stats-grid">
                            <div class="dock-stat-item">
                                <span class="dock-stat-label">${STRINGS.calendar.expectancyLabel || "Expectancy / Op"}</span>
                                <span class="dock-stat-val mono ${expClass}">${State.formatCurrency(stats.expectancy)}</span>
                            </div>
                            <div class="dock-stat-item">
                                <span class="dock-stat-label">${STRINGS.calendar.winRateLabel || "Win Rate"}</span>
                                <span class="dock-stat-val mono ${winRateClass}">${hasTrades ? `${stats.winRate}%` : '0.0%'}</span>
                            </div>
                            <div class="dock-stat-item">
                                <span class="dock-stat-label">${STRINGS.calendar.profitFactorLabel || "Profit Factor"}</span>
                                <span class="dock-stat-val mono ${pfClass}">${hasTrades ? stats.profitFactor : '0.00'}</span>
                            </div>
                            <div class="dock-stat-item">
                                <span class="dock-stat-label">${STRINGS.calendar.avgWinLossLabel || "Avg Win / Loss"}</span>
                                <span class="dock-stat-val mono" style="font-size: 11px;">
                                    ${avgWinDisplay} / ${avgLossDisplay}
                                </span>
                            </div>
                            ${riskStatHtml}
                            <div class="dock-stat-item">
                                <span class="dock-stat-label">${STRINGS.calendar.activityLabel || "Activity"}</span>
                                <span class="dock-stat-val mono ${hasTrades ? '' : 'pnl-neutral'}">${stats.activity} <span style="font-size: 9.5px; color: var(--text-muted); font-weight: 500;">${STRINGS.calendar?.tradesPerDayUnit || 'trades/day'}</span></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderDualAxisChart(canvasId, labels, cumPnlArray, tradesCountArray, totalPnl) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (this.charts[canvasId]) {
            try { this.charts[canvasId].destroy(); } catch (e) {}
            delete this.charts[canvasId];
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#94a3b8' : '#868e96';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
        
        const hasTrades = tradesCountArray.some(c => c > 0) || totalPnl !== 0;
        let strokeColor, fillColor;

        if (!hasTrades) {
            strokeColor = isDark ? '#64748b' : '#94a3b8'; // Neutral muted gray
            fillColor = 'transparent';
        } else if (totalPnl > 0) {
            strokeColor = isDark ? '#22c55e' : '#00875a'; // Profit green
            fillColor = isDark ? 'rgba(34, 197, 94, 0.12)' : 'rgba(0, 135, 90, 0.08)';
        } else if (totalPnl < 0) {
            strokeColor = isDark ? '#ef4444' : '#d32f2f'; // Loss red
            fillColor = isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(211, 47, 47, 0.08)';
        } else {
            strokeColor = isDark ? '#64748b' : '#94a3b8';
            fillColor = 'transparent';
        }

        const barBg = isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(0, 102, 204, 0.2)';
        const barBorder = isDark ? 'rgba(56, 189, 248, 0.7)' : 'rgba(0, 102, 204, 0.6)';

        const maxTrades = Math.max(...tradesCountArray, 1);

        this.charts[canvasId] = new Chart(canvas, {
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: STRINGS.calendar.cumPnlLabel || 'Cumulative P&L',
                        data: cumPnlArray,
                        borderColor: strokeColor,
                        backgroundColor: fillColor,
                        fill: hasTrades,
                        tension: 0.25,
                        borderWidth: 2,
                        spanGaps: false,
                        pointRadius: function(context) {
                            const validPoints = cumPnlArray.filter(v => v !== null && v !== undefined);
                            return validPoints.length <= 1 ? 4 : (labels.length > 25 ? 2.5 : 3.5);
                        },
                        pointHoverRadius: 5.5,
                        pointBackgroundColor: strokeColor,
                        yAxisID: 'yPnl',
                        order: 1
                    },
                    {
                        type: 'bar',
                        label: STRINGS.calendar.tradesLabel || 'Trades',
                        data: tradesCountArray,
                        backgroundColor: barBg,
                        borderColor: barBorder,
                        borderWidth: 1,
                        borderRadius: 2,
                        barPercentage: 0.45,
                        yAxisID: 'yTrades',
                        order: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#1e283d' : '#ffffff',
                        titleColor: isDark ? '#f8fafc' : '#1a1e24',
                        bodyColor: isDark ? '#cbd5e1' : '#495057',
                        borderColor: isDark ? '#314261' : '#dee2e6',
                        borderWidth: 1,
                        padding: 10,
                        boxPadding: 4,
                        usePointStyle: true,
                        callbacks: {
                            label: function(context) {
                                if (context.dataset.yAxisID === 'yPnl') {
                                    if (context.parsed.y === null || context.parsed.y === undefined) return null;
                                    return ` ${STRINGS.calendar.cumPnlLabel || 'Cumulative P&L'}: ${State.formatCurrency(context.parsed.y)}`;
                                } else {
                                    const count = context.parsed.y;
                                    return ` ${STRINGS.calendar.tradesLabel || 'Trades'}: ${count} ${count === 1 ? 'trade' : 'trades'}`;
                                }
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: textColor,
                            font: { family: 'ui-monospace, SFMono-Regular, monospace', size: 10 }
                        }
                    },
                    yPnl: {
                        position: 'left',
                        suggestedMin: 0,
                        suggestedMax: 0,
                        grid: {
                            color: gridColor,
                            drawBorder: false
                        },
                        ticks: {
                            color: textColor,
                            font: { family: 'ui-monospace, SFMono-Regular, monospace', size: 10 },
                            callback: (val) => State.formatCurrency(val)
                        }
                    },
                    yTrades: {
                        position: 'right',
                        min: 0,
                        max: Math.ceil(maxTrades * 2.5),
                        grid: { display: false },
                        ticks: {
                            color: textColor,
                            font: { family: 'ui-monospace, SFMono-Regular, monospace', size: 9 },
                            stepSize: Math.max(1, Math.ceil(maxTrades / 2)),
                            callback: (val) => (val % 1 === 0 && val <= maxTrades * 1.5) ? `${val}` : ''
                        }
                    }
                }
            }
        });
    },

    getBounds() {
        const now = new Date();
        const nowYear = now.getFullYear();
        const nowMonth = now.getMonth() + 1; // 1 - 12
        
        // Monday of current week (normalized to 00:00:00)
        const nowWeekStart = new Date(now);
        const nowDow = (nowWeekStart.getDay() + 6) % 7; // Mon=0 .. Sun=6
        nowWeekStart.setDate(nowWeekStart.getDate() - nowDow);
        nowWeekStart.setHours(0, 0, 0, 0);

        const minDateStr = State.minTradeDate || (State.overviewStats && State.overviewStats.min_trade_date);
        
        if (!minDateStr) {
            return {
                minYear: nowYear,
                minMonth: nowMonth,
                minWeekStart: nowWeekStart,
                maxYear: nowYear,
                maxMonth: nowMonth,
                maxWeekStart: nowWeekStart
            };
        }

        const minParts = minDateStr.split('-');
        const minYear = parseInt(minParts[0], 10);
        const minMonth = parseInt(minParts[1], 10);
        const minDay = parseInt(minParts[2], 10);
        
        const minDate = new Date(minYear, minMonth - 1, minDay);
        const minDow = (minDate.getDay() + 6) % 7;
        const minWeekStart = new Date(minDate);
        minWeekStart.setDate(minWeekStart.getDate() - minDow);
        minWeekStart.setHours(0, 0, 0, 0);

        return {
            minYear,
            minMonth,
            minWeekStart,
            maxYear: nowYear,
            maxMonth: nowMonth,
            maxWeekStart: nowWeekStart
        };
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

        const start = new Date(data.start_date + 'T00:00:00');
        const end = new Date(data.end_date + 'T00:00:00');
        const startM = STRINGS.months.short[start.getMonth()];
        const endM = STRINGS.months.short[end.getMonth()];
        const year = start.getFullYear();
        const headerText = startM === endM
            ? `${STRINGS.calendar.weekOf} ${startM} ${start.getDate()} – ${end.getDate()}, ${year}`
            : `${STRINGS.calendar.weekOf} ${startM} ${start.getDate()} – ${endM} ${end.getDate()}, ${year}`;

        const todayStr = new Date().toISOString().split('T')[0];

        const bounds = this.getBounds();
        const canPrevWeek = start > bounds.minWeekStart;
        const canNextWeek = start < bounds.maxWeekStart;
        const isCurrentWeek = start.getTime() === bounds.maxWeekStart.getTime();

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

        // Compute cumulative PnL & trade counts for weekly chart
        const weekLabels = [];
        const weekCumPnl = [];
        const weekTrades = [];
        let runningPnl = 0;
        const todayIso = new Date().toISOString().split('T')[0];

        days.forEach(d => {
            weekLabels.push(`${STRINGS.days.short3[d.weekday_index]} ${d.day_number}`);
            weekTrades.push(d.trades_count || 0);

            const isFuture = d.date > todayIso;
            if (!isFuture) {
                runningPnl += (d.pnl || 0);
                weekCumPnl.push(Math.round(runningPnl * 100) / 100);
            } else {
                weekCumPnl.push(null);
            }
        });

        const weekStats = this.computePeriodStats(days, null, { largestWin: data.largest_win, largestLoss: data.largest_loss });
        const dockHtml = this.buildDockHtml('week', weekStats);

        container.innerHTML = `
            <div class="week-nav-bar">
                <div class="nav-controls-group">
                    <button class="btn-ctrl" id="btn-week-prev" title="Previous Week" ${!canPrevWeek ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <span class="nav-title-text">${headerText}</span>
                    <button class="btn-ctrl" id="btn-week-next" title="Next Week" ${!canNextWeek ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                    <button class="btn-pill" id="btn-week-today" ${isCurrentWeek ? 'disabled' : ''}>${STRINGS.calendar.thisWeek}</button>
                </div>
            </div>
            <div class="week-cards-row">
                ${cardsHtml}
                ${totalCardHtml}
            </div>
            ${dockHtml}
        `;

        // Render Chart.js
        this.renderDualAxisChart('chart-cal-week', weekLabels, weekCumPnl, weekTrades, totalNetPnl);

        // Event listeners
        document.getElementById('btn-week-prev')?.addEventListener('click', () => {
            if (!canPrevWeek) return;
            const cur = new Date(data.start_date + 'T00:00:00');
            cur.setDate(cur.getDate() - 7);
            this.loadWeek(cur.toISOString().split('T')[0]);
        });
        document.getElementById('btn-week-next')?.addEventListener('click', () => {
            if (!canNextWeek) return;
            const cur = new Date(data.start_date + 'T00:00:00');
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

        const bounds = this.getBounds();
        const canPrevMonth = (year > bounds.minYear) || (year === bounds.minYear && month > bounds.minMonth);
        const canNextMonth = (year < bounds.maxYear) || (year === bounds.maxYear && month < bounds.maxMonth);
        const isCurrentMonth = (year === bounds.maxYear && month === bounds.maxMonth);

        const daysInMonth = new Date(year, month, 0).getDate();
        const firstDayObj = new Date(year, month - 1, 1);
        let firstDayOfWeek = firstDayObj.getDay() - 1;
        if (firstDayOfWeek < 0) firstDayOfWeek = 6; // Mon=0 ... Sun=6

        // Calculate Monday date of the first week row
        const firstMonday = new Date(year, month - 1, 1);
        const fDow = (firstMonday.getDay() + 6) % 7; // 0=Mon ... 6=Sun
        firstMonday.setDate(firstMonday.getDate() - fDow);

        // Build list of cells row by row (7 days + 1 weekly total)
        let matrixHtml = '';
        let currentDay = 1;
        let weekRowIndex = 1;

        while (currentDay <= daysInMonth) {
            let rowDaysHtml = '';
            let rowNetPnl = 0;
            let rowTradesCount = 0;

            const rowWeekDate = new Date(firstMonday);
            rowWeekDate.setDate(firstMonday.getDate() + (weekRowIndex - 1) * 7);
            const rowWeekDateStr = `${rowWeekDate.getFullYear()}-${String(rowWeekDate.getMonth() + 1).padStart(2, '0')}-${String(rowWeekDate.getDate()).padStart(2, '0')}`;

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

            // 8th Cell: Weekly Total for this row (clickable to jump to Week view)
            const rowPnlClass = State.getPnlClass(rowNetPnl);
            const rowPnlText = State.formatCurrency(rowNetPnl);
            const rowTradesBadge = `${rowTradesCount} ${rowTradesCount === 1 ? STRINGS.calendar.tradeSingleBadge : STRINGS.calendar.tradesBadge}`;

            const rowTotalCellHtml = `
                <div class="month-day-cell week-total-cell" data-week-date="${rowWeekDateStr}" title="${STRINGS.calendar.viewWeek || 'View Week'}">
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

        // Compute cumulative PnL & trade counts for monthly chart
        const monthLabels = [];
        const monthCumPnl = [];
        const monthTrades = [];
        let runningMonthPnl = 0;
        const monthItems = [];
        const todayIso = new Date().toISOString().split('T')[0];

        for (let d = 1; d <= daysInMonth; d++) {
            const dStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayData = dailyMap[dStr];
            const pnl = dayData ? (dayData.pnl || 0) : 0;
            const count = dayData ? (dayData.count || 0) : 0;
            const wins = dayData ? (dayData.wins || 0) : 0;
            const losses = dayData ? (dayData.losses || 0) : 0;

            monthLabels.push(`${d}`);
            monthTrades.push(count);

            const isFuture = dStr > todayIso;
            if (!isFuture) {
                runningMonthPnl += pnl;
                monthCumPnl.push(Math.round(runningMonthPnl * 100) / 100);
            } else {
                monthCumPnl.push(null);
            }

            monthItems.push({ pnl, count, wins, losses, date: dStr });
        }

        const monthStats = this.computePeriodStats(monthItems.filter(item => item.count > 0 || item.pnl !== 0), null, { largestWin: data.largest_win, largestLoss: data.largest_loss });
        const monthDockHtml = this.buildDockHtml('month', monthStats);

        container.innerHTML = `
            <div class="week-nav-bar">
                <div class="nav-controls-group">
                    <button class="btn-ctrl" id="btn-month-prev" title="Previous Month" ${!canPrevMonth ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <span class="nav-title-text">${monthName} ${year}</span>
                    <button class="btn-ctrl" id="btn-month-next" title="Next Month" ${!canNextMonth ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                    <button class="btn-pill" id="btn-month-today" ${isCurrentMonth ? 'disabled' : ''}>${STRINGS.calendar.thisMonth}</button>
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
            ${monthDockHtml}
        `;

        // Render Chart.js
        this.renderDualAxisChart('chart-cal-month', monthLabels, monthCumPnl, monthTrades, totalNetPnl);

        document.getElementById('btn-month-prev')?.addEventListener('click', () => {
            if (!canPrevMonth) return;
            let nextM = month - 1, nextY = year;
            if (nextM < 1) { nextM = 12; nextY--; }
            this.loadMonth(nextY, nextM);
        });
        document.getElementById('btn-month-next')?.addEventListener('click', () => {
            if (!canNextMonth) return;
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

        // Click on weekly total cell to navigate/scroll to that week in Week section
        container.querySelectorAll('.month-day-cell.week-total-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                const wDate = cell.getAttribute('data-week-date');
                if (wDate) {
                    this.loadWeek(wDate);
                    const weekSec = document.getElementById('sec-week-container');
                    if (weekSec) {
                        weekSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
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

        const bounds = this.getBounds();
        const canPrevYear = year > bounds.minYear;
        const canNextYear = year < bounds.maxYear;

        let monthsHtml = '';
        for (let m = 1; m <= 12; m++) {
            const monthName = STRINGS.months.short[m - 1];
            const mTotal = monthlyTotals.find(item => item.month === m) || { net_pnl: 0, trades_count: 0 };
            const mPnl = mTotal.net_pnl;
            const mTrades = mTotal.trades_count || 0;
            const mTradesBadge = `${mTrades} ${mTrades === 1 ? STRINGS.calendar.tradeSingleBadge : STRINGS.calendar.tradesBadge}`;
            const mPnlClass = State.getPnlClass(mPnl);

            const isMonthInFuture = (year > bounds.maxYear) || (year === bounds.maxYear && m > bounds.maxMonth);
            const isMonthPreHistory = (year < bounds.minYear) || (year === bounds.minYear && m < bounds.minMonth);
            const isMonthDisabled = isMonthInFuture || isMonthPreHistory;

            const daysInMonth = new Date(year, m, 0).getDate();
            const firstDayObj = new Date(year, m - 1, 1);
            let firstDayOfWeek = firstDayObj.getDay() - 1;
            if (firstDayOfWeek < 0) firstDayOfWeek = 6;

            let daysHtml = '';
            for (let e = 0; e < firstDayOfWeek; e++) {
                const isWeekend = e === 5 || e === 6;
                daysHtml += `<div class="annual-day-dot empty ${isWeekend ? 'weekend' : ''}"></div>`;
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const dow = (firstDayOfWeek + d - 1) % 7;
                const isWeekend = dow === 5 || dow === 6;
                const dStr = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayData = dailyMap[dStr];

                let dotClass = 'annual-day-dot';
                if (isWeekend) dotClass += ' weekend';
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
                <div class="annual-mini-month ${isMonthDisabled ? 'disabled-month' : ''}" data-month="${m}" data-disabled="${isMonthDisabled ? '1' : '0'}">
                    <div class="annual-month-header">
                        <span>${monthName}</span>
                        <span class="mono">
                            <span class="${mPnlClass}">${State.formatCurrency(mPnl)}</span>
                            <span style="font-size: 10px; font-weight: 600; color: var(--text-secondary);"> · ${mTradesBadge}</span>
                        </span>
                    </div>
                    <div class="annual-weekdays">
                        ${STRINGS.days.shortMonSun.map((d, idx) => `<span class="${idx >= 5 ? 'col-weekend' : ''}">${d}</span>`).join('')}
                    </div>
                    <div class="annual-days-grid">
                        ${daysHtml}
                    </div>
                </div>
            `;
        }

        // Compute cumulative PnL & trade counts for annual chart
        const yearLabels = STRINGS.months.short;
        const yearCumPnl = [];
        const yearTrades = [];
        let runningYearPnl = 0;
        const yearItems = [];
        const nowObj = new Date();
        const currentYearNum = nowObj.getFullYear();
        const currentMonthNum = nowObj.getMonth() + 1;

        for (let m = 1; m <= 12; m++) {
            const mTotal = monthlyTotals.find(item => item.month === m) || { net_pnl: 0, trades_count: 0 };
            const pnl = mTotal.net_pnl || 0;
            const count = mTotal.trades_count || 0;

            const isFutureMonth = (year > currentYearNum) || (year === currentYearNum && m > currentMonthNum);
            if (!isFutureMonth) {
                runningYearPnl += pnl;
                yearCumPnl.push(Math.round(runningYearPnl * 100) / 100);
            } else {
                yearCumPnl.push(null);
            }

            yearTrades.push(count);
            yearItems.push({ pnl, count, month: m });
        }

        const activeDaysList = Object.values(dailyMap).map(d => ({ pnl: d.pnl, count: d.count, wins: d.wins, losses: d.losses }));
        const yearStats = this.computePeriodStats(activeDaysList.length > 0 ? activeDaysList : yearItems, null);
        const yearDockHtml = this.buildDockHtml('year', yearStats);

        container.innerHTML = `
            <div class="week-nav-bar">
                <div class="nav-controls-group">
                    <button class="btn-ctrl" id="btn-year-prev" title="Previous Year" ${!canPrevYear ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <span class="nav-title-text">${STRINGS.calendar.yearHeader} ${year}</span>
                    <button class="btn-ctrl" id="btn-year-next" title="Next Year" ${!canNextYear ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                    <button class="btn-pill" id="btn-year-today" ${year === bounds.maxYear ? 'disabled' : ''}>${STRINGS.calendar.thisYear}</button>
                </div>
                <div class="section-summary-badge">
                    <span class="mono ${State.getPnlClass(totalNetPnl)}" style="font-size: 15px; font-weight: 800;">${State.formatCurrency(totalNetPnl)}</span>
                    <span class="mono" style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">· ${totalTrades} ${totalTrades === 1 ? STRINGS.calendar.tradeSingleBadge : STRINGS.calendar.tradesBadge}</span>
                </div>
            </div>

            <div class="annual-months-grid">
                ${monthsHtml}
            </div>
            ${yearDockHtml}
        `;

        // Render Chart.js
        this.renderDualAxisChart('chart-cal-year', yearLabels, yearCumPnl, yearTrades, totalNetPnl);

        document.getElementById('btn-year-prev')?.addEventListener('click', () => {
            if (!canPrevYear) return;
            this.loadYear(year - 1);
        });
        document.getElementById('btn-year-next')?.addEventListener('click', () => {
            if (!canNextYear) return;
            this.loadYear(year + 1);
        });
        document.getElementById('btn-year-today')?.addEventListener('click', () => {
            this.loadYear(new Date().getFullYear());
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
                if (el.getAttribute('data-disabled') === '1') return;
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
