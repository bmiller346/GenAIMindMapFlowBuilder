const sourceOnlyChunksForPreview = (preview = {}) => {
    const metadata = preview.metadata || {};
    return Array.isArray(metadata.source_only_chunks)
        ? metadata.source_only_chunks.filter(Boolean).map((chunk) => ({
              ...chunk,
              source_id: chunk.source_id || metadata.source_id || '',
              source_title: chunk.source_title || metadata.source_title || ''
          }))
        : [];
};

export const previewHasReconciliationWork = (preview = {}) => {
    const previewItems = Array.isArray(preview.preview_items) ? preview.preview_items : [];
    const matchedCount = Number(preview.metadata?.matched_node_count || 0);
    const sourceOnlyCount = Number(preview.metadata?.source_only_chunk_count || 0);
    const sourceOnlyChunks = sourceOnlyChunksForPreview(preview);

    return (
        previewItems.length > 0 ||
        matchedCount > 0 ||
        sourceOnlyCount > 0 ||
        sourceOnlyChunks.length > 0
    );
};

export const combineReconciliationPreviews = (previews = [], sources = []) => {
    const usefulPreviews = previews.filter(previewHasReconciliationWork);
    if (!usefulPreviews.length) {
        return null;
    }
    if (usefulPreviews.length === 1) {
        return usefulPreviews[0];
    }
    const sourceOnlyChunks = usefulPreviews.flatMap(sourceOnlyChunksForPreview);
    const matchedNodeCount = usefulPreviews.reduce(
        (total, preview) => total + Number(preview.metadata?.matched_node_count || 0),
        0
    );
    return {
        ...usefulPreviews[0],
        preview_items: usefulPreviews.flatMap((preview) => preview.preview_items || []),
        warnings: usefulPreviews.flatMap((preview) => preview.warnings || []),
        metadata: {
            ...(usefulPreviews[0].metadata || {}),
            matched_node_count: matchedNodeCount,
            source_only_chunk_count: sourceOnlyChunks.length,
            source_only_chunks: sourceOnlyChunks,
            selected_source_count: usefulPreviews.length,
            selected_source_ids: sources.map((source) => source.id).filter(Boolean),
            staged_useful_preview_count: usefulPreviews.length
        }
    };
};
