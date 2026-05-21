export const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

export const humanizeId = (value = '') =>
    String(value || '')
        .replaceAll('_', ' ')
        .replaceAll('-', ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\w/, (letter) => letter.toUpperCase());

export const formatTokenCount = (value) => {
    const count = Number(value || 0);
    if (!Number.isFinite(count) || count <= 0) {
        return '';
    }
    return count.toLocaleString();
};

export const usageSummary = (modelMeta = {}) => {
    const total = formatTokenCount(modelMeta.totalTokens || modelMeta.tokenEstimate);
    if (!total) {
        return 'Usage available after model response';
    }
    const parts = [`${total} tokens`];
    if (modelMeta.costEstimate) {
        parts.push(`${modelMeta.costEstimate} est.`);
    }
    return parts.join(' · ');
};

export const scopeLabel = (scope = {}) => {
    if (typeof scope === 'string') {
        return humanizeId(scope);
    }
    if (scope.type === 'node' || scope.type === 'branch') {
        return `${humanizeId(scope.type)}: ${scope.node_id || 'selected node'}`;
    }
    if (scope.type === 'source') {
        return `Source: ${scope.source_id || 'selected source'}`;
    }
    if (scope.type === 'nodes') {
        return `${asArray(scope.node_ids).length} selected nodes`;
    }
    return 'Whole workspace';
};

export const reviewSummary = (coverage = { cited: 0, uncited: 0, total: 0 }, noteCount = 0) => {
    if (!coverage.total && !noteCount) {
        return 'No draft items yet';
    }
    const parts = [];
    if (coverage.total) {
        parts.push(`${coverage.total} ${coverage.total === 1 ? 'item' : 'items'}`);
        if (coverage.missingRequired || coverage.assumptions) {
            parts.push(
                [
                    coverage.missingRequired ? `${coverage.missingRequired} missing citation` : '',
                    coverage.assumptions ? `${coverage.assumptions} AI assumption` : ''
                ]
                    .filter(Boolean)
                    .join(', ')
            );
        } else {
            parts.push(coverage.uncited ? `${coverage.uncited} needs review` : 'all cited');
        }
    }
    if (noteCount) {
        parts.push(`${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`);
    }
    return parts.join(' · ');
};

export const formatScore = (value) => {
    if (value === undefined || value === null || value === '') {
        return 'Not scored';
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return String(value);
    }
    return numeric <= 1 ? `${Math.round(numeric * 100)}%` : `${Math.round(numeric)}`;
};

export const draftNodeId = (node = {}) => node.id || node.node_id || '';

export const collectVisibleDraftOutlineIds = (preview) => {
    const visibleIds = new Set();
    const visit = (node, depth) => {
        const nodeId = draftNodeId(node);
        if (!nodeId || visibleIds.has(nodeId)) {
            return;
        }
        visibleIds.add(nodeId);
        if (depth >= 1) {
            return;
        }
        asArray(preview.childrenByParent.get(nodeId))
            .slice(0, 6)
            .forEach(({ node: child }) => visit(child, depth + 1));
    };
    asArray(preview.roots).forEach((root) => visit(root, 0));
    return visibleIds;
};
