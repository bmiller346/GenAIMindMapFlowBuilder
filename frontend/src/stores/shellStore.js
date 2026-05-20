import { create } from 'zustand';

export const SHELL_RIBBON_TABS = Object.freeze([
    'home',
    'map',
    'ai',
    'review',
    'sources',
    'outputs'
]);

export const SHELL_LEFT_PANELS = Object.freeze([
    'workspace',
    'sources',
    'outline',
    'activity',
    'health',
    'build'
]);

export const SHELL_RIGHT_PANEL_KINDS = Object.freeze([
    'node',
    'edge',
    'branch',
    'source',
    'guide'
]);

export const SHELL_BOTTOM_TRAYS = Object.freeze([
    'drafts',
    'connections',
    'issues',
    'tasks',
    'sources',
    'activity'
]);

export const SHELL_LOCAL_OUTPUT_TRAY_BY_VIEW = Object.freeze({
    connections: 'connections',
    preview: 'tasks',
    checklist: 'tasks',
    gaps: 'issues',
    sme: 'issues',
    sources: 'sources'
});

export const SHELL_LOCAL_OUTPUT_VIEW_BY_TRAY = Object.freeze({
    connections: 'connections',
    tasks: 'preview',
    issues: 'gaps',
    sources: 'sources'
});

export const SHELL_LOCAL_OUTPUT_ALLOWED_VIEWS_BY_TRAY = Object.freeze({
    connections: Object.freeze(['connections']),
    tasks: Object.freeze(['preview', 'checklist']),
    issues: Object.freeze(['gaps', 'sme']),
    sources: Object.freeze(['sources'])
});

export const SHELL_OVERLAY_KINDS = Object.freeze([
    'modal',
    'popover'
]);

export const DEFAULT_SHELL_LAYOUT = Object.freeze({
    ribbon: {
        activeTab: 'home',
        context: null
    },
    leftPanel: null,
    rightPanel: {
        kind: null,
        id: null
    },
    bottomTray: null,
    overlay: {
        kind: null,
        id: null,
        anchorId: null
    },
    activeScope: {
        type: 'workspace'
    }
});

const normalizeKind = (value, allowedKinds) =>
    allowedKinds.includes(value) ? value : null;

const normalizeId = (id) =>
    id === undefined || id === null || id === '' ? null : String(id);

const normalizeLeftPanelWidth = (width) =>
    Number.isFinite(width) ? width : null;

const normalizeLeftPanel = (panel = 'workspace', options = {}) => ({
    kind: normalizeKind(panel, SHELL_LEFT_PANELS) || 'workspace',
    tab: options.tab || panel || 'workspace',
    id: normalizeId(options.id),
    collapsed: Boolean(options.collapsed),
    width: normalizeLeftPanelWidth(options.width)
});

export const normalizeShellScope = (scope = {}) => {
    const type = ['workspace', 'branch', 'nodes', 'source', 'filtered'].includes(scope.type)
        ? scope.type
        : 'workspace';

    const normalized = { type };
    if (scope.nodeId) {
        normalized.nodeId = String(scope.nodeId);
    }
    if (Array.isArray(scope.nodeIds) && scope.nodeIds.length) {
        normalized.nodeIds = scope.nodeIds.map(String);
    }
    if (scope.sourceId) {
        normalized.sourceId = String(scope.sourceId);
    }
    return normalized;
};

const closedRightPanel = () => ({ kind: null, id: null });
const closedOverlay = () => ({ kind: null, id: null, anchorId: null });
const isClosedRightPanel = (panel = {}) => !panel?.kind && !panel?.id;
const isClosedOverlay = (overlay = {}) => !overlay?.kind && !overlay?.id && !overlay?.anchorId;
const sameRightPanel = (panel = {}, next = {}) =>
    panel?.kind === next?.kind && panel?.id === next?.id;
const sameShellContext = (context, nextContext) =>
    JSON.stringify(context || null) === JSON.stringify(nextContext || null);
