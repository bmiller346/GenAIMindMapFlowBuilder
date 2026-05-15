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

    return { previewRequests, savedRequests, state };
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
    await page.locator('.node-menu-trigger').first().click();
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

test('node AI preview does not mutate graph before accept, then accept persists AIActionRun on reopen', async ({
    page
}) => {
    const { previewRequests, savedRequests, state } = await setupMockBackend(page);
    await createRoot(page, savedRequests, 'AI root');

    const beforePreview = latestSnapshot(savedRequests);
    await openAskAi(page);
    await page.getByRole('button', { name: 'Generate preview' }).click();
    await expect(page.locator('.node-inspector')).toBeVisible();
    await expect(page.locator('.ai-action-preview-card')).toContainText('node generated child');

    expect(structuralNodes(latestSnapshot(savedRequests))).toEqual(
        structuralNodes(beforePreview)
    );
    expect(latestSnapshot(savedRequests).edges).toEqual(beforePreview.edges);
    expect(previewRequests).toHaveLength(1);
    expect(previewRequests[0].scope).toBe('node');

    await page.locator('.ai-action-preview-actions').getByRole('button', { name: 'Accept' }).click();
    await waitForSavedSnapshot(savedRequests, (snapshot) => {
        const generated = snapshot.nodes.find((node) => node.id === 'generated-node-1');
        return (
            snapshot.nodes.length === 2 &&
            snapshot.edges.some((edge) => edge.source === beforePreview.nodes[0].id && edge.target === generated?.id) &&
            generated?.data?.status === 'needs_review' &&
            snapshot.ai_action_runs.some(
                (run) =>
                    run.ai_action_id === 'action-node-1' &&
                    run.status === 'accepted' &&
                    run.generated_node_ids.includes('generated-node-1')
            )
        );
    });

    await page.reload();
    await page.getByAltText('Open workspaces').click();
    await page.locator('.flow-row-main').filter({ hasText: state.savedFlowName }).click();
    await expect(page.locator('.node-title-input')).toHaveCount(2);
    await expect(page.locator('.node-title-input').nth(1)).toHaveValue('node generated child');
    expect(parseSnapshot(state.savedFlowJson).ai_action_runs).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                ai_action_id: 'action-node-1',
                status: 'accepted',
                generated_node_ids: ['generated-node-1']
            })
        ])
    );
});

test('branch AI reject leaves graph unchanged and records rejected action', async ({ page }) => {
    const { previewRequests, savedRequests } = await setupMockBackend(page);
    await createRoot(page, savedRequests, 'Branch root');

    const beforePreview = latestSnapshot(savedRequests);
    await openAskAi(page, 'Ask AI about branch');
    await page.getByRole('button', { name: 'Generate preview' }).click();
    await expect(page.locator('.ai-action-preview-card')).toContainText('branch generated child');
    expect(previewRequests[0].scope).toBe('branch');

    await page.locator('.ai-action-preview-actions').getByRole('button', { name: 'Reject' }).click();
    await expect(page.locator('.ai-action-preview-card')).toHaveCount(0);
    await waitForSavedSnapshot(savedRequests, (snapshot) =>
        snapshot.ai_action_runs.some(
            (run) => run.ai_action_id === 'action-branch-1' && run.status === 'rejected'
        )
    );

    const afterReject = latestSnapshot(savedRequests);
    expect(structuralNodes(afterReject)).toEqual(structuralNodes(beforePreview));
    expect(afterReject.edges).toEqual(beforePreview.edges);
    expect(afterReject.ai_action_runs).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                ai_action_id: 'action-branch-1',
                status: 'rejected',
                generated_node_ids: []
            })
        ])
    );
});

test('workspace AI preview is available from the header and accepts through AIActionRun', async ({
    page
}) => {
    const { previewRequests, savedRequests } = await setupMockBackend(page);
    await createRoot(page, savedRequests, 'Workspace root');

    const beforePreview = latestSnapshot(savedRequests);
    await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
    await expect(page.locator('.ai-action-modal')).toBeVisible();
    await expect(page.locator('.ai-action-scope')).toContainText('Whole workspace');

    await page.getByRole('button', { name: 'Generate preview' }).click();
    await expect(page.locator('.node-inspector')).toBeVisible();
    await expect(page.locator('.ai-action-preview-card')).toContainText('workspace generated child');
    expect(previewRequests.at(-1).scope).toBe('workspace');
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
    await expect(page.locator('.ai-action-preview-card')).toContainText('workspace generated child');

    await page.locator('.ai-action-preview-actions').getByRole('button', { name: 'Accept' }).click();
    await waitForSavedSnapshot(savedRequests, (snapshot) =>
        snapshot.nodes.some((node) => node.id === 'generated-workspace-2') &&
        snapshot.ai_action_runs.some(
            (run) =>
                run.ai_action_id === 'action-workspace-2' &&
                run.status === 'accepted' &&
                run.generated_node_ids.includes('generated-workspace-2')
        )
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
