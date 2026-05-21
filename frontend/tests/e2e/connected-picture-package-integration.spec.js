import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd7994390e3';
const sourceId = 'messy-context-notes/2026';
const sourceTitle = 'Messy Context Notes';

const emptyFlowJson = () =>
    JSON.stringify({
        nodes: [],
        edges: [],
        viewport: {},
        workspace_brief: {},
        source_library: [],
        activity_events: [],
        ai_action_runs: [],
        automations: []
    });

const sourceRef = (chunkId, section, quote) => ({
    document_id: sourceId,
    document_title: sourceTitle,
    chunk_id: chunkId,
    section,
    quote_snippet: quote,
    confidence: 'high'
});

const draftNodes = [
    {
        id: 'pkg-root',
        title: 'Permit Closeout Package',
        summary: 'A connected picture package for permit closeout decisions, evidence, flow, table rows, and handoff tasks.',
        node_type: 'workflow',
        status: 'ai_generated',
        confidence: 0.91,
        source_refs: [
            sourceRef(
                'chunk-intake',
                'Messy intake',
                'Permit closeout needs a single view of owner approvals, AHJ comments, drawing updates, and field readiness.'
            )
        ],
        metadata: {
            package_section: 'overview',
            business_impact: 'high',
            owner_id: 'Package author'
        }
    },
    {
        id: 'pkg-review-intake',
        parent_id: 'pkg-root',
        title: 'Review intake',
        summary: 'Collect owner approvals, AHJ comments, drawing updates, and field readiness notes.',
        node_type: 'process',
        status: 'ai_generated',
        confidence: 0.88,
        source_refs: [sourceRef('chunk-intake', 'Messy intake', 'Owner approvals and AHJ comments are scattered across notes.')],
        metadata: {
            package_section: 'flow',
            owner_id: 'Coordination lead',
            priority: 'high'
        }
    },
    {
        id: 'pkg-decision-gate',
        parent_id: 'pkg-root',
        title: 'Approval gate',
        summary: 'Decide whether missing owner decisions block the closeout package.',
        node_type: 'decision',
        status: 'needs_review',
        confidence: 0.74,
        source_refs: [sourceRef('chunk-decision', 'Decision notes', 'Owner decisions are needed before the final package can be treated as complete.')],
        metadata: {
            package_section: 'decision',
            owner_id: 'Project manager',
            priority: 'high'
        }
    },
    {
        id: 'pkg-sankey-evidence',
        parent_id: 'pkg-root',
        title: 'Sankey evidence rows',
        summary: 'Source-to-target-value rows for accepted package flow review.',
        node_type: 'data',
        status: 'ai_generated',
        artifact_type: 'data_table',
        confidence: 0.86,
        source_refs: [
            {
                source_type: 'data_table',
                table_name: 'Permit Closeout Flow Rows',
                query_id: 'query-permit-closeout-flow',
                result_hash: 'pkg-flow-001',
                row_count: 3,
                confidence: 'high'
            },
            sourceRef('chunk-flow', 'Flow notes', 'AHJ comments feed drawing updates and owner decisions before task packaging.')
        ],
        generated_artifacts: [
            {
                artifact_type: 'data_table',
                data: {
                    table_name: 'Permit Closeout Flow Rows',
                    query_id: 'query-permit-closeout-flow',
                    result_hash: 'pkg-flow-001',
                    row_count: 3,
                    rows: [
                        {
                            row_id: 'flow-row-1',
                            source: 'AHJ comments',
                            target: 'Drawing updates',
                            value: 5,
                            metric: 'items',
                            review_state: 'ai_generated',
                            evidence_status: 'source_backed',
                            source_refs: [sourceRef('chunk-flow', 'Flow notes', 'AHJ comments drive drawing updates.')]
                        },
                        {
                            row_id: 'flow-row-2',
                            source: 'Owner decisions',
                            target: 'Approval gate',
                            value: 3,
                            metric: 'items',
                            review_state: 'needs_review',
                            evidence_status: 'source_backed',
                            source_refs: [sourceRef('chunk-decision', 'Decision notes', 'Owner decisions are needed before final package approval.')]
                        },
                        {
                            row_id: 'flow-row-3',
                            source: 'Approval gate',
                            target: 'Task package',
                            value: 4,
                            metric: 'items',
                            review_state: 'needs_review',
                            evidence_status: 'source_backed',
                            source_refs: [sourceRef('chunk-tasks', 'Task notes', 'Accepted package items become handoff tasks.')]
                        }
                    ]
                }
            },
            {
                artifact_type: 'chart',
                data: {
                    chart_type: 'sankey',
                    chart_spec: {
                        source_column: 'source',
                        target_column: 'target',
                        value_column: 'value'
                    },
                    data_rows: [
                        {
                            row_id: 'flow-row-1',
                            source: 'AHJ comments',
                            target: 'Drawing updates',
                            value: 5,
                            metric: 'items',
                            review_state: 'ai_generated',
                            evidence_status: 'source_backed',
                            source_refs: [sourceRef('chunk-flow', 'Flow notes', 'AHJ comments drive drawing updates.')]
                        },
                        {
                            row_id: 'flow-row-2',
                            source: 'Owner decisions',
                            target: 'Approval gate',
                            value: 3,
                            metric: 'items',
                            review_state: 'needs_review',
                            evidence_status: 'source_backed',
                            source_refs: [sourceRef('chunk-decision', 'Decision notes', 'Owner decisions are needed before final package approval.')]
                        },
                        {
                            row_id: 'flow-row-3',
                            source: 'Approval gate',
                            target: 'Task package',
                            value: 4,
                            metric: 'items',
                            review_state: 'needs_review',
                            evidence_status: 'source_backed',
                            source_refs: [sourceRef('chunk-tasks', 'Task notes', 'Accepted package items become handoff tasks.')]
                        }
                    ]
                }
            }
        ],
        metadata: {
            domain: 'structured_data',
            table_name: 'Permit Closeout Flow Rows',
            query_id: 'query-permit-closeout-flow',
            result_hash: 'pkg-flow-001',
            row_count: 3,
            package_section: 'sankey'
        }
    },
    {
        id: 'pkg-task',
        parent_id: 'pkg-root',
        title: 'Prepare closeout task package',
        summary: 'Create the task-ready handoff once approval blockers are reviewed.',
        node_type: 'task',
        status: 'needs_review',
        confidence: 0.81,
        priority: 'high',
        owner_id: 'Package author',
        due_date: '2026-06-05',
        source_refs: [sourceRef('chunk-tasks', 'Task notes', 'Accepted package items become handoff tasks.')],
        metadata: {
            package_section: 'tasks',
            owner_id: 'Package author',
            priority: 'high'
        }
    }
];

