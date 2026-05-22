import {
    changeIntentFromAIDraftSession,
    getAIDraftAcceptModeDetail,
    getAIDraftSourceStatus,
    latestAIDraftRevision,
    normalizeAIDraftItem,
    normalizeAIDraftNode
} from './aiDraftSessions.js';
import { isSoftwareOverlapArtifact } from './aiDraftArtifacts.js';
import { asArray, firstText, graphAfterReplacementRemoval, hasSourceRefs, numericConfidence } from './aiDraftSessionCommon.js';

export const formatAIDraftPreviewDiffSummary = (diff = {}) => ({
    nodes: Number(diff.added_nodes || diff.nodes || 0),
    edges: Number(diff.added_edges || diff.edges || 0),
    updates: Number(diff.updated_nodes || diff.updates || 0),
    removals: Number(diff.removed_nodes || diff.removals || 0),
    removedEdges: Number(diff.removed_edges || 0),
    needsReview: Number(diff.needs_review_repairs || diff.needs_review_items || 0),
    reviewOutputs: Number(diff.review_outputs || 0),
    text: [
        `+${Number(diff.added_nodes || diff.nodes || 0)} nodes`,
        `+${Number(diff.added_edges || diff.edges || 0)} edges`,
        `~${Number(diff.updated_nodes || diff.updates || 0)} updates`,
        `-${Number(diff.removed_nodes || diff.removals || 0)} removals`,
        `!${Number(diff.needs_review_repairs || diff.needs_review_items || 0)} needs_review items`
    ].join('  ')
});

export const getAIDraftItemBadges = (item = {}) => {
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const assumptions = asArray(item.assumptions);
    const confidence = numericConfidence(item.confidence ?? metadata.confidence);
    const status = firstText(item.status, metadata.status).toLowerCase();
    const type = firstText(item.item_type, metadata.node_type, metadata.type).toLowerCase();
    const sourceStatus = getAIDraftSourceStatus(item);
    const badges = [];

    badges.push({ id: sourceStatus.badgeId, label: sourceStatus.label, tone: sourceStatus.tone });
    if (sourceStatus.reviewable) {
        badges.push({ id: 'needs-review', label: 'Needs review', tone: 'warn' });
    }
    if (status === 'needs_review' || type === 'needs_review' || metadata.needs_review === true) {
        if (!badges.some((badge) => badge.id === 'needs-review')) {
            badges.push({ id: 'needs-review', label: 'Needs review', tone: 'warn' });
        }
    }
    if (
        sourceStatus.id !== 'ai_assumption_uncited' &&
        (assumptions.length > 0 ||
            metadata.assumption === true ||
            metadata.assumptions === true ||
            type === 'assumption')
    ) {
        badges.push({ id: 'assumption', label: 'Assumption', tone: 'neutral' });
    }
    if (confidence !== null && confidence < 0.6) {
        badges.push({ id: 'low-confidence', label: 'Low confidence', tone: 'warn' });
    }
    if (metadata.duplicate === true || metadata.duplicate_of || type.includes('duplicate')) {
        badges.push({ id: 'duplicate', label: 'Duplicate', tone: 'caution' });
    }
    if (isSoftwareOverlapArtifact(item)) {
        badges.push({ id: 'potential-overlap', label: 'Potential overlap', tone: 'caution' });
    }
    if (metadata.conflict === true || metadata.conflicts || type.includes('conflict')) {
        badges.push({ id: 'conflict', label: 'Conflict', tone: 'danger' });
    }
    return badges;
};

export const selectedDraftNodes = ({ revision = {}, mode = 'append', selectedItemIds = [] } = {}) => {
    const selected = new Set(asArray(selectedItemIds));
    const selectedNodeIds = new Set();
    asArray(revision.draft_items).forEach((item) => {
        if (!selected.has(item.id)) {
            return;
        }
        [item.metadata?.node_id, item.metadata?.draft_node_id].filter(Boolean).forEach((nodeId) => {
            selectedNodeIds.add(nodeId);
        });
    });
    let nodes = asArray(revision.draft_nodes).map(normalizeAIDraftNode);
    if (mode === 'selected') {
        return selected.size > 0 ? nodes.filter((node) => selected.has(node.id) || selectedNodeIds.has(node.id)) : [];
    }
    if (selected.size > 0) {
        nodes = nodes.filter((node) => selected.has(node.id));
    }
    if (mode === 'cited_only') {
        return nodes.filter((node) => asArray(node.source_refs).length > 0);
    }
    if (mode === 'notes_only') {
        return [];
    }
    return nodes;
};

