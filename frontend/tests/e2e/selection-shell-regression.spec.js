import { expect, test } from '@playwright/test';

const flowId = '507f1f77bcf86cd7994390e7';

const initialFlow = ({ selectedNodeIds = [] } = {}) =>
    JSON.stringify({
        nodes: [
            {
                id: 'root',
                type: 'response',
                selected: selectedNodeIds.includes('root'),
                position: { x: 0, y: 0 },
                data: {
                    title: 'Selection root',
                    node_type: 'concept',
                    status: 'reviewed',
                    manual: true,
                    source_refs: [
                        {
                            document_id: 'source-shell-brief',
                            page: 2,
                            section: 'Context',
                            quote_snippet: 'Selection root source evidence.'
                        }
                    ]
                }
            },
            {
                id: 'branch-a',
                type: 'response',
                selected: selectedNodeIds.includes('branch-a'),
                position: { x: 380, y: -140 },
                data: {
                    title: 'Branch A',
                    node_type: 'concept',
                    status: 'reviewed',
                    manual: true
                }
            },
            {
                id: 'branch-b',
                type: 'response',
                selected: selectedNodeIds.includes('branch-b'),
                position: { x: 380, y: 160 },
                data: {
                    title: 'Branch B',
                    node_type: 'concept',
                    status: 'reviewed',
                    manual: true
                }
            }
        ],
        edges: [
            {
                id: 'edge-root-a',
                source: 'root',
                target: 'branch-a',
                type: 'smoothstep',
                animated: false,
                relationship_type: 'contains',
                data: { relationship_type: 'contains' }
            },
            {
                id: 'edge-root-b',
                source: 'root',
                target: 'branch-b',
                type: 'smoothstep',
                animated: false,
                relationship_type: 'supports',
                confidence: 0.72,
                rationale: 'Branch B is supported by the root context.',
                source_signal: 'manual QA fixture',
                data: {
                    relationship_type: 'supports',
                    confidence: 0.72,
                    rationale: 'Branch B is supported by the root context.',
                    source_signal: 'manual QA fixture'
                }
            }
        ],
        viewport: { x: 140, y: 260, zoom: 0.9 },
        workspace_brief: {},
        source_library: [
            {
                id: 'source-shell-brief',
                title: 'Shell Source Brief',
                type: 'pdf',
                type_label: 'PDF',
                status: 'parsed',
                size: 2048,
                path: 'fixtures/shell-source-brief.pdf',
                chunks: [{ chunk_id: 'chunk-context', section: 'Context' }],
                segments: [{ id: 'segment-context' }]
            }
        ],
        activity_events: [],
        ai_action_runs: [],
        automations: []
    });

const parseSnapshot = (flowJson) => JSON.parse(flowJson || initialFlow());

const usageDraftSession = () => ({
    session_id: 'draft-session-shell-right-rail-1',
    workspace_id: flowId,
    scope: { type: 'workspace' },
    role: 'workflow_mapper',
    intent: 'usage_review',
    prompt_history: [
        {
            role: 'user',
            content: 'Review shell routing',
            created_at: '2026-05-19T18:45:00.000Z',
            revision_id: 'revision-shell-right-rail-1'
        }
    ],
    model_policy: 'balanced',
    selected_model: 'gpt-5.4',
    model_reason: 'Mocked shell routing session.',
    revisions: [
        {
            revision_id: 'revision-shell-right-rail-1',
            session_id: 'draft-session-shell-right-rail-1',
            prompt: 'Review shell routing',
            draft_items: [],
            draft_nodes: [
                {
                    id: 'draft-shell-right-rail',
                    parent_id: '',
                    title: 'Shell tray draft',
                    summary: 'A draft opened from AI usage should stay out of the properties rail.',
                    node_type: 'note',
                    status: 'needs_review',
                    confidence: 0.8,
                    source_refs: []
                }
            ],
            draft_edges: [],
            draft_annotations: [],
            preview_diff: {
                mode: 'append',
                added_nodes: 1,
                added_edges: 0,
                updated_nodes: 0,
                review_outputs: 1,
                needs_review_repairs: 1,
                accepted_item_ids: ['draft-shell-right-rail'],
                summary: '+1 nodes, !1 marked needs_review'
            },
            validation_report: {
                is_valid: true,
                repaired: false,
                issues: []
            },
            created_at: '2026-05-19T18:45:00.000Z',
            model: 'gpt-5.4',
            metadata: {}
        }
    ],
    source_refs: [],
    validation_reports: [],
    accept_history: [],
    status: 'drafting',
    metadata: {}
});

