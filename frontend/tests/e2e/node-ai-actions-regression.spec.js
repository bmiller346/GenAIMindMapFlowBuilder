import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd7994390d1';

const emptyFlowJson = JSON.stringify({
    nodes: [],
    edges: [],
    viewport: {},
    workspace_brief: {},
    source_library: [],
    activity_events: [],
    ai_action_runs: [],
    automations: []
});

const parseSnapshot = (flowJson) => JSON.parse(flowJson || emptyFlowJson);

const setupMockBackend = async (page) => {
    await page.addInitScript(() => {
        window.localStorage.clear();
    });

    const state = {
        savedFlowName: 'AI Action QA',
        savedFlowJson: emptyFlowJson,
        createdFlow: false
    };
    const savedRequests = [];
    const previewRequests = [];
    const draftSessionRequests = [];
    const draftRevisionRequests = [];
    const draftAcceptRequests = [];
    const draftSessions = new Map();

    await page.route('http://localhost:8000/create-flow', async (route) => {
        state.createdFlow = true;
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

    await page.route(
        /http:\/\/localhost:8000\/api\/workspaces\/[^/]+\/ai\/actions\/(node|branch|workspace)(\/[^/]+)?\/preview/,
        async (route) => {
            const request = route.request();
            const requestBody = request.postDataJSON();
            const url = new URL(request.url());
            const parts = url.pathname.split('/');
            const isWorkspaceScope = parts.at(-2) === 'workspace';
            const scope = isWorkspaceScope ? 'workspace' : parts.at(-3);
            const nodeId = isWorkspaceScope ? '' : parts.at(-2);
            const action = requestBody.action || 'generate_child_nodes';
            previewRequests.push({ scope, nodeId, requestBody });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    preview_id: `preview-${scope}-${previewRequests.length}`,
                    ai_action_id: `action-${scope}-${previewRequests.length}`,
                    workspace_id: flowId,
                    scope,
                    source_node_id: nodeId || null,
                    role: requestBody.role || 'Task Planner',
                    action,
                    custom_prompt: requestBody.custom_prompt || null,
                    input_source_refs:
                        scope === 'branch' ? [{ document_id: 'doc-1', page: 4 }] : [],
                    draft_nodes: [
                        {
                            id: `generated-${scope}-${previewRequests.length}`,
                            parent_id: nodeId,
                            title: `${scope} generated child`,
                            node_type: 'task',
                            source_refs:
                                scope === 'branch'
                                    ? [{ document_id: 'doc-1', page: 4 }]
                                    : []
                        }
                    ],
                    draft_edges: [],
                    draft_annotations: [
                        {
                            id: `annotation-${previewRequests.length}`,
                            type: 'follow_up_suggestion',
                            text: 'Confirm generated child with the process owner.'
                        }
                    ],
                    validation_report: {
                        status: scope === 'branch' ? 'valid' : 'needs_review',
                        issues:
                            scope === 'branch'
                                ? []
                                : [{ code: 'missing_source_ref', node_id: `generated-${scope}-1` }]
                    },
                    source_refs: scope === 'branch' ? [{ document_id: 'doc-1', page: 4 }] : [],
                    assumptions:
                        scope === 'branch'
                            ? []
                            : ['Generated action preview is not source-backed.']
                })
            });
        }
    );

    await page.route(
        /http:\/\/localhost:8000\/api\/workspaces\/[^/]+\/ai\/draft-sessions$/,
        async (route) => {
            const requestBody = route.request().postDataJSON();
            const scope = requestBody.scope || { type: 'workspace' };
            const scopeType = scope.type || 'workspace';
            const sourceNodeId = scope.node_id || '';
            const requestIndex = draftSessionRequests.length + 1;
            const sessionId = `draft-session-${scopeType}-${requestIndex}`;
            const draftNodeId = `draft-${scopeType}-${requestIndex}`;
            const isCited =
                scopeType === 'branch' ||
                (scopeType === 'source' && Array.isArray(requestBody.source_chunks) && requestBody.source_chunks.length > 0);
            const draftNodes =
                scopeType === 'node'
                    ? [
                          {
                              id: `draft-node-cited-${requestIndex}`,
                              parent_id: sourceNodeId,
                              title: 'General Mills',
                              summary: 'Source-backed manufacturer branch.',
                              node_type: 'task',
                              status: 'ai_generated',
                              confidence: 0.92,
                              source_refs: [{ document_id: 'doc-cereal', page: 4 }]
                          },
                          {
                              id: `draft-node-uncited-${requestIndex}`,
                              parent_id: sourceNodeId,
                              title: 'Uncited cereal branch',
                              summary: 'Uncited manufacturer branch that must be reviewed.',
                              node_type: 'task',
                              status: 'needs_review',
                              confidence: 0.35,
                              source_refs: [],
                              assumptions: ['Manufacturer inferred from the prompt without a citation.'],
                              metadata: {
                                  assumption: true,
                                  duplicate: true,
                                  conflict: true,
                                  confidence: 0.35
                              }
                          }
                      ]
                    : [
                          {
                              id: draftNodeId,
                              parent_id: sourceNodeId,
                              title: `${scopeType} generated child`,
                              summary: `Draft child for ${scopeType} scope.`,
                              node_type: 'task',
                              status: 'ai_generated',
                              source_refs: isCited ? [{ document_id: 'doc-1', page: 4 }] : []
                          }
                      ];
            const draftEdges = sourceNodeId
                ? draftNodes.map((node) => ({
                      id: `draft-edge-${sourceNodeId}-${node.id}`,
                      source_node_id: sourceNodeId,
                      target_node_id: node.id,
                      relationship_type: 'contains',
                      metadata: {}
                  }))
                : [];
            const session = {
                session_id: sessionId,
                workspace_id: flowId,
                scope,
                role: requestBody.role || requestBody.role_id || 'task_planner',
                intent: requestBody.intent || requestBody.action || 'generate_child_nodes',
                prompt_history: [
                    {
                        role: 'user',
                        content: requestBody.prompt || requestBody.custom_prompt || 'Generate preview',
                        created_at: '2026-05-14T12:00:00.000Z',
                        revision_id: `revision-${scopeType}-${requestIndex}-1`
                    }
                ],
                model_policy: requestBody.model_policy || 'balanced',
                selected_model: requestBody.model || 'auto',
                model_reason: isCited
                    ? 'Source-backed branch draft.'
                    : 'Uncited draft will require review.',
                revisions: [
                    {
                        revision_id: `revision-${scopeType}-${requestIndex}-1`,
                        session_id: sessionId,
                        prompt: requestBody.prompt || requestBody.custom_prompt || 'Generate preview',
                        draft_items: [],
                        draft_nodes: draftNodes,
                        draft_edges: draftEdges,
                        draft_annotations: [
                            {
                                id: `annotation-${scopeType}-${requestIndex}`,
                                type: 'follow_up_suggestion',
                                title: 'Confirm owner',
                                body: 'Confirm generated child with the process owner.'
                            }
                        ],
                        preview_diff: {
                            mode: 'append',
                            added_nodes: draftNodes.length,
                            added_edges: draftEdges.length,
                            updated_nodes: 0,
                            review_outputs: 1,
                            needs_review_repairs: draftNodes.filter((node) => !node.source_refs.length).length,
                            accepted_item_ids: draftNodes.map((node) => node.id),
                            summary: sourceNodeId
                                ? `+${draftNodes.length} nodes, +${draftEdges.length} edges${
                                      draftNodes.some((node) => !node.source_refs.length)
                                          ? ', !1 marked needs_review'
                                          : ''
                                  }`
                                : `+${draftNodes.length} nodes, +0 edges${
                                      draftNodes.some((node) => !node.source_refs.length)
                                          ? ', !1 marked needs_review'
                                          : ''
                                  }`
                        },
                        validation_report: {
                            is_valid: true,
                            repaired: false,
                            issues: draftNodes
                                .filter((node) => !node.source_refs.length)
                                .map((node) => ({ code: 'missing_source_ref', node_id: node.id }))
                        },
                        created_at: '2026-05-14T12:00:00.000Z',
                        model: requestBody.model || 'auto',
                        metadata: { canonical: false }
                    }
                ],
                source_refs: isCited ? [{ document_id: 'doc-1', page: 4 }] : [],
                validation_reports: [],
                accept_history: [],
                status: 'drafting',
                metadata: { canonical: false }
            };
            draftSessions.set(sessionId, session);
            draftSessionRequests.push({ scope: scopeType, nodeId: sourceNodeId, requestBody, session });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(session)
            });
        }
    );

    await page.route(
        /http:\/\/localhost:8000\/api\/workspaces\/[^/]+\/ai\/draft-sessions\/[^/]+\/revisions$/,
        async (route) => {
            const requestBody = route.request().postDataJSON();
            const sessionId = new URL(route.request().url()).pathname.split('/').at(-2);
            const session = structuredClone(draftSessions.get(sessionId));
            const revision = structuredClone(session.revisions.at(-1));
            revision.revision_id = `${revision.revision_id}-followup`;
            revision.prompt = requestBody.prompt || 'Follow-up';
            revision.created_at = '2026-05-14T12:02:00.000Z';
            revision.draft_annotations = [
                ...revision.draft_annotations,
                {
                    id: `revision-note-${draftRevisionRequests.length + 1}`,
                    type: 'revision_note',
                    title: requestBody.prompt || 'Follow-up',
                    body: requestBody.prompt || 'Follow-up'
                }
            ];
            session.prompt_history.push({
                role: 'user',
                content: requestBody.prompt || 'Follow-up',
                created_at: revision.created_at,
                revision_id: revision.revision_id
            });
            session.revisions.push(revision);
            draftSessions.set(sessionId, session);
            draftRevisionRequests.push({ sessionId, requestBody });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(session)
            });
        }
    );

    await page.route(
        /http:\/\/localhost:8000\/api\/workspaces\/[^/]+\/ai\/draft-sessions\/[^/]+\/accept$/,
        async (route) => {
            const requestBody = route.request().postDataJSON();
            const sessionId = new URL(route.request().url()).pathname.split('/').at(-2);
            const session = structuredClone(draftSessions.get(sessionId));
            const revision = session.revisions.at(-1);
            const selectedIds = requestBody.mode === 'selected' ? requestBody.selected_item_ids || [] : [];
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
                    position: { x: 320 + index * 80, y: 160 + index * 80 },
                    data: {
                        title: node.title,
                        body: node.summary,
                        node_type: node.node_type,
                        status: node.source_refs?.length ? 'ai_generated' : 'needs_review',
                        confidence: node.confidence,
                        assumption: node.assumptions?.length ? true : undefined,
                        duplicate: node.metadata?.duplicate,
                        conflict: node.metadata?.conflict,
                        source_refs: node.source_refs || [],
                        external_refs: [],
                        metadata: {
                            ...(node.metadata || {}),
                            source: 'ai_draft_session',
                            ai_draft_session_id: sessionId,
                            ai_draft_revision_id: revision.revision_id
                        },
                        data: {
                            summ: node.summary || node.title,
                            source_refs: node.source_refs || [],
                            confidence: node.confidence,
                            assumption: node.assumptions?.length ? true : undefined,
                            duplicate: node.metadata?.duplicate,
                            conflict: node.metadata?.conflict,
                            metadata: node.metadata || {}
                        }
                    },
                    deletable: true,
                    targetPosition: 'left',
                    sourcePosition: 'right'
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
                    review_outputs: revision.draft_annotations.length,
                    needs_review_repairs: acceptedNodes.filter(
                        (node) => node.data.status === 'needs_review'
                    ).length,
                    accepted_item_ids: selectedIds.length ? selectedIds : acceptedNodeIds
                },
                validation_report: { is_valid: true, repaired: false, issues: [] },
                graph_revision_id: `graph-revision-${draftAcceptRequests.length + 1}`,
                metadata: {
                    undo_snapshot: state.savedFlowJson
                },
                canonical_graph_mutated: true
            };
            session.status = 'accepted';
            session.accept_history.push(acceptResult);
            draftSessions.set(sessionId, session);
            draftAcceptRequests.push({ sessionId, requestBody, acceptResult });
            state.savedFlowJson = JSON.stringify(graph);
            savedRequests.push({
                flow_id: flowId,
                flow_name: state.savedFlowName,
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

    return {
        previewRequests,
        draftSessionRequests,
        draftRevisionRequests,
        draftAcceptRequests,
        savedRequests,
        state
    };
};

const latestSnapshot = (savedRequests) => {
    const latestRequest = savedRequests.at(-1);
    return parseSnapshot(latestRequest?.flow_json);
};

const structuralNodes = (snapshot) =>
    snapshot.nodes.map(({ measured, selected, dragging, ...node }) => node);

const waitForSavedSnapshot = async (savedRequests, predicate, timeout = 10000) => {
    await expect
        .poll(
            () => {
                const snapshot = latestSnapshot(savedRequests);
                return predicate(snapshot);
            },
            { timeout }
        )
        .toBe(true);
};

const openNodeMenu = async (page) => {
    await page.locator('.node-menu-trigger').first().dispatchEvent('click');
    await expect(page.locator('.node-action-menu')).toBeVisible();
};

const createRoot = async (page, savedRequests, title) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add root', exact: true }).click();
    await page.locator('.node-title-input').first().fill(title);
    await waitForSavedSnapshot(
        savedRequests,
        (snapshot) => snapshot.nodes.length === 1 && snapshot.nodes[0].data.title === title
    );
};

