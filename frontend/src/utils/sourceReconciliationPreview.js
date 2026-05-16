import axios from 'axios';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import useStore from '../stores/store';
import { requestErrorMessage } from './requestErrors';
import {
    combineReconciliationPreviews,
    previewHasReconciliationWork
} from './reconciliationPreviewCombine';
import {
    parseMindmapJson,
    sourceRecordFromUpload,
    uploadHasGraphDraft,
    upsertSource
} from './sourceUploadRecords';

export { combineReconciliationPreviews, previewHasReconciliationWork };
export { parseMindmapJson, sourceRecordFromUpload, uploadHasGraphDraft, upsertSource };

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
