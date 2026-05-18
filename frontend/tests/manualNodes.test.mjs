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
    getViewportRootPosition,
    getWorkspaceNodeData,
    layoutDirectChildren,
    normalizeWorkspaceEdges,
    normalizeWorkspaceNode,
    reflowSiblingSubtrees,
    updateWorkspaceNode
} from '../src/utils/manualNodes.js';
import { autoStyleWorkspaceNodes } from '../src/utils/mapStyles.js';

test('createWorkspaceNode emits the durable manual node shape', () => {
    const node = createWorkspaceNode({
        id: 'node-1',
        title: 'Launch checklist',
        nodeType: 'task',
        position: { x: 12, y: 24 },
        df: [{ Step: 'Review' }],
        display: {
            collapsed: true,
            layoutMode: LAYOUT_MODES.OUTLINE_STACK,
            emphasis: 'key'
        }
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
        layoutMode: LAYOUT_MODES.OUTLINE_STACK,
        emphasis: 'key'
    });
});

test('createWorkspaceNode preserves artifact payloads for structured data children', () => {
    const artifact = {
        id: 'artifact-1',
        artifact_type: 'data_table',
        data: { rows: [{ Tool: 'Bluebeam' }], columns: ['Tool'] }
    };
    const node = createWorkspaceNode({
        id: 'structured-child-1',
        title: 'Review evidence',
        nodeType: 'task',
        query: 'SELECT Tool FROM software_inventory',
        sourceRefs: [{ source_type: 'sql_query', query_id: 'query-1' }],
        artifactType: 'tasks',
        artifactIds: ['artifact-1'],
        reviewState: 'source_backed',
        generatedArtifacts: [artifact],
        metadata: { domain: 'structured_data', query_id: 'query-1' }
    });

    assert.equal(node.data.artifact_type, 'tasks');
    assert.deepEqual(node.data.artifact_ids, ['artifact-1']);
    assert.equal(node.data.review_state, 'source_backed');
    assert.deepEqual(node.data.generated_artifacts, [artifact]);
    assert.equal(node.data.data.query, 'SELECT Tool FROM software_inventory');
    assert.equal(node.data.data.artifact_type, 'tasks');
    assert.deepEqual(node.data.data.generated_artifacts, [artifact]);
    assert.deepEqual(node.data.metadata, { domain: 'structured_data', query_id: 'query-1' });
});

test('createWorkspaceEdge preserves flowchart relationship metadata', () => {
    const edge = createWorkspaceEdge('decision', 'approved', {
        relationship_type: 'decision_path',
        label: 'Yes',
        branch_label: 'Approved',
        condition: 'Preview opened',
        metadata: { branch_kind: 'yes' }
    });

    assert.equal(edge.relationship_type, 'decision_path');
    assert.equal(edge.label, 'Yes');
    assert.equal(edge.branch_label, 'Approved');
    assert.equal(edge.condition, 'Preview opened');
    assert.equal(edge.data.relationship_type, 'decision_path');
    assert.equal(edge.data.branch_label, 'Approved');
    assert.deepEqual(edge.metadata, { branch_kind: 'yes' });
});

test('createWorkspaceEdge preserves knowledge graph relationship metadata', () => {
    const sourceRefs = [{ document_id: 'doc-1', page: 3, quote_snippet: 'Supports the dependency.' }];
    const edge = createWorkspaceEdge('source-node', 'target-node', {
        relationship_type: 'depends_on',
        label: 'Depends on',
        confidence: '0.82',
        rationale: 'Target work cannot start until the source node is complete.',
        source_signal: 'Manual review',
        review_state: 'needs_review',
        source_refs: sourceRefs,
        metadata: { authored_from_view: 'knowledgeGraph' }
    });

    assert.equal(edge.relationship_type, 'depends_on');
    assert.equal(edge.confidence, '0.82');
    assert.equal(edge.rationale, 'Target work cannot start until the source node is complete.');
    assert.equal(edge.source_signal, 'Manual review');
    assert.equal(edge.review_state, 'needs_review');
    assert.deepEqual(edge.source_refs, sourceRefs);
    assert.equal(edge.data.relationship_type, 'depends_on');
    assert.equal(edge.data.confidence, '0.82');
    assert.equal(edge.data.rationale, 'Target work cannot start until the source node is complete.');
    assert.equal(edge.data.source_signal, 'Manual review');
    assert.equal(edge.data.review_state, 'needs_review');
    assert.deepEqual(edge.data.source_refs, sourceRefs);
    assert.deepEqual(edge.metadata, { authored_from_view: 'knowledgeGraph' });
});

