import * as api from '../api.js';
import {
  paneRegistry,
  editorPaneExtension,
  preloadEditorBundle,
  terminalPaneExtension,
  terminalTabPaneExtension,
  vncPaneExtension,
  workspacePreviewPaneExtension,
  workspaceMarkdownPreviewPaneExtension,
  officeViewerPaneExtension,
  csvViewerPaneExtension,
  pdfViewerPaneExtension,
  imageViewerPaneExtension,
  htmlViewerPaneExtension,
  videoViewerPaneExtension,
  mindmapPaneExtension,
  kanbanPaneExtension,
  devPanelPaneExtension,
} from '../panes/index.js';
import { resolveOptionalApi } from './optional-api.js';

interface AppApiSurface {
  [key: string]: any;
}

let initialized = false;
let browserNoiseFilterInstalled = false;
let serviceWorkerRegistrationStarted = false;

export function configureMarked(markedInstance: { setOptions?: (options: Record<string, unknown>) => void } | null | undefined): void {
  if (!markedInstance || typeof markedInstance.setOptions !== 'function') return;
  markedInstance.setOptions({
    breaks: true,
    gfm: true,
  });
}

export function installBrowserNoiseFilters(runtimeWindow: (Window & typeof globalThis) | null = typeof window !== 'undefined' ? window : null): void {
  if (!runtimeWindow || browserNoiseFilterInstalled) return;
  const handler = (event: ErrorEvent) => {
    const message = String(event?.message || event?.error?.message || '').trim();
    if (!/ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i.test(message)) {
      // iOS fires opaque "Script error." at line 0 when the share sheet opens,
      // the app is backgrounded, or a cross-origin script triggers an exception.
      // These are not actionable and should be suppressed.
      const isOpaqueScriptError = message === 'Script error.' && (event?.lineno === 0 || !event?.filename);
      if (!isOpaqueScriptError) return;
    }
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  };
  runtimeWindow.addEventListener('error', handler, true);
  browserNoiseFilterInstalled = true;
}

export function registerAppPaneExtensions(): void {
  paneRegistry.register(editorPaneExtension);
  paneRegistry.register(workspacePreviewPaneExtension);
  paneRegistry.register(workspaceMarkdownPreviewPaneExtension);
  paneRegistry.register(officeViewerPaneExtension);
  paneRegistry.register(csvViewerPaneExtension);
  paneRegistry.register(pdfViewerPaneExtension);
  paneRegistry.register(imageViewerPaneExtension);
  paneRegistry.register(htmlViewerPaneExtension);
  paneRegistry.register(videoViewerPaneExtension);
  paneRegistry.register(mindmapPaneExtension);
  paneRegistry.register(kanbanPaneExtension);
  paneRegistry.register(devPanelPaneExtension);
  paneRegistry.register(vncPaneExtension);
  preloadEditorBundle();
  paneRegistry.register(terminalPaneExtension);
  paneRegistry.register(terminalTabPaneExtension);
}

export function registerAppServiceWorker(runtimeWindow: (Window & typeof globalThis) | null = typeof window !== 'undefined' ? window : null): void {
  if (!runtimeWindow || serviceWorkerRegistrationStarted) return;
  if (!runtimeWindow.isSecureContext) return;
  if (!("serviceWorker" in runtimeWindow.navigator)) return;
  serviceWorkerRegistrationStarted = true;
  void runtimeWindow.navigator.serviceWorker.register('/sw.js').catch((error) => {
    console.warn('Failed to register app service worker:', error);
  });
}

export function initializeAppShellRuntime(): void {
  if (initialized) return;
  const markedInstance = typeof window !== 'undefined'
    ? (window as any)?.marked
    : null;
  configureMarked(markedInstance);
  installBrowserNoiseFilters(typeof window !== 'undefined' ? window : null);
  registerAppPaneExtensions();
  registerAppServiceWorker(typeof window !== 'undefined' ? window : null);
  installDevPanelOverlayStyles(typeof window !== 'undefined' ? window : null);
  installDevPanelSidebarMenuItem(typeof window !== 'undefined' ? window : null);
  initialized = true;
}

/**
 * Upstream hides the sidebar's built-in ≡ button via CSS
 * (`.workspace-header-left > .workspace-menu-wrap { display: none }` in
 * settings.css) because it replaced it with the global timeline-menu.
 * Our overlay keeps the sidebar menu visible (it has actions the
 * timeline menu lacks: New file, Upload files, Hide hidden files, …)
 * and hides the redundant timeline-menu when the sidebar is open.
 */
function installDevPanelOverlayStyles(runtimeWindow: (Window & typeof globalThis) | null): void {
  if (!runtimeWindow || typeof runtimeWindow.document === 'undefined') return;
  const doc = runtimeWindow.document;
  if (doc.getElementById('dev-panel-overlay-styles')) return;
  const style = doc.createElement('style');
  style.id = 'dev-panel-overlay-styles';
  style.textContent = `
    /* Re-enable the sidebar's native ≡ menu (upstream hides it). */
    .workspace-header-left > .workspace-menu-wrap { display: inline-flex !important; }
    /* Remove left padding so the ≡ sits flush against the sidebar edge. */
    .workspace-sidebar .workspace-header { padding-left: 0 !important; }
  `;
  doc.head.appendChild(style);
}

