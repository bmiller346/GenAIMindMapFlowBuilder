const getNestedData = (node) => {
    const data = node?.data || {};
    return data.data && typeof data.data === 'object' ? data.data : {};
};

const firstValue = (node, keys, fallback = '') => {
    const data = node?.data || {};
    const nestedData = getNestedData(node);

    for (const key of keys) {
        const value = data[key] ?? nestedData[key];
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return fallback;
};

const getExternalRefs = (node) => {
    const data = node?.data || {};
    const nestedData = getNestedData(node);
    const refs = data.external_refs ?? nestedData.external_refs;

    return refs && typeof refs === 'object' ? refs : {};
};

const hasStagedMondaySelection = (node) =>
    Boolean(node?.data?.monday_selection_input?.selected);

const readinessForNode = (mondayRef, hasStagedSelection) => {
    const issues = [];

    if (!mondayRef.board_id) {
        issues.push('Missing monday board');
    }
    if (!mondayRef.item_id) {
        issues.push('Missing monday item');
    }
    if (!mondayRef.export_batch_id) {
        issues.push('Missing export batch');
    }
    if (!mondayRef.last_pushed_at) {
        issues.push('Missing push timestamp');
    }
    if (!hasStagedSelection && issues.length > 0) {
        issues.push('No staged monday selection');
    }

    if (mondayRef.board_id && mondayRef.item_id) {
        return {
            status: 'ready',
            issues
        };
    }

    if (hasStagedSelection) {
        return {
            status: 'staged_not_pushed',
            issues
        };
    }

    return {
        status: 'not_ready',
        issues
    };
};

export const buildMondayStatusBackRows = (nodes, projection) => {
    const branchIds = projection.branchIds || new Set(nodes.map((node) => node.id));

    return nodes
        .filter((node) => branchIds.has(node.id))
        .map((node) => {
            const externalRefs = getExternalRefs(node);
            const mondayRef = externalRefs.monday || {};
            const stagedSelection = node.data?.monday_selection_input || null;
            const hasSelection = hasStagedMondaySelection(node);
            const readiness = readinessForNode(mondayRef, hasSelection);

            return {
                id: node.id,
                title: firstValue(
                    node,
                    ['title', 'question', 'content', 'prompt', 'answer', 'summ'],
                    node.type || 'Untitled Node'
                ),
                node_type: firstValue(
                    node,
                    ['node_type', 'component_type', 'name'],
                    node.type || 'concept'
                ),
                current_status: firstValue(node, ['status'], 'ai_generated'),
                monday_ref: mondayRef,
                staged_selection: stagedSelection,
                readiness: readiness.status,
                issues: readiness.issues,
                included: readiness.status === 'ready',
                status_back_input: {
                    node_id: node.id,
                    current_status: firstValue(node, ['status'], 'ai_generated'),
                    monday_board_id: mondayRef.board_id || '',
                    monday_item_id: mondayRef.item_id || '',
                    export_batch_id: mondayRef.export_batch_id || '',
                    last_pushed_at: mondayRef.last_pushed_at || '',
                    staged_selection_id: stagedSelection?.selection_id || '',
                    can_pull_status: readiness.status === 'ready',
                    readiness: readiness.status,
                    issues: readiness.issues
                }
            };
        })
        .filter(
            (row) =>
                row.readiness === 'ready' ||
                row.readiness === 'staged_not_pushed' ||
                row.staged_selection
        );
};
