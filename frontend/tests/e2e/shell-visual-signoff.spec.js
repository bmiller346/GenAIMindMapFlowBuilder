import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd7994390f9';

const matrixViewports = [
    { name: '1600x1000', width: 1600, height: 1000 },
    { name: '1440x900', width: 1440, height: 900 },
    { name: '390x844', width: 390, height: 844 }
];

const flowJson = JSON.stringify({
    nodes: [
        {
            id: 'root',
            type: 'response',
            position: { x: 0, y: 0 },
            data: {
                title: 'Visual QA root',
                node_type: 'concept',
                status: 'reviewed',
                manual: true
            }
        },
        {
            id: 'branch-a',
            type: 'response',
            position: { x: 360, y: -130 },
            data: {
                title: 'Visual QA branch',
                node_type: 'concept',
                status: 'needs_review',
                manual: true
            }
        }
    ],
    edges: [
        {
            id: 'edge-root-branch',
            source: 'root',
            target: 'branch-a',
            type: 'smoothstep',
            relationship_type: 'contains',
            data: { relationship_type: 'contains' }
        }
    ],
    viewport: { x: 240, y: 240, zoom: 0.9 },
    workspace_brief: {},
    source_library: [],
    activity_events: [],
    ai_action_runs: [],
    automations: []
});