const openAskAi = async (page, buttonName = 'Ask AI about node') => {
    await openNodeMenu(page);
    await page.locator('.node-action-menu').getByRole('button', { name: buttonName }).click();
    await expect(page.locator('.ai-action-modal')).toBeVisible();
};

test('node Ask AI draft stays non-canonical until selected accept, then persists on reopen', async ({
    page
}) => {
    const { draftSessionRequests, draftRevisionRequests, draftAcceptRequests, savedRequests, state } =
        await setupMockBackend(page);
    await createRoot(page, savedRequests, 'AI root');

    const beforePreview = latestSnapshot(savedRequests);
    await openAskAi(page);
    await page.getByRole('button', { name: 'Generate preview' }).click();
    await expect(page.locator('.node-inspector')).toBeVisible();
    await expect(page.locator('.ai-draft-session-panel')).toContainText('AI drafting table');
    await expect(page.locator('.ai-draft-session-panel')).toContainText('General Mills');
    await expect(page.locator('.ai-draft-session-panel')).toContainText('Uncited cereal branch');
    await expect(page.locator('.ai-draft-session-panel')).toContainText('!1 needs_review items');
    const citedDraftItem = page.locator('.ai-draft-item').filter({ hasText: 'General Mills' });
    const reviewDraftItem = page.locator('.ai-draft-item').filter({ hasText: 'Uncited cereal branch' });
    await expect(citedDraftItem).toContainText('Source-backed');
    await expect(reviewDraftItem).toContainText('Needs review');
    await expect(reviewDraftItem).toContainText('Assumption');
    await expect(reviewDraftItem).toContainText('Low confidence');
    await expect(reviewDraftItem).toContainText('Duplicate');
    await expect(reviewDraftItem).toContainText('Conflict');

    expect(structuralNodes(latestSnapshot(savedRequests))).toEqual(
        structuralNodes(beforePreview)
    );
    expect(latestSnapshot(savedRequests).edges).toEqual(beforePreview.edges);
    expect(draftSessionRequests).toHaveLength(1);
    expect(draftSessionRequests[0].scope).toBe('node');

    await page.locator('.ai-draft-conversation textarea').fill('what about General Mills?');
    await page.getByRole('button', { name: 'Add revision' }).click();
    await expect(page.locator('.ai-draft-history')).toContainText('what about General Mills?');
    expect(draftRevisionRequests).toHaveLength(1);
    expect(structuralNodes(latestSnapshot(savedRequests))).toEqual(
        structuralNodes(beforePreview)
    );

    await page
        .locator('.ai-draft-item')
        .filter({ hasText: 'Source-backed manufacturer branch.' })
        .locator('input[type="checkbox"]')
        .first()
        .check();
    await page
        .locator('.ai-draft-item')
        .filter({ hasText: 'Uncited cereal branch' })
        .locator('input[type="checkbox"]')
        .first()
        .check();
    await page
        .locator('.node-inspector .ai-draft-accept')
        .getByRole('button', { name: 'Accept selected' })
        .click();
    await waitForSavedSnapshot(savedRequests, (snapshot) => {
        const cited = snapshot.nodes.find((node) => node.id === 'draft-node-cited-1');
        const uncited = snapshot.nodes.find((node) => node.id === 'draft-node-uncited-1');
        return (
            snapshot.nodes.length === 3 &&
            snapshot.edges.some((edge) => edge.source === beforePreview.nodes[0].id && edge.target === cited?.id) &&
            snapshot.edges.some((edge) => edge.source === beforePreview.nodes[0].id && edge.target === uncited?.id) &&
            cited?.data?.source_refs?.[0]?.document_id === 'doc-cereal' &&
            cited?.data?.confidence === 0.92 &&
            cited?.data?.metadata?.ai_draft_session_id === 'draft-session-node-1' &&
            uncited?.data?.status === 'needs_review' &&
            uncited?.data?.assumption === true &&
            uncited?.data?.confidence === 0.35 &&
            uncited?.data?.metadata?.duplicate === true &&
            uncited?.data?.metadata?.conflict === true &&
            uncited?.data?.metadata?.ai_draft_session_id === 'draft-session-node-1'
        );
    });
    expect(draftAcceptRequests).toHaveLength(1);
    expect(draftAcceptRequests[0].requestBody).toMatchObject({
        mode: 'selected',
        selected_item_ids: ['draft-node-cited-1', 'draft-node-uncited-1']
    });
    expect(draftAcceptRequests[0].acceptResult.graph_revision_id).toBeTruthy();
    expect(parseSnapshot(draftAcceptRequests[0].acceptResult.metadata.undo_snapshot)).toEqual(beforePreview);

    await page.reload();
    await page.getByAltText('Open workspaces').click();
    await page.locator('.flow-row-main').filter({ hasText: state.savedFlowName }).click();
    await expect(page.locator('.node-title-input')).toHaveCount(3);
    await expect(page.locator('.node-title-input').nth(1)).toHaveValue('General Mills');
    await expect(page.locator('.node-title-input').nth(2)).toHaveValue('Uncited cereal branch');
    const reopened = parseSnapshot(state.savedFlowJson);
    expect(reopened.nodes.find((node) => node.id === 'draft-node-cited-1')?.data?.source_refs).toEqual([
        { document_id: 'doc-cereal', page: 4 }
    ]);
    const reopenedUncited = reopened.nodes.find((node) => node.id === 'draft-node-uncited-1');
    expect(reopenedUncited?.data?.status).toBe('needs_review');
    expect(reopenedUncited?.data?.assumption).toBe(true);
    expect(reopenedUncited?.data?.confidence).toBe(0.35);
    expect(reopenedUncited?.data?.metadata?.duplicate).toBe(true);
    expect(reopenedUncited?.data?.metadata?.conflict).toBe(true);
    await expect(page.locator('.node-response').filter({ hasText: 'Uncited cereal branch' })).toContainText('Needs review');
    await expect(page.locator('.node-response').filter({ hasText: 'Uncited cereal branch' })).toContainText('Assumption');
    await expect(page.locator('.node-response').filter({ hasText: 'Uncited cereal branch' })).toContainText('Confidence 35%');
    await expect(page.locator('.node-response').filter({ hasText: 'Uncited cereal branch' })).toContainText('Duplicate');
    await expect(page.locator('.node-response').filter({ hasText: 'Uncited cereal branch' })).toContainText('Conflict');
    await expect(page.locator('.node-response').filter({ hasText: 'General Mills' })).toContainText('Source cited');
});

