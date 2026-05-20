import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd7994390e8';

const flowJson = JSON.stringify({
    nodes: [
        {
            id: 'root',
            type: 'response',
            position: { x: 0, y: 0 },
            data: {
                title: 'Shell smoke root',
                node_type: 'concept',
                status: 'reviewed',
                manual: true
            }
        }
    ],
    edges: [],
    viewport: { x: 320, y: 220, zoom: 1 },
    workspace_brief: {},
    source_library: [],
    activity_events: [],
    ai_action_runs: [],
    automations: []
});

const emptyFlowJson = JSON.stringify({
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    workspace_brief: {},
    source_library: [],
    activity_events: [],
    ai_action_runs: [],
    automations: []
});

const mockBackend = async (page, { shellEnabled = true, initialFlowJson = flowJson } = {}) => {
    const state = {
        savedFlowName: 'Shell Foundation Smoke',
        savedFlowJson: initialFlowJson
    };
    const savedRequests = [];

    await page.addInitScript(({ shellEnabledFlag }) => {
        window.localStorage.clear();
        if (!shellEnabledFlag) {
            window.localStorage.setItem('docmap.uiShellRibbon.enabled', 'false');
        }
    }, { shellEnabledFlag: shellEnabled });

    const flowRecord = () => ({
        flow_id: flowId,
        flow_name: state.savedFlowName,
        flow_json: state.savedFlowJson,
        flow_type: 'manual',
        summary: 'Flow is saved'
    });

    await page.route(/http:\/\/localhost:8000\/.*/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({})
        });
    });

    await page.route('http://localhost:8000/flows', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([flowRecord()])
        });
    });

    await page.route(/http:\/\/localhost:8000\/flow-update\/?$/, async (route) => {
        const requestBody = route.request().postDataJSON();
        state.savedFlowName = requestBody.flow_name;
        state.savedFlowJson = requestBody.flow_json;
        savedRequests.push(requestBody);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                flow_id: flowId,
                message: 'Flow updated successfully'
            })
        });
    });

    await page.route(`http://localhost:8000/flows/${flowId}`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(flowRecord())
        });
    });

    await page.route(/http:\/\/localhost:8000\/api\/workspaces\/[^/]+\/ai\/usage$/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ sessions: [] })
        });
    });

    return { savedRequests, state };
};

test('default shell renders wrapper slots without legacy primary floating docks', async ({ page }) => {
    await mockBackend(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/');

    await expect(page.getByRole('textbox', { name: 'Workspace name' })).toHaveValue(
        'Shell Foundation Smoke'
    );
    await expect(page.getByTestId('workspace-shell')).toBeVisible();
    await expect(page.getByTestId('workspace-shell')).toHaveAttribute('data-has-left-panel', 'true');
    await expect(page.getByTestId('workspace-shell')).toHaveAttribute('data-has-right-panel', 'false');
    await expect(page.getByTestId('workspace-shell')).toHaveAttribute('data-has-status-bar', 'true');
    await expect(page.getByTestId('shell-ribbon')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-left-slot')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-canvas-slot')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-status-slot')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-status-slot')).toContainText('View');
    await expect(page.getByRole('region', { name: 'Workspace tools' })).toBeVisible();
    await expect(page.getByTestId('workspace-shell-overlay-slot')).toBeVisible();
    await expectMountedSlotAttributesMatch(page);

    await expect(page.locator('[data-dock-id="workspaceTools"]')).toHaveCount(0);
    await expect(page.locator('[data-dock-id="canvasLens"]')).toHaveCount(0);
    await expect(page.locator('[data-dock-id="mindmapRelationships"]')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Map', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Map', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
    );
    await expect(page.getByTestId('shell-ribbon')).toHaveAttribute('data-active-tab', 'map');
    await expect(page.getByTestId('shell-ribbon-content')).toHaveAttribute(
        'aria-labelledby',
        'shell-ribbon-tab-map'
    );
    await expect(page.getByTestId('shell-ribbon-content')).toContainText('Map lens');
});