test('updateWorkspaceNode keeps legacy summary compatibility in sync', () => {
    const node = createWorkspaceNode({ id: 'node-1', title: 'Old title' });
    const updated = updateWorkspaceNode(node, {
        title: 'New title',
        nodeType: 'question',
        status: 'reviewed',
        display: { collapsed: true, emphasis: 'critical' }
    });

    assert.equal(updated.data.title, 'New title');
    assert.equal(updated.data.data.summ, 'New title');
    assert.equal(updated.data.node_type, 'question');
    assert.equal(updated.data.status, 'reviewed');
    assert.deepEqual(getNodeDisplayState(updated), {
        collapsed: true,
        layoutMode: LAYOUT_MODES.VERTICAL_CHILDREN,
        emphasis: 'critical'
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

test('getViewportRootPosition keeps manual roots near the current viewport', () => {
    const nodes = [
        createWorkspaceNode({ id: 'a', position: { x: 1200, y: 400 } })
    ];

    assert.deepEqual(
        getViewportRootPosition({
            nodes,
            position: { x: 1200, y: 400 }
        }),
        { x: 1200, y: 580 }
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

test('child positions avoid nearby node boxes, not only exact coordinates', () => {
    const parent = createWorkspaceNode({ id: 'parent', position: { x: 100, y: 100 } });
    const nearbyBranch = createWorkspaceNode({
        id: 'nearby-branch',
        position: { x: 594, y: 116 }
    });
    const nodes = [parent, nearbyBranch];

    assert.deepEqual(getChildPosition(nodes, [], 'parent'), { x: 530, y: 292 });
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

test('reflowSiblingSubtrees expands later siblings when a branch grows', () => {
    const root = createWorkspaceNode({ id: 'root', position: { x: 0, y: 300 } });
    const supplier = createWorkspaceNode({ id: 'supplier', position: { x: 430, y: 500 } });
    const supplierChild = createWorkspaceNode({ id: 'supplier-child', position: { x: 860, y: 760 } });
    const budget = createWorkspaceNode({ id: 'budget', position: { x: 430, y: 625 } });
    const budgetChild = createWorkspaceNode({ id: 'budget-child', position: { x: 860, y: 625 } });
    const nodes = [root, supplier, supplierChild, budget, budgetChild];
    const edges = [
        createWorkspaceEdge('root', 'supplier', { id: 'edge-supplier' }),
        createWorkspaceEdge('root', 'budget', { id: 'edge-budget' }),
        createWorkspaceEdge('supplier', 'supplier-child', { id: 'edge-supplier-child' }),
        createWorkspaceEdge('budget', 'budget-child', { id: 'edge-budget-child' })
    ];

    const reflowed = reflowSiblingSubtrees({
        nodes,
        edges,
        parentId: 'root',
        anchorNodeId: 'supplier'
    });

    assert.equal(reflowed.find((node) => node.id === 'supplier').position.y, 500);
    assert.equal(reflowed.find((node) => node.id === 'budget').position.y, 912);
    assert.equal(reflowed.find((node) => node.id === 'budget-child').position.y, 912);
});

test('reflowSiblingSubtrees compacts later siblings after a branch is removed', () => {
    const root = createWorkspaceNode({ id: 'root', position: { x: 0, y: 300 } });
    const first = createWorkspaceNode({ id: 'first', position: { x: 430, y: 375 } });
    const budget = createWorkspaceNode({ id: 'budget', position: { x: 430, y: 625 } });
    const budgetChild = createWorkspaceNode({ id: 'budget-child', position: { x: 860, y: 625 } });
    const marketing = createWorkspaceNode({ id: 'marketing', position: { x: 430, y: 900 } });
    const nodes = [root, first, budget, budgetChild, marketing];
    const edges = [
        createWorkspaceEdge('root', 'first', { id: 'edge-first' }),
        createWorkspaceEdge('root', 'budget', { id: 'edge-budget' }),
        createWorkspaceEdge('budget', 'budget-child', { id: 'edge-budget-child' }),
        createWorkspaceEdge('root', 'marketing', { id: 'edge-marketing' })
    ];

    const reflowed = reflowSiblingSubtrees({
        nodes,
        edges,
        parentId: 'root',
        compact: true
    });

    assert.equal(reflowed.find((node) => node.id === 'budget').position.y, 527);
    assert.equal(reflowed.find((node) => node.id === 'budget-child').position.y, 527);
    assert.equal(reflowed.find((node) => node.id === 'marketing').position.y, 679);
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

test('normalizeWorkspaceNode keeps generated title and body readable from draft-like data', () => {
    const normalized = normalizeWorkspaceNode({
        id: 'draft-1',
        type: 'custom',
        position: { x: 10, y: 20 },
        data: {
            label: 'Accepted draft node',
            summary: 'Short body for the canvas preview'
        }
    });

    assert.equal(normalized.type, 'response');
    assert.equal(normalized.data.title, 'Accepted draft node');
    assert.equal(normalized.data.body, 'Short body for the canvas preview');
    assert.equal(normalized.data.data.summ, 'Short body for the canvas preview');

    const summaryOnly = normalizeWorkspaceNode({
        id: 'draft-2',
        type: 'response',
        data: {
            summary: 'Summary becomes the visible title when no title is provided'
        }
    });

    assert.equal(
        summaryOnly.data.title,
        'Summary becomes the visible title when no title is provided'
    );
    assert.equal(
        summaryOnly.data.body,
        'Summary becomes the visible title when no title is provided'
    );
});

test('normalizeWorkspaceNode renders semantic question nodes as content nodes', () => {
    const normalized = normalizeWorkspaceNode({
        id: 'decision-1',
        type: 'question',
        position: { x: 20, y: 40 },
        data: {
            title: 'Decision: Is intake complete?',
            summary: 'Route missing intake back to the project team.',
            node_type: 'question',
            status: 'needs_review'
        }
    });

    assert.equal(normalized.type, 'response');
    assert.equal(normalized.data.node_type, 'question');
    assert.equal(normalized.data.title, 'Decision: Is intake complete?');
    assert.equal(normalized.data.body, 'Route missing intake back to the project team.');

    const legacyAskNode = normalizeWorkspaceNode({
        id: 'ask-1',
        type: 'question',
        data: {
            question: '',
            component_type: 'pdf',
            component_id: 'source-1'
        }
    });

    assert.equal(legacyAskNode.type, 'question');
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
        artifactType: '',
        artifactIds: [],
        reviewState: '',
        generatedArtifacts: [],
        metadata: {},
        externalRefs: [],
        display: {
            collapsed: true,
            layoutMode: LAYOUT_MODES.COMPACT_TASK_STACK,
            emphasis: ''
        },
        df: [],
        graph: {},
        query: '',
        manual: true
    });
});

test('normalizeWorkspaceNode preserves structured data artifacts for graph embedding', () => {
    const artifact = {
        id: 'artifact-table-1',
        artifact_type: 'data_table',
        title: 'Query Result Table',
        data: {
            rows: [{ Tool: 'Bluebeam', Count: 12 }],
            columns: ['Tool', 'Count'],
            query_id: 'query-1'
        },
        source_refs: [{ source_type: 'data_table', table_name: 'software_inventory' }],
        review_state: 'source_backed'
    };

    const normalized = normalizeWorkspaceNode({
        id: 'structured-1',
        type: 'response',
        data: {
            title: 'Software overlap by category',
            node_type: 'artifact',
            artifact_type: 'structured_data_analysis',
            artifact_ids: ['artifact-table-1'],
            review_state: 'source_backed',
            generated_artifacts: [artifact],
            source_refs: [{ source_type: 'sql_query', query_id: 'query-1' }],
            metadata: { domain: 'structured_data', query_id: 'query-1' },
            data: {
                summ: 'Software overlap by category',
                query: 'SELECT Tool, Count FROM software_inventory',
                df: [{ Tool: 'Bluebeam', Count: 12 }]
            }
        }
    });

    assert.equal(normalized.data.node_type, 'artifact');
    assert.equal(normalized.data.artifact_type, 'structured_data_analysis');
    assert.deepEqual(normalized.data.artifact_ids, ['artifact-table-1']);
    assert.equal(normalized.data.review_state, 'source_backed');
    assert.deepEqual(normalized.data.generated_artifacts, [artifact]);
    assert.equal(normalized.data.data.artifact_type, 'structured_data_analysis');
    assert.deepEqual(normalized.data.data.generated_artifacts, [artifact]);
    assert.deepEqual(normalized.data.metadata, { domain: 'structured_data', query_id: 'query-1' });
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

test('createWorkspaceEdge keeps manual links static unless animation is requested', () => {
    assert.equal(createWorkspaceEdge('parent', 'manual-child').animated, false);
    assert.equal(
        createWorkspaceEdge('parent', 'generated-child', { animated: true }).animated,
        true
    );
});

test('autoStyleWorkspaceNodes derives print emphasis from graph metadata', () => {
    const root = createWorkspaceNode({ id: 'root', title: 'Main idea' });
    const risk = createWorkspaceNode({
        id: 'risk',
        title: 'Risk',
        nodeType: 'risk',
        position: { x: 430, y: 0 }
    });
    const task = createWorkspaceNode({
        id: 'task',
        title: 'Follow up',
        nodeType: 'task',
        position: { x: 860, y: 0 }
    });
    const evidence = createWorkspaceNode({
        id: 'evidence',
        title: 'Reference',
        nodeType: 'reference',
        sourceRefs: [{ document_id: 'doc-1' }],
        position: { x: 1290, y: 0 }
    });
    const styled = autoStyleWorkspaceNodes(
        [root, risk, task, evidence],
        [
            createWorkspaceEdge('root', 'risk'),
            createWorkspaceEdge('risk', 'task'),
            createWorkspaceEdge('task', 'evidence')
        ]
    );
    const emphasisById = Object.fromEntries(
        styled.map((node) => [node.id, node.data.display.emphasis])
    );

    assert.equal(emphasisById.root, 'key');
    assert.equal(emphasisById.risk, 'critical');
    assert.equal(emphasisById.task, 'action');
    assert.equal(emphasisById.evidence, 'evidence');
});
