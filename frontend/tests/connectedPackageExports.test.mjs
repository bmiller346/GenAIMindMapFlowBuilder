import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getConnectedPackageEvidenceCsvExport,
    getConnectedPackageExportBundle,
    getConnectedPackageHandoffCandidates,
    getConnectedPackageJsonExport,
    getConnectedPackageMarkdownExport,
    getConnectedPackageMermaidExport
} from '../src/views/graphProjection.js';

const sourceRef = {
    document_id: 'doc-package',
    page: 4,
    section: 'Accepted Flow',
    quote_snippet: 'The reviewer accepted the package flow.'
};

const acceptedPackage = {
    package_id: 'pkg-export-1',
    title: 'Accepted Export Package',
    status: 'accepted',
    primary_nodes: [
        {
            item_id: 'node-start-item',
            node_id: 'node-start',
            title: 'Start review',
            node_type: 'workflow',
            review_state: 'source_backed',
            source_refs: [sourceRef]
        },
        {
            item_id: 'node-decision-item',
            node_id: 'node-decision',
            title: 'Approve package',
            node_type: 'decision',
            review_state: 'source_backed',
            source_refs: [sourceRef]
        }
    ],
    relationship_edges: [
        {
            item_id: 'edge-start-decision-item',
            edge_id: 'edge-start-decision',
            source_node_id: 'node-start',
            target_node_id: 'node-decision',
            relationship_type: 'next',
            label: 'Ready for approval',
            review_state: 'source_backed',
            source_refs: [sourceRef]
        }
    ],
    structured_evidence: [
        {
            item_id: 'evidence-item',
            id: 'evidence-row',
            title: 'Accepted evidence',
            evidence_type: 'source_quote',
            review_state: 'source_backed',
            source_refs: [sourceRef]
        }
    ],
    evidence_links: [
        {
            item_id: 'evidence-link-item',
            source_item_id: 'evidence-item',
            target_item_id: 'node-decision-item',
            source_refs: [sourceRef]
        }
    ],
    tasks: [
        {
            item_id: 'task-item',
            id: 'task-review',
            title: 'Push package to stakeholders',
            status: 'accepted',
            priority: 'high',
            owner_id: 'ops',
            due_date: '2026-06-01',
            source_refs: [sourceRef]
        }
    ],
    acceptance_groups: [
        {
            item_id: 'acceptance-item',
            group_id: 'acceptance-core',
            title: 'Accepted core',
            item_ids: ['node-start-item', 'edge-start-decision-item'],
            source_refs: [sourceRef]
        }
    ]
};

test('accepted connected package exports markdown json csv and mermaid shapes', () => {
    const json = getConnectedPackageJsonExport(acceptedPackage, {
        workspace: { id: 'workspace-1', title: 'Workspace One' }
    });
    const markdown = getConnectedPackageMarkdownExport(acceptedPackage);
    const csv = getConnectedPackageEvidenceCsvExport(acceptedPackage);
    const mermaid = getConnectedPackageMermaidExport(acceptedPackage);
    const bundle = getConnectedPackageExportBundle(acceptedPackage);

    assert.equal(json.export_type, 'connected_picture_package');
    assert.equal(json.package_id, 'pkg-export-1');
    assert.equal(json.workspace.title, 'Workspace One');
    assert.equal(json.projections.task_rows[0].item_id, 'task-item');
    assert.match(markdown, /^# Accepted Export Package/);
    assert.match(markdown, /## Evidence Rows/);
    assert.match(csv, /Package ID,Item ID,Item Type,Title,Review State/);
    assert.match(csv, /pkg-export-1,evidence-item,structured_evidence,Accepted evidence,source_backed/);
    assert.match(mermaid, /flowchart TD/);
    assert.match(mermaid, /node_start\["Start review"\]/);
    assert.match(mermaid, /node_start -->\|Ready for approval\| node_decision/);
    assert.equal(bundle.evidence_rows[0]['Source Document'], 'doc-package');
});

test('accepted connected package exposes dry-run Miro and monday handoff candidates', () => {
    const handoff = getConnectedPackageHandoffCandidates(acceptedPackage, {
        workspace: { id: 'workspace-1', title: 'Workspace One' },
        batchId: 'batch-export'
    });

    assert.equal(handoff.miro.mode, 'dry_run');
    assert.equal(handoff.miro.target, 'connected_picture_package_board');
    assert.equal(handoff.miro.export_batch.integration, 'miro');
    assert.deepEqual(
        handoff.miro.items.map((item) => item.package_item_id),
        ['node-start-item', 'node-decision-item']
    );
    assert.equal(handoff.miro.connectors[0].package_item_id, 'edge-start-decision-item');
    assert.equal(handoff.monday.mode, 'dry_run');
    assert.equal(handoff.monday.target.board_id, '');
    assert.equal(handoff.monday.items[0].package_item_id, 'task-item');
    assert.equal(handoff.monday.items[0].source_quote, 'The reviewer accepted the package flow.');
    assert.ok(handoff.deferred_backend_fields.includes('confirmed monday board_id/group_id'));
});
