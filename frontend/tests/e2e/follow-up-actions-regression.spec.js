import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd7994390e5';
const sourceId = 'source-first-plan/2026';
const sourceTitle = 'Source First Strategy.docx';

const createNode = ({
    id,
    title,
    parent = '',
    position = { x: 160, y: 140 },
    sourceRefs = [],
    status = 'needs_review'
}) => ({
    id,
    type: 'response',
    position,
    data: {
        title,
        body: title,
        node_type: 'strategy',
        status,
        manual: false,
        parent,
        source_refs: sourceRefs,
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

const createEdge = (source, target) => ({
    id: `${source}-${target}`,
    source,
    target,
    type: 'step',
    animated: false
});

const hierarchyFlowJson = () =>
    JSON.stringify({
        nodes: [
            createNode({
                id: 'root',
                title: 'Follow-up action milestone',
                position: { x: 160, y: 160 }
            }),
            createNode({
                id: 'market',
                title: 'Market positioning follow-up',
                parent: 'root',
                position: { x: 560, y: 120 }
            }),
            createNode({
                id: 'delivery',
                title: 'Delivery proof points',
                parent: 'root',
                position: { x: 560, y: 300 }
            })
        ],
        edges: [createEdge('root', 'market'), createEdge('root', 'delivery')],
        viewport: { x: 0, y: 0, zoom: 0.9 },
        workspace_brief: {
            goal: 'Exercise follow-up actions on an unsourced hierarchy graph.',
            desired_outputs: ['knowledge_graph']
        },
        source_library: [],
        activity_events: [],
        ai_action_runs: [],
        automations: []
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

const generatedSourceGraph = () => ({
    nodes: [
        createNode({
            id: 'source-root',
            title: 'Source-derived strategy map',
            position: { x: 160, y: 160 },
            sourceRefs: [
                {
                    document_id: sourceId,
                    chunk_id: 'chunk-overview',
                    section: 'Strategic Overview',
                    quote_snippet: 'The uploaded source defines the initial strategy map.'
                }
            ],
            status: 'ai_generated'
        }),
        createNode({
            id: 'source-actions',
            title: 'Source transformation actions',
            parent: 'source-root',
            position: { x: 560, y: 160 },
            sourceRefs: [
                {
                    document_id: sourceId,
                    chunk_id: 'chunk-actions',
                    section: 'Transformation Actions',
                    quote_snippet: 'Transform source-only material into reviewable map actions.'
                }
            ],
            status: 'ai_generated'
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
            component_id: 'docx-source-first',
            chunks: [
                {
                    id: 'chunk-overview',
                    heading: 'Strategic Overview',
                    snippet: 'The uploaded source defines the initial strategy map.'
                },
                {
                    id: 'chunk-actions',
                    heading: 'Transformation Actions',
                    snippet: 'Transform source-only material into reviewable map actions.'
                }
            ]
        }
    ],
    activity_events: [],
    ai_action_runs: [],
    automations: []
});

const setupMockBackend = async (page, initialFlowJson = hierarchyFlowJson()) => {
    await page.addInitScript(() => {
        window.localStorage.clear();
    });

    const state = {
        savedFlowJson: initialFlowJson
    };
    const draftSessionRequests = [];
    const docxUploadRequests = [];
    const reconcileUrls = [];

    await page.route('http://localhost:8000/flows', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    flow_id: flowId,
                    flow_name: 'Follow-up Action Flow',
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
                flow_name: 'Follow-up Action Flow',
                flow_json: state.savedFlowJson,
                flow_type: 'manual',
                summary: 'Flow is saved'
            })
        });
    });

    await page.route('http://localhost:8000/flow-update', async (route) => {
        const body = route.request().postDataJSON();
        state.savedFlowJson = body.flow_json || state.savedFlowJson;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ flow_id: flowId, message: 'Flow updated successfully' })
        });
    });

    await page.route('http://localhost:8000/component-create-docx', async (route) => {
        docxUploadRequests.push(route.request().url());
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                component_id: 'docx-source-first',
                type: 'docx',
                filename: sourceTitle,
                flow_id: flowId,
                flow_name: 'Follow-up Action Flow',
                flow_type: 'manual',
                source_document_id: sourceId,
                mindmap_json: JSON.stringify(generatedSourceGraph())
            })
        });
    });

    await page.route('http://localhost:8000/api/workspaces/**/sources/**/reconcile/preview', async (route) => {
        reconcileUrls.push(route.request().url());
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                preview_id: 'unexpected-source-reconcile-preview',
                helper_id: 'source_librarian',
                action: 'source_repair',
                scope: { type: 'source', source_id: sourceId },
                generated_by: 'mock',
                preview_items: [],
                warnings: [],
                metadata: { source_id: sourceId, source_title: sourceTitle }
            })
        });
    });

    await page.route(
        `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions`,
        async (route) => {
            const requestBody = route.request().postDataJSON();
            const requestIndex = draftSessionRequests.length + 1;
            const revisionId = `revision-follow-up-${requestIndex}`;
            const draftNode = {
                id: `draft-follow-up-${requestIndex}`,
                parent_id: requestBody.scope?.node_id || '',
                title: 'Scoped follow-up update',
                summary: 'Updates the selected node with a reviewable follow-up action.',
                node_type: 'strategy',
                status: 'needs_review',
                confidence: 0.82,
                source_refs: []
            };
            const session = {
                session_id: `draft-session-follow-up-${requestIndex}`,
                workspace_id: flowId,
                scope: requestBody.scope,
                role: requestBody.role || requestBody.role_id || 'workflow_mapper',
                intent: requestBody.intent || requestBody.action || 'custom_prompt',
                prompt_history: [
                    {
                        role: 'user',
                        content: requestBody.prompt || requestBody.custom_prompt || '',
                        created_at: '2026-05-15T12:00:00.000Z',
                        revision_id: revisionId
                    }
                ],
                model_policy: requestBody.model_policy || 'balanced',
                selected_model: requestBody.model || 'auto',
                model_reason: 'Mocked follow-up action preview.',
                revisions: [
                    {
                        revision_id: revisionId,
                        session_id: `draft-session-follow-up-${requestIndex}`,
                        prompt: requestBody.prompt || requestBody.custom_prompt || '',
                        draft_items: [],
                        draft_nodes: [draftNode],
                        draft_edges: [
                            {
                                id: `draft-edge-follow-up-${requestIndex}`,
                                source_node_id: requestBody.scope?.node_id || '',
                                target_node_id: draftNode.id,
                                relationship_type: 'contains',
                                metadata: {}
                            }
                        ],
                        draft_annotations: [],
                        preview_diff: {
                            mode: 'append',
                            added_nodes: 1,
                            added_edges: 1,
                            updated_nodes: 0,
                            review_outputs: 1,
                            needs_review_repairs: 1,
                            accepted_item_ids: [draftNode.id],
                            summary: '+1 nodes, +1 edges, !1 marked needs_review'
                        },
                        validation_report: {
                            is_valid: true,
                            repaired: false,
                            issues: []
                        },
                        created_at: '2026-05-15T12:00:00.000Z',
                        model: requestBody.model || 'auto',
                        metadata: {
                            output_shape: requestBody.metadata?.output_shape
                        }
                    }
                ],
                source_refs: [],
                validation_reports: [],
                accept_history: [],
                status: 'drafting',
                metadata: {
                    output_shape: requestBody.metadata?.output_shape
                }
            };
            draftSessionRequests.push({ requestBody, session });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(session)
            });
        }
    );

    await page.route(`http://localhost:8000/api/workspaces/${flowId}/ai/usage`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                workspace_id: flowId,
                total_tokens: 0,
                estimated_cost_usd: '$0.0000',
                sessions: []
            })
        });
    });

    return { draftSessionRequests, docxUploadRequests, reconcileUrls, state };
};

