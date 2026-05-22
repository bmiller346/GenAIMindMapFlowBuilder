import assert from 'node:assert/strict';
import test from 'node:test';
import {
    assessConnectedPackageReadiness,
    normalizePackage
} from '../src/connected-package/connectedPackageModel.js';

const sourceRef = {
    document_id: 'doc-1',
    document_title: 'Package Evidence',
    section: 'Scope',
    quote_snippet: 'The package depends on verified source evidence.',
    confidence: 0.92
};

test('normalizes strict backend connected package shape into canonical preview model', () => {
    const connectedPackage = normalizePackage({
        packagePreview: {
            package_id: 'pkg-strict-1',
            title: 'Strict backend package',
            summary: 'Backend strict contract.',
            review_state: 'needs_review',
            primary_nodes: [
                {
                    item_id: 'item-node-1',
                    node_id: 'node-1',
                    title: 'Source-backed node',
                    node_type: 'requirement',
                    review_state: 'source_backed',
                    source_refs: [sourceRef],
                    dependency_ids: ['edge-1']
                }
            ],
            relationship_edges: [
                {
                    item_id: 'item-edge-1',
                    edge_id: 'edge-1',
                    source_node_id: 'node-1',
                    target_node_id: 'node-2',
                    relationship_type: 'depends_on',
                    confidence: 0.82,
                    review_state: 'needs_review',
                    source_refs: [sourceRef],
                    dependency_ids: ['item-node-1']
                }
            ],
            view_lenses: [{ item_id: 'lens-flow', lens_type: 'sankey', title: 'Sankey' }],
            structured_evidence: [
                {
                    item_id: 'ev-1',
                    id: 'ev-1',
                    title: 'Evidence table',
                    evidence_type: 'data_table',
                    review_state: 'source_backed',
                    source_refs: [sourceRef]
                }
            ],
            evidence_links: [{ item_id: 'link-1', source_item_id: 'ev-1', target_item_id: 'item-node-1' }],
            tasks: [{ item_id: 'task-1', id: 'task-1', title: 'Confirm package', review_state: 'needs_review' }],
            risks: [{ item_id: 'risk-1', id: 'risk-1', title: 'Missing owner', review_state: 'needs_review' }],
            decisions: [{ item_id: 'decision-1', id: 'decision-1', title: 'Approve handoff', review_state: 'review' }],
            repair_targets: [
                {
                    item_id: 'repair-item-1',
                    target_id: 'repair-1',
                    target_item_id: 'item-edge-1',
                    target_type: 'relationship_edge',
                    issue: 'Confirm dependency',
                    repair_action: 'Validate edge',
                    review_state: 'needs_repair',
                    source_refs: [sourceRef]
                }
            ],
            acceptance_groups: [
                {
                    item_id: 'group-item-1',
                    group_id: 'group-1',
                    title: 'Core package',
                    item_ids: ['item-node-1', 'item-edge-1'],
                    review_state: 'review',
                    source_refs: [sourceRef]
                }
            ],
            assumptions: ['Confirm all owners before export.']
        }
    });

    assert.equal(connectedPackage.package_id, 'pkg-strict-1');
    assert.equal(connectedPackage.status, 'needs_review');
    assert.equal(connectedPackage.primary_nodes[0].item_id, 'item-node-1');
    assert.deepEqual(connectedPackage.primary_nodes[0].dependency_ids, ['edge-1']);
    assert.equal(connectedPackage.relationship_edges[0].item_id, 'item-edge-1');
    assert.equal(connectedPackage.relationship_edges[0].relationship_type, 'depends_on');
    assert.equal(connectedPackage.graph.edges[0].item_id, 'item-edge-1');
    assert.equal(connectedPackage.connections[0].review_state, 'needs_review');
    assert.equal(connectedPackage.structured_evidence[0].source_refs[0].document_id, 'doc-1');
    assert.equal(connectedPackage.evidence_links[0].target_item_id, 'item-node-1');
    assert.equal(connectedPackage.repair_targets[0].target_item_id, 'item-edge-1');
    assert.equal(connectedPackage.acceptance_groups[0].item_count, 2);
    assert.equal(connectedPackage.review[0].label, 'Confirm all owners before export.');
    assert.equal(connectedPackage.source_coverage.total_items, 7);
});

test('keeps preview package shape behavior while adding canonical defaults', () => {
    const connectedPackage = normalizePackage({
        packagePreview: {
            package_id: 'preview-1',
            title: 'Preview package',
            summary: 'Already shaped for the preview.',
            status: 'draft',
            graph: { nodes: [{ id: 'map', label: 'Map' }], edges: [] },
            connections: [{ id: 'cx-1', from: 'Map', to: 'Tasks', relationship: 'packages' }],
            flow: { lenses: ['Stages'], stages: [], sankey_rows: [] },
            table: { columns: ['Name'], rows: [['Map']] },
            charts: [{ id: 'coverage', label: 'Coverage', value: 100, tone: 'ready' }],
            evidence: [{ id: 'ev-preview', title: 'Preview evidence', source: 'Source', status: 'ready' }],
            tasks: [{ id: 'task-preview', title: 'Preview task', status: 'ready' }],
            review: [{ id: 'review-preview', label: 'Preview note', tone: 'ready' }]
        }
    });

    assert.equal(connectedPackage.source, 'backend_or_session');
    assert.equal(connectedPackage.title, 'Preview package');
    assert.equal(connectedPackage.graph.nodes[0].label, 'Map');
    assert.equal(connectedPackage.tasks[0].id, 'task-preview');
    assert.deepEqual(connectedPackage.primary_nodes, []);
    assert.equal(connectedPackage.source_coverage.total_items, 22);
});