const sameBottomTray = (tray = {}, next = {}) =>
    tray?.kind === next?.kind &&
    tray?.id === next?.id &&
    sameShellContext(tray?.context, next?.context);
const sameShellScope = (scope = {}, next = {}) =>
    scope?.type === next?.type &&
    scope?.nodeId === next?.nodeId &&
    scope?.sourceId === next?.sourceId &&
    JSON.stringify(scope?.nodeIds || []) === JSON.stringify(next?.nodeIds || []);

const useShellStore = create((set, get) => ({
    ...DEFAULT_SHELL_LAYOUT,
    setRibbonTab: (activeTab, context = null) =>
        set((state) => {
            const nextRibbon = {
                activeTab: normalizeKind(activeTab, SHELL_RIBBON_TABS) || state.ribbon.activeTab,
                context: context || null
            };
            if (
                state.ribbon.activeTab === nextRibbon.activeTab &&
                sameShellContext(state.ribbon.context, nextRibbon.context)
            ) {
                return state;
            }
            return { ribbon: nextRibbon };
        }),
    setActiveScope: (activeScope = {}) =>
        set((state) => {
            const nextScope = normalizeShellScope(activeScope);
            if (sameShellScope(state.activeScope, nextScope)) {
                return state;
            }
            return {
                activeScope: nextScope
            };
        }),
    openLeftPanel: (panel, options = {}) =>
        set({
            leftPanel: normalizeLeftPanel(panel, options),
            overlay: closedOverlay()
        }),
    closeLeftPanel: () => set({ leftPanel: null }),
    openWorkspaceNavigation: (panel = 'workspace', options = {}) =>
        get().openLeftPanel(panel, options),
    openSourceLibrary: (options = {}) => {
        get().setRibbonTab('sources', 'sourceLibrary');
        return get().openLeftPanel('sources', {
            tab: 'sources',
            collapsed: false,
            ...options
        });
    },
    setLeftPanelTab: (tab, panel = 'workspace') =>
        set((state) => ({
            leftPanel: normalizeLeftPanel(state.leftPanel?.kind || panel, {
                ...state.leftPanel,
                tab,
                collapsed: state.leftPanel?.collapsed || false,
                width: state.leftPanel?.width ?? null
            })
        })),
    setLeftPanelCollapsed: (collapsed) =>
        set((state) => ({
            leftPanel: normalizeLeftPanel(state.leftPanel?.kind || 'workspace', {
                ...state.leftPanel,
                tab: state.leftPanel?.tab || 'workspace',
                collapsed,
                width: state.leftPanel?.width ?? null
            })
        })),
    setLeftPanelWidth: (width) =>
        set((state) => ({
            leftPanel: normalizeLeftPanel(state.leftPanel?.kind || 'workspace', {
                ...state.leftPanel,
                tab: state.leftPanel?.tab || 'workspace',
                collapsed: state.leftPanel?.collapsed || false,
                width
            })
        })),
    openRightPanel: ({ kind, id } = {}) => {
        const panelKind = normalizeKind(kind, SHELL_RIGHT_PANEL_KINDS);
        if (!panelKind) {
            return get().closeRightPanel();
        }

        set((state) => {
            const nextRightPanel = {
                kind: panelKind,
                id: normalizeId(id)
            };
            if (
                sameRightPanel(state.rightPanel, nextRightPanel) &&
                state.bottomTray === null &&
                isClosedOverlay(state.overlay)
            ) {
                return state;
            }
            return {
                rightPanel: nextRightPanel,
                bottomTray: null,
                overlay: closedOverlay()
            };
        });
    },
    closeRightPanel: () =>
        set((state) => {
            if (isClosedRightPanel(state.rightPanel)) {
                return state;
            }
            return {
                rightPanel: closedRightPanel()
            };
        }),
    openNodeMetadata: (nodeId) =>
        get().openRightPanel({ kind: 'node', id: nodeId }),
    openEdgeMetadata: (edgeId) =>
        get().openRightPanel({ kind: 'edge', id: edgeId }),
    openSourceMetadata: (sourceId) =>
        get().openRightPanel({ kind: 'source', id: sourceId }),
    openBranchMetadata: (branchId) =>
        get().openRightPanel({ kind: 'branch', id: branchId }),
    openGuidePanel: (guideId = 'aiHelpers') =>
        get().openRightPanel({ kind: 'guide', id: guideId }),
    openBottomTray: (tray, options = {}) => {
        const trayKind = normalizeKind(tray, SHELL_BOTTOM_TRAYS);
        if (!trayKind) {
            return get().closeBottomTray();
        }

        set((state) => {
            const nextBottomTray = {
                kind: trayKind,
                id: normalizeId(options.id),
                context: options.context || null
            };
            if (
                sameBottomTray(state.bottomTray, nextBottomTray) &&
                isClosedRightPanel(state.rightPanel) &&
                isClosedOverlay(state.overlay)
            ) {
                return state;
            }
            return {
                bottomTray: nextBottomTray,
                rightPanel: closedRightPanel(),
                overlay: closedOverlay()
            };
        });
    },
    closeBottomTray: () =>
        set((state) => {
            if (state.bottomTray === null) {
                return state;
            }
            return { bottomTray: null };
        }),
    openDraftReviewTray: (sessionId) => {
        get().setRibbonTab('review', 'aiDraftSession');
        return get().openBottomTray('drafts', {
            id: sessionId,
            context: 'aiDraftSession'
        });
    },
    openSourceDraftReviewTray: (sourceDraftId) => {
        get().setRibbonTab('review', 'sourceDraftReview');
        return get().openBottomTray('sources', {
            id: sourceDraftId,
            context: 'sourceDraftReview'
        });
    },
    openValidationIssuesTray: (validationId) => {
        get().setRibbonTab('review', 'validationIssues');
        return get().openBottomTray('issues', {
            id: validationId || 'local-validation',
            context: 'validationIssues'
        });
    },
    openLocalOutputReviewTray: (tray, options = {}) => {
        const trayKind = normalizeKind(tray, SHELL_BOTTOM_TRAYS);
        if (!trayKind || !SHELL_LOCAL_OUTPUT_VIEW_BY_TRAY[trayKind]) {
            return get().closeBottomTray();
        }

        const defaultView = SHELL_LOCAL_OUTPUT_VIEW_BY_TRAY[trayKind];
        const allowedViews = SHELL_LOCAL_OUTPUT_ALLOWED_VIEWS_BY_TRAY[trayKind] || [];
        const view = allowedViews.includes(options.view) ? options.view : defaultView;
        get().setRibbonTab('review', {
            workflow: 'localOutputReview',
            view
        });
        return get().openBottomTray(trayKind, {
            id: options.id || view,
            context: {
                workflow: 'localOutputReview',
                view
            }
        });
    },
    openAiProposalTray: (tray = 'drafts', options = {}) => {
        if (options.scope) {
            get().setActiveScope(options.scope);
        }
        return get().openBottomTray(tray, {
            ...options,
            context: {
                ...(options.context || {}),
                workflow: 'aiProposal'
            }
        });
    },
    openOverlay: ({ kind, id, anchorId } = {}) => {
        const overlayKind = normalizeKind(kind, SHELL_OVERLAY_KINDS);
        if (!overlayKind) {
            return get().closeOverlay();
        }

        set({
            overlay: {
                kind: overlayKind,
                id: normalizeId(id),
                anchorId: normalizeId(anchorId)
            }
        });
    },
    closeOverlay: () =>
        set((state) => {
            if (isClosedOverlay(state.overlay)) {
                return state;
            }
            return { overlay: closedOverlay() };
        }),
    resetShellLayout: () =>
        set({
            ...DEFAULT_SHELL_LAYOUT,
            rightPanel: closedRightPanel(),
            overlay: closedOverlay()
        })
}));

export default useShellStore;
