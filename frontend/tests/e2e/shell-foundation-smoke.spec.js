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

const mockBackend = async (page) => {
    await page.addInitScript(() => {
        window.localStorage.clear();
        window.localStorage.setItem('docmap.uiShellRibbon.enabled', 'true');
    });

    const flowRecord = {
        flow_id: flowId,
        flow_name: 'Shell Foundation Smoke',
        flow_json: flowJson,
        flow_type: 'manual',
        summary: 'Flow is saved'
    };

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
            body: JSON.stringify([flowRecord])
        });
    });

    await page.route(`http://localhost:8000/flows/${flowId}`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(flowRecord)
        });
    });

    await page.route(/http:\/\/localhost:8000\/api\/workspaces\/[^/]+\/ai\/usage$/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ sessions: [] })
        });
    });
};

test('feature-flagged shell renders wrapper slots without legacy primary floating docks', async ({ page }) => {
    await mockBackend(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/');

    await expect(page.getByRole('textbox', { name: 'Workspace name' })).toHaveValue(
        'Shell Foundation Smoke'
    );
    await expect(page.getByTestId('workspace-shell')).toBeVisible();
    await expect(page.getByTestId('workspace-shell')).toHaveAttribute('data-has-left-panel', 'true');
    await expect(page.getByTestId('workspace-shell')).toHaveAttribute('data-has-right-panel', 'false');
    await expect(page.getByTestId('shell-ribbon')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-left-slot')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-canvas-slot')).toBeVisible();
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

test('feature-flagged shell keeps predictable slots at a narrow viewport', async ({ page }) => {
    await mockBackend(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/');

    await expect(page.getByTestId('workspace-shell')).toBeVisible();
    await expect(page.getByTestId('workspace-shell')).toHaveAttribute('data-has-left-panel', 'true');
    await expect(page.getByTestId('workspace-shell')).toHaveAttribute('data-has-right-panel', 'false');
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
        const shellRect = shell?.getBoundingClientRect();
        const canvasRect = canvas?.getBoundingClientRect();
        const ribbonRect = ribbon?.getBoundingClientRect();
        const leftRect = left?.getBoundingClientRect();

        return {
            bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
            shellWidth: shellRect?.width || 0,
            canvasWidth: canvasRect?.width || 0,
            ribbonWidth: ribbonRect?.width || 0,
            leftWidth: leftRect?.width || 0,
            leftRight: leftRect?.right || 0
        };
    });

    expect(metrics.bodyOverflow).toBeLessThanOrEqual(2);
    expect(metrics.shellWidth).toBeLessThanOrEqual(390);
    expect(metrics.canvasWidth).toBeGreaterThan(300);
    expect(metrics.ribbonWidth).toBeGreaterThan(300);
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

const expectMountedSlotAttributesMatch = async (page) => {
    const mountedSlots = await page.evaluate(() => {
        const shell = document.querySelector('[data-testid="workspace-shell"]');
        return {
            leftAttr: shell?.getAttribute('data-has-left-panel'),
            rightAttr: shell?.getAttribute('data-has-right-panel'),
            bottomAttr: shell?.getAttribute('data-has-bottom-tray'),
            hasLeftSlot: Boolean(document.querySelector('[data-testid="workspace-shell-left-slot"]')),
            hasRightSlot: Boolean(document.querySelector('[data-testid="workspace-shell-right-slot"]')),
            hasBottomSlot: Boolean(document.querySelector('[data-testid="workspace-shell-bottom-slot"]'))
        };
    });

    expect(mountedSlots.leftAttr).toBe(String(mountedSlots.hasLeftSlot));
    expect(mountedSlots.rightAttr).toBe(String(mountedSlots.hasRightSlot));
    expect(mountedSlots.bottomAttr).toBe(String(mountedSlots.hasBottomSlot));
};