test('normalizes connected package artifact data from generated artifacts', () => {
    const connectedPackage = normalizePackage({
        revision: {
            generated_artifacts: [
                {
                    id: 'artifact-package-1',
                    artifact_type: 'connected_picture_package',
                    title: 'Artifact package',
                    status: 'source_backed',
                    metadata: { evidence_mode: 'web_sources', citation_policy: 'required' },
                    data: {
                        package_id: 'artifact-pkg',
                        primary_nodes: [
                            {
                                id: 'node-artifact',
                                title: 'Artifact node',
                                node_type: 'task',
                                source_refs: [sourceRef]
                            }
                        ],
                        relationship_edges: [],
                        repair_targets: []
                    }
                }
            ]
        }
    });

    assert.equal(connectedPackage.package_id, 'artifact-pkg');
    assert.equal(connectedPackage.title, 'Artifact package');
    assert.equal(connectedPackage.graph.nodes[0].id, 'node-artifact');
    assert.equal(connectedPackage.evidence_meta.web_evidence_requested, true);
    assert.equal(connectedPackage.evidence_meta.citation_required, true);
    assert.equal(connectedPackage.source, 'backend_or_session');
});

test('readiness gate counts uncited items repair targets missing owners and placeholder weights', () => {
    const connectedPackage = normalizePackage({
        revision: {
            generated_artifacts: [
                {
                    id: 'artifact-blocked-package',
                    artifact_type: 'connected_picture_package',
                    metadata: { citation_policy: 'required' },
                    data: {
                        package_id: 'blocked-package',
                        primary_nodes: [
                            {
                                item_id: 'node-uncited',
                                node_id: 'node-uncited',
                                title: 'Uncited requirement',
                                node_type: 'requirement',
                                source_refs: []
                            }
                        ],
                        relationship_edges: [
                            {
                                item_id: 'edge-placeholder',
                                edge_id: 'edge-placeholder',
                                source_node_id: 'node-uncited',
                                target_node_id: 'node-owner',
                                relationship_type: 'feeds',
                                source_refs: [sourceRef],
                                metadata: { weight_source: 'placeholder' }
                            }
                        ],
                        tasks: [
                            {
                                item_id: 'task-missing-owner',
                                title: 'Assign implementation owner',
                                source_refs: [sourceRef]
                            }
                        ],
                        repair_targets: [
                            {
                                item_id: 'repair-citation',
                                target_item_id: 'node-uncited',
                                target_type: 'primary_node',
                                issue: 'Find source support',
                                review_state: 'needs_repair'
                            }
                        ]
                    }
                }
            ]
        }
    });

    assert.equal(connectedPackage.readiness_gate.bulk_accept_blocked, true);
    assert.equal(connectedPackage.readiness_gate.counts.missing_required_citation, 1);
    assert.equal(connectedPackage.readiness_gate.counts.open_repair_target, 1);
    assert.equal(connectedPackage.readiness_gate.counts.missing_owner, 2);
    assert.equal(connectedPackage.readiness_gate.counts.placeholder_weight, 1);
    assert.ok(
        connectedPackage.readiness_gate.issues.some(
            (issue) => issue.code === 'placeholder_weight' && issue.title === 'edge-placeholder'
        )
    );
});

test('assessConnectedPackageReadiness treats resolved repairs as non-blocking', () => {
    const readiness = assessConnectedPackageReadiness({
        primary_nodes: [{ item_id: 'source-backed-node', title: 'Backed', source_refs: [sourceRef] }],
        repair_targets: [{ item_id: 'repair-done', title: 'Done', status: 'resolved' }],
        tasks: [{ item_id: 'task-owned', title: 'Owned task', owner_id: 'PM', source_refs: [sourceRef] }]
    });

    assert.equal(readiness.is_ready, true);
    assert.equal(readiness.bulk_accept_blocked, false);
    assert.equal(readiness.blocker_count, 0);
});

test('falls back to visibly preview-only mock model for partial or missing package fields', () => {
    const connectedPackage = normalizePackage({
        revision: {
            prompt: 'Draft prompt',
            draft_nodes: [{ id: 'uncited-node', title: 'Uncited node' }],
            draft_items: [{ id: 'cited-item', title: 'Cited item', source_refs: [sourceRef] }],
            draft_edges: [{ id: 'edge-1' }]
        }
    });

    assert.equal(connectedPackage.source, 'mock');
    assert.equal(connectedPackage.status, 'preview_only');
    assert.match(connectedPackage.summary, /Preview-only connected package/);
    assert(connectedPackage.title.includes('Draft prompt'));
    assert(connectedPackage.source_coverage.total_items >= 2);
    assert(connectedPackage.source_coverage.required_repairs >= 1);
});
