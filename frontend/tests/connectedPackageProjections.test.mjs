import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getConnectedPackageProjectionBundle,
    getPackageConnectionRows,
    getPackageFlowchartProjection,
    getPackageOverviewProjection,
    getPackageProcessProjection,
    getPackageReadyProjection,
    getPackageSankeyLensProjection,
    getPackageTableRows,
    getPackageTaskRows,
    withPackageProjectionFallback
} from '../src/views/graphProjection.js';

const sourceRef = {
    document_id: 'doc-package',
    document_title: 'Accepted Package Source',
    section: 'Flow',
    quote_snippet: 'Accepted package metadata defines the flow.',
    confidence: 0.94
};

const strictPackage = {
    package_id: 'pkg-projection-1',
    title: 'Package Projection Test',
    primary_nodes: [
        {
            item_id: 'pkg-node-start-item',
            node_id: 'pkg-node-start',
            title: 'Accepted start',
            node_type: 'workflow',
            review_state: 'source_backed',
            source_refs: [sourceRef]
        },
        {
            item_id: 'pkg-node-task-item',
            node_id: 'pkg-node-task',
            title: 'Accepted task',
            node_type: 'task',
            review_state: 'source_backed',
            source_refs: [sourceRef]
        }
    ],
    relationship_edges: [
        {
            item_id: 'pkg-edge-item',
            edge_id: 'pkg-edge',
            source_node_id: 'pkg-node-start',
            target_node_id: 'pkg-node-task',
            relationship_type: 'next',
            label: 'Package next',
            review_state: 'source_backed',
            source_refs: [sourceRef]
        }
    ],
    view_lenses: [
        {
            item_id: 'pkg-sankey-lens-item',
            lens_id: 'pkg-sankey-lens',
            lens_type: 'sankey',
            title: 'Accepted Sankey',
            metric_label: 'Package Value',
            source_refs: [sourceRef],
            rows: [
                {
                    item_id: 'pkg-sankey-row-item',
                    id: 'pkg-sankey-row',
                    source: 'Source system',
                    target: 'Target process',
                    value: 42,
                    source_refs: [sourceRef]
                }
            ]
        }
    ],
    structured_evidence: [
        {
            item_id: 'pkg-evidence-item',
            id: 'pkg-evidence',
            title: 'Package evidence',
            evidence_type: 'data_table',
            review_state: 'source_backed',
            source_refs: [sourceRef]
        }
    ],
    evidence_links: [
        {
            item_id: 'pkg-evidence-link-item',
            source_item_id: 'pkg-evidence-item',
            target_item_id: 'pkg-node-task-item',
            source_refs: [sourceRef]
        }
    ],
    tasks: [
        {
            item_id: 'pkg-task-item',
            id: 'pkg-task',
            title: 'Package task',
            status: 'done',
            owner_id: 'reviewer',
            due_date: '2026-06-01',
            source_refs: [sourceRef]
        }
    ],
    repair_targets: [
        {
            item_id: 'pkg-repair-item',
            target_id: 'pkg-repair',
            target_item_id: 'pkg-edge-item',
            target_type: 'relationship_edge',
            issue: 'Confirm edge',
            repair_action: 'Review package relationship evidence',
            review_state: 'needs_repair'
        }
    ],
    acceptance_groups: [
        {
            item_id: 'pkg-acceptance-item',
            group_id: 'pkg-acceptance',
            title: 'Core accepted package',
            item_ids: ['pkg-node-start-item', 'pkg-edge-item'],
            source_refs: [sourceRef]
        }
    ]
};

const misleadingGraphProjection = {
    nodes: [
        { id: 'graph-task', title: 'Graph task', node_type: 'task', review_state: 'accepted' },
        { id: 'graph-only', title: 'Graph only', node_type: 'workflow', review_state: 'accepted' }
    ],
    edges: [{ id: 'graph-edge', source: 'graph-only', target: 'graph-task', relationship_type: 'next' }]
};