const setupMockBackend = async (page, { selectedNodeIds = [], enableShell = false } = {}) => {
    await page.addInitScript(({ enableShellFlag }) => {
        window.localStorage.clear();
        if (enableShellFlag) {
            window.localStorage.setItem('docmap.uiShellRibbon.enabled', 'true');
        }
    }, { enableShellFlag: enableShell });

    const state = {
        savedFlowJson: initialFlow({ selectedNodeIds })
    };
    const savedRequests = [];
    const nodeMessageRequests = [];

    await page.route('http://localhost:8000/flows', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    flow_id: flowId,
                    flow_name: 'Selection Shell QA',
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
                flow_name: 'Selection Shell QA',
                flow_json: state.savedFlowJson,
                flow_type: 'manual',
                summary: 'Flow is saved'
            })
        });
    });

    await page.route(/http:\/\/localhost:8000\/flow-update\/?$/, async (route) => {
        const requestBody = route.request().postDataJSON();
        state.savedFlowJson = requestBody.flow_json || state.savedFlowJson;
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

    await page.route(
        /http:\/\/localhost:8000\/api\/workspaces\/[^/]+\/ai\/node-message$/,
        async (route) => {
            const requestBody = route.request().postDataJSON();
            nodeMessageRequests.push(requestBody);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    message_id: `selection-message-${nodeMessageRequests.length}`,
                    answer: 'Selection answer uses both selected branches.',
                    selected_model: 'gpt-4.1-mini',
                    source_refs: []
                })
            });
        }
    );

    await page.route(
        /http:\/\/localhost:8000\/api\/workspaces\/[^/]+\/ai\/usage$/,
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    total_tokens: 1400,
                    estimated_cost_usd: '$0.0032',
                    session_count: 1,
                    sessions: [
                        {
                            session_id: 'draft-session-shell-right-rail-1',
                            selected_model: 'gpt-5.4',
                            total_tokens: 1400,
                            estimated_cost_usd: '$0.0032',
                            status: 'drafting',
                            revisions: [{ revision_id: 'revision-shell-right-rail-1' }],
                            created_at: '2026-05-19T18:45:00.000Z'
                        }
                    ]
                })
            });
        }
    );

    await page.route(
        /http:\/\/localhost:8000\/api\/workspaces\/[^/]+\/ai\/draft-sessions\/draft-session-shell-right-rail-1$/,
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(usageDraftSession())
            });
        }
    );

    return { nodeMessageRequests, savedRequests, state };
};

const nodeByTitle = (page, title) => page.locator('.react-flow__node').filter({ hasText: title });

const responseNodeByTitle = (page, title) => page.locator('.node-response').filter({ hasText: title });

const selectedNodeCount = (page) => page.locator('.react-flow__node.selected').count();

const openSelectionFixture = async (page) => {
    if ((await responseNodeByTitle(page, 'Selection root').count()) === 0) {
        const existingFlowRow = page.locator('.flow-row-main').filter({ hasText: 'Selection Shell QA' });
        if ((await existingFlowRow.count()) === 0) {
            await page.getByAltText('Open workspaces').click();
        }
        await page.locator('.flow-row-main').filter({ hasText: 'Selection Shell QA' }).click();
    }
    await expect(responseNodeByTitle(page, 'Selection root')).toBeVisible();
};

const shiftClickNode = async (page, title) => {
    const box = await responseNodeByTitle(page, title).boundingBox();
    expect(box).toBeTruthy();
    await page.keyboard.down('Shift');
    await page.mouse.click(box.x + box.width - 18, box.y + box.height - 18);
    await page.keyboard.up('Shift');
};