const draftEdges = [
    { id: 'draft-edge-root-intake', source_node_id: 'pkg-root', target_node_id: 'pkg-review-intake', relationship_type: 'contains' },
    { id: 'draft-edge-intake-decision', source_node_id: 'pkg-review-intake', target_node_id: 'pkg-decision-gate', relationship_type: 'sequence' },
    { id: 'draft-edge-decision-evidence', source_node_id: 'pkg-decision-gate', target_node_id: 'pkg-sankey-evidence', relationship_type: 'informs' },
    { id: 'draft-edge-decision-task', source_node_id: 'pkg-decision-gate', target_node_id: 'pkg-task', relationship_type: 'handoff' }
];

const draftItems = [
    {
        id: 'pkg-relationship-intake-decision',
        item_type: 'relationship_candidate',
        title: 'Review intake supports approval gate',
        content: 'The intake work clarifies which approvals block the closeout decision.',
        source_refs: [sourceRef('chunk-decision', 'Decision notes', 'Owner decisions are needed before the final package can be treated as complete.')],
        metadata: {
            source_node_id: 'pkg-review-intake',
            target_node_id: 'pkg-decision-gate',
            relationship_type: 'supports',
            relationship_edge_id: 'pkg-edge-intake-supports-decision',
            confidence: 0.84,
            rationale: 'Intake evidence feeds the approval decision.'
        }
    },
    {
        id: 'pkg-relationship-evidence-task',
        item_type: 'relationship_candidate',
        title: 'Sankey evidence packages task handoff',
        content: 'Accepted flow rows provide evidence for the task package.',
        source_refs: [sourceRef('chunk-tasks', 'Task notes', 'Accepted package items become handoff tasks.')],
        metadata: {
            source_node_id: 'pkg-sankey-evidence',
            target_node_id: 'pkg-task',
            relationship_type: 'packages',
            relationship_edge_id: 'pkg-edge-evidence-packages-task',
            confidence: 0.82,
            rationale: 'Structured flow rows become handoff work.'
        }
    }
];

