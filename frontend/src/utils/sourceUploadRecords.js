import { nanoid } from 'nanoid';

export const parseMindmapJson = (mindmapJson) => {
    if (!mindmapJson) {
        return {};
    }
    if (typeof mindmapJson === 'string') {
        try {
            return JSON.parse(mindmapJson);
        } catch (error) {
            return {};
        }
    }
    return mindmapJson;
};

export const uploadHasGraphDraft = (data) => {
    const flow = parseMindmapJson(data?.mindmap_json);
    return (flow.nodes || []).length > 0 || (flow.edges || []).length > 0;
};

export const sourceRecordFromUpload = (
    data,
    sourceInput,
    flowId,
    { fallbackType = '', fallbackTypeLabel = '', fallbackTitle = '' } = {}
) => {
    const flow = parseMindmapJson(data?.mindmap_json);
    const sourceLibrary = Array.isArray(flow.source_library)
        ? flow.source_library
        : Array.isArray(flow.source_library?.documents)
          ? flow.source_library.documents
          : [];
    const inputTitle =
        sourceInput?.name ||
        sourceInput?.title ||
        sourceInput?.content ||
        fallbackTitle ||
        data?.filename ||
        '';
    const fromGraph =
        sourceLibrary.find((source) => source.component_id === data?.component_id) ||
        sourceLibrary.find((source) => source.title === inputTitle) ||
        sourceLibrary[0] ||
        {};
    const sourceType = fromGraph.type || data?.type || fallbackType || 'source';

    return {
        id:
            fromGraph.id ||
            fromGraph.document_id ||
            fromGraph.source_document_id ||
            data?.normalized_document_id ||
            data?.source_document_id ||
            data?.source_document?.id ||
            data?.source_document?.document_id ||
            data?.document_id ||
            data?.component_id ||
            inputTitle ||
            nanoid(),
        title:
            fromGraph.title ||
            fromGraph.filename ||
            fromGraph.original_filename ||
            inputTitle ||
            data?.filename ||
            'Uploaded source',
        type: sourceType,
        type_label: fromGraph.type_label || fallbackTypeLabel || sourceType.toUpperCase(),
        status: fromGraph.status || 'parsed',
        node_id: fromGraph.node_id || '',
        component_id: fromGraph.component_id || data?.component_id || '',
        flow_id: fromGraph.flow_id || data?.flow_id || flowId || '',
        file_hash: fromGraph.file_hash || data?.file_hash || '',
        size: fromGraph.size || sourceInput?.size || 0,
        version: fromGraph.version || '',
        metadata: {
            ...(fromGraph.metadata || {}),
            ...(data?.source_document || {}),
            original_filename:
                sourceInput?.name ||
                fromGraph.title ||
                data?.source_document?.original_filename ||
                data?.filename ||
                fallbackTitle ||
                ''
        },
        chunks: Array.isArray(fromGraph.chunks)
            ? fromGraph.chunks
            : Array.isArray(data?.document_chunks)
              ? data.document_chunks
              : [],
        segments: Array.isArray(fromGraph.segments)
            ? fromGraph.segments
            : Array.isArray(fromGraph.source_segments)
              ? fromGraph.source_segments
              : Array.isArray(data?.source_segments)
                ? data.source_segments
                : [],
        normalized_document_id:
            fromGraph.normalized_document_id ||
            data?.normalized_document_id ||
            data?.source_document_id ||
            data?.source_document?.id ||
            data?.source_document?.document_id ||
            ''
    };
};

export const upsertSource = (sources = [], source = {}) => {
    const normalizedSources = Array.isArray(sources)
        ? sources
        : Array.isArray(sources?.documents)
          ? sources.documents
          : [];
    if (!source.id) {
        return normalizedSources;
    }
    const sourceId = (item = {}) => item.id || item.document_id || item.source_document_id || '';
    const existingIndex = normalizedSources.findIndex((item) => sourceId(item) === source.id);
    if (existingIndex < 0) {
        return [...normalizedSources, source];
    }
    return normalizedSources.map((item, index) => (index === existingIndex ? { ...item, ...source } : item));
};
