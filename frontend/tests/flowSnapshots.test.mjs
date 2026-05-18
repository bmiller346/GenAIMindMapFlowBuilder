import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createFlowSnapshot,
    parseFlowSnapshot,
    stringifyFlowSnapshot
} from '../src/utils/flowSnapshots.js';
import { LAYOUT_MODES, createWorkspaceNode } from '../src/utils/manualNodes.js';

test('parseFlowSnapshot normalizes saved response nodes and layout edge styles', () => {
    const rawSnapshot = {
        nodes: [
            {
                id: 'parent',
                type: 'response',
                data: {
                    title: 'Parent',
                    display: { layoutMode: LAYOUT_MODES.BALANCED_MAP }
                }
            },
            {
                id: 'child',
                type: 'response',
                data: {
                    data: { summ: 'Child from legacy data' }
                }
            }
        ],
        edges: [{ id: 'edge-1', source: 'parent', target: 'child', type: 'step' }]
    };

    const snapshot = parseFlowSnapshot(JSON.stringify(rawSnapshot));

    assert.equal(snapshot.nodes[1].data.title, 'Child from legacy data');
    assert.equal(snapshot.nodes[1].data.status, 'ai_generated');
    assert.equal(snapshot.edges[0].type, 'smoothstep');
});

test('createFlowSnapshot drops disconnected edges and normalizes manual node schema', () => {
    const node = createWorkspaceNode({ id: 'node-1', title: 'Persist me' });
    const snapshot = createFlowSnapshot({
        nodes: [node],
        edges: [
            { id: 'connected', source: 'node-1', target: 'node-1' },
            { id: 'orphaned', source: 'node-1', target: 'missing' }
        ]
    });

    assert.equal(snapshot.nodes[0].data.title, 'Persist me');
    assert.equal(snapshot.nodes[0].data.data.summ, 'Persist me');
    assert.deepEqual(
        snapshot.edges.map((edge) => edge.id),
        ['connected']
    );
    assert.equal(snapshot.edges[0].type, 'step');
});

test('stringifyFlowSnapshot removes activity undo payloads at the snapshot boundary', () => {
    const serialized = stringifyFlowSnapshot({
        nodes: [createWorkspaceNode({ id: 'node-1' })],
        edges: [],
        activity_events: [
            {
                id: 'activity-1',
                title: 'Did work',
                undo: { nodes: [] }
            }
        ]
    });
    const parsed = JSON.parse(serialized);

    assert.equal(Object.hasOwn(parsed.activity_events[0], 'undo'), false);
});

test('flow snapshots preserve AI action run history', () => {
    const serialized = stringifyFlowSnapshot({
        nodes: [createWorkspaceNode({ id: 'node-1' })],
        edges: [],
        ai_action_runs: [
            {
                ai_action_id: 'action-1',
                workspace_id: 'workspace-1',
                source_node_id: 'node-1',
                scope: 'node',
                role: 'Task Planner',
                action: 'generate_tasks',
                custom_prompt: null,
                input_source_refs: [{ document_id: 'doc-1' }],
                created_at: '2026-05-14T00:00:00.000Z',
                created_by: 'user',
                status: 'accepted',
                generated_node_ids: ['node-2']
            }
        ]
    });
    const snapshot = parseFlowSnapshot(serialized);

    assert.equal(snapshot.ai_action_runs.length, 1);
    assert.equal(snapshot.ai_action_runs[0].ai_action_id, 'action-1');
    assert.deepEqual(snapshot.ai_action_runs[0].generated_node_ids, ['node-2']);
});

test('flow snapshots preserve automation definitions and run history', () => {
    const serialized = stringifyFlowSnapshot({
        nodes: [createWorkspaceNode({ id: 'node-1' })],
        edges: [],
        automations: [
            {
                id: 'auto-review',
                name: 'Review needs_review nodes',
                trigger: 'manual',
                scope: 'workspace',
                status: 'active',
                action: { type: 'needs_review_report', params: { limit: 10 } },
                last_run_at: '2026-05-14T15:00:00.000Z',
                run_history: [
                    {
                        id: 'run-1',
                        status: 'completed',
                        detail: 'Found two review items.',
                        started_at: '2026-05-14T14:59:00.000Z',
                        finished_at: '2026-05-14T15:00:00.000Z'
                    }
                ]
            }
        ]
    });
    const snapshot = parseFlowSnapshot(serialized);

    assert.equal(snapshot.automations.length, 1);
    assert.equal(snapshot.automations[0].id, 'auto-review');
    assert.equal(snapshot.automations[0].action.type, 'needs_review_report');
    assert.equal(snapshot.automations[0].run_history[0].id, 'run-1');
});

test('flow snapshots preserve workspace map style settings', () => {
    const serialized = stringifyFlowSnapshot({
        nodes: [createWorkspaceNode({ id: 'node-1' })],
        edges: [],
        map_style: {
            theme: 'sketchbook',
            hierarchy: 'balanced',
            showEmphasisBadges: false
        }
    });
    const snapshot = parseFlowSnapshot(serialized);

    assert.equal(snapshot.map_style.theme, 'sketchbook');
    assert.equal(snapshot.map_style.hierarchy, 'balanced');
    assert.equal(snapshot.map_style.showEmphasisBadges, false);
});

test('stringifyFlowSnapshot normalizes missing automation run history', () => {
    const parsed = JSON.parse(
        stringifyFlowSnapshot({
            nodes: [],
            edges: [],
            automations: [
                {
                    id: 'auto-source',
                    name: 'Regenerate source coverage',
                    action: { type: 'source_coverage_report', params: {} }
                }
            ]
        })
    );

    assert.deepEqual(parsed.automations[0].run_history, []);
});
