import { asArray, firstText } from '../utils/aiDraftSessionCommon.js';

const PACKAGE_ARTIFACT_TYPE = 'connected_picture_package';

const PACKAGE_COLLECTION_KEYS = [
    'primary_nodes',
    'relationship_edges',
    'view_lenses',
    'structured_evidence',
    'evidence_links',
    'tasks',
    'risks',
    'decisions',
    'repair_targets',
    'acceptance_groups'
];

const normalizeSignal = (value = '') =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

const ACCEPTED_SIGNALS = new Set([
    'accepted',
    'approved',
    'reviewed',
    'published',
    'source_backed',
    'ready'
]);

const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const packagePayload = (artifact = {}) =>
    isObject(artifact.data) && (artifact.data.package_id || artifact.data.acceptance_groups)
        ? artifact.data
        : artifact;

const hasPackageCollections = (value = {}) =>
    PACKAGE_COLLECTION_KEYS.some((key) => asArray(value[key]).length > 0);

const artifactType = (artifact = {}) =>
    normalizeSignal(firstText(artifact.artifact_type, artifact.type, artifact.metadata?.artifact_type));

const isStrictPackageArtifact = (artifact = {}) => {
    const payload = packagePayload(artifact);
    return (
        artifactType(artifact) === PACKAGE_ARTIFACT_TYPE ||
        (Boolean(payload.package_id) && hasPackageCollections(payload))
    );
};

const isMockPreviewPackage = (artifact = {}) => {
    const payload = packagePayload(artifact);
    const source = normalizeSignal(firstText(artifact.source, payload.source, artifact.metadata?.source));
    const status = normalizeSignal(firstText(artifact.status, payload.status, artifact.review_state, payload.review_state));
    return (
        source === 'mock' ||
        artifact.mock === true ||
        payload.mock === true ||
        firstText(payload.package_id, artifact.package_id) === 'connected-package-preview' ||
        (status === 'preview_only' && !isStrictPackageArtifact(artifact))
    );
};

const acceptedSignal = (...values) =>
    values.some((value) => ACCEPTED_SIGNALS.has(normalizeSignal(value)));

const isAcceptedNode = (node = {}) => {
    const data = node.data || {};
    const nestedData = data.data || {};
    const metadata = data.metadata || nestedData.metadata || {};
    return (
        node.accepted === true ||
        data.accepted === true ||
        metadata.accepted === true ||
        acceptedSignal(
            node.status,
            node.review_state,
            data.status,
            data.review_state,
            nestedData.status,
            nestedData.review_state,
            metadata.status,
            metadata.review_state
        )
    );
};

const acceptedAtFrom = (...values) => firstText(...values);

const timestampValue = (value = '') => {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
};

const artifactIdFor = (artifact = {}, fallback = '') =>
    firstText(
        artifact.id,
        artifact.artifact_id,
        artifact.data?.artifact_id,
        artifact.metadata?.artifact_id,
        artifact.provenance?.artifact_id,
        fallback
    );

const packageIdFor = (artifact = {}) => {
    const payload = packagePayload(artifact);
    return firstText(
        payload.package_id,
        artifact.package_id,
        artifact.metadata?.package_id,
        artifact.provenance?.package_id,
        artifact.data?.package_id,
        artifactType(artifact) === PACKAGE_ARTIFACT_TYPE ? artifactIdFor(artifact) : ''
    );
};

const artifactWithPackageId = (artifact = {}, packageId = '') => {
    const payload = packagePayload(artifact);
    if (payload === artifact) {
        return {
            ...artifact,
            package_id: packageId || artifact.package_id
        };
    }
    return {
        ...artifact,
        data: {
            ...payload,
            package_id: packageId || payload.package_id
        }
    };
};