test('shell can be disabled and legacy floating docks still work', async ({ page }) => {
    const { savedRequests, state } = await mockBackend(page, { shellEnabled: false });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/');

    await expect(page.getByRole('textbox', { name: 'Workspace name' })).toHaveValue(
        'Shell Foundation Smoke'
    );
    await expect(page.getByTestId('workspace-shell')).toHaveCount(0);
    await expect(page.locator('[data-dock-id="workspaceTools"]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Workspace tools', exact: true })).toBeVisible();

    const node = page.locator('.node-response').filter({ hasText: 'Shell smoke root' });
    await node.locator('[title="Node actions"]').click();
    await page.getByRole('button', { name: 'Node settings' }).click();
    await expect(page.locator('[data-dock-id="metadataInspector"]')).toBeVisible();
    await expect(page.locator('.metadata-inspector-floating-dock')).toContainText('Shell smoke root');

    const inspector = page.locator('.metadata-inspector-floating-dock');
    await inspector.getByLabel('Title').fill('Rollback Saved Root');
    await inspector.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('Applied locally')).toBeVisible();
    await page.getByRole('button', { name: 'Unsaved changes' }).click();

    await expect
        .poll(() => {
            const latest = savedRequests.at(-1);
            if (!latest?.flow_json) {
                return false;
            }
            const snapshot = JSON.parse(latest.flow_json);
            return snapshot.nodes?.some((item) => item.data?.title === 'Rollback Saved Root');
        })
        .toBe(true);

    await page.getByAltText('Open workspaces').click();
    await page.locator('.flow-row-main').filter({ hasText: state.savedFlowName }).click();
    await expect(page.locator('.node-response').filter({ hasText: 'Rollback Saved Root' })).toBeVisible();
});

test('default shell keeps predictable slots at a narrow viewport', async ({ page }) => {
    await mockBackend(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/');

    await expect(page.getByTestId('workspace-shell')).toBeVisible();
    await expect(page.getByTestId('workspace-shell')).toHaveAttribute('data-has-left-panel', 'true');
    await expect(page.getByTestId('workspace-shell')).toHaveAttribute('data-has-right-panel', 'false');
    await expect(page.getByTestId('workspace-shell')).toHaveAttribute('data-has-status-bar', 'true');
    await expectMountedSlotAttributesMatch(page);
    await expect(page.getByTestId('shell-ribbon')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-left-slot')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-canvas-slot')).toBeVisible();
    await expect(page.locator('[data-dock-id="workspaceTools"]')).toHaveCount(0);

    const metrics = await page.evaluate(() => {
        const shell = document.querySelector('[data-testid="workspace-shell"]');
        const canvas = document.querySelector('[data-testid="workspace-shell-canvas-slot"]');
        const ribbon = document.querySelector('[data-testid="shell-ribbon"]');
        const left = document.querySelector('[data-testid="workspace-shell-left-slot"]');
        const status = document.querySelector('[data-testid="workspace-shell-status-slot"]');
        const shellRect = shell?.getBoundingClientRect();
        const canvasRect = canvas?.getBoundingClientRect();
        const ribbonRect = ribbon?.getBoundingClientRect();
        const leftRect = left?.getBoundingClientRect();
        const statusRect = status?.getBoundingClientRect();

        return {
            bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
            shellWidth: shellRect?.width || 0,
            canvasWidth: canvasRect?.width || 0,
            ribbonWidth: ribbonRect?.width || 0,
            statusHeight: statusRect?.height || 0,
            canvasBottom: canvasRect?.bottom || 0,
            statusTop: statusRect?.top || 0,
            leftWidth: leftRect?.width || 0,
            leftRight: leftRect?.right || 0
        };
    });

    expect(metrics.bodyOverflow).toBeLessThanOrEqual(2);
    expect(metrics.shellWidth).toBeLessThanOrEqual(390);
    expect(metrics.canvasWidth).toBeGreaterThan(300);
    expect(metrics.ribbonWidth).toBeGreaterThan(300);
    expect(metrics.statusHeight).toBeGreaterThan(20);
    expect(metrics.canvasBottom).toBeLessThanOrEqual(metrics.statusTop + 1);
    expect(metrics.leftWidth).toBeLessThanOrEqual(390);
    expect(metrics.leftRight).toBeLessThanOrEqual(390);
});

