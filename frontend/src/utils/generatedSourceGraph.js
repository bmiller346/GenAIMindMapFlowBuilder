import flowStore from '../stores/flowStore';
import useStore from '../stores/store';
import {
    parseMindmapJson,
    sourceRecordFromUpload,
    uploadHasGraphDraft,
    upsertSource
} from './sourceReconciliationPreview';

const isBlankCanvas = ({ nodes = [], edges = [] } = {}) =>
    nodes.length === 0 && edges.length === 0;

const sourceLibraryRecords = (sourceLibrary) =>
    Array.isArray(sourceLibrary)
        ? sourceLibrary
        : Array.isArray(sourceLibrary?.documents)
          ? sourceLibrary.documents
          : [];

const normalizeGeneratedSourceGraph = ({ graph = {}, uploadData = {}, sourceInput, sourceRecord }) => ({
    ...graph,
    nodes: Array.isArray(graph.nodes)
        ? graph.nodes.map((node) => {
              if (node.type !== 'dataSource') {
                  return node;
              }
              return {
                  ...node,
                  data: {
                      ...(node.data || {}),
                      name: node.data?.name || uploadData.type || sourceRecord.type || 'source',
                      content:
                          node.data?.content ||
                          sourceInput?.name ||
                          sourceInput?.content ||
                          sourceRecord.title ||
                          'Uploaded source',
                      flow_id:
                          uploadData.flow_id ||
                          flowStore.getState().flow_id ||
                          sourceRecord.flow_id ||
                          ''
                  }
              };
          })
        : [],
    edges: Array.isArray(graph.edges) ? graph.edges : [],
    viewport: graph.viewport || {}
});

export const handleGeneratedSourceGraph = ({
    uploadData,
    sourceInput,
    fallbackType = '',
    fallbackTypeLabel = '',
    fallbackTitle = '',
    popNode,
    fitView,
    draftMeta = {}
}) => {
    const graph = parseMindmapJson(uploadData?.mindmap_json);
    if (!uploadHasGraphDraft(uploadData)) {
        return false;
    }

    const state = useStore.getState();
    const flowState = flowStore.getState();
    const flowId = uploadData.flow_id || flowState.flow_id || '';
    const sourceRecord = sourceRecordFromUpload(uploadData, sourceInput, flowId, {
        fallbackType,
        fallbackTypeLabel,
        fallbackTitle
    });
    const normalizedGraph = normalizeGeneratedSourceGraph({
        graph,
        uploadData,
        sourceInput,
        sourceRecord
    });
    const viewport = normalizedGraph.viewport || {};

    if (isBlankCanvas(state)) {
        flowState.setFlow(flowId);
        flowState.setFlowName(uploadData.flow_name || flowState.flow_name || 'Untitled workspace');
        flowState.setFlowType(uploadData.flow_type || flowState.flow_type || 'automatic');
        state.setNodes(normalizedGraph.nodes);
        state.setEdges(normalizedGraph.edges);
        state.setViewPort(viewport.x || 0, viewport.y || 0, viewport.zoom || 1.25);
        state.setSourceLibrary(
            upsertSource(
                sourceLibraryRecords(normalizedGraph.source_library).length
                    ? sourceLibraryRecords(normalizedGraph.source_library)
                    : state.sourceLibrary,
                sourceRecord
            )
        );
        flowState.setSaveStatus('dirty');
        popNode?.();
        window.setTimeout(() => fitView?.({ maxZoom: 1 }), 50);
        return true;
    }

    state.setPendingSourceDraft({
        id: `source_draft_${uploadData.component_id || uploadData.flow_id || sourceRecord.id}`,
        flowId,
        flowName: uploadData.flow_name || flowState.flow_name || 'Untitled workspace',
        flowType: uploadData.flow_type || flowState.flow_type || 'automatic',
        componentId: uploadData.component_id,
        sourceType: uploadData.type || fallbackType || sourceRecord.type || 'source',
        sourceName:
            sourceInput?.name ||
            sourceInput?.content ||
            fallbackTitle ||
            sourceRecord.title ||
            'Uploaded source',
        graph: normalizedGraph,
        createdAt: new Date().toISOString(),
        ...draftMeta
    });
    popNode?.();
    return true;
};
