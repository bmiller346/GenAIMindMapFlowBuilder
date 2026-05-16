import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyGraphFilters,
    buildGraphProjection
} from '../src/views/graphProjection.js';
import {
    buildWorkspaceNudgeProjection,
    findConnectionOpportunities,
    getProjectionReadiness,
    NUDGE_CATEGORIES
} from '../src/utils/workspaceNudges.js';

const node = (id, data = {}) => ({
    id,
    type: 'response',
    data: {
        title: id,
        ...data
    }
});

test('nudge projection reports missing source coverage as an actionable nudge', () => {
    const result = buildWorkspaceNudgeProjection({
        nodes: [node('claim-1', { node_type: 'requirement' })],
        edges: []
    });
    const nudge = result.nudges.find(
        (item) => item.category === NUDGE_CATEGORIES.SOURCE_COVERAGE
    );

    assert.equal(nudge.title, '1 node needs source support');
    assert.equal(nudge.action_label, 'Open source repair');
    assert.equal(nudge.action.type, 'open_view');
    assert.deepEqual(nudge.target_node_ids, ['claim-1']);
    assert.equal(nudge.dismiss_key, nudge.id);
});

test('nudge projection reports missing and low confidence as repair queue items', () => {
    const result = buildWorkspaceNudgeProjection({
        nodes: [
            node('claim-1', {
                node_type: 'requirement',
                source_refs: [{ document_id: 'source-1', page: 1 }]
            }),
            node('claim-2', {
                node_type: 'risk',
                confidence: 0.42,
                source_refs: [{ document_id: 'source-1', page: 2, confidence: 0.42 }]
            })
        ],
        edges: []
    });
    const nudge = result.nudges.find(
        (item) =>
            item.category === NUDGE_CATEGORIES.SOURCE_COVERAGE &&
            item.action.flow === 'confidence_repair'
    );

    assert.equal(nudge.title, '2 nodes need confidence repair');
    assert.equal(nudge.action_label, 'Open repair queue');
    assert.deepEqual(nudge.target_node_ids, ['claim-1', 'claim-2']);
});

test('task readiness nudges include missing execution metadata', () => {
    const result = buildWorkspaceNudgeProjection({
        nodes: [
            node('task-1', {
                node_type: 'task',
                source_refs: [{ document_id: 'source-1', page: 1 }]
            })
        ],
        edges: []
    });
    const nudge = result.nudges.find(
        (item) => item.category === NUDGE_CATEGORIES.TASK_READINESS
    );

    assert.equal(nudge.action_label, 'Open task preview');
    assert.deepEqual(nudge.action.missing_fields, ['due date', 'owner', 'priority']);
    assert.deepEqual(nudge.target_node_ids, ['task-1']);
    assert.equal(result.readiness.tasks.partially_ready, true);
    assert.deepEqual(
        result.readiness.tasks.missing_required_fields.map((field) => field.field),
        ['owner', 'due date', 'priority']
    );
});

test('knowledge graph opportunity nudges are derived from shared source signals', () => {
    const sourceRefs = [{ document_id: 'source-1', page: 2 }];
    const result = buildWorkspaceNudgeProjection({
        nodes: [
            node('alpha', { source_refs: sourceRefs }),
            node('beta', { source_refs: sourceRefs })
        ],
        edges: [],
        workspaceBrief: { desired_outputs: ['knowledge_graph'] }
    });
    const opportunities = findConnectionOpportunities(result.projection);
    const nudge = result.nudges.find(
        (item) => item.category === NUDGE_CATEGORIES.KNOWLEDGE_GRAPH_CONNECTIONS
    );

    assert.equal(opportunities.length, 1);
    assert.deepEqual(opportunities[0].node_ids, ['alpha', 'beta']);
    assert.equal(nudge.action_label, 'Find connections');
    assert.equal(nudge.action.output_type, 'knowledge_graph');
    assert.equal(result.readiness.knowledge_graph.partially_ready, true);
});

test('chart readiness requires structured or extracted data before projection', () => {
    const proseProjection = buildGraphProjection(
        [node('prose-1', { body: 'Revenue is growing but only described in prose.' })],
        []
    );
    const proseReadiness = getProjectionReadiness(proseProjection, {
        desired_outputs: ['chart']
    });

    assert.equal(proseReadiness.chart.ready, false);
    assert.equal(proseReadiness.chart.partially_ready, true);
    assert.deepEqual(proseReadiness.chart.missing_required_fields, [
        { field: 'structured_or_extracted_data' }
    ]);
    assert.equal(proseReadiness.chart.suggested_enrichment_action.label, 'Create structured table');

    const tableProjection = buildGraphProjection(
        [node('table-1', { df: [{ Status: 'Open', Count: 3 }] })],
        []
    );
    assert.equal(getProjectionReadiness(tableProjection).chart.ready, true);
});

test('flow chart readiness requires process, dependency, or decision relationships', () => {
    const nodes = [
        node('start', { node_type: 'procedure' }),
        node('approve', { node_type: 'decision' })
    ];
    const plainProjection = buildGraphProjection(nodes, [
        { id: 'edge-1', source: 'start', target: 'approve', type: 'step' }
    ]);
    const typedProjection = buildGraphProjection(nodes, [
        {
            id: 'edge-1',
            source: 'start',
            target: 'approve',
            type: 'step',
            data: { relationship_type: 'depends_on' }
        }
    ]);

    assert.equal(getProjectionReadiness(plainProjection).flow_chart.ready, false);
    assert.equal(getProjectionReadiness(plainProjection).flow_chart.partially_ready, true);
    assert.deepEqual(getProjectionReadiness(plainProjection).flow_chart.missing_required_fields, [
        { field: 'process_or_dependency_relationships' }
    ]);
    assert.equal(getProjectionReadiness(typedProjection).flow_chart.ready, true);
});

test('nudge ids and dismiss keys are stable across node order changes', () => {
    const alpha = node('alpha', { source_refs: [{ document_id: 'source-1' }] });
    const beta = node('beta', { source_refs: [{ document_id: 'source-1' }] });
    const first = buildWorkspaceNudgeProjection({ nodes: [alpha, beta], edges: [] });
    const second = buildWorkspaceNudgeProjection({ nodes: [beta, alpha], edges: [] });
    const firstConnection = first.nudges.find(
        (item) => item.category === NUDGE_CATEGORIES.KNOWLEDGE_GRAPH_CONNECTIONS
    );
    const secondConnection = second.nudges.find(
        (item) => item.category === NUDGE_CATEGORIES.KNOWLEDGE_GRAPH_CONNECTIONS
    );

    assert.equal(firstConnection.id, secondConnection.id);
    assert.equal(firstConnection.dismiss_key, secondConnection.dismiss_key);
});

test('filter projection narrows canonical graph data without mutating it', () => {
    const nodes = [
        node('task-1', { node_type: 'task', owner_id: 'mira' }),
        node('task-2', { node_type: 'task' }),
        node('idea-1', { node_type: 'concept' })
    ];
    const projection = buildGraphProjection(nodes, []);
    const filtered = applyGraphFilters(projection, ['unassigned']);

    assert.deepEqual(filtered.nodes.map((item) => item.id), ['task-2']);
    assert.equal(projection.nodes.length, 3);
    assert.equal(nodes[1].data.owner_id, undefined);
});