const candidateFromArtifact = ({
    artifact = {},
    source = '',
    sourceLocation = '',
    sourceRank = 0,
    sessionId = '',
    revisionId = '',
    acceptedAt = '',
    activityEventId = '',
    nodeId = '',
    index = 0,
    accepted = false
} = {}) => {
    if (!isObject(artifact) || isMockPreviewPackage(artifact)) {
        return null;
    }
    const packageId = packageIdFor(artifact);
    if (!packageId || !isStrictPackageArtifact(artifact)) {
        return null;
    }
    const artifactId = artifactIdFor(artifact, packageId);
    const metadata = isObject(artifact.metadata) ? artifact.metadata : {};
    const provenance = isObject(artifact.provenance) ? artifact.provenance : {};
    const acceptedTime = acceptedAtFrom(acceptedAt, metadata.accepted_at, provenance.accepted_at, artifact.accepted_at);
    const resolvedSessionId = firstText(
        sessionId,
        metadata.ai_draft_session_id,
        metadata.session_id,
        provenance.ai_draft_session_id,
        provenance.session_id,
        artifact.session_id
    );
    const resolvedRevisionId = firstText(
        revisionId,
        metadata.ai_draft_revision_id,
        metadata.revision_id,
        provenance.ai_draft_revision_id,
        provenance.revision_id,
        artifact.revision_id
    );
    const strict = isStrictPackageArtifact(artifact);
    const score =
        sourceRank +
        (strict ? 30 : 0) +
        (accepted || acceptedTime ? 20 : 0) +
        (hasPackageCollections(packagePayload(artifact)) ? 10 : 0);

    return {
        package_id: packageId,
        artifact_id: artifactId,
        artifact: artifactWithPackageId(artifact, packageId),
        data: packagePayload(artifactWithPackageId(artifact, packageId)),
        provenance: {
            source,
            source_location: sourceLocation,
            session_id: resolvedSessionId,
            revision_id: resolvedRevisionId,
            accepted_at: acceptedTime,
            artifact_id: artifactId,
            activity_event_id: activityEventId,
            node_id: nodeId
        },
        metadata: {
            score,
            source_rank: sourceRank,
            source_index: index,
            strict_package_artifact: strict,
            accepted: accepted || Boolean(acceptedTime)
        }
    };
};

const candidatesFromArtifacts = (artifacts = [], context = {}) =>
    asArray(artifacts)
        .map((artifact, index) =>
            candidateFromArtifact({
                ...context,
                artifact,
                index,
                sourceLocation: `${context.sourceLocation || context.source}[${index}]`
            })
        )
        .filter(Boolean);

const sessionAcceptHistoryCandidates = (session = {}, source = 'session') =>
    asArray(session.accept_history).flatMap((entry, historyIndex) => {
        const sessionId = firstText(entry.session_id, session.session_id);
        const revisionId = firstText(entry.revision_id, entry.metadata?.revision_id);
        const acceptedAt = acceptedAtFrom(entry.accepted_at, entry.metadata?.accepted_at);
        const baseContext = {
            source,
            sourceRank: source === 'active_session_accept_history' ? 100 : 90,
            sessionId,
            revisionId,
            acceptedAt,
            accepted: true
        };
        return [
            ...candidatesFromArtifacts(entry.accepted_artifacts, {
                ...baseContext,
                sourceLocation: `${source}.accept_history[${historyIndex}].accepted_artifacts`
            }),
            ...candidatesFromArtifacts(entry.accept_result?.accepted_artifacts, {
                ...baseContext,
                sourceLocation: `${source}.accept_history[${historyIndex}].accept_result.accepted_artifacts`
            }),
            ...candidatesFromArtifacts(entry.metadata?.accepted_artifacts, {
                ...baseContext,
                sourceLocation: `${source}.accept_history[${historyIndex}].metadata.accepted_artifacts`
            })
        ];
    });

const nodeArtifactCandidates = (nodes = []) =>
    asArray(nodes).flatMap((node, nodeIndex) => {
        const data = node.data || {};
        const nestedData = data.data || {};
        const nodeId = firstText(node.id, data.id, nestedData.id);
        return [
            ...candidatesFromArtifacts(data.generated_artifacts, {
                source: 'node.data.generated_artifacts',
                sourceRank: 70,
                sourceLocation: `nodes[${nodeIndex}].data.generated_artifacts`,
                nodeId,
                accepted: true
            }),
            ...candidatesFromArtifacts(nestedData.generated_artifacts, {
                source: 'node.data.data.generated_artifacts',
                sourceRank: 65,
                sourceLocation: `nodes[${nodeIndex}].data.data.generated_artifacts`,
                nodeId,
                accepted: true
            }),
            ...nodeMetadataCandidate(node, nodeIndex)
        ];
    });

