import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getAcceptedConnectedPackages,
    getPrimaryConnectedPackage
} from '../src/connected-package/acceptedConnectedPackages.js';

const packageArtifact = ({
    id = 'artifact-connected-package',
    packageId = 'connected-package-1',
    title = 'Accepted connected package',
    status = 'needs_review',
    acceptedAt = '',
    revisionId = '',
    sessionId = '',
    source = ''
} = {}) => ({
    id,
    artifact_type: 'connected_picture_package',
    title,
    status,
    source,
    data: {
        package_id: packageId,
        primary_nodes: [{ id: `${packageId}-root`, node_id: 'root', title: title }],
        relationship_edges: [],
        view_lenses: [{ id: `${packageId}-lens`, lens_type: 'graph' }],
        acceptance_groups: [{ id: `${packageId}-group`, item_ids: [`${packageId}-root`] }]
    },
    metadata: {
        ai_draft_session_id: sessionId,
        ai_draft_revision_id: revisionId,
        accepted_at: acceptedAt
    }
});

test('save/reopen-like node artifacts discover accepted connected packages', () => {
    const packages = getAcceptedConnectedPackages({
        nodes: [
            {
                id: 'root',
                data: {
                    title: 'Root',
                    generated_artifacts: [
                        packageArtifact({
                            id: 'artifact-node-attached',
                            packageId: 'package-node-only'
                        })
                    ]
                }
            }
        ]
    });

    assert.equal(packages.length, 1);
    assert.equal(packages[0].package_id, 'package-node-only');
    assert.equal(packages[0].artifact_id, 'artifact-node-attached');
    assert.equal(packages[0].provenance.source, 'node.data.generated_artifacts');
    assert.equal(packages[0].provenance.node_id, 'root');
});

test('legacy nested node artifacts are discovered after reopen', () => {
    const packages = getAcceptedConnectedPackages({
        nodes: [
            {
                id: 'legacy-node',
                data: {
                    data: {
                        generated_artifacts: [
                            packageArtifact({
                                id: 'artifact-legacy',
                                packageId: 'package-legacy-nested'
                            })
                        ]
                    }
                }
            }
        ]
    });

    assert.equal(packages.length, 1);
    assert.equal(packages[0].package_id, 'package-legacy-nested');
    assert.equal(packages[0].provenance.source, 'node.data.data.generated_artifacts');
    assert.equal(packages[0].provenance.node_id, 'legacy-node');
});

test('activity and session fixtures discover accepted package artifacts with provenance', () => {
    const packages = getAcceptedConnectedPackages({
        sessions: [
            {
                session_id: 'session-accepted',
                accept_history: [
                    {
                        revision_id: 'revision-accepted',
                        accepted_at: '2026-05-20T12:00:00.000Z',
                        accepted_artifacts: [
                            packageArtifact({
                                id: 'artifact-session',
                                packageId: 'package-session',
                                title: 'Session package'
                            })
                        ]
                    }
                ]
            }
        ],
        activityEvents: [
            {
                id: 'activity-accepted',
                created_at: '2026-05-20T12:05:00.000Z',
                metadata: {
                    session_id: 'session-activity',
                    revision_id: 'revision-activity',
                    accepted_at: '2026-05-20T12:06:00.000Z',
                    accepted_artifacts: [
                        packageArtifact({
                            id: 'artifact-activity',
                            packageId: 'package-activity',
                            title: 'Activity package'
                        })
                    ]
                }
            }
        ]
    });

    assert.deepEqual(
        packages.map((item) => item.package_id),
        ['package-session', 'package-activity']
    );
    const sessionPackage = packages.find((item) => item.package_id === 'package-session');
    assert.equal(sessionPackage.provenance.session_id, 'session-accepted');
    assert.equal(sessionPackage.provenance.revision_id, 'revision-accepted');
    assert.equal(sessionPackage.provenance.accepted_at, '2026-05-20T12:00:00.000Z');

    const activityPackage = packages.find((item) => item.package_id === 'package-activity');
    assert.equal(activityPackage.provenance.activity_event_id, 'activity-accepted');
    assert.equal(activityPackage.provenance.session_id, 'session-activity');
    assert.equal(activityPackage.provenance.revision_id, 'revision-activity');
    assert.equal(activityPackage.provenance.accepted_at, '2026-05-20T12:06:00.000Z');
});

test('duplicate packages collapse deterministically in favor of accepted strict artifacts', () => {
    const packages = getAcceptedConnectedPackages({
        nodes: [
            {
                id: 'root',
                data: {
                    generated_artifacts: [
                        packageArtifact({
                            id: 'artifact-node-copy',
                            packageId: 'duplicate-package',
                            title: 'Node copy'
                        })
                    ]
                }
            }
        ],
        sessions: [
            {
                session_id: 'session-duplicate',
                accept_history: [
                    {
                        revision_id: 'revision-duplicate',
                        accepted_at: '2026-05-20T13:00:00.000Z',
                        accepted_artifacts: [
                            packageArtifact({
                                id: 'artifact-session-copy',
                                packageId: 'duplicate-package',
                                title: 'Session copy'
                            })
                        ]
                    }
                ]
            }
        ]
    });

    assert.equal(packages.length, 1);
    assert.equal(packages[0].package_id, 'duplicate-package');
    assert.equal(packages[0].artifact_id, 'artifact-session-copy');
    assert.equal(packages[0].provenance.source, 'session_accept_history');
    assert.equal(packages[0].provenance.session_id, 'session-duplicate');
});

test('package-ish accepted node metadata can identify a sparse connected package', () => {
    const [connectedPackage] = getAcceptedConnectedPackages({
        nodes: [
            {
                id: 'accepted-node',
                data: {
                    title: 'Accepted package node',
                    status: 'accepted',
                    metadata: {
                        package_id: 'metadata-package',
                        artifact_id: 'artifact-from-metadata',
                        ai_draft_session_id: 'session-metadata',
                        ai_draft_revision_id: 'revision-metadata',
                        accepted_at: '2026-05-20T14:00:00.000Z'
                    }
                }
            }
        ]
    });

    assert.equal(connectedPackage.package_id, 'metadata-package');
    assert.equal(connectedPackage.artifact_id, 'artifact-from-metadata');
    assert.equal(connectedPackage.data.primary_nodes[0].node_id, 'accepted-node');
    assert.equal(connectedPackage.provenance.session_id, 'session-metadata');
});

test('non-package drafts and mock preview data return no active package', () => {
    const packages = getAcceptedConnectedPackages({
        activeSession: {
            session_id: 'session-draft-only',
            revisions: [
                {
                    revision_id: 'revision-draft-only',
                    generated_artifacts: [
                        packageArtifact({
                            id: 'artifact-draft-only',
                            packageId: 'draft-only-package'
                        })
                    ]
                }
            ]
        },
        activityEvents: [
            {
                id: 'activity-mock-preview',
                metadata: {
                    accepted_artifacts: [
                        {
                            package_id: 'connected-package-preview',
                            title: 'Connected Package Preview',
                            source: 'mock',
                            status: 'preview_only',
                            graph: { nodes: [] }
                        }
                    ]
                }
            }
        ],
        nodes: [
            {
                id: 'regular-node',
                data: {
                    generated_artifacts: [
                        {
                            id: 'table-artifact',
                            artifact_type: 'data_table',
                            data: { rows: [] }
                        }
                    ]
                }
            }
        ]
    });

    assert.deepEqual(packages, []);
    assert.equal(getPrimaryConnectedPackage({ activeSession: { revisions: [] } }), null);
});
