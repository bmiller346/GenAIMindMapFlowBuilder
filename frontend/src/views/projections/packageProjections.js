import {
    getPackageGraphProjection,
    getPackageConceptMapProjection,
    getPackageProcessProjection,
    getPackageRelationshipProjection,
    hasConnectedPackageProjectionData
} from '../../connected-package/connectedPackageProjections.js';

const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const normalizeSignal = (value = '') =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

const ACCEPTED_SIGNALS = new Set(['accepted', 'approved', 'reviewed', 'published', 'source_backed']);
const ACTION_TYPES = new Set(['task', 'action', 'decision', 'milestone', 'risk', 'requirement']);
const PROCESS_TYPES = new Set(['workflow', 'procedure', 'process', 'handoff', 'phase', 'checkpoint']);
const DEPENDENCY_RELATIONSHIPS = new Set([
    'depends_on',
    'dependency',
    'requires',
    'blocked_by',
    'blocks',
    'prerequisite'
]);
const PROCESS_RELATIONSHIPS = new Set([
    ...DEPENDENCY_RELATIONSHIPS,
    'sequence',
    'next',
    'then',
    'handoff',
    'leads_to',
    'leads-to',
    'contains'
]);

const isAcceptedArtifact = (artifact = {}) =>
    Boolean(artifact.accepted) ||
    ACCEPTED_SIGNALS.has(normalizeSignal(artifact.review_state)) ||
    ACCEPTED_SIGNALS.has(normalizeSignal(artifact.status));

const acceptedArtifactsForNode = (node = {}) =>
    asArray(node.generated_artifacts).filter((artifact) => isAcceptedArtifact(artifact));

const hasAcceptedPackageContent = (node = {}) =>
    ACCEPTED_SIGNALS.has(normalizeSignal(node.review_state)) ||
    ACCEPTED_SIGNALS.has(normalizeSignal(node.status)) ||
    acceptedArtifactsForNode(node).length > 0 ||
    asArray(node.local_preview_acceptances).length > 0;