const mockBackend = async (page, { shellEnabled = true } = {}) => {
    await page.addInitScript(({ shellEnabledFlag }) => {
        window.localStorage.clear();
        window.localStorage.setItem(
            'docmap.uiShellRibbon.enabled',
            shellEnabledFlag ? 'true' : 'false'
        );
    }, { shellEnabledFlag: shellEnabled });

    const flowRecord = () => ({
        flow_id: flowId,
        flow_name: 'Shell Visual Signoff QA',
        flow_json: flowJson,
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
};

const openFixture = async (page) => {
    await page.goto('/#/');
    await expect(page.getByRole('textbox', { name: 'Workspace name' })).toHaveValue(
        'Shell Visual Signoff QA'
    );
    await expect(page.locator('.node-response').filter({ hasText: 'Visual QA root' })).toBeVisible();
};

const shellMetrics = async (page) =>
    page.evaluate(() => {
        const rectFor = (selector) => {
            const element = document.querySelector(selector);
            const rect = element?.getBoundingClientRect();
            return rect
                ? {
                      left: rect.left,
                      right: rect.right,
                      top: rect.top,
                      bottom: rect.bottom,
                      width: rect.width,
                      height: rect.height
                  }
                : null;
        };
        return {
            bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
            shell: rectFor('[data-testid="workspace-shell"]'),
            ribbon: rectFor('[data-testid="shell-ribbon"]'),
            left: rectFor('[data-testid="workspace-shell-left-slot"]'),
            canvas: rectFor('[data-testid="workspace-shell-canvas-slot"]'),
            right: rectFor('[data-testid="workspace-shell-right-slot"]'),
            bottom: rectFor('[data-testid="workspace-shell-bottom-slot"]'),
            status: rectFor('[data-testid="workspace-shell-status-slot"]')
        };
    });

const expectRectInsideViewport = (rect, viewport, label) => {
    expect(rect, `${label} should exist`).toBeTruthy();
    expect(rect.left, `${label} left edge`).toBeGreaterThanOrEqual(-1);
    expect(rect.top, `${label} top edge`).toBeGreaterThanOrEqual(-1);
    expect(rect.right, `${label} right edge`).toBeLessThanOrEqual(viewport.width + 1);
    expect(rect.bottom, `${label} bottom edge`).toBeLessThanOrEqual(viewport.height + 1);
    expect(rect.width, `${label} width`).toBeGreaterThan(1);
    expect(rect.height, `${label} height`).toBeGreaterThan(1);
};

const expectNoOverlap = (first, second, firstLabel, secondLabel) => {
    if (!first || !second) {
        return;
    }
    const overlapWidth = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
    const overlapHeight = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    expect(overlapWidth * overlapHeight, `${firstLabel} overlaps ${secondLabel}`).toBe(0);
};

for (const viewport of matrixViewports) {
    test(`shell visual matrix captures default shell at ${viewport.name}`, async ({ page }, testInfo) => {
        await mockBackend(page, { shellEnabled: true });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await openFixture(page);

        await expect(page.getByTestId('workspace-shell')).toBeVisible();
        await expect(page.locator('[data-dock-id="workspaceTools"]')).toHaveCount(0);
        await expect(page.getByTestId('shell-ribbon')).toBeVisible();
        await expect(page.getByTestId('workspace-shell-left-slot')).toBeVisible();
        await expect(page.getByTestId('workspace-shell-canvas-slot')).toBeVisible();
        await expect(page.getByTestId('workspace-shell-status-slot')).toBeVisible();

        await testInfo.attach(`shell-on-${viewport.name}-default`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png'
        });

        if (viewport.width <= 1100) {
            await page.getByRole('button', { name: 'Collapse navigator' }).click();
            await expect(page.locator('.shell-left-navigator--collapsed')).toBeVisible();
            await testInfo.attach(`shell-on-${viewport.name}-collapsed-navigator`, {
                body: await page.screenshot({ fullPage: true }),
                contentType: 'image/png'
            });
        }

        const rootNode = page.locator('.node-response').filter({ hasText: 'Visual QA root' });
        await rootNode.click();
        await expect(page.getByTestId('workspace-shell-right-slot')).toBeVisible();
        await expect(page.getByTestId('workspace-shell-bottom-slot')).toHaveCount(0);

        await testInfo.attach(`shell-on-${viewport.name}-right-rail`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png'
        });

        await page.getByTestId('workspace-shell-right-slot').getByRole('button', { name: 'Close' }).click();
        await page.getByRole('tab', { name: 'Home', exact: true }).click();
        await page.getByRole('button', { name: /Add sources/i }).click();
        await expect(page.getByTestId('workspace-shell-bottom-slot')).toBeVisible();
        await expect(page.getByTestId('workspace-shell-right-slot')).toHaveCount(0);

        await testInfo.attach(`shell-on-${viewport.name}-review-tray`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png'
        });

        const metrics = await shellMetrics(page);
        expect(metrics.bodyOverflow).toBeLessThanOrEqual(2);
        expectRectInsideViewport(metrics.shell, viewport, 'shell');
        expectRectInsideViewport(metrics.ribbon, viewport, 'ribbon');
        expectRectInsideViewport(metrics.left, viewport, 'left rail');
        expectRectInsideViewport(metrics.canvas, viewport, 'canvas');
        expectRectInsideViewport(metrics.bottom, viewport, 'review tray');
        expectRectInsideViewport(metrics.status, viewport, 'status bar');
        expectNoOverlap(metrics.ribbon, metrics.canvas, 'ribbon', 'canvas');
        expectNoOverlap(metrics.bottom, metrics.status, 'review tray', 'status bar');
        if (viewport.width <= 1100) {
            expect(metrics.left.width, 'collapsed narrow left rail width').toBeLessThanOrEqual(56);
        } else {
            expectNoOverlap(metrics.left, metrics.canvas, 'left rail', 'canvas');
        }
    });

    test(`shell visual matrix captures rollback shell-off at ${viewport.name}`, async ({
        page
    }, testInfo) => {
        await mockBackend(page, { shellEnabled: false });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await openFixture(page);

        await expect(page.getByTestId('workspace-shell')).toHaveCount(0);
        await expect(page.locator('[data-dock-id="workspaceTools"]')).toBeVisible();

        await testInfo.attach(`shell-off-${viewport.name}-rollback`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png'
        });

        const metrics = await page.evaluate(() => {
            const dock = document.querySelector('[data-dock-id="workspaceTools"]')?.getBoundingClientRect();
            const node = [...document.querySelectorAll('.node-response')]
                .find((element) => element.textContent?.includes('Visual QA root'))
                ?.getBoundingClientRect();
            return {
                bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
                dock: dock
                    ? {
                          left: dock.left,
                          right: dock.right,
                          top: dock.top,
                          bottom: dock.bottom,
                          width: dock.width,
                          height: dock.height
                      }
                    : null,
                node: node
                    ? {
                          left: node.left,
                          right: node.right,
                          top: node.top,
                          bottom: node.bottom,
                          width: node.width,
                          height: node.height
                      }
                    : null
            };
        });

        expect(metrics.bodyOverflow).toBeLessThanOrEqual(2);
        expectRectInsideViewport(metrics.dock, viewport, 'rollback workspace dock');
        expect(metrics.node, 'rollback canvas node should be visible').toBeTruthy();
    });
}
