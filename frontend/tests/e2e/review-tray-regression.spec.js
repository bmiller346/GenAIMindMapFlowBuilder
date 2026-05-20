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

const checklistCandidateFlowJson = () =>
    JSON.stringify({
        nodes: [
            createNode({
                id: 'checklist-root',
                title: 'Review checklist intake',
                position: { x: 160, y: 160 },
                sourceRefs: [
                    {
                        document_id: sourceId,
                        chunk_id: 'chunk-checklist',
                        section: 'Checklist Intake',
                        quote_snippet: 'Confirm the intake checklist before publishing.'
                    }
                ]
            })
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        workspace_brief: {},
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
                        id: 'chunk-checklist',
                        heading: 'Checklist Intake',
                        snippet: 'Confirm the intake checklist before publishing.'
                    }
                ]
            }
        ],
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

const connectionDraftSession = () => ({
    ...draftSession(),
    revisions: [
        {
            ...draftSession().revisions[0],
            draft_items: [
                {
                    id: 'review-tray-relationship-candidate',
                    item_type: 'relationship_candidate',
                    title: 'Review tray source map supports review tray action plan',
                    content: 'Relationship candidates should mutate the graph only after tray acceptance.',
                    source_refs: [{ document_id: sourceId, chunk_id: 'chunk-actions' }],
                    metadata: {
                        source_node_id: 'review-tray-source-map-draft',
                        target_node_id: 'review-tray-action-plan-draft',
                        relationship_type: 'supports',
                        relationship_edge_id: 'review-tray-relationship-edge',
                        confidence: 0.84
                    }
                }
            ],
            draft_nodes: [
                {
                    id: 'review-tray-source-map-draft',
                    parent_id: '',
                    title: 'Review tray source map',
                    summary: 'Connection candidate source node.',
                    node_type: 'note',
                    status: 'needs_review',
                    confidence: 0.82,
                    source_refs: [{ document_id: sourceId, chunk_id: 'chunk-overview' }]
                },
                {
                    id: 'review-tray-action-plan-draft',
                    parent_id: '',
                    title: 'Review tray action plan',
                    summary: 'Connection candidate target node.',
                    node_type: 'note',
                    status: 'needs_review',
                    confidence: 0.78,
                    source_refs: [{ document_id: sourceId, chunk_id: 'chunk-actions' }]
                }
            ],
            draft_edges: [],
            preview_diff: {
                mode: 'append',
                added_nodes: 2,
                added_edges: 1,
                updated_nodes: 0,
                review_outputs: 1,
                needs_review_repairs: 0,
                accepted_item_ids: [
                    'review-tray-source-map-draft',
                    'review-tray-action-plan-draft',
                    'review-tray-relationship-candidate'
                ],
                summary: '+2 nodes, +1 relationship candidate'
            }
        }
    ]
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
        const shell = rectFor('[data-testid="workspace-shell"]');
        const left = rectFor('[data-testid="workspace-shell-left-slot"]');
        const right = rectFor('[data-testid="workspace-shell-right-slot"]');
        const bottom = rectFor('[data-testid="workspace-shell-bottom-slot"]');
        const status = rectFor('[data-testid="workspace-shell-status-slot"]');
        const ribbon = rectFor('[data-testid="workspace-shell-ribbon-slot"]');

        return {
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            shell,
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

const expectShellSlotsBounded = (rects, { narrow = false, expectRight = false, expectBottom = false } = {}) => {
    expect(rects.shell?.width || 0).toBeGreaterThan(300);
    expect(rects.ribbon?.height || 0).toBeGreaterThan(40);
    expect(rects.left?.height || 0).toBeGreaterThan(120);
    expect(rects.status?.height || 0).toBeGreaterThan(20);
    expect(rects.bodyOverflow).toBeLessThanOrEqual(2);

    expect(rects.ribbon.left).toBeGreaterThanOrEqual(-1);
    expect(rects.ribbon.right).toBeLessThanOrEqual(rects.viewport.width + 1);
    expect(rects.left.left).toBeGreaterThanOrEqual(-1);
    expect(rects.left.right).toBeLessThanOrEqual(rects.viewport.width + 1);
    expect(rects.status.left).toBeGreaterThanOrEqual(-1);
    expect(rects.status.right).toBeLessThanOrEqual(rects.viewport.width + 1);

    expect(rects.left.top).toBeGreaterThanOrEqual(rects.ribbon.bottom - 1);
    expect(rects.leftStatusOverlap).toBe(0);
    expect(rects.leftRibbonOverlap).toBe(0);

    if (expectRight) {
        expect(rects.right?.height || 0).toBeGreaterThan(120);
        expect(rects.right.left).toBeGreaterThanOrEqual(-1);
        expect(rects.right.right).toBeLessThanOrEqual(rects.viewport.width + 1);
        expect(rects.right.top).toBeGreaterThanOrEqual(rects.ribbon.bottom - 1);
        expect(rects.rightStatusOverlap).toBe(0);
        expect(rects.rightRibbonOverlap).toBe(0);
    }

    if (expectBottom) {
        expect(rects.bottom?.height || 0).toBeGreaterThan(120);
        expect(rects.bottomAboveStatus).toBe(true);
        expect(rects.leftBottomOverlap).toBe(0);
        expect(rects.rightBottomOverlap).toBe(0);
        expect(rects.bottomStatusOverlap).toBe(0);
    }

    if (narrow && expectBottom) {
        expect(rects.bottom.height).toBeLessThanOrEqual(Math.ceil(rects.viewport.height * 0.44) + 1);
    }

    if (narrow && expectRight) {
        expect(rects.right.width).toBeLessThanOrEqual(rects.viewport.width - 8);
    }
};

const setupMockBackend = async (page, initialFlowJson = emptyFlowJson(), options = {}) => {
    await page.addInitScript(() => {
        window.localStorage.clear();
        window.localStorage.setItem('docmap.uiShellRibbon.enabled', 'true');
    });

    const state = {
        savedFlowJson: initialFlowJson
    };
    const activeDraftSession = options.draftSession || draftSession();
    const docxUploadRequests = [];
    const savedRequests = [];
    const draftAcceptRequests = [];

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
                        session_id: activeDraftSession.session_id,
                        selected_model: activeDraftSession.selected_model || 'gpt-5.4',
                        total_tokens: 1400,
                        estimated_cost_usd: '$0.0032',
                        status: activeDraftSession.status || 'drafting',
                        revisions: activeDraftSession.revisions.map((revision) => ({
                            revision_id: revision.revision_id
                        })),
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
                body: JSON.stringify(activeDraftSession)
            });
        }
    );

    await page.route(
        /http:\/\/localhost:8000\/api\/workspaces\/[^/]+\/ai\/draft-sessions\/[^/]+\/accept$/,
        async (route) => {
            const requestBody = route.request().postDataJSON();
            const revision = activeDraftSession.revisions.at(-1);
            const selectedIds = requestBody.mode === 'selected' ? requestBody.selected_item_ids || [] : [];
            const shouldAccept = (id) => selectedIds.length === 0 || selectedIds.includes(id);
            const snapshot = parseSnapshot(state.savedFlowJson);
            const existingNodeIds = new Set(snapshot.nodes.map((node) => node.id));
            const acceptedNodes = (revision.draft_nodes || [])
                .filter((node) => shouldAccept(node.id) && !existingNodeIds.has(node.id))
                .map((node, index) => ({
                    id: node.id,
                    type: 'response',
                    position: { x: 240 + index * 320, y: 180 },
                    data: {
                        title: node.title,
                        body: node.summary,
                        node_type: node.node_type,
                        status: node.status,
                        confidence: node.confidence,
                        source_refs: node.source_refs || [],
                        metadata: {
                            ...(node.metadata || {}),
                            source: 'ai_draft_session',
                            ai_draft_session_id: activeDraftSession.session_id,
                            ai_draft_revision_id: revision.revision_id
                        }
                    },
                    targetPosition: 'left',
                    sourcePosition: 'right',
                    deletable: true
                }));
            const acceptedNodeIds = new Set(acceptedNodes.map((node) => node.id));
            const acceptedRelationshipEdges = (revision.draft_items || [])
                .filter((item) => item.item_type === 'relationship_candidate' && shouldAccept(item.id))
                .filter((item) => acceptedNodeIds.has(item.metadata?.source_node_id) && acceptedNodeIds.has(item.metadata?.target_node_id))
                .map((item) => ({
                    id: item.metadata.relationship_edge_id || item.id,
                    source: item.metadata.source_node_id,
                    target: item.metadata.target_node_id,
                    type: 'step',
                    animated: false,
                    relationship_type: item.metadata.relationship_type,
                    data: {
                        relationship_type: item.metadata.relationship_type,
                        source_refs: item.source_refs || [],
                        confidence: item.metadata.confidence,
                        rationale: item.content
                    }
                }));
            const graph = {
                ...snapshot,
                nodes: [...snapshot.nodes, ...acceptedNodes],
                edges: [...snapshot.edges, ...acceptedRelationshipEdges]
            };
            const acceptResult = {
                session_id: activeDraftSession.session_id,
                revision_id: revision.revision_id,
                mode: requestBody.mode || 'append',
                accepted_node_ids: acceptedNodes.map((node) => node.id),
                accepted_edge_ids: acceptedRelationshipEdges.map((edge) => edge.id),
                graph_revision_id: `review-tray-graph-revision-${draftAcceptRequests.length + 1}`,
                metadata: { undo_snapshot: state.savedFlowJson },
                canonical_graph_mutated: true
            };
            state.savedFlowJson = JSON.stringify(graph);
            draftAcceptRequests.push({ requestBody, acceptResult });
            savedRequests.push({
                flow_id: flowId,
                flow_name: 'Review Tray Flow',
                flow_json: state.savedFlowJson,
                flow_type: 'manual',
                summary: 'Draft accept persisted by mock backend'
            });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ graph, session: activeDraftSession, accept_result: acceptResult })
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

    return { docxUploadRequests, draftAcceptRequests, savedRequests, state };
};

