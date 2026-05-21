import {
    hasCompleteSourceRef,
    hasSourceDocument,
    isHierarchyEdge,
    nodeConfidenceIssues,
    sourceRefIssues,
    suggestedConfidenceForRepair
} from './packageReady.js';

const getParentByChild = (edges) =>
    edges.filter(isHierarchyEdge).reduce((parents, edge) => {
        if (edge.source && edge.target && !parents.has(edge.target)) {
            parents.set(edge.target, edge.source);
        }
        return parents;
    }, new Map());

const nearestAncestorSource = (node, projection, parentByChild) => {
    let currentId = parentByChild.get(node.id);
    const visitedIds = new Set([node.id]);

    while (currentId) {
        if (visitedIds.has(currentId)) {
            return undefined;
        }
        visitedIds.add(currentId);
        const parent = projection.nodeLookup.get(currentId);
        if (hasSourceDocument(parent?.source_ref)) {
            return {
                node: parent,
                source_ref: parent.source_ref,
                relationship: 'ancestor'
            };
        }

        currentId = parentByChild.get(currentId);
    }

    return undefined;
};

const nearestChildSource = (node, projection) => {
    const childIds = projection.childrenByParent.get(node.id) || [];

    for (const childId of childIds) {
        const child = projection.nodeLookup.get(childId);
        if (hasSourceDocument(child?.source_ref)) {
            return {
                node: child,
                source_ref: child.source_ref,
                relationship: 'child'
            };
        }
    }

    return undefined;
};

const nearestSiblingSource = (node, projection, parentByChild) => {
    const parentId = parentByChild.get(node.id);
    const siblingIds = parentId ? projection.childrenByParent.get(parentId) || [] : [];

    for (const siblingId of siblingIds) {
        if (siblingId === node.id) {
            continue;
        }

        const sibling = projection.nodeLookup.get(siblingId);
        if (hasSourceDocument(sibling?.source_ref)) {
            return {
                node: sibling,
                source_ref: sibling.source_ref,
                relationship: 'sibling'
            };
        }
    }

    return undefined;
};

const findSourceSuggestion = (node, projection, parentByChild) =>
    nearestAncestorSource(node, projection, parentByChild) ||
    nearestChildSource(node, projection) ||
    nearestSiblingSource(node, projection, parentByChild);

export const getSourceRepairPreviewRows = (projection) => {
    const parentByChild = getParentByChild(projection.edges);

    return projection.nodes
        .map((node) => {
            const sourceIssues = sourceRefIssues(node.source_ref);
            const confidenceIssues = nodeConfidenceIssues(node);
            const issues = [...sourceIssues, ...confidenceIssues];

            if (issues.length === 0 && hasCompleteSourceRef(node.source_ref)) {
                return undefined;
            }

            const suggestion = findSourceSuggestion(node, projection, parentByChild);
            const hasSuggestion = Boolean(suggestion?.source_ref?.document_id);
            const needsSourceRepair = sourceIssues.some((issue) =>
                ['Missing source document', 'Missing source location', 'Missing source quote'].includes(issue)
            );
            const needsConfidenceRepair =
                confidenceIssues.length > 0 ||
                sourceIssues.some((issue) => issue.includes('confidence'));
            const suggestedConfidence = needsConfidenceRepair
                ? suggestedConfidenceForRepair(node, suggestion)
                : '';
            const repairType = needsSourceRepair
                ? hasSuggestion
                    ? 'suggest_source_ref'
                    : 'request_source_ref'
                : needsConfidenceRepair
                  ? 'suggest_confidence'
                  : 'complete_source_ref';

            return {
                ...node,
                repair_id: `${node.id}-source-repair`,
                issues,
                repair_type: repairType,
                repair_kind: needsSourceRepair ? 'source_ref' : 'confidence',
                suggested_source_ref: hasSuggestion ? suggestion.source_ref : undefined,
                suggested_confidence: suggestedConfidence,
                suggested_from_node_id: suggestion?.node?.id || '',
                suggested_from_title: suggestion?.node?.title || '',
                suggestion_relationship: suggestion?.relationship || '',
                repair_confidence: needsConfidenceRepair ? suggestedConfidence : hasSuggestion ? 'low' : '',
                included: true
            };
        })
        .filter(Boolean);
};
