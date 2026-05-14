import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd799439099';

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

const setupMockBackend = async (page) => {
    const state = {
        savedFlowName: 'New Flow',
        savedFlowJson: emptyFlowJson,
        createdFlow: false
    };
    const savedRequests = [];

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
        `http://localhost:8000/api/workspaces/${flowId}/exports/json`,
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    validation_report: {
                        is_valid: true,
                        repaired: false,
                        root_node_id: '',
                        issues: []
                    }
                })
            });
        }
    );

    return { savedRequests, state };
};

test('activity events persist after save and workspace reopen', async ({ page }) => {
    const { savedRequests, state } = await setupMockBackend(page);

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Add root', exact: true }).click();
    await expect(page.locator('.node-title-input').first()).toHaveValue(
        'New manual node'
    );

    await expect
        .poll(() => {
            const latestRequest = savedRequests.at(-1);
            if (!latestRequest?.flow_json) {
                return false;
            }

            return parseSnapshot(latestRequest.flow_json).activity_events.some(
                (event) => event.type === 'manual_node_created'
            );
        })
        .toBe(true);

    const savedSnapshot = parseSnapshot(state.savedFlowJson);
    expect(savedSnapshot.activity_events).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                type: 'manual_node_created',
                title: 'Manual node added'
            })
        ])
    );

    await page.reload();
    await page.getByAltText('Open workspaces').click();
    await page.locator('.flow-row-main').filter({ hasText: state.savedFlowName }).click();
    await page.getByAltText('Open workspaces').click();
    await page.locator('.drawer-tools').getByRole('button', { name: /Activity/ }).click();

    const activityPanel = page.locator('.activity-panel');
    await expect(activityPanel).toContainText('Manual node added');
    await expect(activityPanel).toContainText('Opened workspace');
});
