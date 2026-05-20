import assert from 'node:assert/strict';
import test from 'node:test';
import useShellStore, {
    DEFAULT_SHELL_LAYOUT,
    normalizeShellScope
} from '../src/stores/shellStore.js';

const resetShellStore = () => {
    useShellStore.getState().resetShellLayout();
};

test('normalizeShellScope preserves known scopes and normalizes ids', () => {
    assert.deepEqual(
        normalizeShellScope({
            type: 'nodes',
            nodeIds: [1, 'two'],
            sourceId: 42
        }),
        {
            type: 'nodes',
            nodeIds: ['1', 'two'],
            sourceId: '42'
        }
    );

    assert.deepEqual(normalizeShellScope({ type: 'unknown' }), {
        type: 'workspace'
    });
});

test('right panel routing is exclusive with bottom tray', () => {
    resetShellStore();

    useShellStore.getState().openBottomTray('drafts', { id: 'draft-1' });
    useShellStore.getState().openNodeMetadata('node-1');

    const state = useShellStore.getState();
    assert.deepEqual(state.rightPanel, { kind: 'node', id: 'node-1' });
    assert.equal(state.bottomTray, null);
});

test('source and branch metadata routes use the right panel and clear review trays', () => {
    resetShellStore();

    useShellStore.getState().openBottomTray('issues', { id: 'validation-1' });
    useShellStore.getState().openSourceMetadata('source-1');

    assert.deepEqual(useShellStore.getState().rightPanel, {
        kind: 'source',
        id: 'source-1'
    });
    assert.equal(useShellStore.getState().bottomTray, null);

    useShellStore.getState().openBottomTray('drafts', { id: 'draft-1' });
    useShellStore.getState().openBranchMetadata('branch-1');

    const state = useShellStore.getState();
    assert.deepEqual(state.rightPanel, {
        kind: 'branch',
        id: 'branch-1'
    });
    assert.equal(state.bottomTray, null);
});

test('bottom tray routing is exclusive with metadata right panel', () => {
    resetShellStore();

    useShellStore.getState().openEdgeMetadata('edge-1');
    useShellStore.getState().openOverlay({ kind: 'popover', id: 'relationship-menu' });
    useShellStore.getState().openAiProposalTray('connections', {
        context: { source: 'findConnections' },
        scope: { type: 'workspace' }
    });

    const state = useShellStore.getState();
    assert.deepEqual(state.rightPanel, { kind: null, id: null });
    assert.deepEqual(state.bottomTray, {
        kind: 'connections',
        id: null,
        context: { source: 'findConnections', workflow: 'aiProposal' }
    });
    assert.deepEqual(state.activeScope, { type: 'workspace' });
    assert.deepEqual(state.overlay, { kind: null, id: null, anchorId: null });
});

test('workspace navigation opens the left panel without disturbing ribbon state', () => {
    resetShellStore();

    useShellStore.getState().setRibbonTab('map', { view: 'knowledgeGraph' });
    useShellStore.getState().openWorkspaceNavigation('workspace', { tab: 'sources', width: 320 });

    const state = useShellStore.getState();
    assert.deepEqual(state.ribbon, {
        activeTab: 'map',
        context: { view: 'knowledgeGraph' }
    });
    assert.deepEqual(state.leftPanel, {
        kind: 'workspace',
        tab: 'sources',
        id: null,
        collapsed: false,
        width: 320
    });
});

test('left panel tab, collapse, and width can update without closing the panel', () => {
    resetShellStore();

    useShellStore.getState().openWorkspaceNavigation('workspace', {
        tab: 'guidance',
        width: 17.65
    });
    useShellStore.getState().setLeftPanelTab('health');
    useShellStore.getState().setLeftPanelCollapsed(true);
    useShellStore.getState().setLeftPanelWidth(22.25);

    assert.deepEqual(useShellStore.getState().leftPanel, {
        kind: 'workspace',
        tab: 'health',
        id: null,
        collapsed: true,
        width: 22.25
    });
});

test('left panel updates create a workspace navigation panel when none is open', () => {
    resetShellStore();

    useShellStore.getState().setLeftPanelTab('build');
    useShellStore.getState().setLeftPanelCollapsed(false);

    assert.deepEqual(useShellStore.getState().leftPanel, {
        kind: 'workspace',
        tab: 'build',
        id: null,
        collapsed: false,
        width: null
    });
});