const connectedPackagePreview = {
    package_id: 'permit-closeout-picture-package',
    title: 'Permit Closeout Picture Package',
    summary: 'A mocked connected package draft with map, relationships, flow, table, Sankey, evidence, and tasks.',
    status: 'draft',
    acceptance_groups: [
        {
            id: 'package-core',
            label: 'Connected package core',
            status: 'ready',
            item_count: 7,
            accepted_count: 0,
            summary: 'Graph nodes, relationship candidates, structured rows, and task output are ready for selected acceptance.'
        }
    ],
    source_coverage: {
        total_items: 7,
        cited_items: 7,
        uncited_items: 0,
        required_repairs: 0,
        sources: [{ id: sourceId, title: sourceTitle, coverage: 1, cited_items: 7 }]
    },
    graph: {
        nodes: [
            { id: 'map', label: 'Map', group: 'View', readiness: 'ready' },
            { id: 'connections', label: 'Connections', group: 'View', readiness: 'ready' },
            { id: 'flowchart', label: 'Flowchart', group: 'View', readiness: 'ready' },
            { id: 'table', label: 'Table', group: 'View', readiness: 'ready' },
            { id: 'sankey', label: 'Sankey', group: 'View', readiness: 'ready' },
            { id: 'evidence', label: 'Evidence', group: 'View', readiness: 'ready' },
            { id: 'tasks', label: 'Tasks', group: 'View', readiness: 'ready' }
        ],
        edges: [
            { id: 'pkg-map-connections', source: 'map', target: 'connections', relationship: 'projects', confidence: 0.9 },
            { id: 'pkg-table-sankey', source: 'table', target: 'sankey', relationship: 'feeds', confidence: 0.86 },
            { id: 'pkg-evidence-tasks', source: 'evidence', target: 'tasks', relationship: 'packages', confidence: 0.82 }
        ]
    },
    connections: [
        {
            id: 'cx-intake-decision',
            from: 'Review intake',
            to: 'Approval gate',
            relationship: 'supports',
            confidence: 0.84,
            evidence_count: 1,
            review_state: 'ready'
        },
        {
            id: 'cx-evidence-task',
            from: 'Sankey evidence rows',
            to: 'Prepare closeout task package',
            relationship: 'packages',
            confidence: 0.82,
            evidence_count: 1,
            review_state: 'ready'
        }
    ],
    flow: {
        lenses: ['Stages', 'Handoffs', 'Sankey'],
        stages: [
            { id: 'intake', label: 'Review intake', value: 5, status: 'ready' },
            { id: 'decision', label: 'Approval gate', value: 3, status: 'warning' },
            { id: 'tasks', label: 'Task package', value: 4, status: 'ready' }
        ],
        sankey_rows: [
            { source: 'AHJ comments', target: 'Drawing updates', value: 5 },
            { source: 'Owner decisions', target: 'Approval gate', value: 3 },
            { source: 'Approval gate', target: 'Task package', value: 4 }
        ]
    },
    table: {
        columns: ['Artifact', 'Type', 'Readiness', 'Sources', 'Repair'],
        rows: [
            ['Permit Closeout Package', 'Map', 'Ready', '3 refs', 'None'],
            ['Sankey evidence rows', 'Chart', 'Ready', '3 refs', 'Review values'],
            ['Prepare closeout task package', 'Tasks', 'Review', '1 ref', 'Owner confirm']
        ]
    },
    charts: [
        { id: 'source-coverage', label: 'Source coverage', value: 100, tone: 'ready' },
        { id: 'task-readiness', label: 'Task readiness', value: 80, tone: 'warning' }
    ],
    evidence: [
        {
            id: 'ev-flow',
            title: 'Flow rows with source refs',
            source: sourceTitle,
            coverage: '3 cited paths',
            status: 'ready'
        }
    ],
    tasks: [
        {
            id: 'task-package',
            title: 'Prepare closeout task package',
            owner: 'Package author',
            status: 'review'
        }
    ],
    review: [{ id: 'rv-values', label: 'Confirm Sankey values before export.', tone: 'warning' }]
};

