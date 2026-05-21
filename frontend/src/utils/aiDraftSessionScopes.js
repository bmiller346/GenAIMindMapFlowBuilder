export const normalizeAIDraftScope = (scope = {}) => {
    const type = ['workspace', 'source', 'branch', 'node', 'nodes'].includes(scope.type)
        ? scope.type
        : 'workspace';
    if ((type === 'branch' || type === 'node') && scope.node_id) {
        return { type, node_id: String(scope.node_id).trim() };
    }
    if (type === 'source' && scope.source_id) {
        return { type, source_id: String(scope.source_id).trim() };
    }
    if (type === 'nodes') {
        return {
            type,
            node_ids: (Array.isArray(scope.node_ids) ? scope.node_ids.filter(Boolean) : [])
                .map((nodeId) => String(nodeId).trim())
                .filter(Boolean)
        };
    }
    return { type };
};