test('workspace navigation does not disturb metadata or review tray state', () => {
    resetShellStore();

    useShellStore.getState().openAiProposalTray('tasks', { id: 'task-preview-1' });
    useShellStore.getState().openWorkspaceNavigation('sources', { tab: 'sources' });

    const state = useShellStore.getState();
    assert.deepEqual(state.leftPanel, {
        kind: 'sources',
        tab: 'sources',
        id: null,
        collapsed: false,
        width: null
    });
    assert.deepEqual(state.bottomTray, {
        kind: 'tasks',
        id: 'task-preview-1',
        context: { workflow: 'aiProposal' }
    });
});

test('source library route opens the sources left panel and sources ribbon', () => {
    resetShellStore();

    useShellStore.getState().openNodeMetadata('node-1');
    useShellStore.getState().openSourceLibrary({ width: 24 });

    const state = useShellStore.getState();
    assert.deepEqual(state.ribbon, {
        activeTab: 'sources',
        context: 'sourceLibrary'
    });
    assert.deepEqual(state.leftPanel, {
        kind: 'sources',
        tab: 'sources',
        id: null,
        collapsed: false,
        width: 24
    });
    assert.deepEqual(state.rightPanel, {
        kind: 'node',
        id: 'node-1'
    });
});

test('outline and activity navigation stay scoped to the left panel', () => {
    resetShellStore();

    useShellStore.getState().openNodeMetadata('node-1');
    useShellStore.getState().openWorkspaceNavigation('outline', {
        tab: 'outline',
        collapsed: false,
        width: 21
    });

    assert.deepEqual(useShellStore.getState().leftPanel, {
        kind: 'outline',
        tab: 'outline',
        id: null,
        collapsed: false,
        width: 21
    });
    assert.deepEqual(useShellStore.getState().rightPanel, {
        kind: 'node',
        id: 'node-1'
    });

    useShellStore.getState().openWorkspaceNavigation('activity', {
        tab: 'activity',
        collapsed: false,
        width: 19
    });

    assert.deepEqual(useShellStore.getState().leftPanel, {
        kind: 'activity',
        tab: 'activity',
        id: null,
        collapsed: false,
        width: 19
    });
    assert.deepEqual(useShellStore.getState().rightPanel, {
        kind: 'node',
        id: 'node-1'
    });
});

test('draft review tray action opens the review ribbon and drafts tray', () => {
    resetShellStore();

    useShellStore.getState().openNodeMetadata('node-1');
    useShellStore.getState().openDraftReviewTray('session-1');

    const state = useShellStore.getState();
    assert.deepEqual(state.ribbon, {
        activeTab: 'review',
        context: 'aiDraftSession'
    });
    assert.deepEqual(state.bottomTray, {
        kind: 'drafts',
        id: 'session-1',
        context: 'aiDraftSession'
    });
    assert.deepEqual(state.rightPanel, { kind: null, id: null });
});

test('source draft review tray action opens the review ribbon and sources tray', () => {
    resetShellStore();

    useShellStore.getState().openSourceDraftReviewTray('source-draft-1');

    const state = useShellStore.getState();
    assert.deepEqual(state.ribbon, {
        activeTab: 'review',
        context: 'sourceDraftReview'
    });
    assert.deepEqual(state.bottomTray, {
        kind: 'sources',
        id: 'source-draft-1',
        context: 'sourceDraftReview'
    });
});

test('validation issues tray action opens the review ribbon and issues tray', () => {
    resetShellStore();

    useShellStore.getState().openValidationIssuesTray('flow-1');

    const state = useShellStore.getState();
    assert.deepEqual(state.ribbon, {
        activeTab: 'review',
        context: 'validationIssues'
    });
    assert.deepEqual(state.bottomTray, {
        kind: 'issues',
        id: 'flow-1',
        context: 'validationIssues'
    });
});

test('local output review tray action opens an authoritative review route', () => {
    resetShellStore();

    useShellStore.getState().openNodeMetadata('node-1');
    useShellStore.getState().openLocalOutputReviewTray('connections', {
        view: 'connections'
    });

    const state = useShellStore.getState();
    assert.deepEqual(state.ribbon, {
        activeTab: 'review',
        context: {
            workflow: 'localOutputReview',
            view: 'connections'
        }
    });
    assert.deepEqual(state.bottomTray, {
        kind: 'connections',
        id: 'connections',
        context: {
            workflow: 'localOutputReview',
            view: 'connections'
        }
    });
    assert.deepEqual(state.rightPanel, { kind: null, id: null });
});

