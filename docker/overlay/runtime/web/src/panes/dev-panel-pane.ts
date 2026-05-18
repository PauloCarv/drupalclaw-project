// @ts-nocheck
/**
 * dev-panel-pane.ts — Custom "Dev Panel" tabs pane for Drupal development.
 *
 * Renders a configurable toolbar of shortcut buttons. Config is loaded
 * dynamically from `.piclaw/dev-panel.json` in the workspace; if the
 * file is missing or invalid, falls back to built-in Drupal defaults.
 *
 * Button click → submits the command to the active chat via
 * /agent/default/message (no leading slash; the agent resolves the skill).
 */

import type { WebPaneExtension, PaneContext, PaneInstance, PaneCapability } from './pane-types.js';
import { sendAgentMessage, getWorkspaceFile } from '../api.js';

export const DEV_PANEL_TAB_PATH = 'piclaw://dev-panel';

const CONFIG_PATH = '.piclaw/dev-panel.json';

interface ButtonDef {
    label: string;
    command: string;
    hint?: string;
}

interface GroupDef {
    label?: string;
    buttons: ButtonDef[];
}

interface PanelConfig {
    title?: string;
    subtitle?: string;
    groups: GroupDef[];
}

const DEFAULT_CONFIG: PanelConfig = {
    title: 'Drupal Dev Panel',
    subtitle: 'Atalhos para desenvolvimento Drupal. Clique para executar.',
    groups: [
        {
            label: 'Stack',
            buttons: [
                { label: '🚀 Start Stack',   command: 'drupal-serve',          hint: 'Inicia PHP + nginx + BD (escolhe BD)' },
                { label: '⏹ Stop',           command: 'drupal-stack stop',     hint: 'Para containers (preserva dados)' },
                { label: '🔄 Restart',       command: 'drupal-stack restart',  hint: 'Reinicia containers' },
                { label: '📊 Status',        command: 'drupal-stack status',   hint: 'Estado dos containers' },
            ],
        },
        {
            label: 'Projecto',
            buttons: [
                { label: '🚀 Init',          command: 'drupal-init',     hint: 'Cria projecto Drupal via Composer' },
                { label: '🔄 Cache Rebuild', command: 'drupal-cr',       hint: 'Limpa caches (drush cr)' },
                { label: '📋 Status',        command: 'drupal-status',   hint: 'Estado do projecto e módulos' },
            ],
        },
        {
            label: 'Código',
            buttons: [
                { label: '📦 New Module',    command: 'drupal-module',   hint: 'Scaffolda módulo custom' },
                { label: '🧪 Analyze',       command: 'drupal-analyze',  hint: 'PHPStan + PHPCS no código custom' },
                { label: '🔧 Fix',           command: 'drupal-fix',      hint: 'Corrige erros detectados' },
                { label: '🧩 Install Module',command: 'drupal-install',  hint: 'Instala módulo contrib (requer nome)' },
            ],
        },
        {
            label: 'Base de Dados',
            buttons: [
                { label: '💾 DB Export',     command: 'drupal-db-export', hint: 'Exporta DB para ficheiro SQL' },
                { label: '📥 DB Import',     command: 'drupal-db-import', hint: 'Importa DB de ficheiro SQL' },
                { label: '🔍 DB Query',      command: 'drupal-db-query',  hint: 'Executa query SQL (requer query)' },
            ],
        },
        {
            label: 'Diagnóstico',
            buttons: [
                { label: '📋 Logs',          command: 'drupal-logs',     hint: 'Mostra últimos logs do watchdog' },
                { label: '🐛 Debug',         command: 'drupal-debug',    hint: 'Analisa e diagnostica erros recentes' },
                { label: '⚡ Performance',    command: 'drupal-perf',     hint: 'Analisa performance e bottlenecks' },
            ],
        },
    ],
};

