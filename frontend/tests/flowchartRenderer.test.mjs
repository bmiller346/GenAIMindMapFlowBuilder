import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FLOWCHART_LENSES,
    flowchartConnectorLensState,
    flowchartNodeLensState
} from '../src/views/flowchart/flowchartLens.js';
import { createFlowchartLayout, shapeForStep } from '../src/views/flowchart/flowchartLayout.js';
import { wheelDeltaMultiplier, zoomViewportAroundPoint } from '../src/views/flowchart/flowchartViewport.js';

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

test('flowchart wheel zoom keeps the cursor anchored on the same diagram point', () => {
    const viewport = { x: 20, y: -30, zoom: 1 };
    const pointerX = 320;
    const pointerY = 180;
    const diagramX = (pointerX - viewport.x) / viewport.zoom;
    const diagramY = (pointerY - viewport.y) / viewport.zoom;

    const nextViewport = zoomViewportAroundPoint({
        viewport,
        pointerX,
        pointerY,
        wheelDelta: -120
    });

    assert.ok(nextViewport.zoom > viewport.zoom);
    assert.equal(Number(((pointerX - nextViewport.x) / nextViewport.zoom).toFixed(6)), diagramX);
    assert.equal(Number(((pointerY - nextViewport.y) / nextViewport.zoom).toFixed(6)), diagramY);
});

test('flowchart wheel zoom normalizes line and page wheel deltas', () => {
    assert.equal(wheelDeltaMultiplier(0, 720), 1);
    assert.equal(wheelDeltaMultiplier(1, 720), 16);
    assert.equal(wheelDeltaMultiplier(2, 720), 720);
});

test('flowchart lenses classify decision, handoff, exception, and evidence emphasis', () => {
    assert.equal(
        flowchartNodeLensState({ flow_kind: 'decision' }, FLOWCHART_LENSES.DECISIONS),
        'focus'
    );
    assert.equal(
        flowchartNodeLensState({ flow_kind: 'step' }, FLOWCHART_LENSES.DECISIONS),
        'muted'
    );
    assert.equal(
        flowchartNodeLensState({ flow_kind: 'handoff' }, FLOWCHART_LENSES.HANDOFFS),
        'focus'
    );
    assert.equal(
        flowchartNodeLensState({ flow_kind: 'dependency', needs_review: true }, FLOWCHART_LENSES.EXCEPTIONS),
        'focus'
    );
    assert.equal(
        flowchartNodeLensState({ source_backed: false }, FLOWCHART_LENSES.EVIDENCE),
        'needs-evidence'
    );
    assert.equal(
        flowchartConnectorLensState({ source_flow_kind: 'decision', branch_kind: 'yes' }, FLOWCHART_LENSES.DECISIONS),
        'focus'
    );
    assert.equal(
        flowchartConnectorLensState({ exception_path: true }, FLOWCHART_LENSES.EXCEPTIONS),
        'focus'
    );
});