test('local output review tray keeps accepted tasks in the structured canvas route', () => {
    resetShellStore();

    useShellStore.getState().openLocalOutputReviewTray('tasks', {
        view: 'tasks'
    });

    assert.deepEqual(useShellStore.getState().ribbon, {
        activeTab: 'review',
        context: {
            workflow: 'localOutputReview',
            view: 'preview'
        }
    });
    assert.deepEqual(useShellStore.getState().bottomTray, {
        kind: 'tasks',
        id: 'preview',
        context: {
            workflow: 'localOutputReview',
            view: 'preview'
        }
    });

    useShellStore.getState().openLocalOutputReviewTray('tasks', {
        view: 'checklist'
    });

    assert.deepEqual(useShellStore.getState().bottomTray, {
        kind: 'tasks',
        id: 'checklist',
        context: {
            workflow: 'localOutputReview',
            view: 'checklist'
        }
    });
});

test('invalid ribbon tabs, tray kinds, and right panels fall back without stale surfaces', () => {
    resetShellStore();

    useShellStore.getState().setRibbonTab('map', { view: 'mindmap' });
    useShellStore.getState().openNodeMetadata('node-1');
    useShellStore.getState().setRibbonTab('missing-tab', { ignored: true });
    useShellStore.getState().openBottomTray('missing-tray');
    useShellStore.getState().openRightPanel({ kind: 'aiDraft', id: 'draft-1' });

    const state = useShellStore.getState();
    assert.deepEqual(state.ribbon, {
        activeTab: 'map',
        context: { ignored: true }
    });
    assert.deepEqual(state.rightPanel, { kind: null, id: null });
    assert.equal(state.bottomTray, null);
});

test('repeated shell sync actions do not emit redundant updates', () => {
    resetShellStore();

    let updates = 0;
    const unsubscribe = useShellStore.subscribe(() => {
        updates += 1;
    });

    useShellStore.getState().closeRightPanel();
    useShellStore.getState().closeBottomTray();
    useShellStore.getState().closeOverlay();
    assert.equal(updates, 0);

    useShellStore.getState().openNodeMetadata('node-1');
    assert.equal(updates, 1);
    useShellStore.getState().openNodeMetadata('node-1');
    assert.equal(updates, 1);

    useShellStore.getState().openDraftReviewTray('draft-1');
    const afterDraftOpen = updates;
    useShellStore.getState().openDraftReviewTray('draft-1');
    assert.equal(updates, afterDraftOpen);

    useShellStore.getState().openLocalOutputReviewTray('tasks', { view: 'preview' });
    const afterLocalOutputOpen = updates;
    useShellStore.getState().openLocalOutputReviewTray('tasks', { view: 'preview' });
    assert.equal(updates, afterLocalOutputOpen);

    useShellStore.getState().setActiveScope({ type: 'nodes', nodeIds: ['node-1', 'node-2'] });
    const afterScopeOpen = updates;
    useShellStore.getState().setActiveScope({ type: 'nodes', nodeIds: ['node-1', 'node-2'] });
    assert.equal(updates, afterScopeOpen);

    unsubscribe();
});

test('overlay routing can close independently but is cleared by major panels', () => {
    resetShellStore();

    useShellStore.getState().openOverlay({
        kind: 'popover',
        id: 'filter-menu',
        anchorId: 'relationship-lens'
    });
    assert.deepEqual(useShellStore.getState().overlay, {
        kind: 'popover',
        id: 'filter-menu',
        anchorId: 'relationship-lens'
    });

    useShellStore.getState().closeOverlay();
    assert.deepEqual(useShellStore.getState().overlay, {
        kind: null,
        id: null,
        anchorId: null
    });

    useShellStore.getState().openOverlay({ kind: 'modal', id: 'source-picker' });
    useShellStore.getState().openWorkspaceNavigation('workspace', { tab: 'activity' });
    assert.deepEqual(useShellStore.getState().overlay, {
        kind: null,
        id: null,
        anchorId: null
    });
});

test('resetShellLayout returns the documented default state', () => {
    resetShellStore();

    assert.deepEqual(useShellStore.getState().ribbon, DEFAULT_SHELL_LAYOUT.ribbon);
    assert.equal(useShellStore.getState().leftPanel, null);
    assert.deepEqual(useShellStore.getState().activeScope, { type: 'workspace' });
});