const parseSnapshot = (flowJson) => JSON.parse(flowJson || emptyFlowJson());

const createAcceptedNode = (draft, index) => ({
    id: draft.id,
    type: 'response',
    position: { x: 160 + index * 280, y: 180 + (index % 2) * 180 },
    data: {
        title: draft.title,
        body: draft.summary,
        node_type: draft.node_type,
        status: draft.status,
        confidence: draft.confidence,
        parent: draft.parent_id || '',
        priority: draft.priority || draft.metadata?.priority || '',
        owner_id: draft.owner_id || draft.metadata?.owner_id || '',
        due_date: draft.due_date || '',
        source_refs: draft.source_refs || [],
        artifact_type: draft.artifact_type || '',
        generated_artifacts: draft.generated_artifacts || [],
        metadata: {
            ...(draft.metadata || {}),
            source: 'ai_draft_session',
            ai_draft_session_id: 'connected-package-session-1',
            ai_draft_revision_id: 'connected-package-revision-1'
        },
        display: { collapsed: false, layoutMode: 'vertical-children' },
        data: {
            summ: draft.summary || draft.title,
            source_refs: draft.source_refs || [],
            generated_artifacts: draft.generated_artifacts || [],
            artifact_type: draft.artifact_type || '',
            metadata: draft.metadata || {}
        }
    },
    targetPosition: 'left',
    sourcePosition: 'right',
    deletable: true
});

