import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd799439012';

const emptyFlowJson = JSON.stringify({
    nodes: [],
    edges: [],
    viewport: {},
    workspace_brief: {}
});

const parseSnapshot = (flowJson) => JSON.parse(flowJson || emptyFlowJson);

test('derives a reviewable map from a workspace brief and preserves MVP actions', async ({
    page
}) => {
    let savedFlowName = 'New Flow';
    let savedFlowJson = emptyFlowJson;
    let createdFlow = false;
    const savedRequests = [];
    const exportRequests = [];

    await page.route('http://localhost:8000/create-flow', async (route) => {
        createdFlow = true;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                flow_id: flowId,
                flow_type: 'manual'
            })
        });
    });

    await page.route('http://localhost:8000/flow-update/', async (route) => {
        const requestBody = route.request().postDataJSON();
        savedFlowName = requestBody.flow_name;
        savedFlowJson = requestBody.flow_json;
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
        `http://localhost:8000/api/workspaces/${flowId}/exports/json`,
        async (route) => {
            exportRequests.push(route.request().url());
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    exported: true,
                    workspace_id: flowId
                })
            });
        }
    );

    await page.goto('/');
    await page.getByAltText('Open workspaces').click();
    await page.getByText('NEW', { exact: true }).click();
    await page.getByRole('button', { name: 'Blank workspace' }).click();

    await page.getByRole('button', { name: 'Add sources' }).click();
    await expect(
        page.getByText(
            'Use source set when you want multiple documents in one upload. Single-source uploads are intentionally one file at a time for clearer extraction, role choice, and review. AI draft inputs create reviewable drafts instead of section-cited source records.'
        )
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Review folder \/ file set/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Upload PPTX/ })).toBeVisible();
    await page.getByRole('button', { name: 'Close source picker' }).click({ force: true });

    await page.getByAltText('Open workspaces').click();
    await page.getByRole('button', { name: /Brief/ }).click();
    await page.getByRole('button', { name: 'Exploratory' }).click();
    await page
        .getByLabel('Goal')
        .fill('Create an MVP launch readiness map from the brief only.');
    await page
        .getByLabel('Audience')
        .fill('Product owners, BIM managers, and internal reviewers');

    await page.getByRole('button', { name: 'Derive from brief' }).click();
    await expect(page.getByText('Workspace Goal')).toBeVisible();
    await page.getByRole('button', { name: 'Unsaved changes' }).click();
    await page.getByRole('button', { name: 'Health' }).click();
    await expect(page.getByRole('button', { name: /Workspace health/ })).toBeVisible();

    await expect
        .poll(() => {
            const snapshot = parseSnapshot(savedFlowJson);
            return snapshot.nodes?.length || 0;
        })
        .toBeGreaterThan(0);

    const savedSnapshotAfterDerive = parseSnapshot(savedFlowJson);
    expect(savedSnapshotAfterDerive.workspace_brief.goal).toBe(
        'Create an MVP launch readiness map from the brief only.'
    );
    expect(savedSnapshotAfterDerive.nodes.some((node) => node.data?.assumption)).toBe(
        true
    );
    expect(savedSnapshotAfterDerive.nodes.every((node) => node.data?.status === 'needs_review')).toBe(
        true
    );
    expect(
        savedSnapshotAfterDerive.nodes.every((node) => {
            const refs = node.data?.source_refs ?? node.data?.data?.source_refs;
            return Array.isArray(refs) && refs.length === 0;
        })
    ).toBe(true);

    await page.getByRole('button', { name: /Workspace health/ }).click();
    await page.getByRole('button', { name: 'TraceSpace Map', exact: true }).click();
    const workspaceGoalNode = page.locator('.node-response').filter({ hasText: 'Workspace Goal' }).first();
    await workspaceGoalNode.locator('.node-menu-trigger').click();
    await page.locator('.node-action-menu').getByRole('button', { name: 'Node settings' }).click();
    await expect(
        page.locator('.node-inspector').getByRole('heading', { name: 'Workspace Goal' })
    ).toBeVisible();
    await page
        .locator('.node-inspector')
        .getByLabel('Title')
        .fill('MVP Readiness Brief');
    await page
        .locator('.node-inspector')
        .getByLabel('Owner')
        .fill('BIM Ops');
    await page.locator('.node-inspector').getByLabel('Priority').selectOption('high');
    await page
        .locator('.node-inspector')
        .getByRole('button', { name: 'Apply', exact: true })
        .click();
    await expect(page.getByText('Applied locally')).toBeVisible();
    await page.getByRole('button', { name: 'Unsaved changes' }).click();

    await expect
        .poll(() => {
            const snapshot = parseSnapshot(savedFlowJson);
            return snapshot.nodes?.some(
                (node) =>
                    node.data?.title === 'MVP Readiness Brief' &&
                    node.data?.owner_id === 'BIM Ops'
            );
        })
        .toBe(true);

    await page.getByAltText('Open workspaces').click();
    await page.locator('.flow-row-main').filter({ hasText: savedFlowName }).click();
    await expect(page.getByRole('heading', { name: 'MVP Readiness Brief' })).toBeVisible();

    const exportRequestCountBeforeDownload = exportRequests.length;
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    await downloadPromise;

    expect(exportRequests.length).toBeGreaterThan(exportRequestCountBeforeDownload);
    expect(savedRequests.length).toBeGreaterThan(0);
});