const expectNoMajorPanelOverlap = async (page) => {
    const boxes = await page
        .locator(
            [
                '.workspace-tools-floating-dock',
                '.canvas-lens-floating-dock',
                '.mindmap-relationship-floating-dock',
                '.selection-action-bar',
                '.node-inspector'
            ].join(', ')
        )
        .evaluateAll((elements) =>
            elements
                .filter((element) => {
                    const style = window.getComputedStyle(element);
                    const rect = element.getBoundingClientRect();
                    return (
                        style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        rect.width > 1 &&
                        rect.height > 1
                    );
                })
                .map((element) => {
                    const rect = element.getBoundingClientRect();
                    return {
                        className: element.className,
                        left: rect.left,
                        right: rect.right,
                        top: rect.top,
                        bottom: rect.bottom
                    };
                })
        );

    for (let firstIndex = 0; firstIndex < boxes.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < boxes.length; secondIndex += 1) {
            const first = boxes[firstIndex];
            const second = boxes[secondIndex];
            const overlapWidth = Math.max(
                0,
                Math.min(first.right, second.right) - Math.max(first.left, second.left)
            );
            const overlapHeight = Math.max(
                0,
                Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)
            );
            expect(
                overlapWidth * overlapHeight,
                `Unexpected panel overlap between ${first.className} and ${second.className}`
            ).toBe(0);
        }
    }
};

test.fixme('shift additive selection and lasso preserve selected nodes', async ({
    page
}) => {
    await setupMockBackend(page);

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await openSelectionFixture(page);

    await shiftClickNode(page, 'Selection root');
    await expect.poll(() => selectedNodeCount(page)).toBe(1);
    await expect(page.locator('.selection-action-bar')).toContainText('1 selected');
    await expect(nodeByTitle(page, 'Selection root')).toHaveClass(/selected/);

    await shiftClickNode(page, 'Branch A');
    await expect.poll(() => selectedNodeCount(page)).toBe(2);
    await expect(page.locator('.selection-action-bar')).toContainText('2 selected');

    const branchBBox = await responseNodeByTitle(page, 'Branch B').boundingBox();
    expect(branchBBox).toBeTruthy();
    await page.keyboard.down('Shift');
    await page.mouse.move(branchBBox.x - 40, branchBBox.y - 40);
    await page.mouse.down();
    await page.mouse.move(branchBBox.x + branchBBox.width + 40, branchBBox.y + branchBBox.height + 40, {
        steps: 8
    });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect.poll(() => selectedNodeCount(page)).toBe(3);
    await expect(page.locator('.selection-action-bar')).toContainText('3 selected');
    await expect(nodeByTitle(page, 'Branch A')).toHaveClass(/selected/);
    await expect(nodeByTitle(page, 'Branch B')).toHaveClass(/selected/);
});

test('quick Ask AI and branch lens stay stable', async ({
    page
}) => {
    const { nodeMessageRequests } = await setupMockBackend(page, {
        selectedNodeIds: ['root', 'branch-a']
    });

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await openSelectionFixture(page);
    await expect.poll(() => selectedNodeCount(page)).toBe(2);
    await expect(page.locator('.selection-action-bar')).toContainText('2 selected');

    await page.getByLabel('Ask AI about selected nodes').fill('What ties these nodes together?');
    await page.locator('.selection-quick-ask').getByRole('button').last().click();
    await expect(page.locator('.selection-quick-result')).toContainText(
        'Selection answer uses both selected branches.'
    );
    await expect.poll(() => nodeMessageRequests.length).toBe(1);
    expect(nodeMessageRequests[0].scope).toEqual({
        type: 'nodes',
        node_ids: ['root', 'branch-a']
    });
    expect(nodeMessageRequests[0].metadata).toMatchObject({
        preview_mode: 'selection_quick_message',
        selected_node_count: 2
    });

    const relationshipLens = page.locator('.mindmap-relationship-controls');
    await expect(relationshipLens).toBeVisible();
    await relationshipLens.getByRole('button', { name: /Branch A/ }).click();
    await expect(page.getByRole('region', { name: 'Active canvas scope' })).toContainText('Branch A');
    await expect(nodeByTitle(page, 'Branch A')).toHaveClass(/canvas-node-branch-root/);
    await expect(nodeByTitle(page, 'Branch B')).toHaveClass(/canvas-node-out-of-scope/);

    await page
        .getByRole('region', { name: 'Active canvas scope' })
        .getByRole('button', { name: 'Clear', exact: true })
        .click();
    await expect(page.getByRole('region', { name: 'Active canvas scope' })).toHaveCount(0);
});