test('closed shell properties slot stays collapsed until selection content is ready', async ({ page }) => {
    await mockBackend(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/');

    await expect(page.getByTestId('workspace-shell')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-left-slot')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-right-slot')).toHaveCount(0);
    await expect(page.getByTestId('workspace-shell')).toHaveAttribute('data-has-right-panel', 'false');
    await expectMountedSlotAttributesMatch(page);
});

test('shell routes AI generation progress through status bar instead of canvas dock', async ({ page }) => {
    await mockBackend(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/');

    await expect(page.getByTestId('workspace-shell')).toBeVisible();
    await page.evaluate(() => {
        window.dispatchEvent(
            new CustomEvent('mindmapwizard:ask-ai-generation-progress', {
                detail: {
                    requestId: 'shell-progress-fixture',
                    status: 'running',
                    stage: 'building_preview',
                    detail: 'Building preview',
                    role: { label: 'Workflow Mapper' },
                    scope: { type: 'workspace' }
                }
            })
        );
    });

    const statusSlot = page.getByTestId('workspace-shell-status-slot');
    const progress = statusSlot.locator('.shell-status-bar__progress');
    await expect(progress).toBeVisible();
    await expect(progress).toContainText('Workflow Mapper is drafting');
    await expect(page.locator('.ai-generation-progress-dock')).toHaveCount(0);
});

test('empty canvas guided starts route to shell AI guide instead of prompt modal', async ({ page }) => {
    await mockBackend(page, { initialFlowJson: emptyFlowJson });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/');

    await expect(page.getByTestId('workspace-shell')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Empty workspace' })).toBeVisible();
    await page.getByRole('region', { name: 'Empty workspace' }).getByRole('button', { name: 'Guided starts' }).click();

    const rightRail = page.getByTestId('workspace-shell-right-slot');
    await expect(rightRail).toBeVisible();
    await expect(rightRail.locator('.ai-helpers-panel')).toBeVisible();
    await expect(page.getByTestId('shell-ribbon')).toHaveAttribute('data-active-tab', 'ai');
    await expect(page.locator('.modal .ai-action-modal')).toHaveCount(0);
    await expect(page.locator('.react-flow__panel .ai-helpers-panel')).toHaveCount(0);
});

test('shell routes source intake into the bottom review tray', async ({ page }) => {
    await mockBackend(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/');

    await expect(page.getByTestId('workspace-shell')).toBeVisible();
    await page.getByRole('tab', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: /Add sources/i }).click();

    const bottomSlot = page.getByTestId('workspace-shell-bottom-slot');
    await expect(bottomSlot).toBeVisible();
    await expect(bottomSlot).toContainText('Source Intake');
    await expect(bottomSlot).toContainText('CHOOSE A STARTING POINT');
    await expect(bottomSlot.locator('.data-source-selector--tray')).toBeVisible();
    await expect(page.getByTestId('workspace-shell')).toHaveAttribute('data-has-bottom-tray', 'true');
    await expect(page.locator('[data-dock-id="workspaceTools"]')).toHaveCount(0);
});

const expectMountedSlotAttributesMatch = async (page) => {
    const mountedSlots = await page.evaluate(() => {
        const shell = document.querySelector('[data-testid="workspace-shell"]');
        return {
            leftAttr: shell?.getAttribute('data-has-left-panel'),
            rightAttr: shell?.getAttribute('data-has-right-panel'),
            bottomAttr: shell?.getAttribute('data-has-bottom-tray'),
            statusAttr: shell?.getAttribute('data-has-status-bar'),
            hasLeftSlot: Boolean(document.querySelector('[data-testid="workspace-shell-left-slot"]')),
            hasRightSlot: Boolean(document.querySelector('[data-testid="workspace-shell-right-slot"]')),
            hasBottomSlot: Boolean(document.querySelector('[data-testid="workspace-shell-bottom-slot"]')),
            hasStatusSlot: Boolean(document.querySelector('[data-testid="workspace-shell-status-slot"]'))
        };
    });

    expect(mountedSlots.leftAttr).toBe(String(mountedSlots.hasLeftSlot));
    expect(mountedSlots.rightAttr).toBe(String(mountedSlots.hasRightSlot));
    expect(mountedSlots.bottomAttr).toBe(String(mountedSlots.hasBottomSlot));
    expect(mountedSlots.statusAttr).toBe(String(mountedSlots.hasStatusSlot));
};
