/**
 * Import Modal & Sync Gap Controller
 * Handles manual CSV / XML file uploads, drag & drop, and desync warning resolution.
 */
const ImportModal = {
    init() {
        const backdrop = document.getElementById('import-modal-backdrop');
        const closeBtn = document.getElementById('import-modal-close-btn');
        const cancelBtn = document.getElementById('import-modal-cancel-btn');
        const browseBtn = document.getElementById('btn-browse-file');
        const fileInput = document.getElementById('import-file-input');
        const dropzone = document.getElementById('import-dropzone');

        if (!backdrop) return;

        // Close handlers
        const closeModal = () => this.hide();
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeModal();
        });

        // Browse button
        if (browseBtn && fileInput) {
            browseBtn.addEventListener('click', () => fileInput.click());
        }

        // File input change
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
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
                    dropzone.classList.add('dragover');
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

        if (statusBox) {
            statusBox.style.display = 'none';
            statusBox.innerHTML = '';
        }

        if (gapInfo && gapInfo.has_gap) {
            if (gapAlert) gapAlert.classList.remove('hidden');
            if (gapDesc) {
                gapDesc.textContent = `Tu última sincronización o trade registrado tiene una brecha de ${gapInfo.days} días. Dado que la Flex Query de IBKR suele cubrir 7 días, importa el extracto CSV o XML para no perder operaciones pasadas.`;
            }
        } else {
            if (gapAlert) gapAlert.classList.add('hidden');
        }

        backdrop.classList.add('active');
    },

    hide() {
        const backdrop = document.getElementById('import-modal-backdrop');
        if (backdrop) backdrop.classList.remove('active');
    },

    async handleFiles(files) {
        const statusBox = document.getElementById('import-status-box');
        if (!statusBox) return;

        statusBox.style.display = 'block';
        statusBox.innerHTML = `<div style="color: var(--color-accent); font-weight: 600;">Importing ${files.length} file(s)...</div>`;

        let totalImported = 0;
        let errors = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const text = await this.readFileAsText(file);
                const res = await API.importTrades(text);
                totalImported += (res.trades_count || 0);
            } catch (err) {
                errors.push(`${file.name}: ${err.message}`);
            }
        }

        if (errors.length > 0) {
            statusBox.innerHTML = `
                <div style="color: var(--color-loss); font-weight: 600; margin-bottom: 4px;">Import finished with errors:</div>
                <ul style="font-size: 11px; color: var(--text-muted); margin-left: 16px;">
                    ${errors.map(e => `<li>${e}</li>`).join('')}
                </ul>
            `;
        } else {
            statusBox.innerHTML = `
                <div style="color: var(--color-profit); font-weight: 700;">
                    ✓ Successfully imported and updated ${totalImported} trades!
                </div>
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
