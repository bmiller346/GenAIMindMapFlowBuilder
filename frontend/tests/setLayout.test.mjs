import assert from 'node:assert/strict';
import test from 'node:test';

import getLayoutedElements from '../src/utils/setLayout.js';

const responseNode = (id, title, nodeType = 'workflow') => ({
    id,
    type: 'response',
    position: { x: 0, y: 0 },
    data: {
        title,
        node_type: nodeType,
        data: {
            summ: title
        }
    }
});

test('flowchart layout separates exception branches from the main lane', () => {
    const nodes = [
        responseNode('start', 'Startup Trigger'),
        responseNode('intake', 'Capture Project Intake'),
        responseNode('decision', 'Decision: Is Intake Complete?', 'question'),
        responseNode('exception', 'Exception: Request Missing Intake Information', 'task'),
        responseNode('confirm', 'Confirm Stakeholders and Handoffs')
    ];
    const edges = [
        { id: 'edge-1', source: 'start', target: 'intake' },
        { id: 'edge-2', source: 'intake', target: 'decision' },
        {
            id: 'edge-3',
            source: 'decision',
            target: 'exception',
            label: 'No / missing intake'
        },
        { id: 'edge-4', source: 'exception', target: 'intake', label: 'Return for intake' },
        { id: 'edge-5', source: 'decision', target: 'confirm', label: 'Yes / complete' }
    ];

    const layouted = getLayoutedElements(nodes, edges);
    const byId = new Map(layouted.nodes.map((node) => [node.id, node]));

    assert.ok(byId.get('start').position.x < byId.get('intake').position.x);
    assert.ok(byId.get('intake').position.x < byId.get('decision').position.x);
    assert.equal(byId.get('exception').position.x, byId.get('confirm').position.x);
    assert.ok(byId.get('exception').position.y < byId.get('decision').position.y);
    assert.ok(byId.get('confirm').position.y > byId.get('decision').position.y);
    assert.equal(
        layouted.edges.find((edge) => edge.id === 'edge-4').data.layoutRole,
        'return'
    );
});

test('generic layout calls do not retain stale dagre graph state', () => {
    getLayoutedElements(
        [
            responseNode('a', 'A'),
            responseNode('b', 'B'),
            responseNode('c', 'C'),
            responseNode('d', 'D')
        ],
        [
            { id: 'ab', source: 'a', target: 'b' },
            { id: 'bc', source: 'b', target: 'c' },
            { id: 'cd', source: 'c', target: 'd' }
        ]
    );

    const second = getLayoutedElements([responseNode('single', 'Single', 'concept')], []);

    assert.equal(second.nodes.length, 1);
    assert.equal(second.nodes[0].id, 'single');
    assert.ok(Number.isFinite(second.nodes[0].position.x));
    assert.ok(Number.isFinite(second.nodes[0].position.y));
});