export const selectedRelationshipDraftItems = ({ revision = {}, mode = 'append', selectedItemIds = [] } = {}) => {
    if (mode === 'notes_only') {
        return [];
    }
    const selected = new Set(asArray(selectedItemIds));
    return asArray(revision.draft_items)
        .map(normalizeAIDraftItem)
        .filter((item) => {
            const metadata = item.metadata || {};
            const relationshipType = firstText(metadata.relationship_type, item.relationship_type);
            if (!metadata.source_node_id || !metadata.target_node_id || !relationshipType) {
                return false;
            }
            if (['contains', 'child', 'parent'].includes(relationshipType)) {
                return false;
            }
            if (mode === 'selected') {
                return selected.size > 0 && selected.has(item.id);
            }
            if (mode === 'cited_only') {
                return hasSourceRefs(item);
            }
            return true;
        });
};

const relationshipEndpointIds = (item = {}) => {
    const metadata = item.metadata || {};
    return {
        sourceId: firstText(metadata.source_node_id, metadata.source, item.source_node_id),
        targetId: firstText(metadata.target_node_id, metadata.target, item.target_node_id)
    };
};

export const filterRelationshipsForAcceptedDraftNodes = ({
    revision = {},
    relationshipItems = [],
    acceptedNodeIds = new Set()
} = {}) => {
    const draftNodeIds = new Set(
        asArray(revision.draft_nodes)
            .map((node) => firstText(node.id, node.node_id))
            .filter(Boolean)
    );
    return asArray(relationshipItems).filter((item) => {
        const { sourceId, targetId } = relationshipEndpointIds(item);
        return [sourceId, targetId].every((nodeId) => !draftNodeIds.has(nodeId) || acceptedNodeIds.has(nodeId));
    });
};

const scopedRemovalCounts = ({ mode = 'append', nodes = [], edges = [], scope = {} } = {}) => {
    if (mode !== 'replace') {
        return { removed_nodes: 0, removed_edges: 0, removed_node_ids: [], removed_edge_ids: [] };
    }
    const removal = graphAfterReplacementRemoval({ nodes, edges, scope });
    return {
        removed_nodes: removal.removed_node_ids.length,
        removed_edges: removal.removed_edge_ids.length,
        removed_node_ids: removal.removed_node_ids,
        removed_edge_ids: removal.removed_edge_ids
    };
};

const describeAIDraftPreviewDiff = ({
    mode = 'append',
    nodes = [],
    edges = [],
    relationshipItems = [],
    reviewOutputs = 0,
    removedNodes = 0,
    removedEdges = 0,
    needsReviewRepairs = 0,
    assumptionRepairs = 0,
    missingSourceRepairs = 0,
    updatedNodes = 0
} = {}) => {
    const draftItemCount = nodes.length + relationshipItems.length;
    if (mode === 'notes_only') {
        return [
            'Graph will not change.',
            reviewOutputs
                ? `${reviewOutputs} review artifact${reviewOutputs === 1 ? '' : 's'} stay available for reference.`
                : 'Draft notes stay available for review.'
        ];
    }
    if (mode === 'merge') {
        return [
            updatedNodes
                ? `${updatedNodes} matching node${updatedNodes === 1 ? '' : 's'} will be updated.`
                : 'No matching node updates are selected yet.',
            'Existing content outside matching draft items stays in place.'
        ];
    }
    if (mode === 'replace') {
        return [
            removedNodes || removedEdges
                ? `${removedNodes} scoped node${removedNodes === 1 ? '' : 's'} and ${removedEdges} connected edge${removedEdges === 1 ? '' : 's'} may be removed before the draft is applied.`
                : 'Selected scope will be replaced by the reviewed draft.',
            `${nodes.length} draft node${nodes.length === 1 ? '' : 's'} and ${edges.length + relationshipItems.length} edge${edges.length + relationshipItems.length === 1 ? '' : 's'} will be added.`
        ];
    }
    if (mode === 'selected') {
        return [
            draftItemCount
                ? `${draftItemCount} checked draft item${draftItemCount === 1 ? '' : 's'} will be accepted.`
                : 'No checked draft items will be accepted yet.',
            'Unchecked draft items remain draft-only.'
        ];
    }
    if (mode === 'cited_only') {
        return [
            draftItemCount
                ? `${draftItemCount} source-backed draft item${draftItemCount === 1 ? '' : 's'} will be accepted.`
                : 'No source-backed draft items are available to accept.',
            needsReviewRepairs
                ? `${needsReviewRepairs} uncited item${needsReviewRepairs === 1 ? '' : 's'} stay draft-only (${missingSourceRepairs} missing citation${missingSourceRepairs === 1 ? '' : 's'}, ${assumptionRepairs} AI assumption${assumptionRepairs === 1 ? '' : 's'}).`
                : 'Uncited draft items stay out of the graph.'
        ];
    }
    return [
        `${nodes.length} draft node${nodes.length === 1 ? '' : 's'} will be added as supporting content.`,
        'Existing workspace content stays in place.'
    ];
};

