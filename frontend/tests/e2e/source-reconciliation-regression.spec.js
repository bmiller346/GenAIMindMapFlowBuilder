import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd7994390a1';
const sourceId = 'aec business plan/2026';
const sourceTitle = 'AEC Consulting Business Plan.docx';

const createNode = ({
    id,
    title,
    sourceRefs = [],
    parent = '',
    position = { x: 160, y: 140 },
    nodeType = 'strategy',
    status = 'ai_generated'
}) => ({
    id,
    type: 'response',
    position,
    data: {
        title,
        body: title,
        node_type: nodeType,
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

const flowJson = () =>
    JSON.stringify({
        nodes: [
            createNode({
                id: 'plan-root',
                title: 'Generated consulting business plan',
                position: { x: 120, y: 160 }
            }),
            createNode({
                id: 'market',
                title: 'Target market and positioning',
                parent: 'plan-root',
                position: { x: 520, y: 80 }
            }),
            createNode({
                id: 'delivery',
                title: 'Delivery model and client lifecycle',
                parent: 'plan-root',
                position: { x: 520, y: 240 }
            })
        ],
        edges: [
            {
                id: 'edge-plan-root-market',
                source: 'plan-root',
                target: 'market',
                type: 'step',
                animated: false
            },
            {
                id: 'edge-plan-root-delivery',
                source: 'plan-root',
                target: 'delivery',
                type: 'step',
                animated: false
            }
        ],
        viewport: { x: 0, y: 0, zoom: 0.9 },
        workspace_brief: {
            goal: 'Generate a business plan that can be specialized after source reconciliation.',
            domain_context: 'Generic consulting firm business planning'
        },
        source_library: [],
        activity_events: [],
        ai_action_runs: [],
        automations: []
    });

const parseSnapshot = (flowJsonValue) => JSON.parse(flowJsonValue || flowJson());

const setupMockBackend = async (page) => {
    await page.addInitScript(() => {
        window.localStorage.clear();
    });

    const state = {
        savedFlowJson: flowJson()
    };
    const reconcileUrls = [];
    const docxUploadRequests = [];
    const draftSessionRequests = [];
    const draftAcceptRequests = [];
    const savedRequests = [];
    const draftSessions = new Map();

    const sourceLibrary = [
        {
            id: sourceId,
            title: sourceTitle,
            type: 'docx',
            type_label: 'DOCX',
            status: 'parsed',
            component_id: 'docx-aec-business-plan',
            flow_id: flowId,
            chunks: [
                {
                    id: 'chunk-market',
                    heading: 'AEC Market Focus',
                    snippet:
                        'The firm will target AEC owners, design-build teams, and construction managers needing digital delivery advisory support.',
                    cited_by_count: 0
                },
                {
                    id: 'chunk-revenue',
                    heading: 'Revenue Model',
                    snippet:
                        'Revenue should blend retained advisory, implementation packages, and principal-led strategic workshops.',
                    cited_by_count: 0
                }
            ],
            segments: []
        }
    ];

    await page.route('http://localhost:8000/flows', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    flow_id: flowId,
                    flow_name: 'Source Reconcile Flow',
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
                flow_name: 'Source Reconcile Flow',
                flow_json: state.savedFlowJson,
                flow_type: 'manual',
                summary: 'Flow is saved'
            })
        });
    });

    await page.route('http://localhost:8000/flow-update', async (route) => {
        const body = route.request().postDataJSON();
        state.savedFlowJson = body.flow_json || state.savedFlowJson;
        savedRequests.push(body);
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
                component_id: 'docx-aec-business-plan',
                type: 'docx',
                filename: sourceTitle,
                flow_id: flowId,
                flow_name: 'Business Plan Milestone QA',
                flow_type: 'manual',
                source_document_id: sourceId,
                mindmap_json: JSON.stringify({
                    nodes: [],
                    edges: [],
                    source_library: sourceLibrary
                })
            })
        });
    });

    await page.route('http://localhost:8000/api/workspaces/**/sources/**/reconcile/preview', async (route) => {
        reconcileUrls.push(route.request().url());
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                preview_id: 'source-reconcile-preview',
                helper_id: 'source_librarian',
                action: 'source_repair',
                scope: { type: 'source', source_id: sourceId },
                generated_by: 'deterministic_reconciliation',
                preview_items: [
                    {
                        id: 'repair-market',
                        preview_type: 'source_repair',
                        node_id: 'market',
                        title: 'Reconcile source support for Target market and positioning',
                        rationale: 'Uploaded source contains AEC-specific positioning language for this node.',
                        confidence: 'high',
                        source_refs: [
                            {
                                document_id: sourceId,
                                chunk_id: 'chunk-market',
                                section: 'AEC Market Focus',
                                quote_snippet:
                                    'The firm will target AEC owners, design-build teams, and construction managers needing digital delivery advisory support.',
                                confidence: 'high'
                            }
                        ],
                        assumptions: [],
                        proposed_mutation: {
                            source_refs: [{ document_id: sourceId, chunk_id: 'chunk-market' }],
                            source_ref_repair: {
                                repair_type: 'reconcile_uploaded_source',
                                issues: ['Selected source may strengthen this node'],
                                source_id: sourceId,
                                suggested_from_title: sourceTitle,
                                suggestion_relationship: 'source_overlap'
                            }
                        }
                    }
                ],
                warnings: [],
                metadata: {
                    source_id: sourceId,
                    source_title: sourceTitle,
                    matched_node_count: 1,
                    source_only_chunk_count: 1,
                    source_only_chunks: [
                        {
                            chunk_id: 'chunk-revenue',
                            section: 'Revenue Model',
                            snippet:
                                'Revenue should blend retained advisory, implementation packages, and principal-led strategic workshops.'
                        }
                    ],
                    recommended_modes: [
                        'supplement_graph',
                        'update_matching_nodes',
                        'keep_both_for_comparison',
                        'replace_branch'
                    ]
                }
            })
        });
    });

    await page.route(
        `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions`,
        async (route) => {
            const requestBody = route.request().postDataJSON();
            const requestIndex = draftSessionRequests.length + 1;
            const sessionId = `draft-session-aec-${requestIndex}`;
            const revisionId = `revision-aec-${requestIndex}`;
            const draftNode = {
                id: `draft-aec-market-${requestIndex}`,
                parent_id: requestBody.scope?.node_id || '',
                title: 'AEC consulting target market',
                summary:
                    'Specializes the selected business-plan node for AEC owners, design-build teams, and construction managers.',
                node_type: 'strategy',
                status: 'needs_review',
                confidence: 0.86,
                source_refs: [
                    {
                        document_id: sourceId,
                        chunk_id: 'chunk-market',
                        section: 'AEC Market Focus'
                    }
                ]
            };
            const session = {
                session_id: sessionId,
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
                model_reason: 'Mocked milestone specialization preview.',
                revisions: [
                    {
                        revision_id: revisionId,
                        session_id: sessionId,
                        prompt: requestBody.prompt || requestBody.custom_prompt || '',
                        draft_items: [],
                        draft_nodes: [draftNode],
                        draft_edges: [
                            {
                                id: `draft-edge-market-${requestIndex}`,
                                source_node_id: requestBody.scope?.node_id || '',
                                target_node_id: draftNode.id,
                                relationship_type: 'contains',
                                metadata: {}
                            }
                        ],
                        draft_annotations: [
                            {
                                id: `annotation-aec-${requestIndex}`,
                                type: 'follow_up_suggestion',
                                title: 'Validate AEC niche',
                                body: 'Confirm target segments with firm leadership before accepting.'
                            }
                        ],
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
                            canonical: false,
                            output_shape: requestBody.metadata?.output_shape
                        }
                    }
                ],
                source_refs: draftNode.source_refs,
                validation_reports: [],
                accept_history: [],
                status: 'drafting',
                metadata: {
                    canonical: false,
                    output_shape: requestBody.metadata?.output_shape
                }
            };
            draftSessions.set(sessionId, session);
            draftSessionRequests.push({ requestBody, session });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(session)
            });
        }
    );

    await page.route(
        `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions/draft-session-usage-1`,
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    session_id: 'draft-session-usage-1',
                    workspace_id: flowId,
                    scope: { type: 'workspace' },
                    role: 'workflow_mapper',
                    intent: 'usage_review',
                    prompt_history: [
                        {
                            role: 'user',
                            content: 'Review token usage draft',
                            created_at: '2026-05-15T12:10:00.000Z',
                            revision_id: 'revision-usage-1'
                        }
                    ],
                    model_policy: 'balanced',
                    selected_model: 'gpt-5.4',
                    model_reason: 'Mocked usage review session.',
                    revisions: [
                        {
                            revision_id: 'revision-usage-1',
                            session_id: 'draft-session-usage-1',
                            prompt: 'Review token usage draft',
                            draft_items: [],
                            draft_nodes: [
                                {
                                    id: 'draft-usage-review',
                                    parent_id: '',
                                    title: 'Usage reviewed draft',
                                    summary: 'A draft opened directly from the workspace AI usage details.',
                                    node_type: 'note',
                                    status: 'needs_review',
                                    confidence: 0.8,
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
                                accepted_item_ids: ['draft-usage-review'],
                                summary: '+1 nodes, !1 marked needs_review'
                            },
                            validation_report: {
                                is_valid: true,
                                repaired: false,
                                issues: []
                            },
                            created_at: '2026-05-15T12:10:00.000Z',
                            model: 'gpt-5.4',
                            metadata: {
                                usage: {
                                    total_tokens: 1400,
                                    estimated_cost_usd: '$0.0032'
                                }
                            }
                        }
                    ],
                    source_refs: [],
                    validation_reports: [],
                    accept_history: [],
                    status: 'drafting',
                    metadata: {}
                })
            });
        }
    );

    await page.route(
        `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions/**/accept`,
        async (route) => {
            const requestBody = route.request().postDataJSON();
            const sessionId = new URL(route.request().url()).pathname.split('/').at(-2);
            const session = structuredClone(draftSessions.get(sessionId));
            const revision = session.revisions.at(-1);
            const selectedIds =
                requestBody.mode === 'selected' ? requestBody.selected_item_ids || [] : [];
            const draftNodes = revision.draft_nodes.filter((node) =>
                selectedIds.length ? selectedIds.includes(node.id) : true
            );
            const snapshot = parseSnapshot(state.savedFlowJson);
            const existingNodeIds = new Set(snapshot.nodes.map((node) => node.id));
            const acceptedNodes = draftNodes
                .filter((node) => !existingNodeIds.has(node.id))
                .map((node, index) => ({
                    id: node.id,
                    type: 'response',
                    position: { x: 760 + index * 120, y: 160 + index * 100 },
                    data: {
                        title: node.title,
                        body: node.summary,
                        node_type: node.node_type,
                        status: node.status,
                        confidence: node.confidence,
                        parent: node.parent_id,
                        source_refs: node.source_refs || [],
                        metadata: {
                            source: 'ai_draft_session',
                            ai_draft_session_id: sessionId,
                            ai_draft_revision_id: revision.revision_id
                        },
                        display: { collapsed: false, layoutMode: 'vertical-children' },
                        data: {
                            summ: node.summary || node.title,
                            source_refs: node.source_refs || [],
                            confidence: node.confidence
                        }
                    },
                    targetPosition: 'left',
                    sourcePosition: 'right',
                    deletable: true
                }));
            const acceptedNodeIds = acceptedNodes.map((node) => node.id);
            const acceptedEdges = revision.draft_edges
                .filter((edge) => acceptedNodeIds.includes(edge.target_node_id))
                .map((edge) => ({
                    id: edge.id,
                    source: edge.source_node_id,
                    target: edge.target_node_id,
                    type: 'step',
                    animated: true
                }));
            const graph = {
                ...snapshot,
                nodes: [...snapshot.nodes, ...acceptedNodes],
                edges: [...snapshot.edges, ...acceptedEdges]
            };
            const acceptResult = {
                session_id: sessionId,
                revision_id: revision.revision_id,
                mode: requestBody.mode || 'append',
                accepted_node_ids: acceptedNodeIds,
                accepted_edge_ids: acceptedEdges.map((edge) => edge.id),
                preview_diff: {
                    added_nodes: acceptedNodes.length,
                    added_edges: acceptedEdges.length,
                    updated_nodes: 0,
                    accepted_item_ids: selectedIds.length ? selectedIds : acceptedNodeIds
                },
                validation_report: { is_valid: true, repaired: false, issues: [] },
                graph_revision_id: `graph-revision-${draftAcceptRequests.length + 1}`,
                metadata: { undo_snapshot: state.savedFlowJson },
                canonical_graph_mutated: true
            };
            session.status = 'accepted';
            session.accept_history.push(acceptResult);
            draftSessions.set(sessionId, session);
            draftAcceptRequests.push({ sessionId, requestBody, acceptResult });
            state.savedFlowJson = JSON.stringify(graph);
            savedRequests.push({
                flow_id: flowId,
                flow_name: 'Source Reconcile Flow',
                flow_json: state.savedFlowJson,
                flow_type: 'manual',
                summary: 'Draft accept persisted by mock backend'
            });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ graph, session, accept_result: acceptResult })
            });
        }
    );

    await page.route(`http://localhost:8000/api/workspaces/${flowId}/ai/usage`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                workspace_id: flowId,
                input_tokens: 900,
                output_tokens: 500,
                total_tokens: 1400,
                session_count: 2,
                estimated_cost_usd: '$0.0032',
                sessions: [
                    {
                        session_id: 'draft-session-usage-1',
                        status: 'drafting',
                        selected_model: 'gpt-5.4',
                        total_tokens: 1400,
                        estimated_cost_usd: '$0.0032',
                        revisions: [{ revision_id: 'revision-1' }]
                    }
                ]
            })
        });
    });

    return { docxUploadRequests, reconcileUrls, draftSessionRequests, draftAcceptRequests, savedRequests, state };
};

