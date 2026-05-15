import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd7994390ff';

const emptyFlowJson = JSON.stringify({
    nodes: [],
    edges: [],
    viewport: {},
    workspace_brief: {},
    source_library: [],
    activity_events: [],
    automations: []
});

const createNode = ({
    id,
    title,
    nodeType = 'concept',
    status = 'needs_review',
    position = { x: 0, y: 0 },
    df = [],
    body = '',
    manual = true
}) => ({
    id,
    type: 'response',
    position,
    data: {
        title,
        body,
        node_type: nodeType,
        status,
        manual,
        source_refs: [],
        display: { collapsed: false, layoutMode: 'vertical-children' },
        data: {
            summ: body || title,
            query: '',
            df,
            graph: {}
        }
    },
    targetPosition: 'left',
    sourcePosition: 'right',
    deletable: true
});

const createEdge = (source, target) => ({
    id: `${source}-${target}`,
    source,
    target,
    type: 'step',
    animated: false
});

const createDenseFlowJson = () => {
    const nodes = [
        createNode({
            id: 'root',
            title:
                'Root with a deliberately long title that should wrap without escaping its node surface',
            position: { x: 260, y: 160 }
        }),
        createNode({
            id: 'generated',
            title: 'AI generated summary node',
            status: 'ai_generated',
            manual: false,
            position: { x: 700, y: 160 },
            body:
                'This generated response has a long summary that should stay behind the details expansion by default while preserving the compact node surface for scanning.'
        }),
        createNode({
            id: 'manual-table',
            title: 'Manual table preview',
            nodeType: 'reference',
            position: { x: 700, y: 320 },
            df: [{ Column: 'Persisted', Owner: 'QA', State: 'Ready' }]
        }),
        createNode({
            id: 'task-1',
            title: 'Task item for projection',
            nodeType: 'task',
            position: { x: 700, y: 480 }
        })
    ];
    const edges = [
        createEdge('root', 'generated'),
        createEdge('root', 'manual-table'),
        createEdge('root', 'task-1')
    ];

    for (let index = 0; index < 22; index += 1) {
        const id = `dense-${index}`;
        nodes.push(
            createNode({
                id,
                title: `Dense sibling ${index + 1}`,
                nodeType: index % 3 === 0 ? 'task' : 'concept',
                position: {
                    x: 1140 + Math.floor(index / 8) * 360,
                    y: 40 + (index % 8) * 118
                }
            })
        );
        edges.push(createEdge(index % 2 === 0 ? 'generated' : 'task-1', id));
    }

    return JSON.stringify({
        nodes,
        edges,
        viewport: { x: -80, y: 40, zoom: 0.72 },
        workspace_brief: {},
        source_library: [],
        activity_events: [],
        automations: []
    });
};

const setupMockBackend = async (page, { initialFlowJson = emptyFlowJson } = {}) => {
    const state = {
        savedFlowName: 'Closeout Flow',
        savedFlowJson: initialFlowJson,
        createdFlow: initialFlowJson !== emptyFlowJson
    };
    const savedRequests = [];

    await page.route('http://localhost:8000/create-flow', async (route) => {
        state.createdFlow = true;
        state.savedFlowJson = emptyFlowJson;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                flow_id: flowId,
                flow_name: state.savedFlowName,
                flow_type: 'manual'
            })
        });
    });

    await page.route('http://localhost:8000/flow-update', async (route) => {
        const requestBody = route.request().postDataJSON();
        state.savedFlowName = requestBody.flow_name;
        state.savedFlowJson = requestBody.flow_json;
        savedRequests.push(requestBody);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ flow_id: flowId, message: 'Flow updated successfully' })
        });
    });

    await page.route(`http://localhost:8000/flows/${flowId}`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                flow_id: flowId,
                flow_name: state.savedFlowName,
                flow_json: state.savedFlowJson,
                flow_type: 'manual',
                summary: 'Flow is saved'
            })
        });
    });

    await page.route('http://localhost:8000/flows', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
                state.createdFlow
                    ? [
                          {
                              flow_id: flowId,
                              flow_name: state.savedFlowName,
                              flow_json: state.savedFlowJson,
                              flow_type: 'manual',
                              summary: 'Flow is saved'
                          }
                      ]
                    : []
            )
        });
    });

    await page.route('http://localhost:8000/api/workspaces/**/exports/json', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ validation_report: undefined })
        });
    });

    return { savedRequests, state };
};

const openExistingWorkspace = async (page) => {
    await page.goto('/');
    await page.getByAltText('Open workspaces').click();
    await page.locator('.flow-row-main').filter({ hasText: 'Closeout Flow' }).click();
};

const clickNodeMenuAction = async (page, name) => {
    await page
        .locator('.node-action-menu')
        .getByRole('button', { name })
        .click({ force: true });
};