const openWorkspace = async (page) => {
    await page.goto('/');
    await expect(page.getByText('Add New Source')).toBeVisible();
};

test('selected node follow-up action opens a scoped update draft', async ({ page }) => {
    const { draftSessionRequests } = await setupMockBackend(page);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await openWorkspace(page);

    const targetNode = page.locator('.node-response').filter({ hasText: 'Market positioning follow-up' });
    await expect(targetNode).toBeVisible();
    await targetNode.click({ force: true });

    const followUpActions = page.getByRole('region', { name: 'Follow-up actions' });
    await expect(followUpActions).toContainText('Update this');
    await expect(targetNode.getByTitle('Advanced Ask AI')).toBeVisible();
    await targetNode.getByTitle('Advanced Ask AI').dispatchEvent('click');

    await expect(page.locator('.ai-action-modal')).toBeVisible();
    await expect(page.locator('.ai-action-scope')).toContainText('Selected node');
    await expect(page.locator('.ai-action-scope')).toContainText('Market positioning follow-up');
    await page.locator('.ai-action-modal textarea').fill('update this node with sourced next steps');
    await page
        .locator('.ai-action-footer')
        .getByRole('button', { name: /Preview changes|Generate preview/ })
        .dispatchEvent('click');

    await expect(page.locator('.ai-draft-session-panel')).toContainText('Scoped follow-up update');
    await expect.poll(() => draftSessionRequests.length).toBe(1);
    const requestBody = draftSessionRequests[0].requestBody;
    expect(requestBody.scope).toMatchObject({ type: 'node', node_id: 'market' });
    expect(requestBody.prompt).toBe('update this node with sourced next steps');
    expect(requestBody.change_intent).toBe('update');
    expect(requestBody.memory_context).toMatchObject({
        change_intent: 'update',
        current_prompt: 'update this node with sourced next steps',
        scope: { type: 'node', node_id: 'market' }
    });
    expect(requestBody.metadata?.follow_up_memory).toMatchObject({
        change_intent: 'update',
        current_prompt: 'update this node with sourced next steps'
    });
});

