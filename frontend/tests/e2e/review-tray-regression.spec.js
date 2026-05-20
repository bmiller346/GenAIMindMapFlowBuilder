import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd7994390f6';
const sourceId = 'review-tray-source/2026';
const sourceTitle = 'Review Tray Source.docx';

const createNode = ({
    id,
    title,
    parent = '',
    position = { x: 160, y: 140 },
    sourceRefs = []
}) => ({
    id,
    type: 'response',
    position,
    data: {
        title,
        body: title,
        node_type: 'strategy',
        status: 'ai_generated',
        parent,
        manual: false,
        source_refs: sourceRefs,
        display: { collapsed: false, layoutMode: 'vertical-children' },
        data: {
            summ: title,
            query: '',
            df: [],
            graph: {},
            source_refs: sourceRefs
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

const emptyFlowJson = () =>
    JSON.stringify({
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        workspace_brief: {},
        source_library: [],
        activity_events: [],
        ai_action_runs: [],
        automations: []
    });

const validationIssueFlowJson = () =>
    JSON.stringify({
        nodes: [
            createNode({
                id: 'issue-root',
                title: 'Unsourced review item',
                position: { x: 160, y: 160 },
                sourceRefs: []
            })
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        workspace_brief: {},
        source_library: [],
        activity_events: [],
        ai_action_runs: [],
        automations: []
    });

const draftSession = () => ({
    session_id: 'review-tray-draft-session-1',
    workspace_id: flowId,
    scope: { type: 'workspace' },
    role: 'workflow_mapper',
    intent: 'review_tray_drafts',
    prompt_history: [
        {
            role: 'user',
            content: 'Create a shell tray draft',
            created_at: '2026-05-19T18:45:00.000Z',
            revision_id: 'review-tray-draft-revision-1'
        }
    ],
    model_policy: 'balanced',
    selected_model: 'gpt-5.4',
    model_reason: 'Mocked review tray session.',
    revisions: [
        {
            revision_id: 'review-tray-draft-revision-1',
            session_id: 'review-tray-draft-session-1',
            prompt: 'Create a shell tray draft',
            draft_items: [],
            draft_nodes: [
                {
                    id: 'review-tray-draft-node',
                    parent_id: '',
                    title: 'Review tray AI draft',
                    summary: 'Drafts should open in the bottom review tray.',
                    node_type: 'note',
                    status: 'needs_review',
                    confidence: 0.82,
                    source_refs: []
                }
            ],
            draft_edges: [],
            draft_annotations: [],
            preview_diff: {
                mode: 'append',
                added_nodes: 1,
                added_edges: 0,
                updated_nodes: 0,
                review_outputs: 1,
                needs_review_repairs: 1,
                accepted_item_ids: ['review-tray-draft-node'],
                summary: '+1 nodes, !1 marked needs_review'
            },
            validation_report: {
                is_valid: true,
                repaired: false,
                issues: []
            },
            created_at: '2026-05-19T18:45:00.000Z',
            model: 'gpt-5.4',
            metadata: {}
        }
    ],
    source_refs: [],
    validation_reports: [],
    accept_history: [],
    status: 'drafting',
    metadata: {}
});

const generatedSourceGraph = () => ({
    nodes: [
        createNode({
            id: 'source-root',
            title: 'Review tray source map',
            position: { x: 160, y: 160 },
            sourceRefs: [
                {
                    document_id: sourceId,
                    chunk_id: 'chunk-overview',
                    section: 'Strategic Overview',
                    quote_snippet: 'The source draft should open in the review tray first.'
                }
            ]
        }),
        createNode({
            id: 'source-actions',
            title: 'Review tray action plan',
            parent: 'source-root',
            position: { x: 560, y: 160 },
            sourceRefs: [
                {
                    document_id: sourceId,
                    chunk_id: 'chunk-actions',
                    section: 'Action Plan',
                    quote_snippet: 'Accepting the tray draft applies the generated action plan.'
                }
            ]
        })
    ],
    edges: [createEdge('source-root', 'source-actions')],
    viewport: { x: 0, y: 0, zoom: 0.95 },
    source_library: [
        {
            id: sourceId,
            title: sourceTitle,
            type: 'docx',
            type_label: 'DOCX',
            status: 'parsed',
            component_id: 'docx-review-tray-source',
            chunks: [
                {
                    id: 'chunk-overview',
                    heading: 'Strategic Overview',
                    snippet: 'The source draft should open in the review tray first.'
                },
                {
                    id: 'chunk-actions',
                    heading: 'Action Plan',
                    snippet: 'Accepting the tray draft applies the generated action plan.'
                }
            ]
        }
    ],
    activity_events: [],
    ai_action_runs: [],
    automations: []
});

const parseSnapshot = (flowJsonValue) => JSON.parse(flowJsonValue || emptyFlowJson());

const shellSlotRects = async (page) =>
    page.evaluate(() => {
        const rectFor = (selector) => {
            const element = document.querySelector(selector);
            if (!element) {
                return null;
            }
            const rect = element.getBoundingClientRect();
            return {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height
            };
        };
        const overlapArea = (first, second) => {
            if (!first || !second) {
                return 0;
            }
            const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
            const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
            return width * height;
        };
        const left = rectFor('.workspace-shell__left');
        const right = rectFor('.workspace-shell__right');
        const bottom = rectFor('.workspace-shell__bottom');
        const status = rectFor('.workspace-shell__status');
        const ribbon = rectFor('.workspace-shell__ribbon');

        return {
            left,
            right,
            bottom,
            status,
            ribbon,
            leftBottomOverlap: overlapArea(left, bottom),
            rightBottomOverlap: overlapArea(right, bottom),
            leftStatusOverlap: overlapArea(left, status),
            rightStatusOverlap: overlapArea(right, status),
            bottomStatusOverlap: overlapArea(bottom, status),
            leftRibbonOverlap: overlapArea(left, ribbon),
            rightRibbonOverlap: overlapArea(right, ribbon),
            bottomAboveStatus: bottom && status ? bottom.bottom <= status.top + 1 : true,
            bodyOverflow: document.documentElement.scrollWidth - window.innerWidth
        };
    });

const setupMockBackend = async (page, initialFlowJson = emptyFlowJson()) => {
    await page.addInitScript(() => {
        window.localStorage.clear();
        window.localStorage.setItem('docmap.uiShellRibbon.enabled', 'true');
    });

    const state = {
        savedFlowJson: initialFlowJson
    };
    const docxUploadRequests = [];
    const savedRequests = [];

    await page.route('http://localhost:8000/flows', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    flow_id: flowId,
                    flow_name: 'Review Tray Flow',
                    flow_json: state.savedFlowJson,
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
                flow_name: 'Review Tray Flow',
                flow_json: state.savedFlowJson,
                flow_type: 'manual',
                summary: 'Flow is saved'
            })
        });
    });

    await page.route(/http:\/\/localhost:8000\/flow-update\/?$/, async (route) => {
        const body = route.request().postDataJSON();
        state.savedFlowJson = body.flow_json || state.savedFlowJson;
        savedRequests.push(body);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ flow_id: flowId, message: 'Flow updated successfully' })
        });
    });

    await page.route(/http:\/\/localhost:8000\/api\/workspaces\/[^/]+\/ai\/usage$/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                total_tokens: 1400,
                estimated_cost_usd: '$0.0032',
                session_count: 1,
                sessions: [
                    {
                        session_id: 'review-tray-draft-session-1',
                        selected_model: 'gpt-5.4',
                        total_tokens: 1400,
                        estimated_cost_usd: '$0.0032',
                        status: 'drafting',
                        revisions: [{ revision_id: 'review-tray-draft-revision-1' }],
                        created_at: '2026-05-19T18:45:00.000Z'
                    }
                ]
            })
        });
    });

    await page.route(
        /http:\/\/localhost:8000\/api\/workspaces\/[^/]+\/ai\/draft-sessions\/review-tray-draft-session-1$/,
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(draftSession())
            });
        }
    );

    await page.route('http://localhost:8000/component-create-docx', async (route) => {
        docxUploadRequests.push(route.request().url());
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                component_id: 'docx-review-tray-source',
                type: 'docx',
                filename: sourceTitle,
                flow_id: flowId,
                flow_name: 'Review Tray Flow',
                flow_type: 'manual',
                source_document_id: sourceId,
                mindmap_json: JSON.stringify(generatedSourceGraph())
            })
        });
    });

    return { docxUploadRequests, savedRequests, state };
};