test('view compatibility and validation selection work for manual nodes', async ({ page }) => {
    await setupMockBackend(page);

    await page.goto('/');
    await page.getByRole('button', { name: 'Add root', exact: true }).click();
    await page.locator('.node-title-input').first().fill('Closeout root');
    await page.locator('.node-quick-add').first().click();
    await page.locator('.node-title-input').nth(1).fill('Closeout task /');
    await page.locator('.node-slash-menu').getByRole('button', { name: /Add table/ }).click();
    await expect(page.locator('.manual-table-preview')).toBeVisible();
    await page.locator('.manual-table-preview').getByRole('button').click();
    await page.locator('.manual-table-editor tbody input').first().fill('Closeout table cell');

    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.locator('.node-title-input').first()).toHaveValue('Closeout root');
    await page.getByRole('button', { name: 'Clear branch' }).click({ force: true });

    await page.getByRole('button', { name: 'Outline', exact: true }).click();
    await expect(page.locator('.local-outline-row').filter({ hasText: 'Closeout root' })).toBeVisible();
    await expect(page.locator('.local-outline-row').filter({ hasText: 'Manual table' })).toBeVisible();
    await page
        .locator('.local-outline-row')
        .filter({ hasText: 'Closeout task' })
        .getByRole('button', { name: 'Branch' })
        .click();
    await expect(page.locator('.local-branch-control')).toContainText('Closeout task');

    await page.getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(page.locator('.local-projection-table').filter({ hasText: 'Closeout task' })).toBeVisible();

    await page.getByRole('button', { name: 'Clear branch' }).click({ force: true });
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(page.locator('.local-projection-table').filter({ hasText: 'Manual table' })).toBeVisible();
    await expect(page.locator('.local-projection-table').filter({ hasText: '1 x 1 table' })).toBeVisible();

    await page.getByRole('button', { name: /Graph validation/ }).click();
    await page.locator('.graph-validation-issues').getByRole('button', { name: 'Inspect' }).first().click();
    await expect(page.locator('.node-inspector')).toBeVisible();
});

test('AI slash preview commands do not structurally mutate nodes or edges', async ({ page }) => {
    const { state } = await setupMockBackend(page);

    await page.goto('/');
    await page.getByRole('button', { name: 'Add root', exact: true }).click();
    await page.locator('.node-title-input').first().fill('Preview root');
    await expect.poll(() => JSON.parse(state.savedFlowJson).nodes.length).toBe(1);

    await page.locator('.node-title-input').first().fill('/ai');
    const beforeCommand = JSON.parse(state.savedFlowJson);
    await page.locator('.node-slash-menu').getByRole('button', { name: /^AI helpers/ }).click();
    await expect(page.locator('.local-branch-control')).toContainText('/');
    const afterCommand = JSON.parse(state.savedFlowJson);

    expect(afterCommand.nodes).toEqual(beforeCommand.nodes);
    expect(afterCommand.edges).toEqual(beforeCommand.edges);
});

test('visual matrix covers themes, narrow viewport, dense graph, long titles, tables, and generated details', async ({
    page
}, testInfo) => {
    const consoleMessages = [];
    page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) {
            consoleMessages.push(`${message.type()}: ${message.text()}`);
        }
    });
    page.on('pageerror', (error) => {
        consoleMessages.push(`pageerror: ${error.message}`);
    });

    await setupMockBackend(page, { initialFlowJson: createDenseFlowJson() });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExistingWorkspace(page);
    await expect(page.locator('.node-response')).toHaveCount(26);
    await expect(page.locator('.manual-table-preview')).toBeVisible();
    await expect(page.locator('.node-details-toggle')).toHaveText('Show details');
    await testInfo.attach('node-authoring-dark-dense', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png'
    });

    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.locator('.app.light')).toBeVisible();
    await testInfo.attach('node-authoring-light-dense', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png'
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.node-title-input').first()).toBeVisible();
    const firstTitleBox = await page.locator('.node-title-input').first().boundingBox();
    const firstNodeBox = await page.locator('.node-response').first().boundingBox();
    expect(firstTitleBox.width).toBeLessThanOrEqual(firstNodeBox.width);
    await testInfo.attach('node-authoring-narrow-long-title', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png'
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.node-details-toggle').click();
    await expect(page.locator('.summary-block')).toContainText('long summary');
    await page.locator('.node-menu-trigger').first().click({ force: true });
    await expect(page.locator('.node-action-menu')).toBeVisible();
    await expect(page.locator('.node-action-group')).toHaveCount(5);
    await expect(page.locator('.node-action-menu')).toContainText('Insert');
    await expect(page.locator('.node-action-menu')).toContainText('AI');
    await expect(page.locator('.node-action-menu')).toContainText('Branch');
    await expect(page.locator('.node-action-menu')).toContainText('Review');
    await expect(page.locator('.node-action-menu')).toContainText('Danger');
    await testInfo.attach('node-authoring-menu-table-details', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png'
    });

    expect(
        consoleMessages.filter(
            (message) =>
                !message.includes('React Router Future Flag Warning') &&
                !message.includes('Download is starting') &&
                !message.includes('net::ERR_NETWORK_ACCESS_DENIED')
        )
    ).toEqual([]);
});