test('source-first DOCX upload applies generated source graph instead of reconciliation', async ({ page }) => {
    const { docxUploadRequests, reconcileUrls } = await setupMockBackend(page, emptyFlowJson());

    await page.setViewportSize({ width: 1440, height: 1000 });
    await openWorkspace(page);
    await expect(page.locator('.node-response')).toHaveCount(0);

    await page.getByText('Add New Source').click();
    await page.getByRole('button', { name: /Upload DOCX/ }).click();
    await expect(page.getByText('Load A Docx', { exact: true })).toBeVisible();
    await page.locator('#docxFileUpload').setInputFiles({
        name: sourceTitle,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('Source first strategy with transformation actions and a generated map.')
    });
    await page.locator('.modal-container').getByRole('button', { name: 'Add', exact: true }).click();

    await expect.poll(() => docxUploadRequests.length).toBe(1);
    await expect(page.locator('.node-response').filter({ hasText: 'Source-derived strategy map' })).toBeVisible();
    await expect(page.locator('.node-response').filter({ hasText: 'Source transformation actions' })).toBeVisible();
    await expect(page.locator('.local-source-repair-preview')).toHaveCount(0);
    await expect.poll(() => reconcileUrls.length).toBe(0);
});

test('unsourced hierarchy graph exposes confidence repair queue and source coverage action', async ({ page }) => {
    await setupMockBackend(page);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await openWorkspace(page);

    const followUpActions = page.getByRole('region', { name: 'Follow-up actions' });
    await expect(followUpActions).toContainText('Update this');
    await expect(followUpActions).toContainText('No sources loaded');

    await page.locator('.local-output-menu-button').click();
    await page.locator('.local-output-popover').getByRole('button', { name: 'Source repair' }).click();
    await expect(page.locator('.local-source-repair-preview')).toContainText('Source-reference repair');
    await expect(page.locator('.local-source-repair-preview')).toContainText('nodes need source repair');
    await expect(page.locator('.local-source-repair-preview')).toContainText('Market positioning follow-up');
});
