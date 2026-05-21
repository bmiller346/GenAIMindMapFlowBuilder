import {
    hasSourceEvidence,
    isHierarchyRelationship,
    numericConfidence,
    uniqueValues
} from './packageReady.js';

const repairItem = ({
    id,
    label,
    severity = 'medium',
    count,
    suggestedAction,
    actionPreset,
    targetView,
    targetNodeIds = [],
    metadata = {}
}) => ({
    id,
    label,
    severity,
    ...(count !== undefined ? { count } : {}),
    suggested_action: suggestedAction,
    ...(actionPreset ? { action_preset: actionPreset } : {}),
    ...(targetView ? { target_view: targetView } : {}),
    ...(targetNodeIds.length > 0 ? { target_node_ids: targetNodeIds } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {})
});

const sectionKeyForRef = (ref = {}) =>
    ref.document_id && (ref.page || ref.section)
        ? [ref.document_id, ref.page || '', ref.section || ''].join('::')
        : '';

export const getGraphConfidenceSummary = (projection) => {
    const contentNodes = projection.nodes.filter((node) => node.react_flow_type !== 'dataSource');
    const nodeCount = contentNodes.length;
    const edgeCount = projection.edges.length;
    const hierarchyEdges = projection.edges.filter((edge) =>
        isHierarchyRelationship(edge.relationship_type)
    ).length;
    const crossLinkEdges = edgeCount - hierarchyEdges;
    const sourcedNodes = contentNodes.filter((node) =>
        node.source_refs?.some(hasSourceEvidence)
    ).length;
    const nodesWithSummary = contentNodes.filter((node) => node.summary).length;
    const nodesNeedingReview = contentNodes.filter(
        (node) => node.status === 'needs_review' || node.node_type === 'needs_review'
    ).length;
    const confidenceValues = contentNodes
        .map((node) => numericConfidence(node.confidence))
        .filter((value) => value !== null);
    const lowConfidenceNodes = contentNodes.filter((node) => {
        const confidence = numericConfidence(node.confidence);
        return confidence !== null && confidence < 0.6;
    }).length;
    const roots = projection.roots.filter((node) => node.react_flow_type !== 'dataSource').length;
    const connectedNodeIds = new Set(
        projection.edges.flatMap((edge) => [edge.source, edge.target]).filter(Boolean)
    );
    const missingSourceNodeIds = contentNodes
        .filter((node) => !node.source_refs?.some(hasSourceEvidence))
        .map((node) => node.id);
    const reviewNodeIds = contentNodes
        .filter((node) => node.status === 'needs_review' || node.node_type === 'needs_review')
        .map((node) => node.id);
    const isolatedSourceSectionKeys = uniqueValues(
        contentNodes
            .filter((node) => !connectedNodeIds.has(node.id))
            .flatMap((node) => node.source_refs || [])
            .map(sectionKeyForRef)
    );
    const missingSourceNodes = nodeCount - sourcedNodes;
    const missingSummaryNodes = nodeCount - nodesWithSummary;
    const reviewRatio = nodeCount === 0 ? 0 : nodesNeedingReview / nodeCount;
    const isUnsourcedGraph = nodeCount > 0 && sourcedNodes === 0;
    const isSparseGraph = nodeCount > 2 && edgeCount < Math.max(1, Math.floor(nodeCount / 2));
    const isHierarchyOnlyGraph = nodeCount > 2 && edgeCount > 0 && crossLinkEdges === 0;
    const hasSourceOnlySections = isolatedSourceSectionKeys.length > 0;
    const hasManyReviewNodes =
        nodeCount > 0 && (nodesNeedingReview >= 4 || reviewRatio >= 0.4);
    const averageConfidence =
        confidenceValues.length > 0
            ? confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length
            : null;

    const structureScore =
        nodeCount === 0
            ? 0
            : Math.min(1, edgeCount / Math.max(1, nodeCount - roots || 1));
    const connectionScore =
        nodeCount < 3 ? 1 : Math.min(1, crossLinkEdges / Math.max(1, Math.ceil(nodeCount / 8)));
    const sourceScore = nodeCount === 0 ? 0 : sourcedNodes / nodeCount;
    const summaryScore = nodeCount === 0 ? 0 : nodesWithSummary / nodeCount;
    const reviewScore = nodeCount === 0 ? 0 : 1 - nodesNeedingReview / nodeCount;
    const confidenceScore = averageConfidence ?? (lowConfidenceNodes > 0 ? 0.45 : 0.62);

    const rawScore = Math.round(
        100 *
            (structureScore * 0.22 +
                connectionScore * 0.18 +
                sourceScore * 0.22 +
                summaryScore * 0.16 +
                reviewScore * 0.14 +
                confidenceScore * 0.08)
    );
    const trustCap = Math.min(
        100,
        isUnsourcedGraph ? 58 : 100,
        isSparseGraph ? 68 : 100,
        isHierarchyOnlyGraph ? 78 : 100,
        hasManyReviewNodes ? 74 : 100
    );
    const score = Math.min(rawScore, trustCap);

    const reasons = [];
    if (nodeCount === 0) {
        reasons.push('No graph nodes yet');
    }
    if (isSparseGraph) {
        reasons.push('Sparse graph structure');
    }
    if (isHierarchyOnlyGraph) {
        reasons.push('No accepted cross-branch connections');
    }
    if (isUnsourcedGraph) {
        reasons.push('Graph has no source-backed nodes');
    } else if (sourceScore < 0.5) {
        reasons.push(`${missingSourceNodes} nodes missing source support`);
    } else if (sourceScore < 0.75) {
        reasons.push(`${missingSourceNodes} nodes need stronger source coverage`);
    }
    if (summaryScore < 0.75) {
        reasons.push(`${missingSummaryNodes} nodes missing summaries`);
    }
    if (hasManyReviewNodes) {
        reasons.push(`${nodesNeedingReview} nodes need review before handoff`);
    } else if (nodesNeedingReview > 0) {
        reasons.push(`${nodesNeedingReview} nodes marked needs review`);
    }
    if (lowConfidenceNodes > 0) {
        reasons.push(`${lowConfidenceNodes} low-confidence nodes`);
    }

    const supplementActions = [];
    if (isSparseGraph) {
        supplementActions.push('Find connections for sparse graph');
    } else if (isHierarchyOnlyGraph) {
        supplementActions.push('Find cross-branch connections');
    }
    if (isUnsourcedGraph) {
        supplementActions.push('Add source support');
    } else if (sourceScore < 0.75) {
        supplementActions.push('Review source coverage');
    }
    if (hasManyReviewNodes) {
        supplementActions.push('Resolve review flags');
    } else if (summaryScore < 0.75 || nodesNeedingReview > 0) {
        supplementActions.push('Find gaps');
    }
    if (edgeCount > 0 && roots > 1) {
        supplementActions.push('Create mind map from connections');
    }

    const repairItems = [];
    if (isUnsourcedGraph || sourceScore < 0.75) {
        repairItems.push(
            repairItem({
                id: 'missing_sources',
                label: isUnsourcedGraph
                    ? 'Add source support to generated graph'
                    : 'Review nodes missing source support',
                severity: isUnsourcedGraph ? 'high' : sourceScore < 0.5 ? 'high' : 'medium',
                count: missingSourceNodes,
                suggestedAction: isUnsourcedGraph ? 'Add source support' : 'Review source coverage',
                targetView: 'sources',
                targetNodeIds: missingSourceNodeIds
            })
        );
    }
    if (hasManyReviewNodes || nodesNeedingReview > 0) {
        repairItems.push(
            repairItem({
                id: 'review_flags',
                label: hasManyReviewNodes
                    ? 'Resolve review-heavy graph before handoff'
                    : 'Review flagged graph nodes',
                severity: hasManyReviewNodes ? 'high' : 'medium',
                count: nodesNeedingReview,
                suggestedAction: hasManyReviewNodes ? 'Resolve review flags' : 'Find gaps',
                targetView: 'gaps',
                targetNodeIds: reviewNodeIds
            })
        );
    }
    if (isHierarchyOnlyGraph) {
        repairItems.push(
            repairItem({
                id: 'weak_connections',
                label: 'Add cross-branch relationships',
                severity: 'medium',
                count: nodeCount,
                suggestedAction: 'Find cross-branch connections',
                actionPreset: 'connections'
            })
        );
    }
    if (isSparseGraph) {
        repairItems.push(
            repairItem({
                id: 'sparse_branch',
                label: 'Connect sparse graph branches',
                severity: 'medium',
                count: nodeCount,
                suggestedAction: 'Find connections for sparse graph',
                actionPreset: 'connections'
            })
        );
    }
    if (hasSourceOnlySections) {
        repairItems.push(
            repairItem({
                id: 'source_only_sections',
                label: 'Connect isolated source-backed sections',
                severity: isSparseGraph ? 'medium' : 'low',
                count: isolatedSourceSectionKeys.length,
                suggestedAction: 'Review source-only sections',
                targetView: 'sources',
                metadata: {
                    section_keys: isolatedSourceSectionKeys
                }
            })
        );
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        label: score >= 80 ? 'Strong' : score >= 60 ? 'Developing' : 'Needs enrichment',
        node_count: nodeCount,
        edge_count: edgeCount,
        hierarchy_edges: hierarchyEdges,
        cross_link_edges: crossLinkEdges,
        sourced_nodes: sourcedNodes,
        nodes_needing_review: nodesNeedingReview,
        low_confidence_nodes: lowConfidenceNodes,
        average_confidence: averageConfidence,
        reasons,
        supplement_actions: supplementActions,
        repair_items: repairItems
    };
};
