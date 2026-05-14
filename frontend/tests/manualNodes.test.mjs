import assert from 'node:assert/strict';
import test from 'node:test';
import {
    LAYOUT_MODES,
    createWorkspaceEdge,
    createWorkspaceNode,
    getBranchPosition,
    getChildPosition,
    getNodeDisplayState,
    getRootFocusViewport,
    getRootPosition,
    getWorkspaceNodeData,
    layoutDirectChildren,
    normalizeWorkspaceEdges,
    normalizeWorkspaceNode,
    updateWorkspaceNode
} from '../src/utils/manualNodes.js';

test('createWorkspaceNode emits the durable manual node shape', () => {
    const node = createWorkspaceNode({
        id: 'node-1',
        title: 'Launch checklist',
        nodeType: 'task',
        position: { x: 12, y: 24 },
        df: [{ Step: 'Review' }],
        display: { collapsed: true, layoutMode: LAYOUT_MODES.OUTLINE_STACK }
    });

    assert.equal(node.id, 'node-1');
    assert.equal(node.type, 'response');
    assert.deepEqual(node.position, { x: 12, y: 24 });
    assert.equal(node.data.title, 'Launch checklist');
    assert.equal(node.data.node_type, 'task');
    assert.equal(node.data.manual, true);
    assert.equal(node.data.data.summ, 'Launch checklist');
    assert.deepEqual(node.data.data.df, [{ Step: 'Review' }]);
    assert.deepEqual(node.data.display, {
        collapsed: true,
        layoutMode: LAYOUT_MODES.OUTLINE_STACK
    });
});

test('updateWorkspaceNode keeps legacy summary compatibility in sync', () => {
    const node = createWorkspaceNode({ id: 'node-1', title: 'Old title' });
    const updated = updateWorkspaceNode(node, {
        title: 'New title',
        nodeType: 'question',
        status: 'reviewed',
        display: { collapsed: true }
    });

    assert.equal(updated.data.title, 'New title');
    assert.equal(updated.data.data.summ, 'New title');
    assert.equal(updated.data.node_type, 'question');
    assert.equal(updated.data.status, 'reviewed');
    assert.deepEqual(getNodeDisplayState(updated), {
        collapsed: true,
        layoutMode: LAYOUT_MODES.VERTICAL_CHILDREN
    });
});

test('getRootPosition chooses a deterministic open root slot', () => {
    const nodes = [
        createWorkspaceNode({ id: 'a', position: { x: 0, y: 0 } }),
        createWorkspaceNode({ id: 'b', position: { x: 360, y: 180 } })
    ];

    assert.deepEqual(getRootPosition(nodes), { x: 980, y: 520 });
});

test('getRootFocusViewport keeps newly focused roots away from lower-left controls', () => {
    assert.deepEqual(
        getRootFocusViewport({
            position: { x: 260, y: 160 },
            viewport: { zoom: 0.5 },
            width: 900,
            height: 600
        }),
        { x: 299, y: 148, zoom: 0.65 }
    );
});

test('child positions are deterministic and avoid occupied slots', () => {
    const parent = createWorkspaceNode({ id: 'parent', position: { x: 100, y: 100 } });
    const childA = createWorkspaceNode({ id: 'child-a', position: { x: 530, y: 52 } });
    const childB = createWorkspaceNode({ id: 'child-b', position: { x: 530, y: 148 } });
    const nodes = [parent, childA, childB];
    const edges = [
        createWorkspaceEdge('parent', 'child-a', { id: 'edge-a' }),
        createWorkspaceEdge('parent', 'child-b', { id: 'edge-b' })
    ];

    assert.deepEqual(getChildPosition(nodes, edges, 'parent'), { x: 530, y: 244 });
});

test('balanced branch mode alternates children left and right', () => {
    const parent = createWorkspaceNode({
        id: 'parent',
        position: { x: 100, y: 100 },
        display: { layoutMode: LAYOUT_MODES.BALANCED_MAP }
    });
    const nodes = [parent];
    const edges = [
        createWorkspaceEdge('parent', 'a', { id: 'edge-a' }),
        createWorkspaceEdge('parent', 'b', { id: 'edge-b' })
    ];

    assert.deepEqual(
        getBranchPosition({
            nodes,
            edges,
            parentId: 'parent',
            childId: 'a',
            childIndex: 0
        }),
        { x: 530, y: 100 }
    );
    assert.deepEqual(
        getBranchPosition({
            nodes,
            edges,
            parentId: 'parent',
            childId: 'b',
            childIndex: 1
        }),
        { x: -330, y: 100 }
    );
});