const sourceRefsFor = (node = {}, artifacts = []) => {
    const refs = [
        ...asArray(node.source_refs),
        ...artifacts.flatMap((artifact) => asArray(artifact.source_refs || artifact.data?.source_refs))
    ];
    const seen = new Set();
    return refs.filter((ref) => {
        const key = JSON.stringify(ref);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const evidenceStateFor = (sourceRefs = [], reviewState = '') =>
    sourceRefs.length > 0 ? normalizeSignal(reviewState) || 'source_backed' : 'needs_review';

const packageNode = (node = {}) => {
    const artifacts = acceptedArtifactsForNode(node);
    const source_refs = sourceRefsFor(node, artifacts);
    return {
        id: node.id,
        title: node.title,
        summary: node.summary,
        node_type: node.node_type,
        status: node.status,
        review_state: node.review_state || node.status || '',
        evidence_state: evidenceStateFor(source_refs, node.review_state || node.status),
        needs_review: source_refs.length === 0,
        source_refs,
        artifact_ids: artifacts.map((artifact) => artifact.id).filter(Boolean),
        artifacts
    };
};

const relationshipType = (edge = {}) =>
    edge.relationship_type || edge.data?.relationship_type || edge.data?.type || edge.type || '';

const packageEdge = (edge = {}, nodeLookup = new Map()) => ({
    id: edge.id || `${edge.source || ''}:${edge.target || ''}:${relationshipType(edge)}`,
    source: edge.source,
    target: edge.target,
    relationship_type: relationshipType(edge),
    label: edge.label || edge.data?.label || relationshipType(edge),
    source_refs: asArray(edge.source_refs || edge.data?.source_refs),
    source_title: nodeLookup.get(edge.source)?.title || '',
    target_title: nodeLookup.get(edge.target)?.title || ''
});

const acceptedPackageNodes = (projection = {}) =>
    asArray(projection.nodes).filter(hasAcceptedPackageContent).map(packageNode);

const acceptedNodeLookup = (nodes = []) => new Map(nodes.map((node) => [node.id, node]));

const acceptedPackageEdges = (projection = {}, nodes = acceptedPackageNodes(projection)) => {
    const nodeLookup = acceptedNodeLookup(nodes);
    return asArray(projection.edges)
        .filter((edge) => nodeLookup.has(edge.source) && nodeLookup.has(edge.target))
        .map((edge) => packageEdge(edge, nodeLookup));
};

const graphProjection = (projection, type, nodes, edges, extra = {}) => ({
    projection_type: type,
    eligible: nodes.length > 0 || edges.length > 0,
    node_count: nodes.length,
    edge_count: edges.length,
    needs_review_count: nodes.filter((node) => node.needs_review).length,
    nodes,
    edges,
    ...extra
});

export const getPackageReadyProjection = (projection = {}) => {
    if (hasConnectedPackageProjectionData(projection)) {
        return getPackageGraphProjection(projection, { projectionType: 'package_ready' });
    }
    const nodes = acceptedPackageNodes(projection);
    const edges = acceptedPackageEdges(projection, nodes);
    return graphProjection(projection, 'package_ready', nodes, edges);
};

export const getConceptGraphProjection = (projection = {}) => {
    if (hasConnectedPackageProjectionData(projection)) {
        return getPackageConceptMapProjection(projection);
    }
    const nodes = acceptedPackageNodes(projection).filter(
        (node) => !ACTION_TYPES.has(normalizeSignal(node.node_type))
    );
    return graphProjection(projection, 'concept_graph', nodes, acceptedPackageEdges(projection, nodes));
};

export const getRelationshipGraphProjection = (projection = {}) => {
    if (hasConnectedPackageProjectionData(projection)) {
        return getPackageRelationshipProjection(projection);
    }
    const nodes = acceptedPackageNodes(projection);
    const edges = acceptedPackageEdges(projection, nodes).filter((edge) =>
        Boolean(edge.relationship_type)
    );
    return graphProjection(projection, 'relationship_graph', nodes, edges);
};

export const getProcessGraphProjection = (projection = {}) => {
    if (hasConnectedPackageProjectionData(projection)) {
        return getPackageProcessProjection(projection);
    }
    const nodes = acceptedPackageNodes(projection).filter((node) =>
        PROCESS_TYPES.has(normalizeSignal(node.node_type))
    );
    const edges = acceptedPackageEdges(projection, nodes).filter((edge) =>
        PROCESS_RELATIONSHIPS.has(normalizeSignal(edge.relationship_type))
    );
    return graphProjection(projection, 'process_graph', nodes, edges);
};

export const getDependencyGraphProjection = (projection = {}) => {
    const nodes = acceptedPackageNodes(projection);
    const edges = acceptedPackageEdges(projection, nodes).filter((edge) =>
        DEPENDENCY_RELATIONSHIPS.has(normalizeSignal(edge.relationship_type))
    );
    const dependencyNodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
    return graphProjection(
        projection,
        'dependency_graph',
        nodes.filter((node) => dependencyNodeIds.has(node.id)),
        edges
    );
};

export const getEvidenceGraphProjection = (projection = {}) => {
    const nodes = acceptedPackageNodes(projection);
    const evidenceNodes = nodes.flatMap((node) =>
        node.source_refs.length
            ? node.source_refs.map((ref, index) => ({
                  id:
                      ref.source_id ||
                      ref.document_id ||
                      ref.file_id ||
                      `${node.id}:source:${index}`,
                  title: ref.title || ref.filename || ref.document_id || ref.source_id || 'Source',
                  source_ref: ref,
                  evidence_state: 'source_backed'
              }))
            : [
                  {
                      id: `${node.id}:missing-evidence`,
                      title: 'Missing evidence',
                      source_ref: null,
                      evidence_state: 'needs_review'
                  }
              ]
    );
    const edges = nodes.map((node) => ({
        id: `${node.id}:evidence`,
        source: node.source_refs[0]?.source_id || node.source_refs[0]?.document_id || `${node.id}:missing-evidence`,
        target: node.id,
        relationship_type: 'supports',
        evidence_state: node.evidence_state
    }));
    return graphProjection(projection, 'evidence_graph', [...evidenceNodes, ...nodes], edges);
};

export const getDataGraphProjection = (projection = {}) => {
    const nodes = acceptedPackageNodes(projection).filter((node) =>
        node.artifacts.some((artifact) =>
            ['data_table', 'chart', 'sql_query'].includes(normalizeSignal(artifact.artifact_type))
        )
    );
    return graphProjection(projection, 'data_graph', nodes, acceptedPackageEdges(projection, nodes), {
        artifacts: nodes.flatMap((node) => node.artifacts)
    });
};

export const getActionGraphProjection = (projection = {}) => {
    const nodes = acceptedPackageNodes(projection).filter((node) =>
        ACTION_TYPES.has(normalizeSignal(node.node_type))
    );
    return graphProjection(projection, 'action_graph', nodes, acceptedPackageEdges(projection, nodes));
};