test('shell flag mounts ribbon, navigator, and canvas slots without legacy workspace dock chrome', async ({ page }) => {
    await setupMockBackend(page, { enableShell: true });

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await openSelectionFixture(page);

    await expect(page.getByTestId('workspace-shell')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-ribbon-slot')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-left-slot')).toBeVisible();
    await expect(page.getByTestId('workspace-shell-canvas-slot')).toBeVisible();
    await expect(page.getByTestId('shell-ribbon')).toHaveAttribute('data-active-tab', 'home');
    await expect(page.locator('.workspace-dock--shell-left')).toBeVisible();
    await expect(page.locator('.workspace-tools-floating-dock')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Map' }).click();
    await expect(page.getByTestId('shell-ribbon')).toHaveAttribute('data-active-tab', 'map');
    await expect(page.locator('.shell-ribbon-command-stack')).toBeVisible();
    await expect(responseNodeByTitle(page, 'Selection root')).toBeVisible();
});

test('shell left navigator tabs, collapse, and open-tab events stay in the left rail', async ({ page }) => {
    await setupMockBackend(page, { enableShell: true });

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await expect(page.getByTestId('workspace-shell')).toBeVisible();

    const leftRail = page.locator('.workspace-shell__left');
    const workspaceDock = leftRail.locator('.workspace-dock--shell-left');
    const navigatorModes = leftRail.locator('.shell-left-navigator__modebar');
    await expect(leftRail).toBeVisible();
    await expect(workspaceDock).toBeVisible();
    await expect(page.locator('.workspace-tools-floating-dock')).toHaveCount(0);

    await workspaceDock.getByRole('button', { name: 'Sources' }).click();
    await expect(workspaceDock.getByRole('button', { name: 'Sources' })).toHaveClass(/active/);
    await expect(leftRail).toContainText('Sources');
    await workspaceDock.getByRole('button', { name: 'Library' }).click();
    await expect(navigatorModes.getByRole('button', { name: 'Sources', exact: true })).toHaveClass(/active/);
    await expect(leftRail.locator('.sources-panel--embedded')).toBeVisible();
    await expect(leftRail.locator('.sources-panel--embedded')).toContainText('Source set / Media');
    await expect(page.locator('body > .sources-panel')).toHaveCount(0);
    await leftRail.locator('.sources-panel--embedded').getByRole('button', { name: 'Close' }).click();
    await expect(navigatorModes.getByRole('button', { name: 'Workspace', exact: true })).toHaveClass(/active/);
    await expect(workspaceDock.getByRole('button', { name: 'Sources' })).toHaveClass(/active/);

    await workspaceDock.getByRole('button', { name: 'Collapse workspace panel' }).click();
    await expect(workspaceDock).toHaveClass(/workspace-dock--collapsed/);
    const collapsedWidth = await leftRail.evaluate((element) => element.getBoundingClientRect().width);
    expect(collapsedWidth).toBeLessThan(90);

    await page.evaluate(() => {
        window.dispatchEvent(
            new CustomEvent('docmap:workspace-dock-open-tab', {
                detail: { tab: 'build' }
            })
        );
    });
    await expect(workspaceDock).not.toHaveClass(/workspace-dock--collapsed/);
    await expect(workspaceDock.getByRole('button', { name: 'Build' })).toHaveClass(/active/);
    await expect(leftRail).toContainText('TraceSpace setup');

    const resizeHandle = workspaceDock.getByRole('button', { name: 'Resize workspace panel' });
    await expect(resizeHandle).toBeVisible();

    await navigatorModes.getByRole('button', { name: 'Outline', exact: true }).click();
    await expect(navigatorModes.getByRole('button', { name: 'Outline', exact: true })).toHaveClass(/active/);
    await expect(leftRail.getByRole('region', { name: 'Workspace outline' })).toBeVisible();
    await expect(leftRail).toContainText('Selection root');
    await expect(page.locator('.workspace-tools-floating-dock')).toHaveCount(0);

    await navigatorModes.getByRole('button', { name: 'Workspace', exact: true }).click();
    await expect(workspaceDock).toBeVisible();
    await expect(workspaceDock.getByRole('button', { name: 'Build' })).toHaveClass(/active/);

    await navigatorModes.getByRole('button', { name: 'Activity', exact: true }).click();
    await expect(navigatorModes.getByRole('button', { name: 'Activity', exact: true })).toHaveClass(/active/);
    await expect(navigatorModes.getByRole('button', { name: 'Workspace', exact: true })).not.toHaveClass(/active/);
    await expect(navigatorModes.getByRole('button', { name: 'Outline', exact: true })).not.toHaveClass(/active/);
    await expect(leftRail.getByRole('button', { name: 'Collapse navigator' })).toBeVisible();
    await expect(leftRail.getByRole('button', { name: 'Resize navigator' })).toBeVisible();
    await expect(leftRail.locator('.activity-panel--embedded')).toBeVisible();
    await expect(
        leftRail.locator('.activity-panel--embedded').getByRole('button', { name: 'Close' })
    ).toHaveCount(0);
    await expect(page.locator('body > .activity-panel')).toHaveCount(0);

    await page.evaluate(() => {
        window.dispatchEvent(
            new CustomEvent('docmap:workspace-dock-open-tab', {
                detail: { tab: 'sources' }
            })
        );
    });
    await expect(workspaceDock).toBeVisible();
    await expect(navigatorModes.getByRole('button', { name: 'Workspace', exact: true })).toHaveClass(/active/);
    await expect(workspaceDock.getByRole('button', { name: 'Sources' })).toHaveClass(/active/);
});

