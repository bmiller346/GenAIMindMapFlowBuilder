import assert from 'node:assert/strict';
import test from 'node:test';
import reactPlugin from '@vitejs/plugin-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let viteServer;

const getViteServer = async () => {
    if (!viteServer) {
        viteServer = await createServer({
            configFile: false,
            logLevel: 'error',
            plugins: [reactPlugin()],
            server: {
                middlewareMode: true
            }
        });
    }
    return viteServer;
};

test.after(async () => {
    await viteServer?.close();
});

const loadShellModules = async () => {
    const server = await getViteServer();
    const [
        { default: WorkspaceShell },
        { default: ShellRibbon },
        { default: BranchPropertiesPanel },
        { default: SourcePropertiesPanel },
        { default: ShellPropertiesPanelHost },
        { default: ShellStatusBar },
        ribbonGroups
    ] = await Promise.all([
        server.ssrLoadModule('/src/shell/WorkspaceShell.jsx'),
        server.ssrLoadModule('/src/shell/ShellRibbon.jsx'),
        server.ssrLoadModule('/src/shell/BranchPropertiesPanel.jsx'),
        server.ssrLoadModule('/src/shell/SourcePropertiesPanel.jsx'),
        server.ssrLoadModule('/src/shell/ShellPropertiesPanelHost.jsx'),
        server.ssrLoadModule('/src/shell/ShellStatusBar.jsx'),
        server.ssrLoadModule('/src/ribbon/AiRibbonGroups.jsx')
    ]);
    return {
        WorkspaceShell,
        ShellRibbon,
        BranchPropertiesPanel,
        SourcePropertiesPanel,
        ShellPropertiesPanelHost,
        ShellStatusBar,
        ...ribbonGroups
    };
};

test('WorkspaceShell renders mounted slot contract attributes', async () => {
    const { WorkspaceShell } = await loadShellModules();
    const html = renderToStaticMarkup(
        React.createElement(WorkspaceShell, {
            ribbon: React.createElement('div', null, 'Ribbon'),
            leftPanel: React.createElement('div', null, 'Left'),
            centerCanvas: React.createElement('div', null, 'Canvas'),
            bottomTray: React.createElement('div', null, 'Bottom')
        })
    );

    assert.match(html, /data-testid="workspace-shell"/);
    assert.match(html, /data-has-left-panel="true"/);
    assert.match(html, /data-has-right-panel="false"/);
    assert.match(html, /data-has-bottom-tray="true"/);
    assert.match(html, /data-has-status-bar="false"/);
    assert.match(html, /data-testid="workspace-shell-ribbon-slot"/);
    assert.match(html, /data-testid="workspace-shell-left-slot"/);
    assert.match(html, /data-testid="workspace-shell-canvas-slot"/);
    assert.match(html, /data-testid="workspace-shell-bottom-slot"/);
    assert.doesNotMatch(html, /data-testid="workspace-shell-right-slot"/);
});

test('WorkspaceShell renders status bar independently from review tray', async () => {
    const { WorkspaceShell, ShellStatusBar } = await loadShellModules();
    const html = renderToStaticMarkup(
        React.createElement(WorkspaceShell, {
            ribbon: React.createElement('div', null, 'Ribbon'),
            centerCanvas: React.createElement('div', null, 'Canvas'),
            statusBar: React.createElement(ShellStatusBar, {
                items: [{ id: 'view', label: 'View', value: 'Mind map' }],
                overrides: [{ id: 'branch', label: 'Branch: Pilot' }]
            })
        })
    );

    assert.match(html, /data-has-status-bar="true"/);
    assert.match(html, /data-has-bottom-tray="false"/);
    assert.match(html, /data-testid="workspace-shell-status-slot"/);
    assert.doesNotMatch(html, /data-testid="workspace-shell-bottom-slot"/);
    assert.match(html, /View/);
    assert.match(html, /Mind map/);
    assert.match(html, /Branch: Pilot/);
});

test('WorkspaceShell renders placeholder-backed optional slots', async () => {
    const { WorkspaceShell } = await loadShellModules();
    const html = renderToStaticMarkup(
        React.createElement(WorkspaceShell, {
            ribbon: React.createElement('div', null, 'Ribbon'),
            centerCanvas: React.createElement('div', null, 'Canvas'),
            rightPanelPlaceholder: React.createElement('div', null, 'No selection'),
            bottomTrayPlaceholder: React.createElement('div', null, 'No reviews')
        })
    );

    assert.match(html, /data-has-left-panel="false"/);
    assert.match(html, /data-has-right-panel="true"/);
    assert.match(html, /data-has-bottom-tray="true"/);
    assert.match(html, /data-testid="workspace-shell-right-slot"/);
    assert.match(html, /data-testid="workspace-shell-bottom-slot"/);
    assert.match(html, /No selection/);
    assert.match(html, /No reviews/);
});

test('ShellRibbon exposes active tab and tabpanel wiring', async () => {
    const { ShellRibbon } = await loadShellModules();
    const html = renderToStaticMarkup(
        React.createElement(ShellRibbon, {
            activeTab: 'map',
            renderContent: ({ activeTab }) => React.createElement('span', null, activeTab)
        })
    );

    assert.match(html, /data-testid="shell-ribbon"/);
    assert.match(html, /data-active-tab="map"/);
    assert.match(html, /id="shell-ribbon-tab-map"/);
    assert.match(html, /aria-controls="shell-ribbon-panel-map"/);
    assert.match(html, /aria-selected="true"/);
    assert.match(html, /id="shell-ribbon-panel-map"/);
    assert.match(html, /aria-labelledby="shell-ribbon-tab-map"/);
    assert.match(html, />map<\/span>/);
});