const setupMockBackend = async (page) => {
    await page.addInitScript(() => {
        window.localStorage.clear();
        window.localStorage.setItem('docmap.uiShellRibbon.enabled', 'disabled');
    });

    const state = {
        createdFlow: false,
        savedFlowName: 'Connected Picture Package QA',
        savedFlowJson: emptyFlowJson()
    };
    const draftSessionRequests = [];
    const draftAcceptRequests = [];
    const savedRequests = [];

    const draftSession = {
        session_id: 'connected-package-session-1',
        workspace_id: flowId,
        scope: { type: 'workspace' },
        role: 'workflow-mapper',
        intent: 'custom_prompt',
        prompt_history: [
            {
                role: 'user',
                content: 'Messy context to view',
                created_at: '2026-05-20T20:00:00.000Z',
                revision_id: 'connected-package-revision-1'
            }
        ],
        model_policy: 'balanced',
        selected_model: 'gpt-5.5',
        model_reason: 'Mocked connected picture package draft for cross-view integration.',
        revisions: [
            {
                revision_id: 'connected-package-revision-1',
                session_id: 'connected-package-session-1',
                prompt: 'Messy context to view',
                draft_items: draftItems,
                draft_nodes: draftNodes,
                draft_edges: draftEdges,
                draft_annotations: [
                    {
                        id: 'pkg-review-note',
                        type: 'review_output',
                        title: 'Confirm package values',
                        body: 'Confirm Sankey values and owner assignments before external handoff.'
                    }
                ],
                connected_package_preview: connectedPackagePreview,
                preview_diff: {
                    mode: 'append',
                    added_nodes: draftNodes.length,
                    added_edges: draftEdges.length + draftItems.length,
                    updated_nodes: 0,
                    review_outputs: 1,
                    needs_review_repairs: 2,
                    accepted_item_ids: [...draftNodes.map((node) => node.id), ...draftItems.map((item) => item.id)],
                    summary: '+5 nodes, +6 edges, connected package preview'
                },
                validation_report: { is_valid: true, repaired: false, issues: [] },
                created_at: '2026-05-20T20:00:00.000Z',
                model: 'gpt-5.5',
                metadata: {
                    output_shape: 'graph_draft',
                    requested_visual: 'auto',
                    connected_package_title: connectedPackagePreview.title
                }
            }
        ],
        source_refs: [sourceRef('chunk-intake', 'Messy intake', 'Permit closeout needs a single view.')],
        validation_reports: [],
        accept_history: [],
        status: 'drafting',
        metadata: {
            canonical: false,
            output_shape: 'graph_draft',
            requested_visual: 'auto',
            connected_package_preview: connectedPackagePreview
        }
    };

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

    await page.route(/http:\/\/localhost:8000\/flow-update\/?$/, async (route) => {
        const requestBody = route.request().postDataJSON();
        state.savedFlowName = requestBody.flow_name || state.savedFlowName;
        state.savedFlowJson = requestBody.flow_json || state.savedFlowJson;
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

    await page.route(`http://localhost:8000/api/workspaces/${flowId}/ai/usage`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                workspace_id: flowId,
                total_tokens: 0,
                estimated_cost_usd: '$0.0000',
                session_count: 0,
                sessions: []
            })
        });
    });

    await page.route(`http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions`, async (route) => {
        const requestBody = route.request().postDataJSON();
        draftSessionRequests.push(requestBody);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ...draftSession,
                prompt_history: [
                    {
                        ...draftSession.prompt_history[0],
                        content: requestBody.prompt || requestBody.custom_prompt || 'Messy context to view'
                    }
                ],
                revisions: [
                    {
                        ...draftSession.revisions[0],
                        prompt: requestBody.prompt || requestBody.custom_prompt || 'Messy context to view'
                    }
                ]
            })
        });
    });

    await page.route(
        `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions/connected-package-session-1/accept`,
        async (route) => {
            const requestBody = route.request().postDataJSON();
            const selectedIds = requestBody.mode === 'selected' ? requestBody.selected_item_ids || [] : [];
            const shouldAccept = (id) => selectedIds.length === 0 || selectedIds.includes(id);
            const snapshot = parseSnapshot(state.savedFlowJson);
            const acceptedNodes = draftNodes
                .filter((node) => shouldAccept(node.id))
                .map(createAcceptedNode);
            const acceptedNodeIds = new Set(acceptedNodes.map((node) => node.id));
            const acceptedHierarchyEdges = draftEdges
                .filter((edge) => acceptedNodeIds.has(edge.source_node_id) && acceptedNodeIds.has(edge.target_node_id))
                .map((edge) => ({
                    id: edge.id,
                    source: edge.source_node_id,
                    target: edge.target_node_id,
                    type: 'smoothstep',
                    animated: false,
                    relationship_type: edge.relationship_type,
                    data: { relationship_type: edge.relationship_type }
                }));
            const acceptedRelationshipEdges = draftItems
                .filter((item) => shouldAccept(item.id))
                .filter((item) => acceptedNodeIds.has(item.metadata?.source_node_id) && acceptedNodeIds.has(item.metadata?.target_node_id))
                .map((item) => ({
                    id: item.metadata.relationship_edge_id,
                    source: item.metadata.source_node_id,
                    target: item.metadata.target_node_id,
                    type: 'smoothstep',
                    animated: false,
                    relationship_type: item.metadata.relationship_type,
                    source_refs: item.source_refs || [],
                    metadata: {
                        relationship_type: item.metadata.relationship_type,
                        confidence: item.metadata.confidence,
                        rationale: item.metadata.rationale
                    },
                    data: {
                        relationship_type: item.metadata.relationship_type,
                        confidence: item.metadata.confidence,
                        rationale: item.metadata.rationale,
                        source_refs: item.source_refs || []
                    }
                }));
            const graph = {
                ...snapshot,
                nodes: acceptedNodes,
                edges: [...acceptedHierarchyEdges, ...acceptedRelationshipEdges],
                source_library: [
                    {
                        id: sourceId,
                        title: sourceTitle,
                        type: 'notes',
                        type_label: 'Notes',
                        status: 'parsed',
                        chunks: [
                            { id: 'chunk-intake', heading: 'Messy intake', snippet: 'Permit closeout needs a single view.' },
                            { id: 'chunk-flow', heading: 'Flow notes', snippet: 'AHJ comments feed drawing updates.' },
                            { id: 'chunk-decision', heading: 'Decision notes', snippet: 'Owner decisions are needed.' },
                            { id: 'chunk-tasks', heading: 'Task notes', snippet: 'Accepted package items become handoff tasks.' }
                        ],
                        segments: []
                    }
                ],
                activity_events: [
                    {
                        id: 'activity-connected-package-accepted',
                        type: 'ai_draft_accepted',
                        title: 'Accepted connected package draft',
                        summary: 'Accepted selected connected picture package items.',
                        metadata: {
                            connected_package_id: connectedPackagePreview.package_id
                        }
                    }
                ]
            };
            const acceptResult = {
                session_id: draftSession.session_id,
                revision_id: 'connected-package-revision-1',
                mode: requestBody.mode || 'append',
                accepted_node_ids: acceptedNodes.map((node) => node.id),
                accepted_edge_ids: [...acceptedHierarchyEdges, ...acceptedRelationshipEdges].map((edge) => edge.id),
                preview_diff: {
                    added_nodes: acceptedNodes.length,
                    added_edges: acceptedHierarchyEdges.length + acceptedRelationshipEdges.length,
                    accepted_item_ids: selectedIds
                },
                graph_revision_id: 'connected-package-graph-revision-1',
                metadata: { undo_snapshot: state.savedFlowJson },
                canonical_graph_mutated: true
            };
            const acceptedSession = {
                ...draftSession,
                status: 'accepted',
                accept_history: [acceptResult]
            };
            state.savedFlowJson = JSON.stringify(graph);
            draftAcceptRequests.push({ requestBody, acceptResult });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ graph, session: acceptedSession, accept_result: acceptResult })
            });
        }
    );

    return { draftSessionRequests, draftAcceptRequests, savedRequests, state };
};