test('shell routes AI helpers into the right rail instead of a canvas overlay', async ({ page }) => {
    await setupMockBackend(page, { enableShell: true });

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await openSelectionFixture(page);

    await page.getByAltText('Open workspaces').click();
    await page.getByRole('button', { name: /^AI helpers\b/i }).click();

    const rightRail = page.locator('.workspace-shell__right');
    await expect(rightRail).toBeVisible();
    await expect(rightRail.locator('.ai-helpers-panel')).toBeVisible();
    await expect(rightRail.locator('.ai-helpers-body')).toBeVisible();
    await expect(page.locator('.react-flow__panel .ai-helpers-panel')).toHaveCount(0);

    await rightRail.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.workspace-shell__right')).toHaveCount(0);
});

test('shell right rail persists node metadata edits', async ({ page }) => {
    await setupMockBackend(page, { enableShell: true });

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await openSelectionFixture(page);

    await responseNodeByTitle(page, 'Selection root').click();
    const rightRail = page.locator('.workspace-shell__right');
    await expect(rightRail).toBeVisible();
    await expect(rightRail).toContainText('Node properties');
    await expect(rightRail.locator('.node-inspector')).toBeVisible();
    await expect(page.locator('.metadata-inspector-floating-dock')).toHaveCount(0);

    await rightRail.getByLabel('Title').fill('Shell rail metadata title');
    await rightRail.getByLabel('Priority').selectOption('high');
    await rightRail.getByRole('button', { name: 'Apply', exact: true }).click();

    await expect(rightRail).toContainText('Applied locally');
    await expect(responseNodeByTitle(page, 'Shell rail metadata title')).toBeVisible();
});

test('shell right rail persists relationship metadata edits', async ({ page }) => {
    const { savedRequests, state } = await setupMockBackend(page, { enableShell: true });

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await openSelectionFixture(page);

    await page.locator('.react-flow__edge[data-id="edge-root-a"]').click({ force: true });
    const rightRail = page.locator('.workspace-shell__right');
    await expect(rightRail).toBeVisible();
    await expect(rightRail).toContainText('Relationship properties');
    await expect(rightRail.locator('.edge-inspector')).toBeVisible();
    await expect(page.locator('.metadata-inspector-floating-dock')).toHaveCount(0);
    await rightRail.locator('.edge-inspector-edit').getByLabel('Relationship').selectOption('depends_on');
    await rightRail.locator('.edge-inspector-edit').getByLabel('Confidence').fill('0.91');
    await rightRail.locator('.edge-inspector-edit').getByLabel('Rationale').fill('Branch B depends on the root outcome.');
    await rightRail.locator('.edge-inspector-edit').getByRole('button', { name: 'Apply relationship' }).click();
    await page.evaluate(() => {
        window.dispatchEvent(new Event('docmap:save-workspace-now'));
    });

    await expect
        .poll(() => {
            const edge = parseSnapshot(state.savedFlowJson).edges.find((item) => item.id === 'edge-root-a');
            return {
                relationship_type: edge?.relationship_type,
                confidence: edge?.confidence,
                rationale: edge?.rationale
            };
        })
        .toEqual({
            relationship_type: 'depends_on',
            confidence: '0.91',
            rationale: 'Branch B depends on the root outcome.'
        });

    expect(savedRequests.length).toBeGreaterThan(0);
});

