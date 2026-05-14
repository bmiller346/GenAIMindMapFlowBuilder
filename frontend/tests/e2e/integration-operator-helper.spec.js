import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd799439044';

const emptyFlowJson = JSON.stringify({
    nodes: [],
    edges: [],
    viewport: {},
    workspace_brief: {},
    source_library: [],
    activity_events: [],
    automations: []
});

const parseSnapshot = (flowJson) => JSON.parse(flowJson || emptyFlowJson);

test('Integration Operator generated preview can be displayed, accepted, and recorded in Activity', async ({
    page
}) => {
    let savedFlowName = 'New Flow';
    let savedFlowJson = emptyFlowJson;
    let createdFlow = false;

    await page.route('http://localhost:8000/create-flow', async (route) => {
        createdFlow = true;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                flow_id: flowId,
                flow_name: savedFlowName,
                flow_type: 'manual'
            })
        });
    });

    await page.route('http://localhost:8000/flow-update', async (route) => {
        const requestBody = route.request().postDataJSON();
        savedFlowName = requestBody.flow_name;
        savedFlowJson = requestBody.flow_json;
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
                flow_name: savedFlowName,
                flow_json: savedFlowJson,
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
                createdFlow
                    ? [
                          {
                              flow_id: flowId,
                              flow_name: savedFlowName,
                              flow_json: savedFlowJson,
                              flow_type: 'manual',
                              summary: 'Flow is saved'
                          }
                      ]
                    : []
            )
        });
    });

    await page.route(
        `http://localhost:8000/api/workspaces/${flowId}/ai/integration-operator/preview`,
        async (route) => {
            const snapshot = parseSnapshot(savedFlowJson);
            const node = snapshot.nodes?.[0];
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    preview_id: 'preview-integration-1',
                    helper_id: 'integration_operator',
                    action: 'handoff_readiness',
                    scope: { type: 'workspace' },
                    generated_by: 'deterministic_fallback',
                    warnings: [],
                    metadata: { ai_helper_preview_contract_version: '1' },
                    preview_items: [
                        {
                            id: 'item-handoff-1',
                            preview_type: 'handoff_readiness',
                            node_id: node?.id || 'missing-node',
                            title: 'Review handoff readiness',
                            rationale: 'The node has staged monday input pending.',
                            confidence: 'low',
                            source_refs: [],
                            assumptions: ['A user must stage monday input before push.'],
                            proposed_mutation: {
                                integration_operator_preview: {
                                    target: 'monday',
                                    readiness: 'staged_not_pushed',
                                    issues: ['Missing monday item'],
                                    explanation: 'Ready to stage monday input before push.',
                                    source: 'generated_integration_operator_preview'
                                }
                            }
                        }
                    ]
                })
            });
        }
    );

    await page.goto('/');
    await page.getByRole('button', { name: 'Add root', exact: true }).click();

    await expect
        .poll(() => parseSnapshot(savedFlowJson).nodes?.[0]?.id || '')
        .not.toBe('');

    await page.getByAltText('Open workspaces').click();
    await page.locator('.drawer-tools').getByRole('button', { name: /AI helpers/i }).click();
    await page.getByRole('button', { name: /AI Helpers/ }).click();
    await page.getByRole('button', { name: /monday input/ }).click();

    await expect(page.getByText('monday selection input')).toBeVisible();
    await expect(page.getByText('staged_not_pushed')).toBeVisible();
    await expect(page.getByText('Ready to stage monday input before push.')).toBeVisible();

    await page.getByRole('button', { name: 'Stage selected' }).click();
    await page.getByAltText('Open workspaces').click();
    await page.locator('.drawer-tools').getByRole('button', { name: /Activity/ }).click();

    await expect(page.locator('.activity-panel')).toContainText(
        'Accepted integration handoff preview'
    );
});
