export const getProviderRef = (node, provider) =>
    node?.data?.external_refs?.[provider] || {};

export const getLastDate = (refs, fields) => {
    const dates = refs
        .flatMap((ref) => fields.map((field) => ref[field]))
        .filter(Boolean)
        .map((value) => Date.parse(value))
        .filter((value) => Number.isFinite(value));

    if (dates.length === 0) {
        return '';
    }

    return new Date(Math.max(...dates)).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

export const summarizeProvider = (nodes, provider, hasCredential, validationIssues) => {
    const refs = nodes
        .map((node) => getProviderRef(node, provider))
        .filter((ref) => Object.keys(ref).length > 0);
    const mappedNodes = refs.filter((ref) => ref.item_id || ref.board_id).length;
    const completeRefs = refs.filter((ref) => ref.board_id && ref.item_id).length;
    const lastPush = getLastDate(refs, ['last_pushed_at']);
    const lastPull = getLastDate(refs, ['last_pulled_at']);
    const exportBatches = new Set(refs.map((ref) => ref.export_batch_id).filter(Boolean));
    const warnings = validationIssues.filter((issue) => {
        const text = [
            issue.code,
            issue.label,
            issue.detail,
            issue.integration
        ].filter(Boolean).join(' ').toLowerCase();
        return text.includes(provider);
    });

    return {
        provider,
        hasCredential,
        mappedNodes,
        completeRefs,
        lastPush,
        lastPull,
        lastExportBatch: [...exportBatches].at(-1) || '',
        warnings
    };
};
