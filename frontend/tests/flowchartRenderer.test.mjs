import assert from 'node:assert/strict';
import test from 'node:test';

import { createFlowchartLayout, shapeForStep } from '../src/views/flowchart/flowchartLayout.js';

test('flowchart renderer layout preserves standard node shapes and branch paths', () => {
    const layout = createFlowchartLayout({
        steps: [
            { id: 'start', title: 'Start', shape: 'terminator', flow_kind: 'step' },
            { id: 'review', title: 'Review request', shape: 'decision', flow_kind: 'decision' },
            { id: 'docs', title: 'Attach docs', shape: 'document', flow_kind: 'dependency' },
            { id: 'ship', title: 'Ship', shape: 'process', flow_kind: 'handoff' }
        ],
        connectors: [
            { id: 'edge-1', source: 'start', target: 'review', branch_kind: 'default' },
            { id: 'edge-2', source: 'review', target: 'ship', branch_kind: 'yes' },
            { id: 'edge-3', source: 'review', target: 'docs', branch_kind: 'no', exception_path: true }
        ]
    });

    assert.deepEqual(layout.nodes.map((node) => node.shape), ['terminator', 'decision', 'document', 'process']);
    assert.equal(layout.paths.length, 3);
    assert.equal(layout.paths.find((edge) => edge.id === 'edge-2').branchKind, 'yes');
    assert.equal(layout.paths.find((edge) => edge.id === 'edge-3').exceptionPath, true);
    assert.ok(layout.width >= 680);
    assert.ok(layout.height >= 360);
});

test('flowchart shape inference treats decision flow kind as a diamond shape', () => {
    assert.equal(shapeForStep({ flow_kind: 'decision', shape: 'process' }), 'decision');
    assert.equal(shapeForStep({ flow_kind: 'step', shape: 'terminator' }), 'terminator');
    assert.equal(shapeForStep({ flow_kind: 'step', shape: 'unknown' }), 'process');
});
