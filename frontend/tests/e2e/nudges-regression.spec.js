import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd7994390ee';

const createNode = ({
    id,
    title,
    nodeType = 'concept',
    status = 'reviewed',
    position = { x: 0, y: 0 },
    sourceId = 'source-used',
    tags = 'ops',
    entities = 'Platform',
    ownerId = '',
    priority = '',
    dueDate = ''
}) => ({
    id,
    type: 'response',
    position,
    data: {
        title,
        body: title,
        node_type: nodeType,
        status,
        manual: true,
        tags,
        entities,
        priority,
        owner_id: ownerId,
        due_date: dueDate,
        source_refs: sourceId
            ? [
                  {
                      document_id: sourceId,
                      page: '1',
                      quote_snippet: `${title} quote`,
                      confidence: 0.86
                  }
              ]
            : [],
        display: { collapsed: false, layoutMode: 'vertical-children' },
        data: {
            summ: title,
            query: '',
            df: [],
            graph: {}
        }
    },
    targetPosition: 'left',
    sourcePosition: 'right',
    deletable: true
});

const createEdge = (source, target, type = 'step') => ({
    id: `${source}-${target}`,
    source,
    target,
    type,
    data: { relationship_type: type },
    animated: false
});

const baseFlowJson = () =>
    JSON.stringify({
        nodes: [
            createNode({
                id: 'root',
                title: 'Launch readiness',
                position: { x: 200, y: 160 },
                status: 'needs_review'
            }),
            createNode({
                id: 'task-a',
                title: 'Prepare handoff task',
                nodeType: 'task',
                position: { x: 640, y: 160 }
            }),
            createNode({
                id: 'topic-b',
                title: 'Related platform context',
                position: { x: 640, y: 340 }
            })
        ],
        edges: [createEdge('root', 'task-a'), createEdge('root', 'topic-b')],
        viewport: { x: 0, y: 0, zoom: 0.9 },
        workspace_brief: { desired_outputs: ['checklist', 'knowledge_graph'] },
        source_library: [
            { id: 'source-used', title: 'Used source', type: 'pdf', status: 'parsed' },
            { id: 'source-unused', title: 'Unused source', type: 'pdf', status: 'parsed' }
        ],
        activity_events: [],
        automations: []
    });

const denseFlowJson = () => {
    const nodes = [
        createNode({
            id: 'root',
            title: 'Dense review root',
            position: { x: 160, y: 160 },
            status: 'needs_review'
        })
    ];
    const edges = [];

    for (let index = 0; index < 30; index += 1) {
        const id = `dense-${index}`;
        nodes.push(
            createNode({
                id,
                title: `Dense node ${index + 1}`,
                nodeType: index % 3 === 0 ? 'task' : 'concept',
                position: {
                    x: 520 + Math.floor(index / 8) * 300,
                    y: 60 + (index % 8) * 115
                },
                tags: index % 2 === 0 ? 'ops, shared' : 'ops',
                entities: 'Platform'
            })
        );
        edges.push(createEdge('root', id));
    }

    return JSON.stringify({
        nodes,
        edges,
        viewport: { x: -80, y: 20, zoom: 0.72 },
        workspace_brief: { desired_outputs: ['checklist', 'knowledge_graph'] },
        source_library: [
            { id: 'source-used', title: 'Used source', type: 'pdf', status: 'parsed' },
            { id: 'source-unused', title: 'Unused source', type: 'pdf', status: 'parsed' }
        ],
        activity_events: [],
        automations: []
    });
};

const invalidFlowJson = () =>
    JSON.stringify({
        nodes: [
            createNode({
                id: 'root',
                title: 'Validation root',
                position: { x: 160, y: 160 }
            })
        ],
        edges: [createEdge('missing-node', 'root')],
        viewport: {},
        workspace_brief: {},
        source_library: [],
        activity_events: [],
        automations: []
    });

const setupMockBackend = async (page, initialFlowJson = baseFlowJson()) => {
    await page.route('http://localhost:8000/flows', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    flow_id: flowId,
                    flow_name: 'Nudge Flow',
                    flow_json: initialFlowJson,
                    flow_type: 'manual',
                    summary: 'Flow is saved'
                }
            ])
        });
    });

    await page.route(`http://localhost:8000/flows/${flowId}`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                flow_id: flowId,
                flow_name: 'Nudge Flow',
                flow_json: initialFlowJson,
                flow_type: 'manual',
                summary: 'Flow is saved'
            })
        });
    });

    await page.route('http://localhost:8000/flow-update', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ flow_id: flowId, message: 'Flow updated successfully' })
        });
    });
};

const openWorkspace = async (page) => {
    await page.goto('/');
    await expect(page.locator('.node-response').first()).toBeVisible();
};

const seedNudgePreferences = async (page, preferences) => {
    await page.addInitScript((value) => {
        window.localStorage.setItem('docmap.nudgePreferences', JSON.stringify(value));
    }, preferences);
};