test('package projections derive table, flow, tasks, and connections from strict package metadata', () => {
    const overview = getPackageOverviewProjection(strictPackage);
    const ready = getPackageReadyProjection(strictPackage);
    const tableRows = getPackageTableRows(strictPackage);
    const process = getPackageProcessProjection(strictPackage);
    const flowchart = getPackageFlowchartProjection(strictPackage);
    const connections = getPackageConnectionRows(strictPackage);
    const tasks = getPackageTaskRows(strictPackage);
    const bundle = getConnectedPackageProjectionBundle(strictPackage);

    assert.equal(overview.package_id, 'pkg-projection-1');
    assert.equal(overview.collection_counts.relationship_edges, 1);
    assert.equal(ready.nodes[0].item_id, 'pkg-node-start-item');
    assert.equal(ready.edges[0].item_id, 'pkg-edge-item');
    assert.equal(tableRows.some((row) => row.item_id === 'pkg-evidence-item'), true);
    assert.equal(tableRows.some((row) => row.id === 'graph-task'), false);
    assert.deepEqual(process.edges.map((edge) => edge.id), ['pkg-edge']);
    assert.deepEqual(flowchart.steps.map((step) => step.id), ['pkg-node-start', 'pkg-node-task']);
    assert.equal(connections[0].raw_edge.item_id, 'pkg-edge-item');
    assert.equal(connections[0].source.id, 'pkg-node-start');
    assert.equal(tasks[0].item_id, 'pkg-task-item');
    assert.equal(tasks[0].source_refs[0].document_id, 'doc-package');
    assert.equal(bundle.repair_targets[0].target_item_id, 'pkg-edge-item');
});

test('package Sankey projection uses only the Sankey view lens', () => {
    const sankey = getPackageSankeyLensProjection(strictPackage);
    const noLens = getPackageSankeyLensProjection({
        ...strictPackage,
        view_lenses: [],
        relationship_edges: [
            {
                item_id: 'edge-flow-item',
                edge_id: 'edge-flow',
                source_node_id: 'A',
                target_node_id: 'B',
                value: 999,
                source_refs: [sourceRef]
            }
        ]
    });

    assert.equal(sankey.eligible, true);
    assert.equal(sankey.path_count, 1);
    assert.equal(sankey.value_total, 42);
    assert.equal(sankey.nodes[0].item_id, 'pkg-sankey-lens-item');
    assert.equal(sankey.rows[0].item_id, 'pkg-sankey-row-item');
    assert.equal(sankey.rows[0].evidence_node_id, 'pkg-sankey-lens');
    assert.equal(sankey.rows[0].source_refs[0].document_id, 'doc-package');
    assert.equal(noLens.eligible, false);
    assert.equal(noLens.path_count, 0);
});

test('package flowchart projection can render directly from a flow view lens', () => {
    const flowchart = getPackageFlowchartProjection({
        package_id: 'pkg-flow-lens-only',
        view_lenses: [
            {
                item_id: 'flow-lens-item',
                lens_id: 'flow-lens',
                lens_type: 'flowchart',
                source_refs: [sourceRef],
                steps: [
                    { id: 'lens-intake', title: 'Lens intake', node_type: 'process' },
                    { id: 'lens-gate', title: 'Lens gate', node_type: 'decision' }
                ],
                connectors: [
                    {
                        id: 'lens-edge',
                        source: 'lens-intake',
                        target: 'lens-gate',
                        relationship_type: 'next',
                        label: 'Package lens next'
                    }
                ]
            }
        ],
        structured_evidence: [
            {
                item_id: 'evidence-only',
                title: 'Evidence-only table',
                source_refs: [sourceRef]
            }
        ]
    });

    assert.deepEqual(flowchart.steps.map((step) => step.title), ['Lens intake', 'Lens gate']);
    assert.equal(flowchart.steps[1].flow_kind, 'decision');
    assert.equal(flowchart.connectors[0].label, 'Package lens next');
    assert.equal(flowchart.metadata.lens_source, 'flow-lens-item');
});

test('package projections mark uncited package rows for review', () => {
    const rows = getPackageTableRows({
        package_id: 'pkg-uncited',
        tasks: [
            {
                item_id: 'uncited-task-item',
                id: 'uncited-task',
                title: 'Uncited task',
                status: 'done'
            }
        ],
        relationship_edges: [
            {
                item_id: 'unsupported-edge-item',
                edge_id: 'unsupported-edge',
                source_node_id: 'a',
                target_node_id: 'b',
                relationship_type: 'blocks',
                review_state: 'unsupported'
            }
        ]
    });

    assert.equal(rows.find((row) => row.item_id === 'uncited-task-item').review_state, 'needs_review');
    assert.equal(rows.find((row) => row.item_id === 'unsupported-edge-item').needs_review, true);
});

test('fallback adapter calls legacy projector only when no package is available', () => {
    const packageResult = withPackageProjectionFallback({
        packageCandidate: strictPackage,
        packageProjector: getPackageTaskRows,
        fallbackProjector: (projection) => projection.nodes,
        fallbackArgs: [misleadingGraphProjection]
    });
    const fallbackResult = withPackageProjectionFallback({
        packageCandidate: null,
        packageProjector: getPackageTaskRows,
        fallbackProjector: (projection) => projection.nodes,
        fallbackArgs: [misleadingGraphProjection]
    });

    assert.deepEqual(packageResult.map((row) => row.item_id), ['pkg-task-item']);
    assert.deepEqual(fallbackResult.map((row) => row.id), ['graph-task', 'graph-only']);
});