test('shell right rail shows branch properties from the active branch lens', async ({ page }) => {
    await setupMockBackend(page, { enableShell: true });

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await openSelectionFixture(page);

    await page.getByRole('tab', { name: 'Map' }).click();
    await page.locator('.mindmap-relationship-controls').getByRole('button', { name: /Branch A/ }).click();
    const scopeBanner = page.getByRole('region', { name: 'Active canvas scope' });
    await expect(scopeBanner).toContainText('Branch A');
    await expect(page.locator('.workspace-shell__right')).toHaveCount(0);

    await scopeBanner.getByRole('button', { name: 'Properties' }).click();

    const rightRail = page.locator('.workspace-shell__right');
    await expect(rightRail).toBeVisible();
    await expect(rightRail).toContainText('Branch properties');
    await expect(rightRail.locator('.branch-properties-panel')).toContainText('Branch A');
    await expect(rightRail.locator('.branch-properties-panel')).toContainText('Nodes');
    await expect(rightRail.locator('.branch-properties-panel')).toContainText('Relationships');
    await expect(page.locator('.metadata-inspector-floating-dock')).toHaveCount(0);

    await rightRail.getByRole('button', { name: 'Clear lens' }).click();
    await expect(page.getByRole('region', { name: 'Active canvas scope' })).toHaveCount(0);
    await expect(page.locator('.workspace-shell__right')).toHaveCount(0);
});

test('shell right rail shows source properties from the source library', async ({ page }) => {
    await setupMockBackend(page, { enableShell: true });

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await openSelectionFixture(page);

    const leftRail = page.locator('.workspace-shell__left');
    await leftRail.locator('.workspace-dock-tabs').getByRole('button', { name: 'Sources' }).click();
    await leftRail.getByRole('button', { name: 'Library' }).click();

    const sourcePanel = page.locator('.sources-panel');
    await expect(sourcePanel).toBeVisible();
    await expect(sourcePanel).toContainText('Shell Source Brief');
    await sourcePanel.getByRole('button', { name: 'Properties' }).click();

    const rightRail = page.locator('.workspace-shell__right');
    await expect(sourcePanel).toHaveCount(0);
    await expect(rightRail).toBeVisible();
    await expect(rightRail).toContainText('Source properties');
    await expect(rightRail.locator('.source-properties-panel')).toContainText('Shell Source Brief');
    await expect(rightRail.locator('.source-properties-panel')).toContainText('Coverage');
    await expect(rightRail.locator('.source-properties-panel')).toContainText('1 nodes');
    await expect(rightRail.locator('.source-properties-panel')).toContainText('Selection root');
    await expect(page.locator('.metadata-inspector-floating-dock')).toHaveCount(0);

    await rightRail.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.workspace-shell__right')).toHaveCount(0);
});

test('shell routes AI draft review to tray instead of right properties rail', async ({ page }) => {
    await setupMockBackend(page, { enableShell: true });

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await openSelectionFixture(page);

    await page.locator('.workspace-dock-tabs').getByRole('button', { name: 'Health' }).click();
    await page.locator('.workspace-ai-usage').getByRole('button', { name: 'Refresh' }).click();
    await expect(page.locator('.workspace-ai-usage')).toContainText('1 draft sessions tracked');
    await page.locator('.workspace-ai-usage').getByText('Details').click();
    await page.locator('.workspace-ai-usage').getByRole('button', { name: 'Review' }).click();

    const tray = page.locator('.workspace-shell__bottom .review-tray');
    await expect(tray).toBeVisible();
    await expect(tray.getByRole('tab', { name: 'Drafts' })).toHaveAttribute('aria-selected', 'true');
    await expect(tray.locator('.ai-draft-session-panel')).toContainText('Shell tray draft');
    await expect(page.locator('.workspace-shell__right')).toHaveCount(0);
    await expect(page.locator('.metadata-inspector-floating-dock')).toHaveCount(0);
});

test.fixme('major floating panels do not overlap when branch lens is active', async ({ page }) => {
    await setupMockBackend(page, {
        selectedNodeIds: ['root', 'branch-a']
    });

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await expect(responseNodeByTitle(page, 'Selection root')).toBeVisible();
    await page.locator('.mindmap-relationship-controls').getByRole('button', { name: /Branch A/ }).click();

    await expectNoMajorPanelOverlap(page);
});
