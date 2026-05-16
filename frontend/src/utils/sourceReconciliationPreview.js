import axios from 'axios';
import { nanoid } from 'nanoid';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import useStore from '../stores/store';
import { requestErrorMessage } from './requestErrors';
import {
    combineReconciliationPreviews,
    previewHasReconciliationWork
} from './reconciliationPreviewCombine';

export { combineReconciliationPreviews, previewHasReconciliationWork };

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

export const hasExistingGraphNode = (nodes = []) =>
    nodes.some((node) => node && node.type !== 'dataSource');

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

export const stageUploadedSourcesReconciliationPreview = async ({
    sources = [],
    flowId = '',
    nodes
} = {}) => {
    const selectedSources = Array.isArray(sources)
        ? sources.filter((source) => source?.id)
        : [];
    const store = useStore.getState();
    const currentFlowId = flowId || flowStore.getState().flow_id;

    if (!currentFlowId || !selectedSources.length || !hasExistingGraphNode(nodes || store.nodes)) {
        return { opened: false, reason: 'not_applicable' };
    }

    const addActivity = useActivityStore.getState().addActivity;
    try {
        const responses = await Promise.all(
            selectedSources.map((source) =>
                axios.post(
                    `http://localhost:8000/api/workspaces/${currentFlowId}/sources/${encodeURIComponent(source.id)}/reconcile/preview`,
                    { scope: { type: 'source', source_id: source.id } }
                )
            )
        );
        const previews = responses.map((response) => response.data || {});
        const preview = combineReconciliationPreviews(previews, selectedSources);

        if (!preview) {
            return { opened: false, reason: 'no_overlap', previews };
        }

        store.setGeneratedHelperPreview('sourceLibrarianSources', preview);
        store.setActiveView('sources');
        addActivity({
            type:
                selectedSources.length > 1
                    ? 'ai_multi_source_reconcile_previewed'
                    : 'ai_source_reconcile_previewed',
            title:
                selectedSources.length > 1
                    ? 'Multi-source reconciliation previewed'
                    : 'Source reconciliation previewed',
            summary:
                selectedSources.length > 1
                    ? `Detected useful overlap for ${selectedSources.length} uploaded sources.`
                    : `Detected overlap between ${selectedSources[0].title} and the current graph.`,
            status: 'completed',
            source_ids: selectedSources.map((source) => source.id),
            metadata: {
                intent: 'reconcile_source_with_workspace',
                trigger: 'source_set_upload',
                selected_source_count: selectedSources.length,
                preview_items: preview.preview_items?.length || 0
            }
        });
        return { opened: true, preview };
    } catch (error) {
        addActivity({
            type: 'ai_source_reconcile_failed',
            title: 'Source reconciliation failed',
            summary: requestErrorMessage(error),
            status: 'failed',
            source_ids: selectedSources.map((source) => source.id),
            metadata: {
                intent: 'reconcile_source_with_workspace',
                trigger: 'source_set_upload'
            }
        });
        return { opened: false, reason: 'failed', error };
    }
};