const openCanvasView = async (page, name) => {
    const toolbar = page.getByRole('region', { name: 'Canvas lens toolbar' });
    if ((await toolbar.count()) > 0) {
        await toolbar.getByRole('button').filter({ hasText: 'View' }).first().click();
    } else {
        const panel = page.locator('.local-views-panel').first();
        await panel.locator('.local-canvas-view-button').click();
    }
    await page.getByRole('button', { name, exact: true }).click();
};

test('new workspace accepts a connected picture package and projects every review view', async ({ page }) => {
    test.setTimeout(60000);
    const { draftSessionRequests, draftAcceptRequests, savedRequests, state } = await setupMockBackend(page);

    await page.setViewportSize({ width: 1500, height: 1050 });
    await page.goto('/');
    await page.getByAltText('Open workspaces').click();
    await page.getByText('NEW', { exact: true }).click();
    await page.getByRole('button', { name: 'Blank workspace' }).click();

    await page.getByTestId('rf__wrapper').getByRole('button', { name: 'Ask AI', exact: true }).click();
    await expect(page.locator('.ai-action-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Messy context to view' }).click();
    await page.locator('.ai-action-natural textarea').fill(
        [
            'Messy context to view: permit closeout notes are scattered across AHJ comments, owner approvals,',
            'drawing updates, field readiness, and task handoff. Package a connected picture draft with map,',
            'connections, flowchart, table, Sankey, evidence, and tasks.'
        ].join(' ')
    );
    await page
        .locator('.ai-action-footer')
        .getByRole('button', { name: /Create initial graph|Preview changes|Generate preview/ })
        .click();

    const draftPanel = page.locator('.ai-draft-session-panel');
    await expect(draftPanel).toContainText('Permit Closeout Package');
    await expect(draftPanel).toContainText('Review intake supports approval gate');
    const packagePreview = page.getByLabel('Connected package preview');
    await expect(packagePreview).toContainText('Permit Closeout Picture Package');
    await packagePreview.getByRole('button', { name: 'Graph' }).click();
    await expect(packagePreview).toContainText('Map');
    await expect(packagePreview).toContainText('Connections');
    await packagePreview.getByRole('button', { name: 'Chart' }).click();
    await expect(packagePreview).toContainText('Sankey lens');
    await packagePreview.getByRole('button', { name: 'Evidence' }).click();
    await expect(packagePreview).toContainText('Flow rows with source refs');
    await packagePreview.getByRole('button', { name: 'Tasks' }).click();
    await expect(packagePreview).toContainText('Prepare closeout task package');

    await expect.poll(() => draftSessionRequests.length, { timeout: 7000 }).toBe(1);
    expect(draftSessionRequests[0]).toMatchObject({
        scope: { type: 'workspace' },
        metadata: expect.objectContaining({
            output_shape: 'graph_draft',
            requested_visual: 'auto'
        })
    });
    expect(draftSessionRequests[0].prompt).toContain('Messy context to view');

    const draftItemsInPanel = draftPanel.locator('.ai-draft-item');
    await expect(draftItemsInPanel).toHaveCount(7);
    for (let index = 0; index < 7; index += 1) {
        await draftItemsInPanel.nth(index).locator('input[type="checkbox"]').check();
    }
    await expect(draftPanel.locator('.ai-draft-impact')).toContainText('7 checked draft items will be accepted');
    await draftPanel.locator('.ai-draft-accept').getByRole('button', { name: 'Accept selected' }).click();

    await expect.poll(() => draftAcceptRequests.length, { timeout: 7000 }).toBe(1);
    expect(draftAcceptRequests[0].requestBody).toMatchObject({
        mode: 'selected',
        selected_item_ids: [
            'pkg-root',
            'pkg-review-intake',
            'pkg-decision-gate',
            'pkg-sankey-evidence',
            'pkg-task',
            'pkg-relationship-intake-decision',
            'pkg-relationship-evidence-task'
        ]
    });
    const acceptedFlowchartView = page.getByRole('region', { name: 'Flowchart', exact: true });
    await expect(acceptedFlowchartView).toBeVisible();
    await expect(acceptedFlowchartView).toContainText('Review intake');
    await expect(acceptedFlowchartView).toContainText('Approval gate');

    await acceptedFlowchartView.getByRole('button', { name: 'Map' }).click();
    await expect(page.locator('.node-response').filter({ hasText: 'Permit Closeout Package' })).toBeVisible();
    await expect(page.locator('.node-response').filter({ hasText: 'Sankey evidence rows' })).toBeVisible();
    const closePanelButtons = page.getByRole('button', { name: 'Close', exact: true });
    if ((await closePanelButtons.count()) > 0) {
        await closePanelButtons.last().click();
    }

    expect(
        parseSnapshot(state.savedFlowJson).edges.some(
            (edge) => edge.relationship_type === 'packages' && edge.id === 'pkg-edge-evidence-packages-task'
        )
    ).toBe(true);

    await openCanvasView(page, 'Flowchart');
    await expect(page.getByRole('region', { name: 'Flowchart', exact: true })).toBeVisible();

    await openCanvasView(page, 'Table');
    const tableView = page.locator('.canvas-structured-view-table').filter({ hasText: '5 nodes' }).first();
    await expect(tableView).toBeVisible();
    await expect(tableView).toContainText('Permit Closeout Package');
    await expect(tableView).toContainText('Sankey evidence rows');
    const flowLens = tableView.getByLabel('Flow lens');
    await expect(flowLens).toBeVisible();
    await expect(flowLens).toContainText('3 paths');
    await expect(flowLens).toContainText('AHJ comments');
    await expect(flowLens).toContainText('Task package');

    await expect(tableView.getByRole('tab', { name: 'Evidence' })).toBeVisible();
    await expect(tableView).toContainText(sourceId);

    await openCanvasView(page, 'Tasks');
    const tasksView = page.getByRole('region', { name: 'Tasks', exact: true });
    await expect(tasksView).toBeVisible();
    await expect(tasksView).toContainText('Prepare closeout task package');

    await expect
        .poll(
            () => {
                const snapshot = parseSnapshot(state.savedFlowJson);
                return {
                    saved: savedRequests.length > 0,
                    nodeCount: snapshot.nodes.length,
                    edgeCount: snapshot.edges.length,
                    hasSankeyArtifact: snapshot.nodes.some((node) =>
                        node.data?.generated_artifacts?.some(
                            (artifact) =>
                                artifact.artifact_type === 'chart' &&
                                artifact.data?.chart_type === 'sankey'
                        )
                    ),
                    hasRelationship: snapshot.edges.some(
                        (edge) =>
                            edge.id === 'pkg-edge-evidence-packages-task' &&
                            edge.relationship_type === 'packages'
                    ),
                    hasTask: snapshot.nodes.some(
                        (node) => node.id === 'pkg-task' && node.data?.node_type === 'task'
                    )
                };
            },
            { timeout: 10000 }
        )
        .toEqual({
            saved: true,
            nodeCount: 5,
            edgeCount: 6,
            hasSankeyArtifact: true,
            hasRelationship: true,
            hasTask: true
        });
});
