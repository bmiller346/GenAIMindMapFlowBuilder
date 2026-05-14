import { expect, test } from '@playwright/test';

const emptyFlowJson = JSON.stringify({
    nodes: [],
    edges: [],
    viewport: {},
    workspace_brief: {}
});

const setupMockBackend = async (page, { flowId = '507f1f77bcf86cd799439011' } = {}) => {
    const state = {
        savedFlowName: 'New Flow',
        savedFlowJson: emptyFlowJson
    };
    const savedRequests = [];

    await page.route('http://localhost:8000/create-flow', async (route) => {
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
                summary: 'Flow is empty'
            })
        });
    });

    await page.route('http://localhost:8000/flows', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([])
        });
    });

    return { flowId, savedRequests, state };
};

test('autosaves workspace names and reverts from the saved backend snapshot', async ({ page }) => {
    const { savedRequests } = await setupMockBackend(page);

    await page.goto('/');
    await page.getByAltText('Open workspaces').click();
    await page.getByText('NEW', { exact: true }).click();
    await page.getByRole('button', { name: 'Blank workspace' }).click();

    const nameInput = page.getByLabel('Workspace name');
    await expect(nameInput).toHaveValue('New Flow');
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

    await nameInput.fill('Autosaved Flow');
    await expect(page.getByRole('button', { name: 'Unsaved' })).toBeVisible();
    await expect
        .poll(() => savedRequests.some((request) => request.flow_name === 'Autosaved Flow'))
        .toBe(true);
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

    await nameInput.fill('Unsaved Scratch');
    await expect(page.getByRole('button', { name: 'Unsaved' })).toBeVisible();
    await page.getByRole('button', { name: 'Revert' }).click();

    await expect(nameInput).toHaveValue('Autosaved Flow');
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
});

test('manual table attaches to the selected branch and appears in the outline', async ({ page }) => {
    const { savedRequests } = await setupMockBackend(page);

    await page.goto('/');
    await page.getByRole('button', { name: 'Add root', exact: true }).click();
    await expect(page.getByRole('button', { name: /New manual node/ })).toBeVisible();
    await page.locator('.node-title-input').first().fill('/');
    await page
        .locator('.node-slash-menu')
        .getByRole('button', { name: /Add table/ })
        .click();

    await page.getByRole('button', { name: 'Outline' }).click();
    await expect(page.locator('.local-outline-row').filter({ hasText: 'Manual table' })).toBeVisible();

    await expect
        .poll(() => {
            const latestRequest = savedRequests.at(-1);
            if (!latestRequest?.flow_json) {
                return 0;
            }
            return JSON.parse(latestRequest.flow_json).edges.length;
        })
        .toBe(1);
});
