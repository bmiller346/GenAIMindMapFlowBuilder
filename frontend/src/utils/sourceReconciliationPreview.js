import axios from 'axios';
import { nanoid } from 'nanoid';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import useStore from '../stores/store';
import { requestErrorMessage } from './requestErrors';

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
    const sourceLibrary = Array.isArray(flow.source_library) ? flow.source_library : [];
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
            data?.normalized_document_id ||
            data?.source_document_id ||
            data?.document_id ||
            data?.component_id ||
            inputTitle ||
            nanoid(),
        title: fromGraph.title || inputTitle || data?.filename || 'Uploaded source',
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
            : Array.isArray(data?.source_segments)
              ? data.source_segments
              : [],
        normalized_document_id:
            fromGraph.normalized_document_id ||
            data?.normalized_document_id ||
            data?.source_document_id ||
            ''
    };
};

export const upsertSource = (sources = [], source = {}) => {
    if (!source.id) {
        return sources;
    }
    const existingIndex = sources.findIndex((item) => item.id === source.id);
    if (existingIndex < 0) {
        return [...sources, source];
    }
    return sources.map((item, index) => (index === existingIndex ? { ...item, ...source } : item));
};

const hasExistingGraphNode = (nodes = []) =>
    nodes.some((node) => node && node.type !== 'dataSource');

const previewHasReconciliationWork = (preview = {}) => {
    const previewItems = Array.isArray(preview.preview_items) ? preview.preview_items : [];
    const matchedCount = Number(preview.metadata?.matched_node_count || 0);
    const sourceOnlyCount = Number(preview.metadata?.source_only_chunk_count || 0);
    const sourceOnlyChunks = Array.isArray(preview.metadata?.source_only_chunks)
        ? preview.metadata.source_only_chunks
        : [];

    return (
        previewItems.length > 0 ||
        matchedCount > 0 ||
        sourceOnlyCount > 0 ||
        sourceOnlyChunks.length > 0
    );
};

export const stageUploadedSourceReconciliationPreview = async ({
    uploadData,
    sourceRecord,
    sourceInput,
    fallbackTitle = '',
    fallbackType = '',
    fallbackTypeLabel = '',
    nodes
}) => {
    const store = useStore.getState();
    const currentFlowId = flowStore.getState().flow_id || sourceRecord?.flow_id || uploadData?.flow_id;
    const nextSource =
        sourceRecord ||
        sourceRecordFromUpload(uploadData, sourceInput, currentFlowId, {
            fallbackTitle,
            fallbackType,
            fallbackTypeLabel
        });

    if (nextSource?.id) {
        store.setSourceLibrary(upsertSource(store.sourceLibrary, nextSource));
    }

    if (!currentFlowId || !nextSource?.id || !hasExistingGraphNode(nodes || store.nodes)) {
        return { opened: false, reason: 'not_applicable' };
    }

    const addActivity = useActivityStore.getState().addActivity;
    try {
        const response = await axios.post(
            `http://localhost:8000/api/workspaces/${currentFlowId}/sources/${encodeURIComponent(nextSource.id)}/reconcile/preview`,
            { scope: { type: 'source', source_id: nextSource.id } }
        );
        const preview = response.data || {};
        const previewItems = Array.isArray(preview.preview_items) ? preview.preview_items : [];
        const matchedCount = Number(preview.metadata?.matched_node_count || 0);
        const sourceOnlyCount = Number(preview.metadata?.source_only_chunk_count || 0);

        if (!previewHasReconciliationWork(preview)) {
            return { opened: false, reason: 'no_overlap', preview };
        }

        store.setGeneratedHelperPreview('sourceLibrarianSources', preview);
        store.setActiveView('sources');
        addActivity({
            type: 'ai_source_reconcile_previewed',
            title: 'Source reconciliation previewed',
            summary: `Detected overlap between ${nextSource.title} and the current graph.`,
            status: 'completed',
            source_ids: [nextSource.id],
            metadata: {
                intent: 'reconcile_source_with_workspace',
                source_id: nextSource.id,
                preview_items: previewItems.length,
                matched_node_count: matchedCount,
                source_only_chunk_count: sourceOnlyCount,
                trigger: 'source_upload'
            }
        });
        return { opened: true, preview };
    } catch (error) {
        addActivity({
            type: 'ai_source_reconcile_failed',
            title: 'Source reconciliation failed',
            summary: requestErrorMessage(error),
            status: 'failed',
            source_ids: [nextSource.id],
            metadata: {
                intent: 'reconcile_source_with_workspace',
                source_id: nextSource.id,
                trigger: 'source_upload'
            }
        });
        return { opened: false, reason: 'failed', error };
    }
};
