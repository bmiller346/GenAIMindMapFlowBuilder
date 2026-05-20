import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveShellLayoutState } from '../src/shell/useShellLayoutState.js';

const baseShellState = {
    activeRibbonTab: 'home',
    leftPanel: null,
    bottomTray: null,
    rightPanel: { kind: null, id: null },
    overlay: { kind: null, id: null, anchorId: null }
};

const pickLayoutFields = (state) => ({
    activeRibbonTab: state.activeRibbonTab,
    leftPanelKind: state.leftPanelKind,
    workspaceDockActiveTab: state.workspaceDockActiveTab,
    workspaceDockCollapsed: state.workspaceDockCollapsed,
    workspaceDockWidth: state.workspaceDockWidth,
    workspaceShellLeftWidth: state.workspaceShellLeftWidth
});

test('deriveShellLayoutState returns documented default workspace dock layout', () => {
    assert.deepEqual(pickLayoutFields(deriveShellLayoutState(baseShellState)), {
        activeRibbonTab: 'home',
        leftPanelKind: 'workspace',
        workspaceDockActiveTab: 'guidance',
        workspaceDockCollapsed: false,
        workspaceDockWidth: 17.65,
        workspaceShellLeftWidth: '17.65rem'
    });
});

test('deriveShellLayoutState clamps oversized persisted left rail widths', () => {
    assert.deepEqual(
        pickLayoutFields(
            deriveShellLayoutState({
                ...baseShellState,
                leftPanel: {
                    kind: 'workspace',
                    tab: 'sources',
                    id: null,
                    collapsed: false,
                    width: 320
                }
            })
        ),
        {
            activeRibbonTab: 'home',
            leftPanelKind: 'workspace',
            workspaceDockActiveTab: 'sources',
            workspaceDockCollapsed: false,
            workspaceDockWidth: 27,
            workspaceShellLeftWidth: '27rem'
        }
    );
});

test('deriveShellLayoutState clamps undersized persisted left rail widths', () => {
    assert.deepEqual(
        pickLayoutFields(
            deriveShellLayoutState({
                ...baseShellState,
                leftPanel: {
                    kind: 'workspace',
                    tab: 'health',
                    id: null,
                    collapsed: false,
                    width: 2
                }
            })
        ),
        {
            activeRibbonTab: 'home',
            leftPanelKind: 'workspace',
            workspaceDockActiveTab: 'health',
            workspaceDockCollapsed: false,
            workspaceDockWidth: 15.5,
            workspaceShellLeftWidth: '15.5rem'
        }
    );
});

test('deriveShellLayoutState uses collapsed shell width without losing stored dock width', () => {
    assert.deepEqual(
        pickLayoutFields(
            deriveShellLayoutState({
                ...baseShellState,
                leftPanel: {
                    kind: 'workspace',
                    tab: 'build',
                    id: null,
                    collapsed: true,
                    width: 22
                }
            })
        ),
        {
            activeRibbonTab: 'home',
            leftPanelKind: 'workspace',
            workspaceDockActiveTab: 'build',
            workspaceDockCollapsed: true,
            workspaceDockWidth: 22,
            workspaceShellLeftWidth: '4.8rem'
        }
    );
});

test('deriveShellLayoutState preserves the left panel kind for shell navigator modes', () => {
    assert.deepEqual(
        pickLayoutFields(
            deriveShellLayoutState({
                ...baseShellState,
                leftPanel: {
                    kind: 'sources',
                    tab: 'sources',
                    id: null,
                    collapsed: false,
                    width: 23
                }
            })
        ),
        {
            activeRibbonTab: 'home',
            leftPanelKind: 'sources',
            workspaceDockActiveTab: 'sources',
            workspaceDockCollapsed: false,
            workspaceDockWidth: 23,
            workspaceShellLeftWidth: '23rem'
        }
    );
});