test('nudges are visible by default and actions open the correct workspace view', async ({ page }) => {
    await setupMockBackend(page);
    await openWorkspace(page);

    await expect(page.locator('.workspace-nudge-surface')).toBeVisible();
    await expect(page.locator('.workspace-nudge').filter({ hasText: 'execution fields' })).toBeVisible();

    await page
        .locator('.workspace-nudge')
        .filter({ hasText: 'execution fields' })
        .getByRole('button', { name: /Open task preview/ })
        .click();
    await expect(page.locator('.local-task-preview')).toContainText('Generate task preview');
    await expect(page.locator('.node-inspector')).toContainText('Prepare handoff task');
});

test('master setting hides nudges without hiding validation', async ({ page }) => {
    await setupMockBackend(page, invalidFlowJson());
    await seedNudgePreferences(page, {
        enabled: false,
        density: 'normal',
        categories: {
            canvas: true,
            review: true,
            sources: true,
            tasks: true,
            ai_outputs: true,
            integrations: true,
            knowledge_graph: true
        }
    });
    await openWorkspace(page);

    await expect(page.locator('.workspace-nudge-surface')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Graph validation/ })).toBeVisible();
    await page.getByRole('button', { name: /Graph validation/ }).click();
    await expect(page.locator('.graph-validation-issues')).toContainText('Broken edge');
});

test('category setting hides only that nudge category', async ({ page }) => {
    await setupMockBackend(page);
    await openWorkspace(page);
    await expect(page.locator('.workspace-nudge').filter({ hasText: 'marked for review' })).toBeVisible();
    await expect(page.locator('.workspace-nudge').filter({ hasText: 'execution fields' })).toBeVisible();

    await page.locator('.workspace-nudge-settings').click();
    await page.locator('.settings-advanced summary').click();
    await page.locator('#nudge-category-review').uncheck();
    await page.locator('.settings-modal').getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.locator('.workspace-nudge').filter({ hasText: 'marked for review' })).toHaveCount(0);
    await expect(page.locator('.workspace-nudge').filter({ hasText: 'execution fields' })).toBeVisible();
});

test('source and graph actions route to the expected panels', async ({ page }) => {
    await setupMockBackend(page);
    await seedNudgePreferences(page, {
        enabled: true,
        density: 'assertive',
        categories: {
            canvas: true,
            review: true,
            sources: true,
            tasks: true,
            ai_outputs: true,
            integrations: true,
            knowledge_graph: true
        }
    });
    await openWorkspace(page);

    await page
        .locator('.workspace-nudge')
        .filter({ hasText: 'Source is not cited yet' })
        .getByRole('button', { name: /Review source coverage/ })
        .click();
    await expect(page.locator('.sources-panel')).toBeVisible();
    await expect(page.locator('.local-views-panel')).toContainText('Source repair');

    await page.locator('.sources-panel-header').getByRole('button', { name: 'Close' }).click();
    await page
        .locator('.workspace-nudge')
        .filter({ hasText: 'can be reviewed' })
        .getByRole('button', { name: /Find connections/ })
        .click();
    await expect(page.locator('.ai-helpers-panel')).toBeVisible();
    await expect(page.locator('.local-views-panel')).toContainText('Find connections');
});

test('output and empty review CTAs open valid AI presets', async ({ page }) => {
    await setupMockBackend(page);
    await openWorkspace(page);

    await page.getByLabel('AI output previews').selectOption('chartData');
    await expect(page.locator('.local-view-empty')).toContainText('Extract chart data');
    await page.getByRole('button', { name: 'Ask AI to extract chart data' }).click();
    await expect(page.locator('.ai-action-modal')).toBeVisible();
    await expect(page.getByLabel('Advanced role')).toHaveValue('data-table-interpreter');
    await expect(page.getByLabel('What do you want?')).toHaveValue('interpret_table_data');
    await page.getByAltText('Cross Svg').click();

    await page.getByLabel('Review outputs').selectOption('sources');
    await expect(page.locator('.local-source-repair-preview')).toContainText(
        'No source-reference repairs are needed'
    );
    await page.getByRole('button', { name: 'Ask AI to review source coverage' }).click();
    await expect(page.locator('.ai-action-modal')).toBeVisible();
    await expect(page.getByLabel('Advanced role')).toHaveValue('source-ref-repair');
    await expect(page.getByLabel('What do you want?')).toHaveValue('find_missing_source_support');
});

test('dismiss hides the nudge by dismiss key', async ({ page }) => {
    await setupMockBackend(page);
    await openWorkspace(page);

    const nudge = page.locator('.workspace-nudge').filter({ hasText: 'execution fields' });
    await expect(nudge).toBeVisible();
    await nudge.getByRole('button', { name: /Dismiss/ }).click();
    await expect(page.locator('.workspace-nudge').filter({ hasText: 'execution fields' })).toHaveCount(0);

    await page.reload();
    await expect(page.locator('.workspace-nudge').filter({ hasText: 'execution fields' })).toHaveCount(0);
});

test('dense graph keeps global guidance compact', async ({ page }, testInfo) => {
    await setupMockBackend(page, denseFlowJson());
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page);

    await expect(page.locator('.node-response')).toHaveCount(31);
    await expect(page.locator('.workspace-nudge')).toHaveCount(4);
    const box = await page.locator('.workspace-nudge-surface').boundingBox();
    expect(box.height).toBeLessThanOrEqual(360);
    await testInfo.attach('nudges-dense-graph', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png'
    });
});
