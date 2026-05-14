export const createOperationSnapshot = ({
    nodes = [],
    edges = [],
    viewport = {},
    workspaceBrief = {}
}) => ({
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
    viewport: { ...(viewport || {}) },
    workspace_brief: structuredClone(workspaceBrief || {})
});

export const restoreOperationSnapshot = ({
    snapshot,
    setNodes,
    setEdges,
    setWorkspaceBrief,
    setViewPort,
    setViewport
}) => {
    if (!snapshot) {
        return;
    }

    setNodes(structuredClone(snapshot.nodes || []));
    setEdges(structuredClone(snapshot.edges || []));
    setWorkspaceBrief(structuredClone(snapshot.workspace_brief || {}));
    const viewport = snapshot.viewport || {};
    setViewPort(viewport);
    if (setViewport) {
        const { x = 0, y = 0, zoom = 1 } = viewport;
        setViewport({ x, y, zoom });
    }
};
