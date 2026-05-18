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

test('flowchart layout gives process nodes independent coordinates', () => {
    const layout = createFlowchartLayout({
        steps: [
            { id: 'start', title: 'Start', shape: 'process', flow_kind: 'step' },
            { id: 'middle', title: 'Middle', shape: 'process', flow_kind: 'step' },
            { id: 'finish', title: 'Finish', shape: 'process', flow_kind: 'step' }
        ],
        connectors: [
            { id: 'edge-1', source: 'start', target: 'middle' },
            { id: 'edge-2', source: 'middle', target: 'finish' }
        ]
    });

    assert.deepEqual(
        layout.nodes.map((node) => node.x),
        [...layout.nodes.map((node) => node.x)].sort((a, b) => a - b)
    );
    assert.equal(new Set(layout.nodes.map((node) => `${node.x},${node.y}`)).size, 3);
});

test('flowchart shape inference treats decision flow kind as a diamond shape', () => {
    assert.equal(shapeForStep({ flow_kind: 'decision', shape: 'process' }), 'decision');
    assert.equal(shapeForStep({ flow_kind: 'step', shape: 'terminator' }), 'terminator');
    assert.equal(shapeForStep({ flow_kind: 'step', shape: 'unknown' }), 'process');
});

test('flowchart layout keeps branch labels out of node bounds', () => {
    const layout = createFlowchartLayout({
        steps: [
            { id: 'start', title: 'Start request', shape: 'process', flow_kind: 'step' },
            { id: 'context', title: 'Select source context', shape: 'process', flow_kind: 'step' },
            { id: 'draft', title: 'Generate draft', shape: 'process', flow_kind: 'step' },
            { id: 'decision', title: 'Did preview open?', shape: 'decision', flow_kind: 'decision' },
            { id: 'preview', title: 'Show preview', shape: 'terminator', flow_kind: 'step' }
        ],
        connectors: [
            { id: 'edge-1', source: 'start', target: 'context', label: 'Next' },
            { id: 'edge-2', source: 'context', target: 'draft', label: 'Next' },
            { id: 'edge-3', source: 'draft', target: 'decision', label: 'Next' },
            { id: 'edge-4', source: 'decision', target: 'preview', label: 'Yes', branch_kind: 'yes' },
            { id: 'edge-5', source: 'decision', target: 'context', label: 'No', branch_kind: 'no', exception_path: true }
        ]
    });

    const overlaps = (a, b) =>
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;

    layout.edgeLabels.forEach((label) => {
        assert.equal(
            layout.nodes.some((node) => overlaps(label, node)),
            false,
            `Label ${label.id} should not overlap a node`
        );
    });
});