test('branch Ask AI discard leaves graph unchanged', async ({ page }) => {
    const { draftSessionRequests, savedRequests } = await setupMockBackend(page);
    await createRoot(page, savedRequests, 'Branch root');

    const beforePreview = latestSnapshot(savedRequests);
    await openAskAi(page, 'Ask AI about branch');
    await page.getByRole('button', { name: 'Generate preview' }).click();
    await expect(page.locator('.ai-draft-session-panel')).toContainText('branch generated child');
    await expect(page.locator('.ai-draft-session-panel')).toContainText('1/2 cited');
    expect(draftSessionRequests[0].scope).toBe('branch');

    await page.getByRole('button', { name: 'Close AI draft session' }).click();
    await expect(page.locator('.ai-draft-session-panel')).toHaveCount(0);

    const afterReject = latestSnapshot(savedRequests);
    expect(structuralNodes(afterReject)).toEqual(structuralNodes(beforePreview));
    expect(afterReject.edges).toEqual(beforePreview.edges);
});

test('workspace Ask AI draft is available from the header and accepts all through draft contract', async ({
    page
}) => {
    const { draftSessionRequests, draftAcceptRequests, savedRequests } = await setupMockBackend(page);
    await createRoot(page, savedRequests, 'Workspace root');

    const beforePreview = latestSnapshot(savedRequests);
    await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
    await expect(page.locator('.ai-action-modal')).toBeVisible();
    await expect(page.locator('.ai-action-scope')).toContainText('Whole workspace');

    await page.getByRole('button', { name: 'Generate preview' }).click();
    await expect(page.locator('.node-inspector')).toBeVisible();
    await expect(page.locator('.ai-draft-session-panel')).toContainText('workspace generated child');
    expect(draftSessionRequests.at(-1).scope).toBe('workspace');
    expect(structuralNodes(latestSnapshot(savedRequests))).toEqual(
        structuralNodes(beforePreview)
    );

    await page.getByRole('button', { name: 'Close workspace AI preview' }).click();
    await expect(page.locator('.node-inspector')).toHaveCount(0);
    expect(structuralNodes(latestSnapshot(savedRequests))).toEqual(
        structuralNodes(beforePreview)
    );

    await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
    await page.getByRole('button', { name: 'Generate preview' }).click();
    await expect(page.locator('.ai-draft-session-panel')).toContainText('workspace generated child');

    await page
        .locator('.node-inspector .ai-draft-accept')
        .getByRole('button', { name: 'Accept all' })
        .click();
    await expect.poll(() => draftAcceptRequests.length, { timeout: 7000 }).toBe(1);
    await waitForSavedSnapshot(savedRequests, (snapshot) =>
        snapshot.nodes.some(
            (node) => node.id === 'draft-workspace-2' && node.data.status === 'needs_review'
        )
    );
    expect(draftAcceptRequests.at(-1).requestBody.mode).toBe('append');
});