test('shell review tray hosts AI draft sessions in Drafts', async ({ page }) => {
    await setupMockBackend(page);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    await page.locator('.workspace-dock-tabs').getByRole('button', { name: 'Health' }).click();
    await page.locator('.workspace-ai-usage').getByRole('button', { name: 'Refresh' }).click();
    await expect(page.locator('.workspace-ai-usage')).toContainText('1 draft sessions tracked');
    await page.locator('.workspace-ai-usage').getByText('Details').click();
    await page.locator('.workspace-ai-usage').getByRole('button', { name: 'Review' }).click();

    const tray = page.locator('.workspace-shell__bottom .review-tray');
    await expect(tray).toBeVisible();
    await expect(tray.getByRole('tab', { name: 'Drafts' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.locator('.ai-draft-session-panel')).toContainText('Review tray AI draft');
    await expect(page.locator('.workspace-shell__right')).toHaveCount(0);
    await expect(page.locator('.metadata-inspector-floating-dock')).toHaveCount(0);
});

test('shell review tray hosts generated source draft before applying it', async ({ page }) => {
    const { docxUploadRequests, savedRequests, state } = await setupMockBackend(page);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Add sources' }).click();
    await page.getByText('Upload one DOCX').click();
    await expect(page.getByText('Load A Docx', { exact: true })).toBeVisible();
    await page.locator('#docxFileUpload').setInputFiles({
        name: sourceTitle,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('Review tray source draft fixture.')
    });
    await page.locator('.modal-container').getByRole('button', { name: 'Add', exact: true }).click();

    await expect.poll(() => docxUploadRequests.length).toBe(1);
    const tray = page.locator('.workspace-shell__bottom .review-tray');
    await expect(tray).toBeVisible();
    await expect(tray.getByRole('tab', { name: 'Sources' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray).toContainText('Source draft review');
    await expect(tray).toContainText(sourceTitle);
    await expect(tray).toContainText('Review tray source map');
    await expect(page.locator('.react-flow__panel.source-draft-review-panel-shell')).toHaveCount(0);
    await expect(page.locator('.node-response').filter({ hasText: 'Review tray source map' })).toHaveCount(0);

    await tray.getByRole('button', { name: 'Accept draft' }).click();

    await expect(page.locator('.workspace-shell__bottom .review-tray')).toHaveCount(0);
    await expect(page.locator('.node-response').filter({ hasText: 'Review tray source map' })).toBeVisible();
    await expect(page.locator('.node-response').filter({ hasText: 'Review tray action plan' })).toBeVisible();
    await expect
        .poll(() => {
            const snapshot = parseSnapshot(state.savedFlowJson);
            return {
                saved: savedRequests.length > 0,
                nodeCount: snapshot.nodes.length,
                sourceCount: snapshot.source_library.length
            };
        })
        .toEqual({
            saved: true,
            nodeCount: 2,
            sourceCount: 1
        });
});

test('shell review tray hosts workspace health issues from the left rail', async ({ page }) => {
    await setupMockBackend(page, validationIssueFlowJson());

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    await page.locator('.workspace-dock-tabs').getByRole('button', { name: 'Health' }).click();
    await expect(page.locator('.workspace-dock-content .graph-validation-panel')).toBeVisible();
    await expect(page.locator('.workspace-dock-content .graph-validation-panel')).toContainText('Workspace health');

    await page.getByRole('button', { name: 'Review issues in tray' }).click();

    const tray = page.locator('.workspace-shell__bottom .review-tray');
    await expect(tray).toBeVisible();
    await expect(tray.getByRole('tab', { name: 'Issues' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.locator('.graph-validation-panel')).toBeVisible();
    await expect(tray).toContainText('Workspace health');
    await expect(tray).toContainText(/to review|No workspace health issues detected/);
});

test('shell review tray routes local output review views through shell state', async ({ page }) => {
    await setupMockBackend(page, validationIssueFlowJson());

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    await page.getByRole('tab', { name: 'Review', exact: true }).click();
    await page.getByRole('button', { name: /^Connections\b/ }).click();

    const tray = page.locator('.workspace-shell__bottom .review-tray');
    await expect(tray).toBeVisible();
    await expect(tray.getByRole('tab', { name: 'Connections' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.locator('.local-table-wrap')).toBeVisible();
    await expect(tray.locator('.local-view-content-surface')).toHaveCount(0);
    await expect(page.locator('.workspace-shell__right')).toHaveCount(0);

    await tray.getByRole('tab', { name: 'Tasks' }).click();
    await expect(tray.getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.locator('.local-task-preview')).toBeVisible();
    await expect(tray.locator('.local-view-content-surface')).toHaveCount(0);

    await tray.getByRole('tab', { name: 'Issues' }).click();
    await expect(tray.getByRole('tab', { name: 'Issues' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.locator('.local-missing-info-preview')).toBeVisible();
    await expect(tray.locator('.local-view-content-surface')).toHaveCount(0);

    await tray.getByRole('tab', { name: 'Sources' }).click();
    await expect(tray.getByRole('tab', { name: 'Sources' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.locator('.local-source-repair-preview')).toBeVisible();
    await expect(tray.locator('.local-view-content-surface')).toHaveCount(0);

    await tray.getByRole('button', { name: 'Close review tray' }).click();
    await expect(page.locator('.workspace-shell__bottom .review-tray')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Outputs', exact: true }).click();
    await page.getByRole('button', { name: /^Checklist\b/ }).click();
    await expect(tray).toBeVisible();
    await expect(tray.getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.locator('.local-checklist-preview')).toBeVisible();
    await expect(tray.locator('.local-view-content-surface')).toHaveCount(0);
});

test('shell review tray stays bounded with the left rail at desktop and narrow widths', async ({ page }) => {
    await setupMockBackend(page, validationIssueFlowJson());

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    await page.locator('.workspace-dock-tabs').getByRole('button', { name: 'Health' }).click();
    await page.getByRole('button', { name: 'Review issues in tray' }).click();
    await expect(page.locator('.workspace-shell__bottom .review-tray')).toBeVisible();

    const desktopRects = await shellSlotRects(page);
    expect(desktopRects.leftBottomOverlap).toBe(0);
    expect(desktopRects.leftStatusOverlap).toBe(0);
    expect(desktopRects.bottomStatusOverlap).toBe(0);
    expect(desktopRects.bottomAboveStatus).toBe(true);
    expect(desktopRects.leftRibbonOverlap).toBe(0);
    expect(desktopRects.bodyOverflow).toBeLessThanOrEqual(2);
    expect(desktopRects.status?.height || 0).toBeGreaterThan(20);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.workspace-shell__bottom .review-tray')).toBeVisible();

    const narrowRects = await shellSlotRects(page);
    expect(narrowRects.leftBottomOverlap).toBe(0);
    expect(narrowRects.leftStatusOverlap).toBe(0);
    expect(narrowRects.bottomStatusOverlap).toBe(0);
    expect(narrowRects.bottomAboveStatus).toBe(true);
    expect(narrowRects.leftRibbonOverlap).toBe(0);
    expect(narrowRects.bodyOverflow).toBeLessThanOrEqual(2);
    expect(narrowRects.bottom?.height || 0).toBeLessThanOrEqual(380);
    expect(narrowRects.status?.height || 0).toBeGreaterThan(20);
});
