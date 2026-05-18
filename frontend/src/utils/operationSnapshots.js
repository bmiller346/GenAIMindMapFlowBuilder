export const createOperationSnapshot = ({
    nodes = [],
    edges = [],
    viewport = {},
    workspaceBrief = {},
    mapStyle = {}
}) => ({
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
    viewport: { ...(viewport || {}) },
    workspace_brief: structuredClone(workspaceBrief || {}),
    map_style: structuredClone(mapStyle || {})
});

export const restoreOperationSnapshot = ({
    snapshot,
    setNodes,
    setEdges,
    setWorkspaceBrief,
    setMapStyle,
    setViewPort,
    setViewport
}) => {
    if (!snapshot) {
        return;
    }

    setNodes(structuredClone(snapshot.nodes || []));
    setEdges(structuredClone(snapshot.edges || []));
    setWorkspaceBrief(structuredClone(snapshot.workspace_brief || {}));
    if (setMapStyle) {
        setMapStyle(structuredClone(snapshot.map_style || {}));
    }
    const viewport = snapshot.viewport || {};
    setViewPort(viewport);
    if (setViewport) {
        const { x = 0, y = 0, zoom = 1 } = viewport;
        setViewport({ x, y, zoom });
    }
};