const reviewSourceStatusCounts = (items = []) =>
    asArray(items).reduce(
        (counts, item) => {
            const sourceStatus = getAIDraftSourceStatus(item);
            if (sourceStatus.id === 'missing_required_source') {
                counts.missing_required_source += 1;
            } else if (sourceStatus.id === 'ai_assumption_uncited') {
                counts.ai_assumption_uncited += 1;
            }
            return counts;
        },
        { ai_assumption_uncited: 0, missing_required_source: 0 }
    );

export const buildAIDraftPreviewDiff = (
    session = {},
    { mode = 'append', selectedItemIds = [], currentNodes = [], currentEdges = [] } = {}
) => {
    const revision = latestAIDraftRevision(session);
    const changeIntent = changeIntentFromAIDraftSession(session, revision);
    const acceptModeDetail = getAIDraftAcceptModeDetail(mode);
    const nodes = selectedDraftNodes({ revision, mode, selectedItemIds });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges =
        mode === 'notes_only'
            ? []
            : asArray(revision.draft_edges).filter((edge) => nodeIds.has(edge.target_node_id));
    const relationshipItems = filterRelationshipsForAcceptedDraftNodes({
        revision,
        relationshipItems: selectedRelationshipDraftItems({ revision, mode, selectedItemIds }),
        acceptedNodeIds: nodeIds
    });
    const removals = scopedRemovalCounts({
        mode,
        nodes: currentNodes,
        edges: currentEdges,
        scope: session.scope
    });
    const needsReviewNodes =
        mode === 'notes_only'
            ? []
            : mode === 'cited_only'
              ? asArray(revision.draft_nodes).filter(
                    (node) => node.node_type !== 'reference' && asArray(node.source_refs).length === 0
                )
              : nodes.filter((node) => node.node_type !== 'reference' && asArray(node.source_refs).length === 0);
    const needsReviewRepairs = needsReviewNodes.length;
    const sourceStatusCounts = reviewSourceStatusCounts(needsReviewNodes);
    const updatedNodes = mode === 'merge' ? nodes.length : 0;
    const addedEdges = mode === 'merge' ? 0 : edges.length + relationshipItems.length;
    const previewLines = describeAIDraftPreviewDiff({
        mode,
        nodes,
        edges,
        relationshipItems,
        reviewOutputs: asArray(revision.draft_annotations).length,
        removedNodes: removals.removed_nodes,
        removedEdges: removals.removed_edges,
        needsReviewRepairs,
        assumptionRepairs: sourceStatusCounts.ai_assumption_uncited,
        missingSourceRepairs: sourceStatusCounts.missing_required_source,
        updatedNodes
    });
    const canonicalGraphMutated =
        mode !== 'notes_only' &&
        (nodes.length > 0 ||
            addedEdges > 0 ||
            updatedNodes > 0 ||
            removals.removed_nodes > 0 ||
            removals.removed_edges > 0);
    const diff = {
        mode,
        added_nodes: mode === 'merge' ? 0 : nodes.length,
        added_edges: addedEdges,
        updated_nodes: updatedNodes,
        removed_nodes: removals.removed_nodes,
        removed_edges: removals.removed_edges,
        review_outputs: asArray(revision.draft_annotations).length,
        needs_review_repairs: needsReviewRepairs,
        ai_assumption_repairs: sourceStatusCounts.ai_assumption_uncited,
        missing_source_repairs: sourceStatusCounts.missing_required_source,
        accepted_item_ids: asArray(selectedItemIds).length
            ? asArray(selectedItemIds)
            : [...nodes.map((node) => node.id), ...relationshipItems.map((item) => item.id)],
        preview_lines: previewLines,
        metadata: {
            change_intent: changeIntent,
            accept_mode: mode,
            accept_mode_label: acceptModeDetail.label,
            accept_mode_help: acceptModeDetail.help,
            user_choice: acceptModeDetail.user_choice,
            preview_lines: previewLines,
            source_status_counts: sourceStatusCounts,
            removed_node_ids: removals.removed_node_ids,
            removed_edge_ids: removals.removed_edge_ids,
            follow_up_semantics: {
                change_intent: changeIntent,
                accept_mode: mode,
                accept_mode_label: acceptModeDetail.label,
                accept_mode_help: acceptModeDetail.help,
                user_choice: acceptModeDetail.user_choice,
                preserves_existing: mode !== 'replace',
                canonical_graph_mutated: canonicalGraphMutated,
                selected_only: mode === 'selected',
                adds_as_alternate: mode === 'append',
                source_backed_only: mode === 'cited_only'
            }
        }
    };
    diff.summary = [
        `+${diff.added_nodes} nodes`,
        `+${diff.added_edges} edges`,
        diff.updated_nodes ? `~${diff.updated_nodes} nodes updated` : '',
        diff.removed_nodes ? `-${diff.removed_nodes} scoped nodes` : '',
        diff.needs_review_repairs
            ? `!${diff.needs_review_repairs} reviewable (${diff.missing_source_repairs} missing citation, ${diff.ai_assumption_repairs} AI assumption)`
            : ''
    ]
        .filter(Boolean)
        .join(', ');
    return diff;
};