test('ShellRibbon falls back to the first tab when active tab is unknown', async () => {
    const { ShellRibbon } = await loadShellModules();
    const html = renderToStaticMarkup(
        React.createElement(ShellRibbon, {
            activeTab: 'missing'
        })
    );

    assert.match(html, /data-active-tab="home"/);
    assert.match(html, /id="shell-ribbon-panel-home"/);
    assert.match(html, /Workspace commands/);
});

test('Home and Sources ribbon groups render stable command surfaces', async () => {
    const { HomeRibbonGroups, SourcesRibbonGroups } = await loadShellModules();
    const homeHtml = renderToStaticMarkup(
        React.createElement(HomeRibbonGroups, {
            canUseWorkspace: true
        })
    );
    const sourcesHtml = renderToStaticMarkup(
        React.createElement(SourcesRibbonGroups, {
            canUseWorkspace: true,
            hasSources: true
        })
    );

    assert.match(homeHtml, /aria-label="Home ribbon commands"/);
    assert.match(homeHtml, /Map/);
    assert.match(homeHtml, /Workspace/);
    assert.match(homeHtml, /Next steps/);
    assert.match(sourcesHtml, /aria-label="Sources ribbon commands"/);
    assert.match(sourcesHtml, /Library/);
    assert.match(sourcesHtml, /Review support/);
    assert.match(sourcesHtml, /Repair sources/);
});

test('Sources ribbon disables source repair until sources exist', async () => {
    const { SourcesRibbonGroups } = await loadShellModules();
    const html = renderToStaticMarkup(
        React.createElement(SourcesRibbonGroups, {
            canUseWorkspace: true,
            hasSources: false
        })
    );

    assert.match(html, /Repair sources/);
    assert.match(html, /disabled=""/);
});

test('Outputs ribbon separates accepted views, previews, and handoff outputs', async () => {
    const { OutputsRibbonGroups } = await loadShellModules();
    const html = renderToStaticMarkup(
        React.createElement(OutputsRibbonGroups, {
            canOpenOutputs: true
        })
    );

    assert.match(html, /aria-label="Accepted output views"/);
    assert.match(html, /Table/);
    assert.match(html, /Executive/);
    assert.match(html, /Flowchart/);
    assert.match(html, /aria-label="Execution output views"/);
    assert.match(html, /Tasks/);
    assert.match(html, /Kanban/);
    assert.match(html, /aria-label="Preview output views"/);
    assert.match(html, /Checklist Preview/);
    assert.match(html, /aria-label="Handoff output views"/);
    assert.match(html, /Implementation/);
    assert.match(html, /Status/);
});

test('branch and source properties panels render editable summaries', async () => {
    const { BranchPropertiesPanel, SourcePropertiesPanel } = await loadShellModules();
    const nodes = [
        {
            id: 'branch-1',
            type: 'response',
            position: { x: 0, y: 0 },
            data: { title: 'Branch One' }
        },
        {
            id: 'child-1',
            type: 'response',
            position: { x: 1, y: 1 },
            data: {
                title: 'Child One',
                source_refs: [
                    {
                        document_id: 'source-1',
                        page: 3,
                        quote_snippet: 'Source-backed child evidence.'
                    }
                ]
            }
        }
    ];
    const edges = [{ id: 'edge-1', source: 'branch-1', target: 'child-1' }];
    const sourceLibrary = [
        {
            id: 'source-1',
            title: 'Source One',
            type_label: 'PDF',
            chunks: [{ id: 'chunk-1' }]
        }
    ];

    const branchHtml = renderToStaticMarkup(
        React.createElement(BranchPropertiesPanel, {
            branchId: 'branch-1',
            nodes,
            edges
        })
    );
    assert.match(branchHtml, /Branch properties/);
    assert.match(branchHtml, /Branch One/);
    assert.match(branchHtml, /Direct children/);

    const sourceHtml = renderToStaticMarkup(
        React.createElement(SourcePropertiesPanel, {
            sourceId: 'source-1',
            nodes,
            edges,
            sourceLibrary
        })
    );
    assert.match(sourceHtml, /Source properties/);
    assert.match(sourceHtml, /Source One/);
    assert.match(sourceHtml, /Child One/);
    assert.match(sourceHtml, /Source-backed child evidence/);
});

test('ShellPropertiesPanelHost uses the shell right-panel route for metadata', async () => {
    const { ShellPropertiesPanelHost } = await loadShellModules();
    const nodes = [
        {
            id: 'branch-1',
            type: 'response',
            position: { x: 0, y: 0 },
            data: { title: 'Branch One' }
        }
    ];

    const emptyHtml = renderToStaticMarkup(
        React.createElement(ShellPropertiesPanelHost, {
            rightPanel: { kind: null, id: null },
            nodes
        })
    );
    assert.equal(emptyHtml, '');

    const branchHtml = renderToStaticMarkup(
        React.createElement(ShellPropertiesPanelHost, {
            rightPanel: { kind: 'branch', id: 'branch-1' },
            nodes
        })
    );
    assert.match(branchHtml, /Branch properties/);
    assert.match(branchHtml, /Branch One/);
});