function parseConfig(raw: unknown): PanelConfig | null {
    if (!raw || typeof raw !== 'object') return null;
    const src = raw as Record<string, unknown>;

    const normaliseButtons = (arr: unknown[]): ButtonDef[] => {
        const out: ButtonDef[] = [];
        for (const b of arr) {
            if (!b || typeof b !== 'object') continue;
            const bo = b as Record<string, unknown>;
            const label = typeof bo.label === 'string' ? bo.label : null;
            const command = typeof bo.command === 'string' ? bo.command : null;
            if (!label || !command) continue;
            const hint = typeof bo.hint === 'string' ? bo.hint : undefined;
            out.push({ label, command, hint });
        }
        return out;
    };

    const groups: GroupDef[] = [];
    if (Array.isArray(src.groups)) {
        for (const g of src.groups) {
            if (!g || typeof g !== 'object') continue;
            const go = g as Record<string, unknown>;
            const btns = Array.isArray(go.buttons) ? normaliseButtons(go.buttons) : [];
            if (!btns.length) continue;
            groups.push({ label: typeof go.label === 'string' ? go.label : undefined, buttons: btns });
        }
    } else if (Array.isArray((src as any).buttons)) {
        const btns = normaliseButtons((src as any).buttons);
        if (btns.length) groups.push({ buttons: btns });
    }

    if (!groups.length) return null;
    return {
        title: typeof src.title === 'string' ? src.title : undefined,
        subtitle: typeof src.subtitle === 'string' ? src.subtitle : undefined,
        groups,
    };
}

async function loadConfig(): Promise<{ config: PanelConfig; source: 'workspace' | 'default'; error?: string }> {
    try {
        const res = await getWorkspaceFile(CONFIG_PATH, 100_000, null);
        const content: string | undefined = res?.text ?? res?.content;
        if (typeof content !== 'string' || !content.trim()) {
            return { config: DEFAULT_CONFIG, source: 'default' };
        }
        let parsed: unknown;
        try { parsed = JSON.parse(content); }
        catch (e) {
            return { config: DEFAULT_CONFIG, source: 'default', error: `JSON inválido: ${(e as Error).message}` };
        }
        const cfg = parseConfig(parsed);
        if (!cfg) return { config: DEFAULT_CONFIG, source: 'default', error: 'Schema inválido — sem botões válidos' };
        return { config: cfg, source: 'workspace' };
    } catch (err: any) {
        const msg = err?.message || String(err);
        if (/not found|404/i.test(msg)) return { config: DEFAULT_CONFIG, source: 'default' };
        return { config: DEFAULT_CONFIG, source: 'default', error: msg };
    }
}

class DevPanelInstance implements PaneInstance {
    private el: HTMLElement;
    private grid: HTMLElement | null = null;
    private titleEl: HTMLElement | null = null;
    private subtitleEl: HTMLElement | null = null;
    private footer: HTMLElement | null = null;
    private disposed = false;

    constructor(container: HTMLElement, _context: PaneContext) {
        this.el = document.createElement('div');
        this.el.className = 'dev-panel-pane';
        this.el.setAttribute('tabindex', '0');
        this.el.style.cssText = [
            'padding: 20px 24px',
            'overflow: auto',
            'height: 100%',
            'font-family: inherit',
            'font-size: 14px',
            'line-height: 1.5',
        ].join(';');

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px;';

        this.titleEl = document.createElement('h2');
        this.titleEl.textContent = 'Drupal Dev Panel';
        this.titleEl.style.cssText = 'margin: 0; font-size: 18px; flex: 1;';

        const reloadBtn = document.createElement('button');
        reloadBtn.type = 'button';
        reloadBtn.textContent = '↻ Recarregar';
        reloadBtn.title = `Lê ${CONFIG_PATH} do workspace`;
        reloadBtn.style.cssText = [
            'padding: 4px 10px',
            'border: 1px solid #475569',
            'border-radius: 6px',
            'background: transparent',
            'color: #cbd5e1',
            'cursor: pointer',
            'font-size: 11px',
        ].join(';');
        reloadBtn.addEventListener('click', () => this.refresh());

        header.appendChild(this.titleEl);
        header.appendChild(reloadBtn);

        this.subtitleEl = document.createElement('div');
        this.subtitleEl.style.cssText = 'opacity: .7; font-size: 12px; margin-bottom: 16px;';

        this.grid = document.createElement('div');

        this.footer = document.createElement('div');
        this.footer.style.cssText = 'margin-top: 18px; font-size: 11px; opacity: .6;';

        this.el.appendChild(header);
        this.el.appendChild(this.subtitleEl);
        this.el.appendChild(this.grid);
        this.el.appendChild(this.footer);
        container.appendChild(this.el);

        void this.refresh();
    }

