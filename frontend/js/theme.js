/**
 * Theme Switcher Controller (Light Default / Dark / System)
 */
const ThemeManager = {
    currentTheme: 'light', // 'light' | 'dark' | 'system'

    init() {
        const saved = (typeof SettingsManager !== 'undefined' ? SettingsManager.get('theme', 'light') : null) ||
            localStorage.getItem('ib_journal_theme') || 'light';
        this.setTheme(saved, false);

        // Listen for OS system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (this.currentTheme === 'system') {
                this.applySystemTheme();
            }
        });

        // Bind theme switcher buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.getAttribute('data-theme-val');
                if (theme) this.setTheme(theme, true);
            });
        });
    },

    setTheme(theme, save = true) {
        this.currentTheme = theme;
        if (save) {
            localStorage.setItem('ib_journal_theme', theme);
            if (typeof SettingsManager !== 'undefined') {
                SettingsManager.set('theme', theme);
            }
        }

        if (theme === 'system') {
            this.applySystemTheme();
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }

        // Update active button state
        document.querySelectorAll('.theme-btn').forEach(btn => {
            if (btn.getAttribute('data-theme-val') === theme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: this.currentTheme } }));
    },

    applySystemTheme() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: 'system', effective: prefersDark ? 'dark' : 'light' } }));
    }
};

window.ThemeManager = ThemeManager;
