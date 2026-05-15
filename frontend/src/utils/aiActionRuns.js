import { nanoid } from 'nanoid';
import {
    createWorkspaceEdge,
    createWorkspaceNode,
    getChildPosition
} from './manualNodes.js';

const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const firstText = (...values) =>
    values.find((value) => typeof value === 'string' && value.trim()) || '';

const previewScopeType = (preview = {}) =>
    typeof preview.scope === 'string' ? preview.scope : preview.scope?.type || 'workspace';

export const createAIActionRun = ({
    preview = {},
    status = 'previewed',
    generatedNodeIds = [],
    createdAt = new Date().toISOString()
} = {}) => {
    const contractRun =
        preview.ai_action_run && typeof preview.ai_action_run === 'object'
            ? preview.ai_action_run
            : undefined;
    const sourceNodeId =
        contractRun?.source_node_id ||
        preview.source_node_id ||
        preview.node_id ||
        preview.scope?.node_id ||
        preview.scope?.source_node_id ||
        '';
    const nextGeneratedNodeIds =
        generatedNodeIds.length > 0
            ? generatedNodeIds
            : asArray(contractRun?.generated_node_ids);

    return {
        ...(contractRun || {}),
        ai_action_id:
            contractRun?.ai_action_id || preview.ai_action_id || `ai_action_${nanoid(10)}`,
        workspace_id: contractRun?.workspace_id || preview.workspace_id || '',
        source_node_id: sourceNodeId,
        scope: contractRun?.scope || previewScopeType(preview),
        role: contractRun?.role || preview.role || preview.helper_id || 'AI action',
        action: contractRun?.action || preview.action || preview.preview_action || '',
        custom_prompt: contractRun?.custom_prompt ?? preview.custom_prompt ?? null,
        input_source_refs: asArray(
            contractRun?.input_source_refs ||
                preview.input_source_refs ||
                preview.source_refs ||
                preview.scope?.source_refs
        ),
        created_at: contractRun?.created_at || preview.created_at || createdAt,
        created_by: contractRun?.created_by || preview.created_by || 'user',
        status,
        generated_node_ids: asArray(nextGeneratedNodeIds)
    };
};

export const normalizeAIActionRuns = (runs = []) =>
    asArray(runs).map((run) => ({
        ...createAIActionRun({ preview: run, status: run.status || 'previewed' }),
        ...run,
        input_source_refs: asArray(run.input_source_refs),
        generated_node_ids: asArray(run.generated_node_ids)
    }));

export const mergeAIActionRun = (runs = [], run) => {
    if (!run?.ai_action_id) {
        return normalizeAIActionRuns(runs);
    }

    const nextRun = {
        ...run,
        input_source_refs: asArray(run.input_source_refs),
        generated_node_ids: asArray(run.generated_node_ids)
    };
    const existingIndex = runs.findIndex(
        (item) => item.ai_action_id === nextRun.ai_action_id
    );

    if (existingIndex === -1) {
        return [nextRun, ...normalizeAIActionRuns(runs)];
    }

    return runs.map((item, index) =>
        index === existingIndex ? { ...item, ...nextRun } : item
    );
};

export const previewDraftNodes = (preview = {}) => {
    const directDrafts = asArray(preview.draft_nodes);
    if (directDrafts.length > 0) {
        return directDrafts;
    }

    return asArray(preview.preview_items)
        .map((item) => {
            const mutation = item.proposed_mutation || {};
            return mutation.draft_node || mutation.create_node
                ? {
                      ...(mutation.draft_node || mutation.create_node),
                      id:
                          mutation.draft_node?.id ||
                          mutation.create_node?.id ||
                          item.generated_node_id ||
                          item.id,
                      title:
                          mutation.draft_node?.title ||
                          mutation.create_node?.title ||
                          item.title,
                      body:
                          mutation.draft_node?.body ||
                          mutation.create_node?.body ||
                          item.rationale,
                      source_refs:
                          mutation.draft_node?.source_refs ||
                          mutation.create_node?.source_refs ||
                          item.source_refs
                  }
                : null;
        })
        .filter(Boolean);
};

export const previewDraftEdges = (preview = {}) => {
    const directDrafts = asArray(preview.draft_edges);
    if (directDrafts.length > 0) {
        return directDrafts;
    }

    return asArray(preview.preview_items)
        .map((item) => item.proposed_mutation?.draft_edge || item.proposed_mutation?.create_edge)
        .filter(Boolean);
};

export const previewNonNodeOutputs = (preview = {}) => {
    const annotations = asArray(preview.draft_annotations);
    const collections = [
        ['notes', preview.draft_notes || preview.notes],
        ['tasks', preview.draft_tasks || preview.tasks],
        ['checklist', preview.draft_checklist_items || preview.checklist_items],
        ['sme_questions', preview.draft_sme_questions || preview.sme_questions],
        ['table_interpretations', preview.draft_table_interpretations || preview.table_interpretations],
        ['assumptions', preview.assumptions]
    ];

    return [
        ...annotations.map((item) => ({ type: item.type || 'annotation', item })),
        ...collections.flatMap(([type, items]) =>
            asArray(items).map((item) => ({ type, item }))
        )
    ];
};

