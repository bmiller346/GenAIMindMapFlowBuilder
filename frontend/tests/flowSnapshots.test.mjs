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