test('uploaded business plan reconciles with generated graph and opens scoped AEC Ask AI', async ({ page }) => {
    const { docxUploadRequests, reconcileUrls, draftSessionRequests, draftAcceptRequests, state } =
        await setupMockBackend(page);

    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/');
    await expect(
        page.locator('.node-response').filter({ hasText: 'Generated consulting business plan' })
    ).toBeVisible();
    await expect(
        page.locator('.node-response').filter({ hasText: 'Target market and positioning' })
    ).toBeVisible();

    await page.getByText('Add New Source').click();
    await page.getByRole('button', { name: /Upload DOCX/ }).click();
    await expect(page.getByText('Load A Docx', { exact: true })).toBeVisible();
    await page.locator('#docxFileUpload').setInputFiles({
        name: sourceTitle,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from(
            'AEC consulting business plan: target owners, design-build teams, construction managers, retained advisory, and implementation packages.'
        )
    });
    await page.locator('.modal-container').getByRole('button', { name: 'Add', exact: true }).click();

    await expect.poll(() => docxUploadRequests.length).toBe(1);
    await expect(page.locator('.local-source-repair-preview')).toContainText(
        'Reconcile source support for Target market and positioning'
    );
    await expect(page.locator('.source-only-sections')).toContainText('Revenue Model');
    expect(reconcileUrls[0]).toContain(encodeURIComponent(sourceId));

    await page.getByRole('button', { name: 'Accept selected' }).click();
    await expect(page.getByRole('row', { name: /Target market and positioning/ })).toContainText(
        'aec business plan/2026 | AEC Market Focus'
    );

    await page.getByRole('button', { name: 'Health' }).click();
    await expect(page.locator('.workspace-ai-usage')).toContainText('1,400 tokens');
    await expect(page.locator('.workspace-ai-usage')).toContainText('$0.0032 est.');
    await page.locator('.workspace-ai-usage').getByText('Details').click();
    await expect(page.locator('.workspace-ai-usage')).toContainText('gpt-5.4');
    await page.locator('.workspace-ai-usage').getByRole('button', { name: 'Review' }).click();
    await expect(page.locator('.ai-draft-session-panel')).toContainText('Usage reviewed draft');
    await expect(page.locator('.workspace-ai-usage')).toContainText('Draft session opened for review.');
    await page.getByRole('button', { name: 'Close workspace AI preview' }).click();

    await page.getByRole('button', { name: /TraceSpace Map/ }).click();
    const targetNode = page.locator('.node-response').filter({ hasText: 'Target market and positioning' });
    await targetNode.locator('.node-menu-trigger').first().dispatchEvent('click');
    await expect(page.locator('.node-action-menu')).toBeVisible();
    await page
        .locator('.node-action-menu')
        .getByRole('button', { name: 'Specialize branch' })
        .click();

    await expect(page.locator('.ai-action-modal')).toBeVisible();
    await expect(page.locator('.ai-action-scope')).toContainText('Selected branch');
    await expect(page.locator('.ai-action-scope')).toContainText('Target market and positioning');
    await page
        .locator('.ai-action-modal textarea')
        .fill('make this specific to AEC consulting');
    await page
        .locator('.ai-action-footer')
        .getByRole('button', { name: /Preview changes|Generate preview/ })
        .click({ force: true });

    await expect(page.locator('.ai-draft-session-panel')).toContainText('AEC consulting target market');
    await expect.poll(() => draftSessionRequests.length).toBe(1);
    const requestBody = draftSessionRequests[0].requestBody;
    expect(requestBody.scope).toMatchObject({ type: 'branch', node_id: 'market' });
    expect(requestBody.prompt).toBe('make this specific to AEC consulting');
    expect(requestBody.change_intent).toBe('update');
    expect(requestBody.memory_context).toMatchObject({
        change_intent: 'update',
        current_prompt: 'make this specific to AEC consulting',
        scope: { type: 'branch', node_id: 'market' }
    });
    expect(requestBody.metadata?.change_intent).toBe('update');
    expect(requestBody.metadata?.follow_up_memory).toMatchObject({
        change_intent: 'update',
        current_prompt: 'make this specific to AEC consulting'
    });

    await page
        .locator('.node-inspector .ai-draft-accept')
        .getByRole('button', { name: 'Accept 1 item' })
        .click();
    await expect.poll(() => draftAcceptRequests.length, { timeout: 7000 }).toBe(1);
    await expect(page.locator('.node-response').filter({ hasText: 'AEC consulting target market' })).toBeVisible();

    const workspaceViews = page.getByLabel('Workspace lenses and outputs');
    await workspaceViews.getByRole('button', { name: 'Whole workspace', exact: true }).click();
    await workspaceViews.getByRole('button', { name: 'Tasks', exact: true }).click();
    const tasksRegion = page.getByRole('region', { name: 'Tasks' });
    const aecTaskCandidate = tasksRegion.locator('article').filter({ hasText: 'AEC consulting target market' });
    await expect(aecTaskCandidate).toContainText('strategy · candidate');
    await aecTaskCandidate.getByRole('button', { name: 'Confirm' }).evaluate((button) => button.click());
    await expect(tasksRegion.locator('table')).toContainText('AEC consulting target market');

    await expect
        .poll(
            () => {
                const taskNode = parseSnapshot(state.savedFlowJson).nodes.find(
                    (node) => node.id === 'draft-aec-market-1'
                );
                return Boolean(
                    taskNode?.data?.node_type === 'task' &&
                        taskNode?.data?.task_projection?.accepted === true &&
                        taskNode?.data?.task_projection?.preview_type === 'task' &&
                        taskNode?.data?.metadata?.ai_draft_session_id === 'draft-session-aec-1'
                );
            },
            { timeout: 10000 }
        )
        .toBe(true);

    await page.reload();
    await page.getByAltText('Open workspaces').click();
    await page.locator('.flow-row-main').filter({ hasText: 'Source Reconcile Flow' }).click();
    const reloadedWorkspaceViews = page.getByLabel('Workspace lenses and outputs');
    await reloadedWorkspaceViews.getByRole('button', { name: 'Whole workspace', exact: true }).click();
    await reloadedWorkspaceViews.getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Tasks' }).locator('table')).toContainText(
        'AEC consulting target market'
    );
    const reloadedTaskNode = parseSnapshot(state.savedFlowJson).nodes.find(
        (node) => node.id === 'draft-aec-market-1'
    );
    expect(reloadedTaskNode?.data?.task_projection).toMatchObject({
        accepted: true,
        preview_type: 'task',
        preview_status: 'needs_review'
    });
});
