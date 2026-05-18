const isNodeHiddenFromPdfExport = (node = {}) => {
    const data = node.data || {};
    const nestedData = data.data && typeof data.data === 'object' ? data.data : {};
    return Boolean(
        node.hidden ||
            data.hidden ||
            nestedData.hidden ||
            data.hidden_from_export ||
            nestedData.hidden_from_export
    );
};

export const buildPdfStudioWorkspaceGraph = ({
    nodes = [],
    edges = [],
    flowNodes = [],
    flowEdges = []
} = {}) => {
    const sourceNodes = nodes.length > 0 ? nodes : flowNodes;
    const sourceEdges = edges.length > 0 ? edges : flowEdges;
    const flowNodeLookup = new Map(flowNodes.map((node) => [node.id, node]));
    const exportNodes = sourceNodes.map((node) => {
        const flowNode = flowNodeLookup.get(node.id);
        if (!flowNode) {
            return node;
        }
        return {
            ...node,
            measured: flowNode.measured || node.measured,
            width: flowNode.width || node.width,
            height: flowNode.height || node.height,
            positionAbsolute: flowNode.positionAbsolute || node.positionAbsolute
        };
    });

    return {
        nodes: exportNodes.filter((node) => !isNodeHiddenFromPdfExport(node)),
        edges: sourceEdges
    };
};