test('selected source Ask AI sends source scope and chunks to draft sessions', async ({
    page
}) => {
    const { draftSessionRequests, savedRequests, state } = await setupMockBackend(page);
    state.createdFlow = true;
    state.savedFlowName = 'Source scoped QA';
    state.savedFlowJson = JSON.stringify({
        nodes: [],
        edges: [],
        viewport: {},
        workspace_brief: {},
        source_library: [
            {
                id: 'doc-general-mills',
                title: 'General Mills source',
                type: 'docx',
                status: 'parsed',
                chunks: [
                    {
                        id: 'chunk-1',
                        document_id: 'doc-general-mills',
                        page: 2,
                        heading: 'Manufacturers',
                        snippet: 'General Mills makes Cheerios cereal.'
                    }
                ],
                segments: []
            }
        ],
        activity_events: [],
        ai_action_runs: [],
        automations: []
    });

    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Workspace name' })).toHaveValue('Source scoped QA');
    await page.getByAltText('Open workspaces').click();
    await page.locator('.drawer-tool').filter({ hasText: 'Sources' }).click();
    await expect(page.locator('.sources-panel')).toContainText('General Mills source');

    await page.getByRole('button', { name: 'Ask AI about source' }).click();
    await expect(page.locator('.ai-action-modal')).toBeVisible();
    await expect(page.locator('.ai-action-scope')).toContainText('Selected source');
    await expect(page.locator('.ai-action-scope')).toContainText('General Mills source');

    await page.getByRole('button', { name: 'Generate preview' }).click();
    await expect(page.locator('.ai-draft-session-panel')).toContainText('source generated child');
    await expect.poll(() => draftSessionRequests.length, { timeout: 7000 }).toBe(1);

    expect(draftSessionRequests[0].scope).toBe('source');
    expect(draftSessionRequests[0].requestBody.scope).toEqual({
        type: 'source',
        source_id: 'doc-general-mills'
    });
    expect(draftSessionRequests[0].requestBody.source_chunks).toHaveLength(1);
    expect(draftSessionRequests[0].requestBody.source_chunks[0].source_ref).toMatchObject({
        document_id: 'doc-general-mills',
        chunk_id: 'chunk-1',
        page: 2,
        section: 'Manufacturers',
        quote_snippet: 'General Mills makes Cheerios cereal.'
    });
    expect(draftSessionRequests[0].requestBody.metadata.source_context).toMatchObject({
        selected_source_id: 'doc-general-mills',
        selected_source_title: 'General Mills source',
        selected_source_chunk_count: 1
    });
    expect(structuralNodes(latestSnapshot(savedRequests))).toEqual([]);
});

