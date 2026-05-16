import {
    sourceRecordFromUpload,
    upsertSource
} from './sourceUploadRecords.js';
import { chooseGeneratedWorkspaceName } from './workspaceNaming.js';

export const isBlankCanvas = ({ nodes = [], edges = [] } = {}) =>
    nodes.length === 0 && edges.length === 0;

export const sourceLibraryRecords = (sourceLibrary) =>
    Array.isArray(sourceLibrary)
        ? sourceLibrary
        : Array.isArray(sourceLibrary?.documents)
          ? sourceLibrary.documents
          : [];

export const normalizeGeneratedSourceGraph = ({ graph = {}, uploadData = {}, sourceInput, sourceRecord }) => ({
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
                          sourceRecord.flow_id ||
                          ''
                  }
              };
          })
        : [],
    edges: Array.isArray(graph.edges) ? graph.edges : [],
    viewport: graph.viewport || {}
});

export const buildGeneratedSourceDraft = ({
    graph = {},
    uploadData = {},
    sourceInput,
    fallbackType = '',
    fallbackTypeLabel = '',
    fallbackTitle = '',
    currentState = {},
    flowState = {},
    draftMeta = {}
}) => {
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
    const workspaceName = chooseGeneratedWorkspaceName({
        uploadData,
        sourceInput,
        fallbackTitle,
        sourceRecord,
        graph: normalizedGraph,
        currentFlowName: flowState.flow_name
    });
    const sourceLibrary = upsertSource(
        sourceLibraryRecords(normalizedGraph.source_library).length
            ? sourceLibraryRecords(normalizedGraph.source_library)
            : currentState.sourceLibrary,
        sourceRecord
    );

    return {
        id: `source_draft_${uploadData.component_id || uploadData.flow_id || sourceRecord.id}`,
        flowId,
        flowName: workspaceName,
        flowType: uploadData.flow_type || flowState.flow_type || 'automatic',
        componentId: uploadData.component_id,
        sourceType: uploadData.type || fallbackType || sourceRecord.type || 'source',
        sourceName:
            sourceInput?.name ||
            sourceInput?.content ||
            fallbackTitle ||
            sourceRecord.title ||
            'Uploaded source',
        graph: {
            ...normalizedGraph,
            source_library: sourceLibrary
        },
        createdAt: new Date().toISOString(),
        initialCanvas: isBlankCanvas(currentState),
        ...draftMeta
    };
};