    private async refresh(): Promise<void> {
        if (!this.grid || !this.subtitleEl || !this.footer) return;
        this.grid.innerHTML = '';
        this.subtitleEl.textContent = 'A carregar configuração…';

        const { config, source, error } = await loadConfig();
        if (this.disposed) return;

        if (this.titleEl) this.titleEl.textContent = config.title || 'Dev Panel';
        this.subtitleEl.textContent = config.subtitle || 'Atalhos rápidos. Clique para executar.';

        for (const group of config.groups) {
            if (group.label) {
                const gLabel = document.createElement('div');
                gLabel.textContent = group.label;
                gLabel.style.cssText = 'margin: 18px 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; opacity: .65;';
                this.grid.appendChild(gLabel);
            }
            const gGrid = document.createElement('div');
            gGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;';
            for (const btnDef of group.buttons) {
                gGrid.appendChild(this.createButton(btnDef));
            }
            this.grid.appendChild(gGrid);
        }

        const footerTxt = source === 'workspace'
            ? `Config: workspace/${CONFIG_PATH}`
            : `Config: defaults embebidos (cria workspace/${CONFIG_PATH} para personalizar)`;
        this.footer.textContent = error ? `${footerTxt} — ⚠ ${error}` : footerTxt;
        this.footer.style.color = error ? '#f87171' : '';
    }

    private createButton(btnDef: ButtonDef): HTMLButtonElement {
        const BG_IDLE = '#1f2937';
        const BG_HOVER = '#334155';
        const FG = '#f1f5f9';
        const BORDER = '#475569';
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = btnDef.label;
        if (btnDef.hint) b.title = btnDef.hint;
        b.style.cssText = [
            'padding: 12px 14px',
            `border: 1px solid ${BORDER}`,
            'border-radius: 8px',
            `background: ${BG_IDLE}`,
            `color: ${FG}`,
            'cursor: pointer',
            'font-size: 14px',
            'font-weight: 500',
            'text-align: left',
            'transition: background .15s, border-color .15s, transform .05s',
        ].join(';');
        b.addEventListener('mouseenter', () => { b.style.background = BG_HOVER; b.style.borderColor = '#38bdf8'; });
        b.addEventListener('mouseleave', () => { b.style.background = BG_IDLE; b.style.borderColor = BORDER; });
        b.addEventListener('mousedown', () => { b.style.transform = 'scale(0.98)'; });
        b.addEventListener('mouseup', () => { b.style.transform = 'scale(1)'; });
        b.addEventListener('click', () => this.triggerCommand(btnDef.command, b));
        return b;
    }

    private async triggerCommand(command: string, btn: HTMLButtonElement): Promise<void> {
        const original = btn.textContent;
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = '… a executar';
        try {
            await sendAgentMessage('default', command, null, []);
            btn.textContent = '✓ enviado';
        } catch (err) {
            console.error('[dev-panel] failed to send command', command, err);
            btn.textContent = '✗ erro';
            try { void navigator.clipboard?.writeText(command); } catch { /* ignore */ }
        } finally {
            setTimeout(() => {
                if (this.disposed) return;
                btn.textContent = original;
                btn.disabled = false;
            }, 1500);
        }
    }

    getContent(): string | undefined { return undefined; }
    isDirty(): boolean { return false; }
    setContent(_content: string, _mtime: string): void { /* no-op */ }
    focus(): void { this.el?.focus(); }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.el?.remove();
    }
}

export const devPanelPaneExtension: WebPaneExtension = {
    id: 'dev-panel',
    label: 'Dev Panel',
    icon: 'panel',
    capabilities: ['readonly'] as PaneCapability[],
    placement: 'tabs',

    canHandle(context: PaneContext): boolean | number {
        return context?.path === DEV_PANEL_TAB_PATH ? 10_000 : false;
    },

    mount(container: HTMLElement, context: PaneContext): PaneInstance {
        return new DevPanelInstance(container, context);
    },
};