/**
 * Injects an "Open Dev Panel" entry into the sidebar's built-in
 * workspace-menu-dropdown (the ≡ button inside the Workspace panel).
 * Uses a MutationObserver so the item reappears every time the
 * dropdown is re-rendered. Added here (instead of patching the large
 * upstream workspace-explorer.ts) to keep the overlay minimal.
 */
function installDevPanelSidebarMenuItem(runtimeWindow: (Window & typeof globalThis) | null): void {
  if (!runtimeWindow || typeof MutationObserver === 'undefined') return;
  const INJECTED_ATTR = 'data-dev-panel-injected';
  const tryInject = (dropdown: Element): void => {
    if (dropdown.getAttribute(INJECTED_ATTR)) return;
    if (!dropdown.classList.contains('workspace-menu-dropdown')) return;
    // Skip our own timeline menu dropdowns.
    if (dropdown.classList.contains('timeline-menu-dropdown')) return;
    const doc = dropdown.ownerDocument || runtimeWindow.document;
    const btn = doc.createElement('button');
    btn.className = 'workspace-menu-item';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = 'Open Dev Panel';
    btn.addEventListener('click', () => {
      runtimeWindow.dispatchEvent(new CustomEvent('piclaw:open-dev-panel'));
      // Close the menu by simulating an outside click.
      doc.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    // Insert before the first separator if any; otherwise append at the end.
    const firstSep = dropdown.querySelector('.workspace-menu-separator');
    if (firstSep) dropdown.insertBefore(btn, firstSep);
    else dropdown.appendChild(btn);
    dropdown.setAttribute(INJECTED_ATTR, '1');
  };
  const scan = (root: ParentNode): void => {
    root.querySelectorAll?.('.workspace-menu-dropdown').forEach(tryInject);
  };
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        const el = n as Element;
        if (el.classList?.contains('workspace-menu-dropdown')) tryInject(el);
        else scan(el);
      });
    }
  });
  obs.observe(runtimeWindow.document.body, { childList: true, subtree: true });
  scan(runtimeWindow.document.body);
}

export function resolveAppApiSurface(apiNamespace: Record<string, any> = api): AppApiSurface {
  return {
    searchPosts: apiNamespace.searchPosts,
    deletePost: apiNamespace.deletePost,
    getAgents: apiNamespace.getAgents,
    getAgentThought: apiNamespace.getAgentThought,
    setAgentThoughtVisibility: apiNamespace.setAgentThoughtVisibility,
    getAgentStatus: apiNamespace.getAgentStatus,
    getWorkspaceFile: apiNamespace.getWorkspaceFile,
    getThread: apiNamespace.getThread,
    getTimeline: apiNamespace.getTimeline,
    sendAgentMessage: apiNamespace.sendAgentMessage,
    forkChatBranch: apiNamespace.forkChatBranch,

    getAgentContext: resolveOptionalApi(apiNamespace, 'getAgentContext', null),
    getAutoresearchStatus: resolveOptionalApi(apiNamespace, 'getAutoresearchStatus', null),
    stopAutoresearch: resolveOptionalApi(apiNamespace, 'stopAutoresearch', { status: 'ok' }),
    dismissAutoresearch: resolveOptionalApi(apiNamespace, 'dismissAutoresearch', { status: 'ok' }),
    getAgentModels: resolveOptionalApi(apiNamespace, 'getAgentModels', { current: null, models: [] }),
    completeInstanceOobe: resolveOptionalApi(apiNamespace, 'completeInstanceOobe', { status: 'ok' }),
    getActiveChatAgents: resolveOptionalApi(apiNamespace, 'getActiveChatAgents', { chats: [] }),
    getChatBranches: resolveOptionalApi(apiNamespace, 'getChatBranches', { chats: [] }),
    renameChatBranch: resolveOptionalApi(apiNamespace, 'renameChatBranch', null),
    pruneChatBranch: resolveOptionalApi(apiNamespace, 'pruneChatBranch', null),
    restoreChatBranch: resolveOptionalApi(apiNamespace, 'restoreChatBranch', null),
    getAgentQueueState: resolveOptionalApi(apiNamespace, 'getAgentQueueState', { count: 0 }),
    steerAgentQueueItem: resolveOptionalApi(apiNamespace, 'steerAgentQueueItem', { removed: false, queued: 'steer' }),
    removeAgentQueueItem: resolveOptionalApi(apiNamespace, 'removeAgentQueueItem', { removed: false }),
    streamSidePrompt: resolveOptionalApi(apiNamespace, 'streamSidePrompt', null),
  };
}

export const appApi = resolveAppApiSurface(api);