test('multi-selected node Ask AI sends nodes scope from AI helpers', async ({ page }) => {
    const { draftSessionRequests, state } = await setupMockBackend(page);
    state.createdFlow = true;
    state.savedFlowName = 'Multi node scoped QA';
    state.savedFlowJson = JSON.stringify({
        nodes: [
            {
                id: 'node-alpha',
                type: 'response',
                selected: true,
                position: { x: 0, y: 240 },
                data: {
                    title: 'Alpha requirement',
                    body: 'Alpha source-backed work.',
                    node_type: 'requirement',
                    status: 'ai_generated',
                    source_refs: [{ document_id: 'doc-alpha', page: 1 }],
                    data: { summ: 'Alpha source-backed work.' }
                }
            },
            {
                id: 'node-beta',
                type: 'response',
                selected: true,
                position: { x: 360, y: 240 },
                data: {
                    title: 'Beta requirement',
                    body: 'Beta source-backed work.',
                    node_type: 'requirement',
                    status: 'ai_generated',
                    source_refs: [{ document_id: 'doc-beta', page: 2 }],
                    data: { summ: 'Beta source-backed work.' }
                }
            }
        ],
        edges: [],
        viewport: {},
        workspace_brief: {},
        source_library: [],
        activity_events: [],
        ai_action_runs: [],
        automations: []
    });

    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Workspace name' })).toHaveValue('Multi node scoped QA');
    const beforePreview = parseSnapshot(state.savedFlowJson);
    const graphNodes = page.locator('.react-flow__node');
    await expect(graphNodes).toHaveCount(2);

    await page.getByAltText('Open workspaces').click();
    await page.locator('.drawer-tool').filter({ hasText: 'AI helpers' }).click();
    await page.locator('.ai-helpers-summary').click();
    await page.getByLabel('Scope before generation').selectOption('nodes');
    await expect(page.locator('.ai-helper-scope')).toContainText('Selected nodes: 2 nodes');

    await page.getByRole('button', { name: /Create knowledge graph/ }).click();
    await expect(page.locator('.ai-action-modal')).toBeVisible();
    await expect(page.locator('.ai-action-scope')).toContainText('Selected nodes');
    await expect(page.locator('.ai-action-scope')).toContainText('2 selected nodes');
    await page.locator('.ai-action-custom textarea').fill('Find shared implementation themes across these selected nodes.');

    await page.getByRole('button', { name: 'Generate preview' }).click();
    await expect(page.locator('.ai-draft-session-panel')).toContainText('nodes generated child');
    await expect.poll(() => draftSessionRequests.length, { timeout: 7000 }).toBe(1);

    expect(draftSessionRequests[0].scope).toBe('nodes');
    expect(draftSessionRequests[0].requestBody.scope).toEqual({
        type: 'nodes',
        node_ids: ['node-alpha', 'node-beta']
    });
    expect(structuralNodes(parseSnapshot(state.savedFlowJson))).toEqual(
        structuralNodes(beforePreview)
    );
});

test('legacy personas and custom prompts remain discoverable in Ask AI', async ({ page }) => {
    const { savedRequests } = await setupMockBackend(page);
    await createRoot(page, savedRequests, 'Persona root');
    await openAskAi(page);

    const roleOptions = await page.locator('.ai-action-modal').getByLabel('Role').locator('option').allTextContents();
    expect(roleOptions).toEqual(expect.arrayContaining([
        'General: Strategic Advisor',
        'General: Research Assistant',
        'General: Productivity Coach',
        'General: Data Interpreter',
        'General: Custom Prompts'
    ]));

    await page.locator('.ai-action-modal').getByLabel('Role').selectOption('custom-prompts');
    await page.locator('.ai-action-custom textarea').fill('Keep this as a legacy custom prompt.');
    await expect(page.locator('.ai-action-custom textarea')).toHaveValue(
        'Keep this as a legacy custom prompt.'
    );
});