const nodeMetadataCandidate = (node = {}, nodeIndex = 0) => {
    const data = node.data || {};
    const nestedData = data.data || {};
    const metadata = {
        ...(isObject(nestedData.metadata) ? nestedData.metadata : {}),
        ...(isObject(data.metadata) ? data.metadata : {})
    };
    const packageId = firstText(data.package_id, nestedData.package_id, metadata.package_id);
    if (!packageId || !isAcceptedNode(node)) {
        return [];
    }
    const artifactId = firstText(metadata.artifact_id, data.artifact_id, nestedData.artifact_id, packageId);
    const artifact = {
        id: artifactId,
        artifact_type: PACKAGE_ARTIFACT_TYPE,
        title: firstText(data.title, data.label, nestedData.title, nestedData.label, metadata.title, packageId),
        status: firstText(data.status, nestedData.status, metadata.status, 'accepted'),
        data: {
            package_id: packageId,
            primary_nodes: [
                {
                    id: firstText(node.id, data.id, packageId),
                    node_id: firstText(node.id, data.id),
                    title: firstText(data.title, data.label, nestedData.title, nestedData.label),
                    review_state: firstText(data.review_state, nestedData.review_state, data.status, nestedData.status)
                }
            ]
        },
        metadata
    };
    const candidate = candidateFromArtifact({
        artifact,
        source: 'node.package_metadata',
        sourceRank: 50,
        sourceLocation: `nodes[${nodeIndex}].data.metadata`,
        nodeId: firstText(node.id, data.id),
        accepted: true,
        sessionId: firstText(metadata.ai_draft_session_id, metadata.session_id),
        revisionId: firstText(metadata.ai_draft_revision_id, metadata.revision_id),
        acceptedAt: metadata.accepted_at
    });
    return candidate ? [candidate] : [];
};

const activityCandidates = (activityEvents = []) =>
    asArray(activityEvents).flatMap((event, eventIndex) => {
        const metadata = isObject(event.metadata) ? event.metadata : {};
        const acceptedAt = acceptedAtFrom(metadata.accepted_at, event.created_at, event.updated_at);
        return candidatesFromArtifacts(metadata.accepted_artifacts, {
            source: 'activity.metadata.accepted_artifacts',
            sourceRank: 85,
            sourceLocation: `activityEvents[${eventIndex}].metadata.accepted_artifacts`,
            sessionId: metadata.session_id,
            revisionId: metadata.revision_id,
            acceptedAt,
            activityEventId: event.id,
            accepted: true
        });
    });

const compareCandidates = (left, right) => {
    const scoreDelta = right.metadata.score - left.metadata.score;
    if (scoreDelta) {
        return scoreDelta;
    }
    const timeDelta = timestampValue(right.provenance.accepted_at) - timestampValue(left.provenance.accepted_at);
    if (timeDelta) {
        return timeDelta;
    }
    const sourceDelta = right.metadata.source_rank - left.metadata.source_rank;
    if (sourceDelta) {
        return sourceDelta;
    }
    return `${left.package_id}:${left.artifact_id}:${left.provenance.source_location}`.localeCompare(
        `${right.package_id}:${right.artifact_id}:${right.provenance.source_location}`
    );
};

const dedupePackages = (candidates = []) => {
    const bestByPackageId = new Map();
    [...candidates].sort(compareCandidates).forEach((candidate) => {
        if (!bestByPackageId.has(candidate.package_id)) {
            bestByPackageId.set(candidate.package_id, candidate);
        }
    });
    return [...bestByPackageId.values()].sort(compareCandidates);
};

export const getAcceptedConnectedPackages = ({
    nodes = [],
    activityEvents = [],
    sessions = [],
    activeSession = null
} = {}) => {
    const sessionCandidates = asArray(sessions).flatMap((session) =>
        sessionAcceptHistoryCandidates(session, 'session_accept_history')
    );
    const activeSessionCandidates = activeSession
        ? sessionAcceptHistoryCandidates(activeSession, 'active_session_accept_history')
        : [];
    return dedupePackages([
        ...activeSessionCandidates,
        ...sessionCandidates,
        ...activityCandidates(activityEvents),
        ...nodeArtifactCandidates(nodes)
    ]);
};

export const getPrimaryConnectedPackage = (options = {}) =>
    getAcceptedConnectedPackages(options)[0] || null;
