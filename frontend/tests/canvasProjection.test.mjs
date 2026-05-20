import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MINDMAP_RELATIONSHIP_MODES,
    buildBranchColorAssignments,
    buildMindmapStructureEdgeIds,
    projectCanvasGraph
} from '../src/utils/canvasProjection.js';
import { KG_RELATIONSHIP_MODES } from '../src/utils/kgRelationshipFilters.js';

const nodes = [
    { id: 'root', type: 'response', position: { x: 0, y: 0 }, data: { title: 'Root' } },
    { id: 'branch-a', type: 'response', position: { x: 300, y: -100 }, data: { title: 'Branch A' } },
    { id: 'leaf-a', type: 'response', position: { x: 620, y: -100 }, data: { title: 'Leaf A' } },
    { id: 'branch-b', type: 'response', position: { x: 300, y: 120 }, data: { title: 'Branch B' } }
];

const edges = [
    {
        id: 'edge-root-a',
        source: 'root',
        target: 'branch-a',
        relationship_type: 'contains',
        data: { relationship_type: 'contains' }
    },
    {
        id: 'edge-a-leaf',
        source: 'branch-a',
        target: 'leaf-a',
        relationship_type: 'contains',
        data: { relationship_type: 'contains' }
    },
    {
        id: 'edge-root-b',
        source: 'root',
        target: 'branch-b',
        relationship_type: 'contains',
        data: { relationship_type: 'contains' }
    },
    {
        id: 'edge-a-leaf-supports',
        source: 'branch-a',
        target: 'leaf-a',
        relationship_type: 'supports',
        confidence: 0.84,
        data: {
            relationship_type: 'supports',
            confidence: 0.84,
            rationale: 'Leaf A supports Branch A but is not hierarchy.'
        }
    }
];

const edgeById = (projection, id) => projection.edges.find((edge) => edge.id === id);
const classNames = (item = {}) => String(item.className || '').split(/\s+/).filter(Boolean);

test('mind map projection defaults to structural edges only', () => {
    const projection = projectCanvasGraph({
        nodes,
        edges,
        activeCanvasView: 'mindmap',
        activeGraphFilters: [],
        selectedBranchId: '',
        mindmapRelationshipMode: MINDMAP_RELATIONSHIP_MODES.OFF
    });

    assert.deepEqual(
        projection.edges.map((edge) => edge.id).sort(),
        ['edge-a-leaf', 'edge-root-a', 'edge-root-b']
    );
    assert.equal(edgeById(projection, 'edge-a-leaf-supports'), undefined);
});

test('mind map relationship lens adds semantic labels without structural branch emphasis', () => {
    const projection = projectCanvasGraph({
        nodes,
        edges,
        activeCanvasView: 'mindmap',
        activeGraphFilters: [],
        selectedBranchId: 'branch-a',
        mindmapRelationshipMode: KG_RELATIONSHIP_MODES.INSIGHTS
    });

    const structuralEdge = edgeById(projection, 'edge-a-leaf');
    const relationshipEdge = edgeById(projection, 'edge-a-leaf-supports');

    assert.ok(classNames(structuralEdge).includes('canvas-edge-in-branch-scope'));
    assert.ok(classNames(structuralEdge).includes('canvas-edge-mindmap-structure'));
    assert.ok(classNames(relationshipEdge).includes('canvas-edge-mindmap-relationship'));
    assert.ok(classNames(relationshipEdge).includes('semantic-edge'));
    assert.equal(classNames(relationshipEdge).includes('canvas-edge-in-branch-scope'), false);
    assert.equal(relationshipEdge.data.semantic_edge.mindmapRelationship, true);
});

test('branch colors are assigned from structural hierarchy only', () => {
    const structuralEdgeIds = buildMindmapStructureEdgeIds(nodes, edges);
    const assignments = buildBranchColorAssignments(nodes, edges, structuralEdgeIds);

    assert.equal(assignments.edgeColors.has('edge-a-leaf'), true);
    assert.equal(assignments.edgeColors.has('edge-a-leaf-supports'), false);
    assert.equal(assignments.nodeColors.has('leaf-a'), true);
});
