import { normalizeAIDraftScope } from './aiDraftSessionScopes.js';

export const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

export const firstText = (...values) =>
    values.find((value) => typeof value === 'string' && value.trim()) || '';

export const numericConfidence = (value) => {
    if (typeof value === 'number') {
        return value;
    }
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'high') {
        return 0.9;
    }
    if (normalized === 'medium') {
        return 0.65;
    }
    if (normalized === 'low') {
        return 0.35;
    }
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

export const edgeSourceId = (edge = {}) => firstText(edge.source, edge.source_node_id, edge.parent_id);

export const edgeTargetId = (edge = {}) => firstText(edge.target, edge.target_node_id, edge.child_id);

export const mergeSourceRefs = (current = [], next = []) => {
    const refs = [...asArray(current)];
    const seen = new Set(refs.map((ref) => JSON.stringify(ref)));
    asArray(next).forEach((ref) => {
        const key = JSON.stringify(ref);
        if (!seen.has(key)) {
            refs.push(ref);
            seen.add(key);
        }
    });
    return refs;
};

export const sourceRefsFromNode = (node = {}) => {
    const data = node.data || {};
    const nestedData = data.data || {};
    return mergeSourceRefs(
        mergeSourceRefs(asArray(data.source_refs), asArray(data.sourceRefs)),
        mergeSourceRefs(asArray(nestedData.source_refs), asArray(nestedData.sourceRefs))
    );
};

export const sourceRefsFromDraftItem = (item = {}) =>
    mergeSourceRefs(asArray(item.source_refs), asArray(item.metadata?.source_refs));

export const hasSourceRefs = (item = {}) => sourceRefsFromDraftItem(item).length > 0;

export const sourceRefMatchesSourceId = (ref = {}, sourceId = '') => {
    const normalizedSourceId = String(sourceId || '').trim();
    if (!normalizedSourceId) {
        return false;
    }
    return [
        ref.document_id,
        ref.documentId,
        ref.source_id,
        ref.sourceId,
        ref.normalized_document_id
    ].some((value) => String(value || '').trim() === normalizedSourceId);
};

export const collectBranchNodeIds = (edges = [], rootId = '') => {
    const root = String(rootId || '').trim();
    if (!root) {
        return new Set();
    }
    const childIdsByParent = new Map();
    asArray(edges).forEach((edge) => {
        const source = edgeSourceId(edge);
        const target = edgeTargetId(edge);
        if (!source || !target) {
            return;
        }
        childIdsByParent.set(source, [...(childIdsByParent.get(source) || []), target]);
    });

    const ids = new Set([root]);
    const queue = [root];
    while (queue.length) {
        const parentId = queue.shift();
        asArray(childIdsByParent.get(parentId)).forEach((childId) => {
            if (ids.has(childId)) {
                return;
            }
            ids.add(childId);
            queue.push(childId);
        });
    }
    return ids;
};

export const collectScopedNodeIds = ({ nodes = [], edges = [], scope = {} } = {}) => {
    const normalizedScope = normalizeAIDraftScope(scope);
    if (normalizedScope.type === 'branch' && normalizedScope.node_id) {
        return collectBranchNodeIds(edges, normalizedScope.node_id);
    }
    if (normalizedScope.type === 'node' && normalizedScope.node_id) {
        return new Set([normalizedScope.node_id]);
    }
    if (normalizedScope.type === 'nodes') {
        return new Set(asArray(normalizedScope.node_ids));
    }
    if (normalizedScope.type === 'source' && normalizedScope.source_id) {
        const sourceMatchedIds = asArray(nodes)
            .filter((node) =>
                sourceRefsFromNode(node).some((ref) =>
                    sourceRefMatchesSourceId(ref, normalizedScope.source_id)
                )
            )
            .map((node) => node.id)
            .filter(Boolean);
        return new Set(sourceMatchedIds.length ? sourceMatchedIds : asArray(nodes).map((node) => node.id));
    }
    return new Set(asArray(nodes).map((node) => node.id).filter(Boolean));
};

export const collectReplacementNodeIds = ({ nodes = [], edges = [], scope = {} } = {}) => {
    const normalizedScope = normalizeAIDraftScope(scope);
    if ((normalizedScope.type === 'branch' || normalizedScope.type === 'node') && normalizedScope.node_id) {
        const scopedNodeIds = collectBranchNodeIds(edges, normalizedScope.node_id);
        scopedNodeIds.delete(normalizedScope.node_id);
        return scopedNodeIds;
    }
    if (normalizedScope.type === 'nodes') {
        return new Set(asArray(normalizedScope.node_ids));
    }
    return collectScopedNodeIds({ nodes, edges, scope });
};

export const graphAfterReplacementRemoval = ({ nodes = [], edges = [], scope = {} } = {}) => {
    const removedNodeIds = collectReplacementNodeIds({ nodes, edges, scope });
    const removedEdgeIds = new Set(
        asArray(edges)
            .filter((edge) => removedNodeIds.has(edgeSourceId(edge)) || removedNodeIds.has(edgeTargetId(edge)))
            .map((edge) => firstText(edge.id, `${edgeSourceId(edge)}->${edgeTargetId(edge)}`))
    );
    return {
        nodes: asArray(nodes).filter((node) => !removedNodeIds.has(node.id)),
        edges: asArray(edges).filter((edge) => !removedEdgeIds.has(firstText(edge.id, `${edgeSourceId(edge)}->${edgeTargetId(edge)}`))),
        removed_node_ids: [...removedNodeIds],
        removed_edge_ids: [...removedEdgeIds]
    };
};