test('shell review tray hosts AI draft sessions in Drafts', async ({ page }) => {
    await setupMockBackend(page);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    await page.locator('.shell-left-navigator__modebar').getByRole('button', { name: 'Health', exact: true }).click();
    await page.locator('.workspace-ai-usage').getByRole('button', { name: 'Refresh' }).click();
    await expect(page.locator('.workspace-ai-usage')).toContainText('1 draft sessions tracked');
    await page.locator('.workspace-ai-usage').getByText('Details').click();
    await page.locator('.workspace-ai-usage').getByRole('button', { name: 'Review' }).click();

    const tray = page.locator('.workspace-shell__bottom .review-tray');
    await expect(tray).toBeVisible();
    await expect(tray).toContainText('Draft Review');
    await expect(tray).toContainText('Preview AI draft changes here before accepting anything into the canvas.');
    await expect(tray.getByRole('tab', { name: 'Drafts' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.getByRole('tab')).toHaveCount(1);
    await expect(tray.locator('.ai-draft-session-panel')).toContainText('Review tray AI draft');
    await expect(page.locator('.workspace-shell__right')).toHaveCount(0);
    await expect(page.locator('.metadata-inspector-floating-dock')).toHaveCount(0);
});

test('shell review tray accepts connection candidates before mutating the graph', async ({ page }) => {
    const { draftAcceptRequests, savedRequests, state } = await setupMockBackend(
        page,
        emptyFlowJson(),
        { draftSession: connectionDraftSession() }
    );
    const beforeAccept = parseSnapshot(state.savedFlowJson);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    await page.locator('.shell-left-navigator__modebar').getByRole('button', { name: 'Health', exact: true }).click();
    await page.locator('.workspace-ai-usage').getByRole('button', { name: 'Refresh' }).click();
    await page.locator('.workspace-ai-usage').getByText('Details').click();
    await page.locator('.workspace-ai-usage').getByRole('button', { name: 'Review' }).click();

    const tray = page.locator('.workspace-shell__bottom .review-tray');
    await expect(tray).toBeVisible();
    await expect(tray.getByRole('tab', { name: 'Drafts' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.locator('.ai-draft-session-panel')).toContainText(
        'Review tray source map supports review tray action plan'
    );
    expect(parseSnapshot(state.savedFlowJson)).toEqual(beforeAccept);

    await tray
        .locator('.ai-draft-item')
        .filter({ hasText: 'Review tray source map' })
        .locator('input[type="checkbox"]')
        .first()
        .check();
    await tray
        .locator('.ai-draft-item')
        .filter({ hasText: 'Review tray action plan' })
        .locator('input[type="checkbox"]')
        .first()
        .check();
    await tray
        .locator('.ai-draft-item')
        .filter({ hasText: 'Review tray source map supports review tray action plan' })
        .locator('input[type="checkbox"]')
        .first()
        .check();
    await expect(tray.locator('.ai-draft-impact')).toContainText('3 checked draft items will be accepted');

    await tray.locator('.ai-draft-accept').getByRole('button', { name: 'Accept selected' }).click();

    await expect
        .poll(() => {
            const snapshot = parseSnapshot(state.savedFlowJson);
            return {
                acceptedRequests: draftAcceptRequests.length,
                savedRequests: savedRequests.length,
                nodeCount: snapshot.nodes.length,
                hasRelationship: snapshot.edges.some(
                    (edge) =>
                        edge.id === 'review-tray-relationship-edge' &&
                        edge.source === 'review-tray-source-map-draft' &&
                        edge.target === 'review-tray-action-plan-draft' &&
                        edge.data?.relationship_type === 'supports'
                )
            };
        })
        .toEqual({
            acceptedRequests: 1,
            savedRequests: 1,
            nodeCount: 2,
            hasRelationship: true
        });
    expect(draftAcceptRequests[0].requestBody).toMatchObject({
        mode: 'selected',
        selected_item_ids: [
            'review-tray-source-map-draft',
            'review-tray-action-plan-draft',
            'review-tray-relationship-candidate'
        ]
    });
});

test('shell review tray hosts generated source draft before applying it', async ({ page }) => {
    const { docxUploadRequests, savedRequests, state } = await setupMockBackend(page);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    await page.getByTestId('rf__wrapper').getByRole('button', { name: 'Add sources', exact: true }).click();
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
    await expect(tray).toContainText('Source Draft Review');
    await expect(tray).toContainText('Review the generated source map before applying it to the workspace.');
    await expect(tray.getByRole('tab', { name: 'Sources' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.getByRole('tab')).toHaveCount(1);
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

    await page.locator('.shell-left-navigator__modebar').getByRole('button', { name: 'Health', exact: true }).click();
    await expect(page.locator('.workspace-dock-content .graph-validation-panel')).toBeVisible();
    await expect(page.locator('.workspace-dock-content .graph-validation-panel')).toContainText('Workspace health');

    await page.getByRole('button', { name: 'Review issues in tray' }).click();

    const tray = page.locator('.workspace-shell__bottom .review-tray');
    await expect(tray).toBeVisible();
    await expect(tray).toContainText('Workspace Health Review');
    await expect(tray).toContainText('Review validation issues from the current workspace health report.');
    await expect(tray.getByRole('tab', { name: 'Issues' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.getByRole('tab')).toHaveCount(1);
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
    await expect(tray).toContainText('Connections Review');
    await expect(tray).toContainText('Review relationship candidates and source signals before treating them as canonical.');
    await expect(tray.getByRole('tab', { name: 'Connections' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.getByRole('tab', { name: 'Drafts' })).toHaveCount(0);
    await expect(tray.getByRole('tab', { name: 'Activity' })).toHaveCount(0);
    await expect(tray.locator('.local-table-wrap')).toBeVisible();
    await expect(tray.locator('.local-view-content-surface')).toHaveCount(0);
    await expect(page.locator('.workspace-shell__right')).toHaveCount(0);

    await tray.getByRole('tab', { name: 'Task Preview' }).click();
    await expect(tray.getByRole('tab', { name: 'Task Preview' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray).toContainText('Preview-first task candidates. Accepted tasks stay in the structured canvas view.');
    await expect(tray.locator('.local-task-preview')).toBeVisible();
    await expect(tray.locator('.local-view-content-surface')).toHaveCount(0);

    await tray.getByRole('tab', { name: 'Issues' }).click();
    await expect(tray.getByRole('tab', { name: 'Issues' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.locator('.local-missing-info-preview')).toBeVisible();
    await expect(tray.locator('.local-view-content-surface')).toHaveCount(0);

    await tray.getByRole('tab', { name: 'Source Review' }).click();
    await expect(tray.getByRole('tab', { name: 'Source Review' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.locator('.local-source-repair-preview')).toBeVisible();
    await expect(tray.locator('.local-view-content-surface')).toHaveCount(0);

    await tray.getByRole('button', { name: 'Close review tray' }).click();
    await expect(page.locator('.workspace-shell__bottom .review-tray')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Outputs', exact: true }).click();
    await page.getByRole('button', { name: /^Checklist\b/ }).click();
    await expect(tray).toBeVisible();
    await expect(tray.getByRole('tab', { name: 'Checklist Preview' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray).toContainText('Preview-first checklist candidates. Accepting applies selected changes to the workspace.');
    await expect(tray.locator('.local-checklist-preview')).toBeVisible();
    await expect(tray.locator('.local-view-content-surface')).toHaveCount(0);
});

test('accepted checklist preview persists after save and reopen', async ({ page }) => {
    const { savedRequests, state } = await setupMockBackend(page, checklistCandidateFlowJson());

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    await page.getByRole('tab', { name: 'Outputs', exact: true }).click();
    await page.getByRole('button', { name: /^Checklist\b/ }).click();

    const tray = page.locator('.workspace-shell__bottom .review-tray');
    await expect(tray).toBeVisible();
    await expect(tray.getByRole('tab', { name: 'Checklist Preview' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.locator('.local-checklist-preview')).toContainText('Review checklist intake');

    await tray.getByRole('button', { name: 'Accept selected' }).click();
    await expect(page.getByRole('button', { name: 'Unsaved changes' })).toBeVisible();
    await page.getByRole('button', { name: 'Unsaved changes' }).click();

    await expect
        .poll(() => {
            const snapshot = parseSnapshot(state.savedFlowJson);
            const node = snapshot.nodes.find((item) => item.id === 'checklist-root');
            return {
                saved: savedRequests.length > 0,
                accepted: Boolean(node?.data?.checklist_projection?.accepted),
                flow: node?.data?.local_preview_acceptances?.at(-1)?.flow || '',
                label: node?.data?.checklist_projection?.label || ''
            };
        })
        .toEqual({
            saved: true,
            accepted: true,
            flow: 'branch_to_checklist',
            label: 'Review checklist intake'
        });

    await page.getByAltText('Open workspaces').click();
    await page.locator('.flow-row-main').filter({ hasText: 'Review Tray Flow' }).click();
    const tableView = page.getByRole('region', { name: 'Table', exact: true });
    await expect(tableView).toContainText('Review checklist intake');

    await tableView.getByRole('button', { name: 'Review checklist intake', exact: true }).click();
    await expect(page.getByTestId('workspace-shell-right-slot')).toContainText('Review checklist intake');

    const reopened = parseSnapshot(state.savedFlowJson).nodes.find((item) => item.id === 'checklist-root');
    expect(reopened?.data?.checklist_projection?.accepted).toBe(true);
});

test('shell review tray stays bounded with the left rail at desktop and narrow widths', async ({ page }) => {
    await setupMockBackend(page, validationIssueFlowJson());

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    await page.locator('.shell-left-navigator__modebar').getByRole('button', { name: 'Health', exact: true }).click();
    await page.getByRole('button', { name: 'Review issues in tray' }).click();
    await expect(page.locator('.workspace-shell__bottom .review-tray')).toBeVisible();

    const desktopRects = await shellSlotRects(page);
    expectShellSlotsBounded(desktopRects, { expectBottom: true });

    await page.locator('.node-response').filter({ hasText: 'Unsourced review item' }).click();
    await expect(page.getByTestId('workspace-shell-right-slot')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-bottom-slot')).toHaveCount(0);
    expectShellSlotsBounded(await shellSlotRects(page), { expectRight: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('workspace-shell-right-slot')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-bottom-slot')).toHaveCount(0);
    expectShellSlotsBounded(await shellSlotRects(page), { narrow: true, expectRight: true });

    await page.getByTestId('workspace-shell-right-slot').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('workspace-shell-right-slot')).toHaveCount(0);
    await page.locator('.shell-left-navigator__modebar').getByRole('button', { name: 'Health', exact: true }).click();
    await page.getByRole('button', { name: 'Review issues in tray' }).click();
    await expect(page.locator('.workspace-shell__bottom .review-tray')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-right-slot')).toHaveCount(0);
    expectShellSlotsBounded(await shellSlotRects(page), { narrow: true, expectBottom: true });
});
