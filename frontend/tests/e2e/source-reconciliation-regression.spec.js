import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd7994390sr';
const sourceId = 'doc plan/2026';

const createNode = ({ id, title, sourceRefs = [] }) => ({
    id,
    type: 'response',
    position: { x: 160, y: 140 },
    data: {
        title,
        body: title,
        node_type: 'workflow',
        status: 'needs_review',
        manual: true,
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
                id: 'intake',
                title: 'Project intake workflow'
            })
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 0.9 },
        workspace_brief: {},
        source_library: [
            {
                id: sourceId,
                title: 'Project Plan 2026',
                type: 'docx',
                status: 'parsed',
                chunks: [
                    {
                        id: 'chunk-intake',
                        heading: 'Project Intake',
                        snippet: 'The project intake workflow validates the project template before setup.',
                        cited_by_count: 0
                    }
                ]
            }
        ],
        activity_events: [],
        automations: []
    });

const setupMockBackend = async (page) => {
    const state = {
        savedFlowJson: flowJson()
    };
    const reconcileUrls = [];

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
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ flow_id: flowId, message: 'Flow updated successfully' })
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
                        id: 'repair-intake',
                        preview_type: 'source_repair',
                        node_id: 'intake',
                        title: 'Reconcile source support for Project intake workflow',
                        rationale: 'Selected source contains overlapping language for this graph node.',
                        confidence: 'high',
                        source_refs: [
                            {
                                document_id: sourceId,
                                chunk_id: 'chunk-intake',
                                section: 'Project Intake',
                                quote_snippet:
                                    'The project intake workflow validates the project template before setup.',
                                confidence: 'high'
                            }
                        ],
                        assumptions: [],
                        proposed_mutation: {
                            source_refs: [{ document_id: sourceId, chunk_id: 'chunk-intake' }],
                            source_ref_repair: {
                                repair_type: 'reconcile_uploaded_source',
                                issues: ['Selected source may strengthen this node'],
                                source_id: sourceId,
                                suggested_from_title: 'Project Plan 2026',
                                suggestion_relationship: 'source_overlap'
                            }
                        }
                    }
                ],
                warnings: [],
                metadata: {
                    source_id: sourceId,
                    source_title: 'Project Plan 2026',
                    matched_node_count: 1,
                    source_only_chunk_count: 1,
                    source_only_chunks: [
                        {
                            chunk_id: 'chunk-budget',
                            section: 'Budget Risk',
                            snippet: 'The plan identifies budget risk that has not been modeled in the graph.'
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
                sessions: []
            })
        });
    });

    return { reconcileUrls };
};

test('source reconciliation previews and accepts source refs from the source library', async ({ page }) => {
    const { reconcileUrls } = await setupMockBackend(page);

    await page.goto('/');
    await expect(page.locator('.node-response')).toContainText('Project intake workflow');

    await page.locator('.workspace-dock-header').getByRole('button', { name: 'Library' }).click();
    await expect(page.locator('.sources-panel')).toBeVisible();
    await expect(page.locator('.sources-panel')).toContainText('Project Plan 2026');

    await page.getByRole('button', { name: 'Reconcile with workspace' }).click();
    await expect(page.locator('.local-source-repair-preview')).toContainText(
        'Reconcile source support for Project intake workflow'
    );
    await expect(page.locator('.source-only-sections')).toContainText('Budget Risk');
    expect(reconcileUrls[0]).toContain(encodeURIComponent(sourceId));

    await page.getByRole('button', { name: 'Accept selected' }).click();
    await expect(page.getByRole('row', { name: /Project intake workflow/ })).toContainText(
        'doc plan/2026 | Project Intake'
    );

    await page.getByRole('button', { name: 'Health' }).click();
    await expect(page.locator('.workspace-ai-usage')).toContainText('1,400 tokens');
    await expect(page.locator('.workspace-ai-usage')).toContainText('$0.0032 est.');
});
