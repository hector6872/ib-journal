/**
 * Import Modal & Sync Gap Controller
 * Handles manual CSV / XML file uploads, drag & drop, and desync warning resolution.
 */
const ImportModal = {
    isImporting: false,

    init() {
        const backdrop = document.getElementById('import-modal-backdrop');
        const closeBtn = document.getElementById('import-modal-close-btn');
        const cancelBtn = document.getElementById('import-modal-cancel-btn');
        const openBtn = document.getElementById('btn-open-import');
        const browseBtn = document.getElementById('btn-browse-file');
        const fileInput = document.getElementById('import-file-input');
        const dropzone = document.getElementById('import-dropzone');

        if (!backdrop) return;

        // Open handler
        if (openBtn) {
            openBtn.addEventListener('click', () => {
                if (State.syncStatus && State.syncStatus.is_syncing) {
                    if (typeof App !== 'undefined' && App.showAlertModal) {
                        App.showAlertModal({
                            title: "Sync in Progress",
                            message: STRINGS.import?.importBlockedBySync || "A synchronization is in progress. Please wait until sync finishes."
                        });
                    }
                    return;
                }
                const gapInfo = (typeof State !== 'undefined' && State.syncStatus)
                    ? { has_gap: State.syncStatus.has_sync_gap, days: State.syncStatus.gap_days }
                    : null;
                this.show(gapInfo);
            });
        }

        // Close handlers (strictly blocked during importing)
        const closeModal = () => {
            if (this.isImporting) return;
            this.hide();
        };

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        backdrop.addEventListener('click', (e) => {
            if (this.isImporting) return;
            if (e.target === backdrop) closeModal();
        });

        // Close on ESC (strictly blocked during importing)
        document.addEventListener('keydown', (e) => {
            if (this.isImporting) return;
            if (e.key === 'Escape' && backdrop && (backdrop.classList.contains('open') || backdrop.classList.contains('active'))) {
                closeModal();
            }
        });

        // Dismiss Gap Handler
        const dismissGapBtn = document.getElementById('btn-dismiss-gap');
        if (dismissGapBtn) {
            dismissGapBtn.addEventListener('click', async () => {
                if (this.isImporting) return;
                try {
                    dismissGapBtn.disabled = true;
                    dismissGapBtn.textContent = "Resolving...";
                    await API.resolveSyncGap();
                    const gapAlert = document.getElementById('import-sync-gap-alert');
                    if (gapAlert) gapAlert.classList.add('hidden');
                    if (typeof StatsController !== 'undefined') {
                        await StatsController.updateSyncStatus();
                    }
                    this.hide();
                } catch (err) {
                    if (typeof App !== 'undefined' && App.showErrorModal) {
                        App.showErrorModal("Gap Resolution Error", err.message);
                    } else {
                        console.error("Could not resolve sync gap:", err);
                    }
                } finally {
                    dismissGapBtn.disabled = false;
                    dismissGapBtn.textContent = STRINGS.import?.gapDismissBtn || "✓ No trades during this period (Dismiss warning)";
                }
            });
        }

        // Browse button
        if (browseBtn && fileInput) {
            browseBtn.addEventListener('click', () => {
                if (this.isImporting) return;
                fileInput.click();
            });
        }

        // File input change
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (this.isImporting) return;
                const files = e.target.files;
                if (files && files.length > 0) {
                    this.handleFiles(files);
                }
            });
        }

        // Drag & Drop
        if (dropzone) {
            ['dragenter', 'dragover'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!this.isImporting) {
                        dropzone.classList.add('dragover');
                    }
                });
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.remove('dragover');
                });
            });

            dropzone.addEventListener('drop', (e) => {
                if (this.isImporting) return;
                const dt = e.dataTransfer;
                const files = dt ? dt.files : null;
                if (files && files.length > 0) {
                    this.handleFiles(files);
                }
            });
        }
    },

    show(gapInfo = null) {
        const backdrop = document.getElementById('import-modal-backdrop');
        const gapAlert = document.getElementById('import-sync-gap-alert');
        const gapDesc = document.getElementById('import-gap-desc');
        const statusBox = document.getElementById('import-status-box');

        if (!backdrop) return;

        if (statusBox && !this.isImporting) {
            statusBox.style.display = 'none';
            statusBox.innerHTML = '';
        }

        if (gapInfo && gapInfo.has_gap) {
            if (gapAlert) gapAlert.classList.remove('hidden');
            if (gapDesc) {
                if (gapInfo.from && gapInfo.to) {
                    const fromDate = gapInfo.from.split('T')[0];
                    const toDate = gapInfo.to.split('T')[0];
                    gapDesc.textContent = `A ${gapInfo.days}-day desync gap was detected between ${fromDate} and ${toDate}. Automated IBKR Flex Queries only cover recent days. Please import your historical CSV or XML activity statement.`;
                } else if (gapInfo.days && gapInfo.days > 0) {
                    gapDesc.textContent = `Your last synchronization or recorded trade has a ${gapInfo.days}-day gap. Please import your CSV or XML statement to prevent missing past trades.`;
                } else {
                    gapDesc.textContent = STRINGS.import?.gapDesc || `Please import your historical CSV or XML statement.`;
                }
            }
        } else {
            if (gapAlert) gapAlert.classList.add('hidden');
        }

        backdrop.classList.add('open');
        backdrop.classList.add('active');
    },

    hide() {
        if (this.isImporting) return; // Disallow closing during active import
        const backdrop = document.getElementById('import-modal-backdrop');
        if (backdrop) {
            backdrop.classList.remove('open');
            backdrop.classList.remove('active');
        }
    },

    setLockState(locked) {
        this.isImporting = locked;
        if (typeof State !== 'undefined') State.isImporting = locked;

        const closeBtn = document.getElementById('import-modal-close-btn');
        const cancelBtn = document.getElementById('import-modal-cancel-btn');
        const dropzone = document.getElementById('import-dropzone');
        const fileInput = document.getElementById('import-file-input');
        const browseBtn = document.getElementById('btn-browse-file');
        const dismissGapBtn = document.getElementById('btn-dismiss-gap');

        if (closeBtn) {
            closeBtn.disabled = locked;
            closeBtn.style.opacity = locked ? '0.3' : '1';
            closeBtn.style.cursor = locked ? 'not-allowed' : 'pointer';
            closeBtn.style.pointerEvents = locked ? 'none' : 'auto';
        }

        if (cancelBtn) {
            cancelBtn.disabled = locked;
            cancelBtn.style.opacity = locked ? '0.3' : '1';
            cancelBtn.style.cursor = locked ? 'not-allowed' : 'pointer';
            cancelBtn.style.pointerEvents = locked ? 'none' : 'auto';
            cancelBtn.textContent = locked ? (STRINGS.import?.importingFiles || "Importing...") : (STRINGS.import?.closeBtn || "Close");
        }

        if (dropzone) {
            dropzone.style.opacity = locked ? '0.4' : '1';
            dropzone.style.pointerEvents = locked ? 'none' : 'auto';
        }

        if (browseBtn) {
            browseBtn.disabled = locked;
            browseBtn.style.opacity = locked ? '0.4' : '1';
            browseBtn.style.cursor = locked ? 'not-allowed' : 'pointer';
            browseBtn.style.pointerEvents = locked ? 'none' : 'auto';
        }
        if (fileInput) fileInput.disabled = locked;

        if (dismissGapBtn) {
            dismissGapBtn.disabled = locked;
            dismissGapBtn.style.opacity = locked ? '0.35' : '1';
            dismissGapBtn.style.cursor = locked ? 'not-allowed' : 'pointer';
            dismissGapBtn.style.pointerEvents = locked ? 'none' : 'auto';
        }

        // Re-render sync widget to reflect lock state
        if (typeof StatsController !== 'undefined' && StatsController.renderSyncWidget && State.syncStatus) {
            StatsController.renderSyncWidget(State.syncStatus);
        }
    },

    async handleFiles(files) {
        const statusBox = document.getElementById('import-status-box');
        const fileInput = document.getElementById('import-file-input');

        if (!statusBox || files.length === 0) return;

        this.setLockState(true);

        statusBox.style.display = 'block';
        statusBox.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; color: var(--color-accent); font-weight: 600; padding: 6px 0;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinning"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                <span>${STRINGS.import?.importingFiles || 'Importing statement(s)...'} (${files.length})</span>
            </div>
        `;

        let totalImported = 0;
        let totalCashImported = 0;
        let lastResult = null;
        let errors = [];

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    const text = await this.readFileAsText(file);
                    const res = await API.importTrades(text);
                    lastResult = res;
                    totalImported += (res.trades_count || 0);
                    totalCashImported += (res.cash_count || 0);
                    if (res.currency_symbol) {
                        State.currency = res.currency_symbol;
                        if (typeof STRINGS !== 'undefined' && STRINGS.common) {
                            STRINGS.common.currency = res.currency_symbol;
                        }
                    }
                } catch (err) {
                    errors.push(`${file.name}: ${err.message}`);
                }
            }
        } finally {
            this.setLockState(false);
            if (fileInput) fileInput.value = '';
        }

        if (errors.length > 0) {
            statusBox.innerHTML = `
                <div style="color: var(--color-loss); font-weight: 600; margin-bottom: 4px;">${STRINGS.import?.errorsTitle || 'Import finished with errors:'}</div>
                <ul style="font-size: 11px; color: var(--text-muted); margin-left: 16px;">
                    ${errors.map(e => `<li>${e}</li>`).join('')}
                </ul>
            `;
        } else {
            let summaryParts = [];
            if (totalImported > 0) summaryParts.push(`${totalImported} ${STRINGS.calendar?.tradesBadge || 'trades'}`);
            if (totalCashImported > 0) summaryParts.push(`${totalCashImported} cash transfers`);
            const summaryText = summaryParts.length > 0 ? summaryParts.join(' & ') : `0 ${STRINGS.calendar?.tradesBadge || 'trades'}`;

            let currencyNoticeHtml = '';
            if (lastResult && lastResult.currency_changed) {
                currencyNoticeHtml = `
                    <div style="margin-top: 6px; padding: 6px 10px; background: rgba(59, 130, 246, 0.1); border-left: 3px solid var(--color-accent); border-radius: 4px; font-size: 12px; color: var(--text-primary);">
                        💱 <strong>Base currency updated:</strong> ${lastResult.prev_currency} → <strong>${lastResult.base_currency} (${lastResult.currency_symbol})</strong>. All metrics and charts updated.
                    </div>
                `;
            } else if (lastResult && lastResult.base_currency) {
                currencyNoticeHtml = `
                    <div style="margin-top: 4px; font-size: 11px; color: var(--text-muted);">
                        Base currency: <strong>${lastResult.base_currency} (${lastResult.currency_symbol || '$'})</strong>
                    </div>
                `;
            }

            statusBox.innerHTML = `
                <div style="color: var(--color-profit); font-weight: 700;">
                    ✓ ${STRINGS.import?.successMsg || 'Successfully processed statement.'} (${summaryText})
                </div>
                ${currencyNoticeHtml}
            `;
            // Refresh current view & sync status
            setTimeout(async () => {
                if (typeof StatsController !== 'undefined') {
                    await StatsController.updateOverview();
                    await StatsController.updateSyncStatus();
                }
                if (typeof App !== 'undefined') {
                    if (App.activeTab === 'calendar' && typeof CalendarPage !== 'undefined') {
                        CalendarPage.loadAll();
                    } else if (typeof StatsPage !== 'undefined') {
                        StatsPage.load();
                    }
                }
            }, 800);
        }
    },

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsText(file, "UTF-8");
        });
    }
};

window.ImportModal = ImportModal;