const sourceRefsForDraft = (draft = {}, preview = {}) =>
    asArray(draft.source_refs).length > 0
        ? asArray(draft.source_refs)
        : asArray(preview.source_refs || preview.input_source_refs);

const draftNeedsReview = (draft = {}, preview = {}) => {
    const sourceRefs = sourceRefsForDraft(draft, preview);
    return sourceRefs.length === 0 || draft.needs_review === true;
};

const normalizeDraftNode = ({ draft, preview, nodes, edges, index }) => {
    const sourceNodeId =
        draft.parent_id ||
        draft.source_node_id ||
        preview.source_node_id ||
        preview.scope?.node_id ||
        '';
    const sourceRefs = sourceRefsForDraft(draft, preview);
    const status = draftNeedsReview(draft, preview)
        ? 'needs_review'
        : draft.status || 'ai_generated';
    const position =
        draft.position ||
        (sourceNodeId ? getChildPosition(nodes, edges, sourceNodeId) : undefined);

    return createWorkspaceNode({
        id: draft.id || draft.node_id || `ai_node_${nanoid(10)}`,
        title: firstText(draft.title, draft.label, draft.question, draft.content, 'AI draft'),
        body: firstText(draft.body, draft.summary, draft.rationale, draft.content),
        nodeType: draft.node_type || draft.type || 'concept',
        status,
        sourceRefs,
        position: position
            ? {
                  x: (position.x || 0) + (sourceNodeId ? 0 : index * 32),
                  y: (position.y || 0) + (sourceNodeId ? index * 96 : index * 32)
              }
            : { x: index * 320, y: index * 120 },
        display: draft.display || {}
    });
};

const normalizeDraftEdge = (draft = {}, generatedNodeIds = []) => {
    const source = draft.source || draft.source_node_id || draft.parent_id;
    const target =
        draft.target ||
        draft.target_node_id ||
        draft.child_id ||
        (generatedNodeIds.includes(draft.node_id) ? draft.node_id : '');

    if (!source || !target) {
        return null;
    }

    return createWorkspaceEdge(source, target, {
        id: draft.id || draft.edge_id,
        type: draft.type,
        animated: draft.animated !== false
    });
};

export const acceptAIActionPreview = ({ preview = {}, nodes = [], edges = [] }) => {
    const drafts = previewDraftNodes(preview);
    const draftEdges = previewDraftEdges(preview);
    const nonNodeOutputs = previewNonNodeOutputs(preview);
    const existingNodeIds = new Set(nodes.map((node) => node.id));
    const generatedNodes = drafts
        .map((draft, index) => normalizeDraftNode({ draft, preview, nodes, edges, index }))
        .filter((node) => !existingNodeIds.has(node.id));
    const generatedNodeIds = generatedNodes.map((node) => node.id);
    const sourceNodeId =
        preview.ai_action_run?.source_node_id ||
        preview.source_node_id ||
        preview.node_id ||
        preview.scope?.node_id ||
        '';
    const explicitEdges = draftEdges
        .map((draft) => normalizeDraftEdge(draft, generatedNodeIds))
        .filter(Boolean);
    const edgeKeys = new Set(edges.map((edge) => `${edge.source}->${edge.target}`));
    const fallbackEdges =
        explicitEdges.length === 0 && sourceNodeId
            ? generatedNodeIds.map((nodeId) =>
                  createWorkspaceEdge(sourceNodeId, nodeId, {
                      id: `edge_${sourceNodeId}_${nodeId}`,
                      animated: true
                  })
              )
            : [];
    const generatedEdges = [...explicitEdges, ...fallbackEdges].filter((edge) => {
        const key = `${edge.source}->${edge.target}`;
        if (edgeKeys.has(key)) {
            return false;
        }
        edgeKeys.add(key);
        return true;
    });

    const acceptedAt = new Date().toISOString();
    const nextNodes =
        nonNodeOutputs.length > 0 && sourceNodeId
            ? nodes.map((node) =>
                  node.id === sourceNodeId
                      ? {
                            ...node,
                            data: {
                                ...(node.data || {}),
                                ai_action_outputs: [
                                    ...asArray(node.data?.ai_action_outputs),
                                    {
                                        ai_action_id:
                                            preview.ai_action_run?.ai_action_id ||
                                            preview.ai_action_id ||
                                            '',
                                        preview_id: preview.preview_id || '',
                                        accepted_at: acceptedAt,
                                        outputs: nonNodeOutputs
                                    }
                                ]
                            }
                        }
                      : node
              )
            : nodes;

    return {
        nodes: [...nextNodes, ...generatedNodes],
        edges: [...edges, ...generatedEdges],
        run: createAIActionRun({
            preview,
            status: 'accepted',
            generatedNodeIds
        })
    };
};
