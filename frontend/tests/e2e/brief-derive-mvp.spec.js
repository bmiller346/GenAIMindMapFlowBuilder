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

    await page.route('http://localhost:8000/flow-update', async (route) => {
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

    await page.getByText('Add New Source').click();
    await expect(page.getByText('PDF, DOCX, Markdown, and TXT are the MVP source-traceable paths.')).toBeVisible();
    await expect(page.getByText('Source-traceable | Extracts chunks and citations.').first()).toBeVisible();
    await expect(page.getByText('AI intake | Reviewable draft; no chunk citations.').first()).toBeVisible();
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
    await expect(page.getByRole('button', { name: /Graph validation/ })).toBeVisible();

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

    await page.getByRole('button', { name: /Graph validation/ }).click();
    await page.getByRole('button', { name: 'Inspect' }).first().click();
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
