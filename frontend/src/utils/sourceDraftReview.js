const nodePayload = (node = {}) => ({
    ...(node.data || {}),
    ...(node.data?.data || {})
});

export const nodeLabel = (node = {}) => {
    const payload = nodePayload(node);
    return (
        payload.label ||
        payload.title ||
        payload.question ||
        payload.content ||
        payload.name ||
        node.id ||
        'Untitled node'
    );
};

export const sourceRefsForNode = (node = {}) => {
    const payload = nodePayload(node);
    const refs = payload.source_refs || payload.sourceRefs || payload.citations || [];
    return Array.isArray(refs) ? refs.filter(Boolean) : [];
};

export const isStructuralNode = (node = {}) =>
    ['dataSource', 'question', 'workspaceRoot'].includes(node.type);

export const isSourceBackedNode = (node = {}) => sourceRefsForNode(node).length > 0;

export const isNeedsReviewNode = (node = {}) => {
    const payload = nodePayload(node);
    const labels = [
        payload.node_type,
        payload.nodeType,
        payload.status,
        payload.review_status,
        payload.reviewStatus
    ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

    return node.type === 'needs_review' || labels.includes('needs_review');
};

export const summarizeSourceDraft = (graph = {}) => {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    const parentIds = new Set(edges.map((edge) => edge.target).filter(Boolean));
    const contentNodes = nodes.filter((node) => !isStructuralNode(node));
    const sourceBackedNodes = contentNodes.filter(isSourceBackedNode);
    const needsReviewNodes = contentNodes.filter(isNeedsReviewNode);
    const unsourcedNodes = contentNodes.filter(
        (node) => !isSourceBackedNode(node) && !isStructuralNode(node)
    );
    const topLevelNodes = contentNodes.filter((node) => !parentIds.has(node.id));

    return {
        totalNodes: nodes.length,
        contentNodes: contentNodes.length,
        totalEdges: edges.length,
        topLevelNodes: topLevelNodes.length,
        sourceBackedNodes: sourceBackedNodes.length,
        needsReviewNodes: needsReviewNodes.length,
        unsourcedNodes: unsourcedNodes.length
    };
};

export const previewSourceDraftNodes = (graph = {}, limit = 6) => {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    return nodes
        .filter((node) => !isStructuralNode(node))
        .slice(0, limit)
        .map((node) => ({
            id: node.id,
            label: nodeLabel(node),
            sourceBacked: isSourceBackedNode(node),
            needsReview: isNeedsReviewNode(node)
        }));
};

export const sourceBackedDraftGraph = (graph = {}) => {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    const keptNodeIds = new Set(
        nodes
            .filter((node) => isStructuralNode(node) || isSourceBackedNode(node))
            .map((node) => node.id)
    );

    return {
        ...graph,
        nodes: nodes.filter((node) => keptNodeIds.has(node.id)),
        edges: edges.filter(
            (edge) => keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target)
        )
    };
};

export const normalizeAcceptedSourceDraftGraph = (graph = {}) => {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];

    return {
        ...graph,
        nodes: nodes.map((node) => {
            if (
                isStructuralNode(node) ||
                isSourceBackedNode(node) ||
                isNeedsReviewNode(node)
            ) {
                return node;
            }

            return {
                ...node,
                data: {
                    ...(node.data || {}),
                    node_type: 'needs_review',
                    review_status: 'needs_review'
                }
            };
        })
    };
};