test('layoutDirectChildren repositions only the requested direct children', () => {
    const parent = createWorkspaceNode({ id: 'parent', position: { x: 0, y: 0 } });
    const childA = createWorkspaceNode({ id: 'a', title: 'A', position: { x: 5, y: 5 } });
    const childB = createWorkspaceNode({ id: 'b', title: 'B', position: { x: 15, y: 15 } });
    const other = createWorkspaceNode({ id: 'other', position: { x: 999, y: 999 } });
    const nodes = [parent, childA, childB, other];
    const edges = [
        createWorkspaceEdge('parent', 'a', { id: 'edge-a' }),
        createWorkspaceEdge('parent', 'b', { id: 'edge-b' })
    ];

    const laidOut = layoutDirectChildren({
        nodes,
        edges,
        parentId: 'parent',
        childIds: ['b', 'a']
    });

    assert.deepEqual(
        laidOut.find((node) => node.id === 'other').position,
        { x: 999, y: 999 }
    );
    assert.deepEqual(
        laidOut.find((node) => node.id === 'b').position,
        { x: 430, y: -48 }
    );
    assert.deepEqual(
        laidOut.find((node) => node.id === 'a').position,
        { x: 430, y: 48 }
    );
});

test('normalizeWorkspaceNode adds canonical fields while preserving legacy response data', () => {
    const aiNode = normalizeWorkspaceNode({
        id: 'ai-1',
        type: 'response',
        position: { x: 1, y: 2 },
        data: {
            data: {
                summ: 'Generated answer',
                df: [{ A: 1 }],
                graph: '{"data":[]}',
                source_refs: [{ document_id: 'doc-1' }]
            }
        }
    });

    assert.equal(aiNode.data.title, 'Generated answer');
    assert.equal(aiNode.data.body, 'Generated answer');
    assert.equal(aiNode.data.node_type, 'concept');
    assert.equal(aiNode.data.status, 'ai_generated');
    assert.deepEqual(aiNode.data.source_refs, [{ document_id: 'doc-1' }]);
    assert.equal(aiNode.data.data.summ, 'Generated answer');
    assert.deepEqual(aiNode.data.data.df, [{ A: 1 }]);
    assert.equal(aiNode.data.data.graph, '{"data":[]}');
});

test('getWorkspaceNodeData exposes the canonical data contract', () => {
    const node = createWorkspaceNode({
        id: 'contract-1',
        title: 'Canonical node',
        nodeType: 'requirement',
        body: 'Details',
        sourceRefs: [{ document_id: 'doc-1' }],
        display: { collapsed: true, layoutMode: LAYOUT_MODES.COMPACT_TASK_STACK }
    });

    assert.deepEqual(getWorkspaceNodeData(node), {
        title: 'Canonical node',
        body: 'Details',
        nodeType: 'requirement',
        status: 'needs_review',
        priority: '',
        ownerId: '',
        dueDate: '',
        confidence: '',
        sourceRefs: [{ document_id: 'doc-1' }],
        externalRefs: [],
        display: {
            collapsed: true,
            layoutMode: LAYOUT_MODES.COMPACT_TASK_STACK
        },
        df: [],
        graph: {},
        query: '',
        manual: true
    });
});

test('normalizeWorkspaceEdges applies layout-specific edge style from source nodes', () => {
    const verticalParent = createWorkspaceNode({ id: 'vertical-parent' });
    const balancedParent = createWorkspaceNode({
        id: 'balanced-parent',
        display: { layoutMode: LAYOUT_MODES.BALANCED_MAP }
    });

    const edges = normalizeWorkspaceEdges([verticalParent, balancedParent], [
        createWorkspaceEdge('vertical-parent', 'a', { id: 'edge-a', type: 'smoothstep' }),
        createWorkspaceEdge('balanced-parent', 'b', { id: 'edge-b', type: 'step' })
    ]);

    assert.equal(edges.find((edge) => edge.id === 'edge-a').type, 'step');
    assert.equal(edges.find((edge) => edge.id === 'edge-b').type, 'smoothstep');
});
