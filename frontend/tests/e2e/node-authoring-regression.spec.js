import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd7994390d0';

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
    const exportRequests = [];

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

    for (const format of ['json', 'markdown']) {
        await page.route(
            `http://localhost:8000/api/workspaces/${flowId}/exports/${format}`,
            async (route) => {
                exportRequests.push({
                    format,
                    snapshot: parseSnapshot(state.savedFlowJson)
                });
                await route.fulfill({
                    status: 200,
                    contentType: format === 'json' ? 'application/json' : 'text/markdown',
                    body: format === 'json' ? state.savedFlowJson : '# New Flow\n'
                });
            }
        );
    }

    return { exportRequests, savedRequests, state };
};

const latestSnapshot = (savedRequests) => {
    const latestRequest = savedRequests.at(-1);
    return parseSnapshot(latestRequest?.flow_json);
};

const waitForSavedSnapshot = async (savedRequests, predicate, timeout = 7000) => {
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

const openFirstNodeMenu = async (page) => {
    await page.locator('.node-menu-trigger').first().click();
};

const openNodeMenuByTitle = async (page, title) => {
    const inputs = page.locator('.node-title-input');
    const count = await inputs.count();
    for (let index = 0; index < count; index += 1) {
        const input = inputs.nth(index);
        if ((await input.inputValue()) === title) {
            await input
                .locator('xpath=ancestor::div[contains(@class, "node-response")]')
                .locator('.node-menu-trigger')
                .click();
            return;
        }
    }

    throw new Error(`Could not find node titled "${title}"`);
};

const clickNodeMenuAction = async (page, name) => {
    await page
        .locator('.node-action-menu')
        .getByRole('button', { name })
        .click({ force: true });
};

test('node authoring actions save, reopen, delete, and export cleanly', async ({
    page
}) => {
    const consoleMessages = [];
    page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) {
            consoleMessages.push(`${message.type()}: ${message.text()}`);
        }
    });
    page.on('pageerror', (error) => {
        consoleMessages.push(`pageerror: ${error.message}`);
    });

    const { exportRequests, savedRequests, state } = await setupMockBackend(page);

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Add root', exact: true }).click();
    await expect(page.locator('.node-title-input').first()).toHaveValue(
        'New manual node'
    );

    await page.locator('.node-title-input').first().fill('Root alpha');
    await waitForSavedSnapshot(
        savedRequests,
        (snapshot) =>
            snapshot.nodes.length === 1 && snapshot.nodes[0].data.title === 'Root alpha'
    );

    await page.locator('.node-quick-add').first().click();
    await expect(page.locator('.node-title-input')).toHaveCount(2);

    await page.locator('.node-title-input').nth(1).fill('/');
    await page
        .locator('.node-slash-menu')
        .getByRole('button', { name: /Add table/ })
        .click();
    await expect(page.locator('.manual-table-preview')).toBeVisible();

    await page.locator('.manual-table-preview').getByRole('button').click();
    await page.locator('.manual-table-editor tbody input').first().fill('Persisted');
    await waitForSavedSnapshot(savedRequests, (snapshot) =>
        snapshot.nodes.some((node) =>
            node.data?.data?.df?.some((row) => row.Column === 'Persisted')
        )
    );

    await openFirstNodeMenu(page);
    await clickNodeMenuAction(page, 'Add task below');
    await expect(page.locator('.node-title-input')).toHaveCount(4);

    await page.locator('.node-quick-add').first().click();
    await expect(page.locator('.node-title-input')).toHaveCount(5);

    await openFirstNodeMenu(page);
    await clickNodeMenuAction(page, 'Duplicate');
    await expect(page.locator('.node-title-input')).toHaveCount(6);
    await waitForSavedSnapshot(savedRequests, (snapshot) => {
        const original = snapshot.nodes.find((node) => node.data?.title === 'Root alpha');
        const duplicate = snapshot.nodes.find(
            (node) =>
                node.data?.title === 'Root alpha copy' && node.id !== original?.id
        );
        return Boolean(original && duplicate);
    });

    await openFirstNodeMenu(page);
    await clickNodeMenuAction(page, 'Sort children');
    await waitForSavedSnapshot(savedRequests, (snapshot) => {
        const root = snapshot.nodes.find((node) => node.data?.title === 'Root alpha');
        if (!root) {
            return false;
        }
        const directChildIds = snapshot.edges
            .filter((edge) => edge.source === root.id)
            .map((edge) => edge.target);
        return directChildIds.length === 2;
    });

    await openFirstNodeMenu(page);
    await clickNodeMenuAction(page, 'Node settings');
    const inspector = page.locator('.node-inspector');
    await expect(inspector).toBeVisible();
    await inspector.getByLabel('Title').fill('Root metadata title');
    await inspector.getByLabel('Priority').selectOption('high');
    await inspector.getByRole('button', { name: 'Apply' }).click();
    await waitForSavedSnapshot(savedRequests, (snapshot) =>
        snapshot.nodes.some(
            (node) =>
                node.data?.title === 'Root metadata title' &&
                node.data?.priority === 'high'
        )
    );

    await page.reload();
    await page.getByAltText('Open workspaces').click();
    await page.locator('.flow-row-main').filter({ hasText: state.savedFlowName }).click();
    await expect(page.locator('.node-title-input')).toHaveCount(6);
    await expect(page.locator('.node-title-input').first()).toHaveValue(
        'Root metadata title'
    );
    await expect(page.locator('.manual-table-preview')).toBeVisible();

    const rootIdBeforeDelete = latestSnapshot(savedRequests).nodes.find(
        (node) => node.data?.title === 'Root metadata title'
    )?.id;
    expect(rootIdBeforeDelete).toBeTruthy();
    await openNodeMenuByTitle(page, 'Root metadata title');
    page.once('dialog', (dialog) => dialog.accept());
    await clickNodeMenuAction(page, 'Delete');
    await expect
        .poll(() => page.locator('.node-title-input').count())
        .toBeLessThan(6);
    await waitForSavedSnapshot(
        savedRequests,
        (snapshot) => {
            const nodeRemoved = !snapshot.nodes.some(
                (node) => node.id === rootIdBeforeDelete
            );
            const edgesRemoved = !snapshot.edges.some(
                (edge) =>
                    edge.source === rootIdBeforeDelete ||
                    edge.target === rootIdBeforeDelete
            );
            return nodeRemoved && edgesRemoved;
        },
        15000
    );

    await page.getByRole('button', { name: 'Export' }).click();
    await page
        .locator('.export-menu')
        .getByRole('button', { name: 'JSON', exact: true })
        .click();
    await expect.poll(() => exportRequests.some((request) => request.format === 'json')).toBe(
        true
    );

    await page.getByRole('button', { name: 'Export' }).click();
    await page
        .locator('.export-menu')
        .getByRole('button', { name: 'Markdown' })
        .click();
    await expect
        .poll(() => exportRequests.some((request) => request.format === 'markdown'))
        .toBe(true);

    expect(
        consoleMessages.filter(
            (message) =>
                !message.includes('React Router Future Flag Warning') &&
                !message.includes('Download is starting') &&
                !message.includes('net::ERR_NETWORK_ACCESS_DENIED')
        )
    ).toEqual([]);
});
