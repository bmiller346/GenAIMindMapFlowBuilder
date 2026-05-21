import {
    createWorkspaceEdge,
    createWorkspaceNode,
    getChildPosition,
    updateWorkspaceNode,
    reflowSiblingSubtrees
} from '../../utils/manualNodes';
import {
    applyStructuredEvidenceRepair,
    structuredDataAcceptance,
    structuredDataChildData
} from '../../utils/structuredDataArtifacts';
import { sourceRefsFromPastedUrls } from '../../utils/aiDraftSessions';

export const buildStructuredEvidenceRepairPrompt = (row = {}) => {
    const currentRefs = Array.isArray(row.source_refs) ? row.source_refs : [];
    const representedRows = Array.isArray(row.represented_rows) ? row.represented_rows : [];

    return (
        row.evidence_repair_prompt ||
        row.source_repair_prompt ||
        [
            'Correct and cite this output item.',
            `Current source: ${row.source}`,
            `Current target: ${row.target}`,
            `Value: ${row.value}`,
            row.metric_label ? `Metric: ${row.metric_label}` : '',
            representedRows[0]?.notes ? `Notes: ${representedRows[0].notes}` : '',
            `Current source refs: ${currentRefs.length}`,
            'Use uploaded sources, selected sources, pasted URLs, or web search/public context when available. If the current citation is weak, random, or missing, replace it with better evidence. Return only the corrected item fields plus source_refs and review_state.'
        ]
            .filter(Boolean)
            .join('\n')
    );
};

export const sourceRefsForStructuredEvidenceRepair = (row = {}) => {
    const currentRefs = Array.isArray(row.source_refs) ? row.source_refs : [];
    const representedRows = Array.isArray(row.represented_rows) ? row.represented_rows : [];
    const urlRefs = sourceRefsFromPastedUrls(
        [
            row.source,
            row.target,
            row.notes,
            row.evidence_repair_prompt,
            row.source_repair_prompt,
            ...representedRows.flatMap((representedRow) => [
                representedRow?.source,
                representedRow?.target,
                representedRow?.notes
            ])
        ]
            .filter(Boolean)
            .join('\n')
    );

    return [...currentRefs, ...urlRefs];
};

export const createStructuredEvidenceNodeActions = ({
    id,
    data,
    nodes,
    edges,
    setNodes,
    setEdges,
    setSaveStatus,
    setActiveView,
    recordActivity,
    openAskAi,
    structuredDataContext,
    displayTitle,
    summary
}) => {
    const acceptStructuredEvidence = () => {
        const acceptedData = structuredDataAcceptance(data, structuredDataContext);
        setNodes(
            nodes.map((node) =>
                node.id === id
                    ? updateWorkspaceNode({ ...node, data: acceptedData }, { data: acceptedData })
                    : node
            )
        );
        recordActivity({
            type: 'structured_data_preview_accepted',
            title: 'Accepted structured evidence',
            summary: `Accepted ${structuredDataContext.tableName || displayTitle || id} as source-backed structured evidence.`,
            node_ids: [id],
            metadata: {
                query_id: structuredDataContext.queryId,
                table_name: structuredDataContext.tableName,
                artifact_types: structuredDataContext.artifactTypes
            }
        });
        setSaveStatus('dirty');
        setActiveView('table');
    };

    const createStructuredDataChild = (kind) => {
        const childData = structuredDataChildData({
            kind,
            parentTitle: displayTitle || summary || id,
            context: structuredDataContext,
            summary: kind === 'finding' ? summary : '',
            evidenceNodeId: id
        });
        const childNode = createWorkspaceNode({
            ...childData,
            position: getChildPosition(nodes, edges, id)
        });
        const acceptedData = structuredDataContext.accepted
            ? data
            : structuredDataAcceptance(data, structuredDataContext);

        const nextEdges = [...edges, createWorkspaceEdge(id, childNode.id)];
        const parentEdge = edges.find((edge) => edge.target === id);
        const nextNodes = [
            ...nodes.map((node) =>
                node.id === id
                    ? updateWorkspaceNode({ ...node, data: acceptedData }, { data: acceptedData })
                    : node
            ),
            childNode
        ];
        setNodes(
            parentEdge
                ? reflowSiblingSubtrees({
                      nodes: nextNodes,
                      edges: nextEdges,
                      parentId: parentEdge.source,
                      anchorNodeId: id
                  })
                : nextNodes
        );
        setEdges(nextEdges);
        recordActivity({
            type: kind === 'task' ? 'structured_data_task_created' : 'structured_data_finding_created',
            title: kind === 'task' ? 'Created data-backed task' : 'Created data-backed finding',
            summary: `${childData.title} was created from structured evidence.`,
            node_ids: [id, childNode.id],
            metadata: {
                query_id: structuredDataContext.queryId,
                table_name: structuredDataContext.tableName,
                artifact_type: childData.artifactType
            }
        });
        setSaveStatus('dirty');
        setActiveView(kind === 'task' ? 'tasks' : 'knowledgeGraph');
    };

    const openStructuredEvidenceRepair = (row) => {
        const currentRefs = sourceRefsForStructuredEvidenceRepair(row);
        const hasUrlRef = currentRefs.some((ref) =>
            String(ref?.document_id || '').startsWith('http')
        );
        openAskAi('node', {
            initialRoleId: 'research-assistant',
            initialActionId: 'custom_prompt',
            initialVisual: structuredDataContext.chartType || 'table',
            initialPrompt: buildStructuredEvidenceRepairPrompt(row),
            initialEvidenceMode: hasUrlRef ? 'web_sources' : undefined,
            initialCitationPolicy: currentRefs.length ? 'required' : undefined,
            initialSourceRefs: currentRefs,
            intent: 'structured_evidence_repair'
        });
        recordActivity({
            type: 'structured_evidence_repair_opened',
            title: 'Opened evidence repair',
            summary: `Opened evidence repair for ${row.source} -> ${row.target}.`,
            node_ids: [id],
            metadata: {
                evidence_item_id: row.evidence_item_id || row.id || '',
                row_id: row.id || '',
                query_id: structuredDataContext.queryId,
                source: row.source,
                target: row.target,
                source_ref_count: currentRefs.length
            }
        });
    };

    const applyStructuredEvidenceRepairWriteBack = ({ target = {}, repair = {} } = {}) => {
        const result = applyStructuredEvidenceRepair(data, { target, repair });
        if (!result.applied) {
            return result;
        }
        setNodes(
            nodes.map((node) =>
                node.id === id
                    ? updateWorkspaceNode({ ...node, data: result.data }, { data: result.data })
                    : node
            )
        );
        recordActivity({
            type: 'structured_evidence_repair_applied',
            title: 'Applied evidence repair',
            summary: `Updated one structured evidence row for ${structuredDataContext.tableName || displayTitle || id}.`,
            node_ids: [id],
            metadata: {
                query_id: structuredDataContext.queryId,
                table_name: structuredDataContext.tableName,
                row_id: target.row_id || target.evidence_item_id || repair.row_id || repair.evidence_item_id || '',
                patched_row_indexes: result.patchedRowIndexes
            }
        });
        setSaveStatus('dirty');
        return result;
    };

    return {
        acceptStructuredEvidence,
        createStructuredDataChild,
        openStructuredEvidenceRepair,
        applyStructuredEvidenceRepairWriteBack
    };
};
