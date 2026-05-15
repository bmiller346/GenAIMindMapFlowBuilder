import PROMPTSvg from "../assets/prompt.svg";
import CROSSSvg from "../assets/cross.svg";
import Prompts from "../global-components/Prompts";
import DataSourceSelect from "../global-components/DataSourceSelect";
import { useMemo, useState } from "react";
import axios from "axios";
import modalStore from "../stores/modalStore";
import useStore from "../stores/store";
import useActivityStore from "../stores/activityStore";
import flowStore from "../stores/flowStore";
import { useShallow } from "zustand/shallow";
import {
    defaultOpenAIModel,
    supportedOpenAIModels,
    getActionsForProfileAndScope,
    getDefaultActionForProfile,
    getFollowUpSuggestions,
    getPromptProfilesForScope,
    legacyPersonaNames,
    starterTransformations
} from "../prompts/promptsModel";
import { getWorkspaceNodeData } from "../utils/manualNodes";
import {
    acceptAIDraftSession,
    buildAIDraftMemoryContext,
    buildAIDraftSessionRequestPayload,
    buildSelectedSourceDraftPayload,
    buildSelectedSourcesDraftPayload,
    createAIDraftSession,
    inferAIDraftChangeIntent
} from "../utils/aiDraftSessions";
import { createAIActionRun } from "../utils/aiActionRuns";
import { buildSourceLibraryProjection } from "../views/graphProjection";

const viewForAction = (actionId) => {
    if (actionId.includes('question')) {
        return 'sme';
    }
    if (actionId.includes('source') || actionId.includes('unsupported')) {
        return 'sources';
    }
    if (actionId.includes('sme') || actionId.includes('question')) {
        return 'sme';
    }
    if (actionId.includes('checklist')) {
        return 'checklist';
    }
    if (actionId.includes('gap') || actionId.includes('duplicate')) {
        return 'gaps';
    }
    return 'preview';
};

const VISUAL_OPTIONS = [
    { id: 'auto', label: 'Auto' },
    { id: 'mind_map', label: 'TraceSpace Map' },
    { id: 'outline', label: 'Outline' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'table', label: 'Table' },
    { id: 'flow_chart', label: 'Flowchart' },
    { id: 'knowledge_graph', label: 'Knowledge Graph' },
    { id: 'chart', label: 'Chart' },
    { id: 'kanban', label: 'Kanban' },
    { id: 'sme_questions', label: 'SME Questions' },
    { id: 'implementation_handoff_package', label: 'Handoff' },
    { id: 'no_visual', label: 'No visual' }
];

const OUTPUT_SHAPE_VIEW = {
    mind_map: 'mindmap',
    graph_draft: 'mindmap',
    knowledge_graph: 'knowledgeGraph',
    outline: 'outline',
    tasks: 'tasks',
    table: 'table',
    checklist: 'checklist',
    flow_chart: 'flowchart',
    chart: 'chartData',
    kanban: 'preview',
    review_annotations: 'gaps',
    sme_questions: 'sme',
    source_coverage: 'sources',
    implementation_handoff_package: 'preview',
    no_visual: 'mindmap'
};

const OUTPUT_SHAPE_ROUTE = {
    tasks: { roleId: 'task-planner', actionId: 'generate_tasks' },
    checklist: { roleId: 'training-guide-builder', actionId: 'generate_checklist' },
    table: { roleId: 'data-table-interpreter', actionId: 'interpret_table_data' },
    chart: { roleId: 'data-table-interpreter', actionId: 'interpret_table_data' },
    flow_chart: { roleId: 'workflow-mapper', actionId: 'custom_prompt' },
    knowledge_graph: { roleId: 'standards-extractor', actionId: 'custom_prompt' },
    outline: { roleId: 'training-guide-builder', actionId: 'generate_training_outline' },
    kanban: { roleId: 'task-planner', actionId: 'generate_tasks' },
    sme_questions: { roleId: 'sme-question-generator', actionId: 'create_sme_questions' },
    source_coverage: { roleId: 'source-ref-repair', actionId: 'find_missing_source_support' },
    implementation_handoff_package: { roleId: 'integration-readiness-reviewer', actionId: 'custom_prompt' },
    review_annotations: { roleId: 'gap-analyst', actionId: 'find_gaps' },
    no_visual: { roleId: 'custom', actionId: 'custom_prompt' },
    mind_map: { roleId: 'workflow-mapper', actionId: 'custom_prompt' },
    graph_draft: { roleId: 'workflow-mapper', actionId: 'custom_prompt' }
};

const inferOutputShape = (prompt, actionId = '') => {
    const text = `${prompt || ''} ${actionId || ''}`.toLowerCase();
    if (/\b(kanban|board|columns)\b/.test(text)) {
        return 'kanban';
    }
    if (/\b(table|matrix|spreadsheet|rows|columns|compare)\b/.test(text)) {
        return 'table';
    }
    if (/\b(chart|graph this|visualize data|plot)\b/.test(text)) {
        return 'chart';
    }
    if (/\b(flowchart|flow chart|process map|swimlane|decision tree)\b/.test(text)) {
        return 'flow_chart';
    }
    if (/\b(handoff package|implementation package|implementation handoff|handoff readiness)\b/.test(text)) {
        return 'implementation_handoff_package';
    }
    if (/\b(sme|subject matter expert|review packet|review questions?)\b/.test(text)) {
        return 'sme_questions';
    }
    if (
        /\b(checklist|check list|steps|step[- ]by[- ]step|recipe|instructions?|walkthrough)\b/.test(text) ||
        /\bhow\s+(to|do\s+i|can\s+i|should\s+i|would\s+i)\b/.test(text) ||
        /\b(cook|bake|prepare|make)\b.*\b(grilled cheese|sandwich|meal|dish|recipe)\b/.test(text)
    ) {
        return 'checklist';
    }
    if (/\b(task|todo|to-do|owner|due date|assign)\b/.test(text)) {
        return 'tasks';
    }
    if (/\b(outline|agenda|sections|training outline)\b/.test(text)) {
        return 'outline';
    }
    if (/\b(source|citation|cite|unsupported|coverage)\b/.test(text)) {
        return 'source_coverage';
    }
    if (/\b(gap|missing|risk|question|review)\b/.test(text)) {
        return 'review_annotations';
    }
    if (/\b(relationship|connections|dependencies|knowledge graph)\b/.test(text)) {
        return 'knowledge_graph';
    }
    if (/\b(mind map|brainstorm|cluster|map out)\b/.test(text)) {
        return 'mind_map';
    }
    return 'graph_draft';
};

const viewForOutputShape = (shape, actionId) =>
    OUTPUT_SHAPE_VIEW[shape] || viewForAction(actionId || 'custom_prompt');

const shapeFromSession = (session, fallbackShape) => {
    const latestRevision = Array.isArray(session?.revisions) ? session.revisions.at(-1) : undefined;
    const artifactShape = Array.isArray(latestRevision?.generated_artifacts)
        ? latestRevision.generated_artifacts.find((artifact) => artifact?.artifact_type)?.artifact_type
        : '';
    return (
        session?.metadata?.output_shape ||
        latestRevision?.metadata?.output_shape ||
        artifactShape ||
        fallbackShape ||
        'graph_draft'
    );
};

const latestRevisionFromSession = (session = {}) =>
    Array.isArray(session?.revisions) ? session.revisions.at(-1) || {} : {};

const shouldPreferFallbackInitialSeed = ({ session, inferredShape }) => {
    if (!['checklist', 'tasks'].includes(inferredShape)) {
        return false;
    }
    const nodes = Array.isArray(latestRevisionFromSession(session).draft_nodes)
        ? latestRevisionFromSession(session).draft_nodes
        : [];
    if (!nodes.length) {
        return true;
    }
    const titles = nodes.map((node) => String(node?.title || '').trim().toLowerCase());
    const genericTitles = new Set(['breakdown', 'checks and assumptions', 'checks', 'assumptions']);
    const genericCount = titles.filter((title) => genericTitles.has(title)).length;
    const hasStepLikeNode = nodes.some((node) =>
        ['task', 'step'].includes(String(node?.node_type || node?.type || '').toLowerCase())
    );
    return genericCount >= 1 || (!hasStepLikeNode && nodes.length <= 3);
};

const isLocalFallbackDraftSession = (session) => {
    const candidate = session?.session_id
        ? session
        : session?.draft_session?.session_id
          ? session.draft_session
          : session?.session?.session_id
            ? session.session
            : session;
    const latestRevision = Array.isArray(candidate?.revisions)
        ? candidate.revisions[candidate.revisions.length - 1]
        : null;
    return (
        candidate?.metadata?.preview_mode === 'local_fallback' ||
        latestRevision?.metadata?.preview_mode === 'local_fallback'
    );
};

const messageFromGenerationError = (error, fallback = 'Unable to generate preview.') => {
    const rawDetail =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        error?.message ||
        fallback;
    if (typeof rawDetail === 'string') {
        return rawDetail;
    }
    try {
        return JSON.stringify(rawDetail);
    } catch (_error) {
        return fallback;
    }
};

const summarizeDraftRequestForDebug = (payload = {}) => ({
    role: payload.role || '',
    action: payload.action || '',
    model: payload.model || '',
    model_policy: payload.model_policy || null,
    scope: payload.scope || null,
    desired_outputs: payload.desired_outputs || [],
    prompt_length: String(payload.prompt || payload.custom_prompt || '').length,
    prompt_preview: String(payload.prompt || payload.custom_prompt || '').slice(0, 140),
    source_chunk_count: Array.isArray(payload.source_chunks) ? payload.source_chunks.length : 0,
    metadata: payload.metadata || {},
    workspace_brief_keys:
        payload.workspace_brief && typeof payload.workspace_brief === 'object'
            ? Object.keys(payload.workspace_brief).filter((key) => payload.workspace_brief[key])
            : []
});

const serializeResponseDetailForDebug = (detail) => {
    if (!detail) {
        return null;
    }
    if (typeof detail === 'string') {
        return detail;
    }
    try {
        return JSON.stringify(detail);
    } catch (_error) {
        return String(detail);
    }
};

const buildGenerationDebugSnapshot = ({
    endpoint,
    requestPayload,
    error,
    mode = 'request_failed'
}) => {
    const axiosSnapshot =
        typeof error?.toJSON === 'function'
            ? error.toJSON()
            : {};
    const request = error?.request || {};
    const response = error?.response || null;
    const hasHttpResponse = Boolean(response);
    const diagnosis = hasHttpResponse
        ? [
              'Backend returned an HTTP response. Check status and response_detail below.',
              response.status === 424 || response.status === 503
                  ? 'Likely model/API configuration is missing or unavailable.'
                  : 'Request reached the backend; inspect backend logs for this timestamp.'
          ]
        : [
              'No HTTP response reached the browser.',
              'Check that the backend is running on localhost:8000.',
              'If the backend is running, check browser console for CORS or mixed-content errors.',
              'Try opening http://localhost:8000/flows in a browser tab to confirm connectivity.'
          ];
    return {
        timestamp: new Date().toISOString(),
        mode,
        endpoint,
        resolved_endpoint:
            typeof window !== 'undefined' && endpoint
                ? new URL(endpoint, window.location.href).href
                : endpoint,
        browser_origin:
            typeof window !== 'undefined' ? window.location.origin : '',
        diagnosis,
        http: {
            status: response?.status || null,
            status_text: response?.statusText || '',
            response_detail: serializeResponseDetailForDebug(response?.data?.detail || response?.data)
        },
        axios: {
            name: error?.name || axiosSnapshot.name || '',
            message: error?.message || axiosSnapshot.message || '',
            code: error?.code || axiosSnapshot.code || '',
            is_axios_error: Boolean(error?.isAxiosError),
            method: error?.config?.method || axiosSnapshot.config?.method || 'post',
            url: error?.config?.url || axiosSnapshot.config?.url || endpoint,
            timeout: error?.config?.timeout || axiosSnapshot.config?.timeout || 0
        },
        request: {
            ready_state: request.readyState ?? null,
            status: request.status ?? null,
            status_text: request.statusText || '',
            response_url: request.responseURL || '',
            with_credentials: request.withCredentials ?? null
        },
        payload: summarizeDraftRequestForDebug(requestPayload)
    };
};

const decorateInitialSeedNode = (node, position, variant, layoutMode = 'vertical-children') => ({
    ...node,
    position,
    data: {
        ...(node.data || {}),
        display: {
            ...(node.data?.display || {}),
            layoutMode
        },
        metadata: {
            ...(node.data?.metadata || {}),
            initial_seed_visual: variant
        },
        data: {
            ...(node.data?.data || {}),
            metadata: {
                ...(node.data?.data?.metadata || {}),
                initial_seed_visual: variant
            }
        }
    }
});

const layoutHierarchyInitialSeedGraph = ({ nodes = [], edges = [] } = {}) => {
    if (!nodes.length) {
        return { nodes, edges };
    }

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const childMap = new Map();
    const incoming = new Set();
    edges.forEach((edge) => {
        if (!edge?.source || !edge?.target || !nodeById.has(edge.target)) {
            return;
        }
        incoming.add(edge.target);
        childMap.set(edge.source, [...(childMap.get(edge.source) || []), edge.target]);
    });

    const roots = nodes.filter((node) => !incoming.has(node.id));
    const root = roots[0] || nodes[0];
    const rowGap = 118;
    const columnGap = 420;
    const top = 90;
    const rootX = 150;
    const visitedHeights = new Map();
    const subtreeUnits = (nodeId, trail = new Set()) => {
        if (visitedHeights.has(nodeId)) {
            return visitedHeights.get(nodeId);
        }
        if (trail.has(nodeId)) {
            return 1;
        }
        const nextTrail = new Set(trail).add(nodeId);
        const children = (childMap.get(nodeId) || []).filter((childId) => nodeById.has(childId));
        const units = children.length
            ? children.reduce((total, childId) => total + subtreeUnits(childId, nextTrail), 0)
            : 1;
        visitedHeights.set(nodeId, Math.max(1, units));
        return visitedHeights.get(nodeId);
    };

    const totalUnits = subtreeUnits(root.id);
    const positioned = new Map();
    const placeChildren = (parentId, depth, startUnit, trail = new Set()) => {
        if (trail.has(parentId)) {
            return;
        }
        const nextTrail = new Set(trail).add(parentId);
        let cursor = startUnit;
        (childMap.get(parentId) || [])
            .filter((childId) => nodeById.has(childId))
            .forEach((childId) => {
                const units = subtreeUnits(childId);
                const centerUnit = cursor + (units - 1) / 2;
                positioned.set(childId, {
                    x: rootX + depth * columnGap,
                    y: top + centerUnit * rowGap
                });
                placeChildren(childId, depth + 1, cursor, nextTrail);
                cursor += units;
            });
    };

    positioned.set(root.id, { x: rootX, y: top });
    placeChildren(root.id, 1, 0);

    let overflowIndex = 0;
    const laidOutNodes = nodes.map((node) => {
        const position =
            positioned.get(node.id) ||
            {
                x: rootX + (overflowIndex % 3) * columnGap,
                y: top + (totalUnits + overflowIndex + 1) * rowGap
            };
        if (!positioned.has(node.id)) {
            overflowIndex += 1;
        }
        const depth = Math.max(0, Math.round(((position.x || rootX) - rootX) / columnGap));
        return decorateInitialSeedNode(
            node,
            position,
            'mind-map-depth',
            depth <= 1 ? 'balanced-map' : 'vertical-children'
        );
    });

    return { nodes: laidOutNodes, edges };
};

const layoutInitialSeedGraph = ({ nodes = [], edges = [], shape = '' } = {}) => {
    if (!nodes.length) {
        return { nodes, edges };
    }

    if (!['checklist', 'tasks'].includes(shape)) {
        return layoutHierarchyInitialSeedGraph({ nodes, edges });
    }

    const incoming = new Set(edges.map((edge) => edge.target));
    const root = nodes.find((node) => !incoming.has(node.id)) || nodes[0];
    const children = nodes.filter((node) => node.id !== root.id);
    const top = 90;
    const gap = 118;
    const rootY = top + Math.max(0, (children.length - 1) * gap) / 2;
    const laidOutNodes = [
        decorateInitialSeedNode(root, { x: 140, y: rootY }, 'checklist-root', 'compact-task-stack'),
        ...children.map((node, index) =>
            decorateInitialSeedNode(node, { x: 560, y: top + index * gap }, 'checklist-step', 'compact-task-stack')
        )
    ];
    const edgeByTarget = new Map(edges.map((edge) => [edge.target, edge]));
    const laidOutEdges = children.map((node) => {
        const existing = edgeByTarget.get(node.id);
        return {
            ...(existing || {}),
            id: existing?.id || `initial-seed-edge-${root.id}-${node.id}`,
            source: root.id,
            target: node.id,
            type: 'step',
            animated: false
        };
    });

    return { nodes: laidOutNodes, edges: laidOutEdges };
};

const nodeTypeForShape = (shape, actionId) => {
    if (shape === 'tasks' || shape === 'checklist' || actionId?.includes('task') || actionId?.includes('checklist')) {
        return 'task';
    }
    if (shape === 'flow_chart') {
        return 'workflow';
    }
    if (shape === 'review_annotations') {
        return 'question';
    }
    if (shape === 'sme_questions') {
        return 'question';
    }
    if (shape === 'implementation_handoff_package') {
        return 'task';
    }
    if (shape === 'table') {
        return 'reference';
    }
    return 'concept';
};

const routeForOutputShape = ({ outputShape, profiles, promptScope, fallbackRole, fallbackAction }) => {
    const route = OUTPUT_SHAPE_ROUTE[outputShape] || OUTPUT_SHAPE_ROUTE.graph_draft;
    const nextRole =
        profiles.find((profile) => profile.id === route.roleId) ||
        fallbackRole ||
        profiles[0];
    const roleActions = getActionsForProfileAndScope(nextRole, promptScope);
    const fallbackActionForRole = roleActions.find((action) => action.id === fallbackAction?.id);
    const shouldKeepSopAction =
        outputShape === 'outline' && fallbackActionForRole?.id === 'export_branch_as_sop_draft';
    const nextAction = shouldKeepSopAction
        ? fallbackActionForRole
        : roleActions.find((action) => action.id === route.actionId) ||
        roleActions.find((action) => action.id === 'custom_prompt') ||
        fallbackActionForRole ||
        roleActions[0];
    return { role: nextRole, action: nextAction };
};

const rootTitleFromPrompt = (prompt, fallbackTitle) => {
    const cleaned = String(prompt || '')
        .replace(/[?.!]+$/g, '')
        .trim();
    if (!cleaned) {
        return fallbackTitle;
    }
    const withoutLead = cleaned.replace(/^(how\s+to|how\s+do\s+i|make|create|build|turn\s+this\s+into)\s+/i, '');
    const title = withoutLead || cleaned;
    return title.replace(/^\w/, (letter) => letter.toUpperCase());
};

const topicFromCustomPrompt = (prompt) => {
    const cleaned = String(prompt || '')
        .replace(/\s+/g, ' ')
        .replace(/[?.!]+$/g, '')
        .trim()
        .replace(/^(please\s+)?(show|map|layout|lay out|create|build|draft|make|generate|outline)\s+(me\s+)?(a|an|the|typical\s+)?/i, '')
        .replace(/^(what\s+is|explain|describe)\s+(a|an|the\s+)?/i, '')
        .replace(/^(typical|standard|basic)\s+/i, '');
    return cleaned.replace(/\bsaas\b/gi, 'SaaS').slice(0, 96);
};

const normalizeCustomBranchDefinition = (branch) =>
    Array.isArray(branch)
        ? {
              title: branch[0],
              summary: branch[1],
              nodeType: branch[2],
              parentIndex: 0
          }
        : {
              title: branch.title,
              summary: branch.summary,
              nodeType: branch.nodeType || branch.node_type || 'concept',
              parentIndex: Number.isFinite(branch.parentIndex) ? branch.parentIndex : 0
          };

const customPromptDraftBranches = (prompt) => {
    const topic = topicFromCustomPrompt(prompt);
    return {
        rootTitle: rootTitleFromPrompt(prompt, topic || 'AI draft'),
        rootSummary: `Draft a reviewable structure for: ${String(prompt || topic).slice(0, 180)}`,
        branches: [
            ['Core components', `Break ${topic || 'the request'} into its main parts, decisions, and dependencies.`, 'category'],
            ['Workflow or sequence', 'Show the practical order of operations, handoffs, or lifecycle stages.', 'category'],
            ['Metrics and evidence', 'Identify the signals, examples, or source support needed to validate the draft.', 'reference'],
            ['Open questions', 'Flag assumptions, missing context, risks, and choices to confirm before accepting.', 'question']
        ]
    };
};

const fallbackChecklistSteps = (prompt) => {
    const lower = String(prompt || '').toLowerCase();
    if (/\b(commission|commissioning|punch\s*list|rfi|submittal|field\s*report|inspection)\b/.test(lower)) {
        return [
            'Confirm the scope, acceptance criteria, and source documents.',
            'Identify responsible parties, handoffs, and required approvals.',
            'Sequence the field or review steps in execution order.',
            'Capture evidence, exceptions, and open questions as review items.',
            'Assign owners, due dates, and closeout requirements.',
            'Validate completion against the workspace brief and cited sources.'
        ];
    }
    return [
        'Define the desired outcome.',
        'Gather the required materials and context.',
        'Prepare the workspace and sequence the steps.',
        'Complete the main procedure carefully.',
        'Review the result and adjust anything incomplete.'
    ];
};

const buildFallbackDraftGraph = ({
    shouldDraftNode,
    inferredShape,
    effectiveAction,
    targetLabel,
    targetNodeId,
    localPrompt,
    compactSuggestions,
    sourceRefs,
    selectedVisual
}) => {
    if (!shouldDraftNode) {
        return { draftNodes: [], draftEdges: [] };
    }

    const rootId = `draft-${Date.now()}`;
    const fallbackTitle =
        localPrompt
            ? rootTitleFromPrompt(localPrompt, localPrompt.slice(0, 96))
            : `${effectiveAction.label}: ${targetLabel}`;
    const fallbackSummary =
        effectiveAction.id === 'custom_prompt' && localPrompt
            ? `Draft a reviewable structure for: ${localPrompt.slice(0, 180)}`
            : localPrompt || compactSuggestions[0] || `${effectiveAction.label} draft for ${targetLabel}.`;
    const rootNode = {
        id: rootId,
        parent_id: targetNodeId || null,
        title: fallbackTitle,
        summary: fallbackSummary,
        node_type: nodeTypeForShape(inferredShape, effectiveAction.id),
        status: sourceRefs.length ? 'ai_generated' : 'needs_review',
        source_refs: sourceRefs,
        metadata: {
            output_shape: inferredShape,
            visual_mode: selectedVisual
        }
    };

    const customPlan =
        effectiveAction.id === 'custom_prompt' && localPrompt && !['checklist', 'tasks'].includes(inferredShape)
            ? customPromptDraftBranches(localPrompt)
            : null;
    if (customPlan) {
        const plannedRoot = {
            ...rootNode,
            title: customPlan.rootTitle,
            summary: customPlan.rootSummary
        };
        const branchDefinitions = customPlan.branches.map(normalizeCustomBranchDefinition);
        const branchNodes = branchDefinitions.map((branch, index) => {
            const parentId =
                branch.parentIndex > 0 && branch.parentIndex <= branchDefinitions.length
                    ? `${rootId}-branch-${branch.parentIndex}`
                    : rootId;
            return {
                id: `${rootId}-branch-${index + 1}`,
                parent_id: parentId,
                title: branch.title,
                summary: branch.summary,
                node_type: branch.nodeType,
                status: sourceRefs.length ? 'ai_generated' : 'needs_review',
                source_refs: sourceRefs,
                metadata: {
                    output_shape: inferredShape,
                    visual_mode: selectedVisual,
                    branch_index: index + 1
                }
            };
        });
        return {
            draftNodes: [plannedRoot, ...branchNodes],
            draftEdges: [
                ...(targetNodeId
                    ? [
                          {
                              id: `draft-edge-${targetNodeId}-${rootId}`,
                              source_node_id: targetNodeId,
                              target_node_id: rootId
                          }
                      ]
                    : []),
                ...branchNodes.map((node) => ({
                    id: `draft-edge-${rootId}-${node.id}`,
                    source_node_id: node.parent_id || rootId,
                    target_node_id: node.id
                }))
            ]
        };
    }

    if (targetNodeId || !['checklist', 'tasks'].includes(inferredShape)) {
        return {
            draftNodes: [rootNode],
            draftEdges: targetNodeId
                ? [
                      {
                          id: `draft-edge-${targetNodeId}-${rootId}`,
                          source_node_id: targetNodeId,
                          target_node_id: rootId
                      }
                  ]
                : []
        };
    }

    const stepNodes = fallbackChecklistSteps(localPrompt).map((step, index) => ({
        id: `${rootId}-step-${index + 1}`,
        parent_id: rootId,
        title: step,
        summary: step,
        node_type: inferredShape === 'tasks' ? 'task' : 'step',
        status: 'needs_review',
        source_refs: sourceRefs,
        metadata: {
            output_shape: inferredShape,
            visual_mode: selectedVisual,
            step_index: index + 1
        }
    }));

    return {
        draftNodes: [rootNode, ...stepNodes],
        draftEdges: stepNodes.map((node) => ({
            id: `draft-edge-${rootId}-${node.id}`,
            source_node_id: rootId,
            target_node_id: node.id
        }))
    };
};

const legacyAgents = [
    'Strategic Advisor',
    'Research Assistant',
    'Productivity Coach',
    'Data Interpreter',
    'Custom Prompts'
];

const actionsThatDraftNodes = new Set([
    'expand_this_node',
    'generate_child_nodes',
    'convert_to_checklist',
    'generate_tasks',
    'generate_checklist',
    'generate_training_outline',
    'export_branch_as_sop_draft',
    'custom_prompt'
]);

const AI_GENERATION_STAGES = [
    'Preparing request',
    'Selecting source context',
    'Choosing model',
    'Calling AI model',
    'Validating draft',
    'Building preview',
    'Saving starter graph'
];

const AI_GENERATION_STAGE_HELP = {
    'Preparing request': 'Packaging your prompt, scope, role, and requested output.',
    'Selecting source context': 'Collecting workspace nodes and selected source sections.',
    'Choosing model': 'Applying the model policy for this kind of draft.',
    'Calling AI model': 'Waiting for the model to produce structured draft JSON.',
    'Validating draft': 'Checking the draft contract, citations, and review flags.',
    'Building preview': 'Preparing the non-canonical preview before anything changes.',
    'Saving starter graph': 'Persisting the accepted starter graph.'
};

const sourceOrReviewActionIds = new Set([
    'ask_follow_up',
    'create_sme_questions',
    'find_missing_source_support',
    'find_unsupported_assumptions',
    'find_duplicate_overlapping_nodes',
    'find_gaps',
    'suggest_follow_up_questions',
    'summarize_branch'
]);

const looksLikeGenerativePrompt = (prompt = '') =>
    /\b(create|build|draft|generate|make|map|outline|plan|turn|convert|expand|workflow|flowchart|mind map|checklist|tasks?|branches?)\b/i.test(
        prompt
    );

const modelOptions = ['auto', ...supportedOpenAIModels];

const draftSessionEndpoint = ({ flowId }) =>
    `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions`;

const formatStageContextValue = (value, fallback = 'None') => {
    if (Array.isArray(value)) {
        return value.length ? value.join(', ') : fallback;
    }
    if (value === null || value === undefined || value === '') {
        return fallback;
    }
    return String(value);
};

const hasWorkspaceBriefContext = (brief = {}) =>
    Boolean(
        brief?.configured ||
            String(brief?.goal || '').trim() ||
            String(brief?.audience || '').trim() ||
            String(brief?.domain_context || '').trim() ||
            String(brief?.review_rules || '').trim() ||
            (Array.isArray(brief?.desired_outputs) &&
                brief.desired_outputs.some((output) => output !== 'mind_map'))
    );

const PromptModal = ({
    scope,
    nodeId,
    nodeIds = [],
    sourceId: propSourceId,
    source,
    sources = [],
    initialRoleId,
    initialActionId,
    initialPrompt = '',
    initialVisual = 'auto',
    initialPromptPlaceholder = '',
    initialContextSourceId = '',
    initialContextSourceIds = []
}) => {
    const selector = (state) => ({
        popNode: state.popNode,
        pushNode: state.pushNode,
        sourceId: state.sourceId
    });
    const { popNode, pushNode, sourceId } = modalStore(useShallow(selector));
    const storeSelector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        setActiveView: state.setActiveView,
        setSelectedBranchId: state.setSelectedBranchId,
        setGeneratedHelperPreview: state.setGeneratedHelperPreview,
        clearGeneratedHelperPreview: state.clearGeneratedHelperPreview,
        setActiveAIActionPreview: state.setActiveAIActionPreview,
        setActiveAIDraftSession: state.setActiveAIDraftSession,
        activeAIDraftSession: state.activeAIDraftSession,
        recordAIActionRun: state.recordAIActionRun,
        setInspectorNodeId: state.setInspectorNodeId,
        workspaceBrief: state.workspaceBrief,
        sourceLibrary: state.sourceLibrary
    });
    const {
        nodes,
        edges,
        setNodes,
        setEdges,
        setActiveView,
        setSelectedBranchId,
        setGeneratedHelperPreview,
        clearGeneratedHelperPreview,
        setActiveAIActionPreview,
        setActiveAIDraftSession,
        activeAIDraftSession,
        recordAIActionRun,
        setInspectorNodeId,
        workspaceBrief,
        sourceLibrary
    } = useStore(useShallow(storeSelector));
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const flowId = flowStore((state) => state.flow_id);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const targetSourceId = propSourceId || (scope === 'source' ? sourceId : undefined);
    const selectedNodeIds = Array.isArray(nodeIds) ? nodeIds.filter(Boolean) : [];
    const targetNodeId = scope === 'source' || scope === 'nodes' ? undefined : nodeId || sourceId;
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    const initialLegacyAgent = legacyAgents.includes(targetNode?.data?.prompt)
        ? targetNode.data.prompt
        : '';
    const [activeAgent, setActiveAgent] = useState(initialLegacyAgent);
    const [selectedModel, setSelectedModel] = useState(
        targetNode?.data?.model_name || (scope ? 'auto' : defaultOpenAIModel)
    );
    const [selectedRoleId, setSelectedRoleId] = useState(initialRoleId || '');
    const [selectedActionId, setSelectedActionId] = useState(initialActionId || '');
    const [selectedVisual, setSelectedVisual] = useState(initialVisual || 'auto');
    const [selectedContextSourceIds, setSelectedContextSourceIds] = useState(() =>
        Array.from(
            new Set([
                ...(Array.isArray(initialContextSourceIds) ? initialContextSourceIds : []),
                initialContextSourceId || ''
            ].filter(Boolean))
        )
    );
    const [customPrompt, setCustomPrompt] = useState(initialPrompt || '');
    const [stageMessage, setStageMessage] = useState('');
    const [generationStage, setGenerationStage] = useState('');
    const [stageContext, setStageContext] = useState([]);
    const [stageDebug, setStageDebug] = useState(null);
    const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
    const promptScope = scope === 'nodes' ? 'node' : scope || 'node';

    const isPreviewFlow = Boolean(scope);
    const targetData = targetNode ? getWorkspaceNodeData(targetNode) : {};
    const loadedSources = useMemo(
        () =>
            buildSourceLibraryProjection(nodes, edges, workspaceBrief, sourceLibrary).sources,
        [edges, nodes, sourceLibrary, workspaceBrief]
    );
    const selectedContextSources = loadedSources.filter((source) =>
        selectedContextSourceIds.includes(source.id)
    );
    const selectedSourcePayload =
        scope === 'source'
            ? Array.isArray(sources) && sources.length > 1
                ? buildSelectedSourcesDraftPayload(sources)
                : buildSelectedSourceDraftPayload(source || sources[0] || { id: targetSourceId })
            : selectedContextSources.length > 1
              ? buildSelectedSourcesDraftPayload(selectedContextSources)
              : selectedContextSources.length === 1
                ? buildSelectedSourceDraftPayload(selectedContextSources[0])
              : null;
    const targetLabel =
        selectedSourcePayload?.metadata?.selected_source_title ||
        (selectedSourcePayload?.metadata?.selected_source_count
            ? `${selectedSourcePayload.metadata.selected_source_count} selected sources`
            : '') ||
        targetData.title ||
        targetData.body ||
        (scope === 'nodes' && selectedNodeIds.length
            ? `${selectedNodeIds.length} selected nodes`
            : '') ||
        targetNodeId ||
        targetSourceId ||
        (scope === 'workspace' ? 'Whole workspace' : 'Selected scope');

    const profiles = useMemo(
        () => getPromptProfilesForScope(promptScope),
        [promptScope]
    );
    const role = useMemo(
        () =>
            profiles.find((profile) => profile.id === selectedRoleId) ||
            profiles[0],
        [profiles, selectedRoleId]
    );
    const actions = useMemo(
        () => getActionsForProfileAndScope(role, promptScope),
        [role, promptScope]
    );
    const selectedAction = useMemo(
        () =>
            actions.find((action) => action.id === selectedActionId) ||
            actions.find((action) => action.id === getDefaultActionForProfile(role, promptScope)) ||
            actions[0],
        [actions, role, promptScope, selectedActionId]
    );
    const suggestions = useMemo(
        () => getFollowUpSuggestions(role, selectedAction, targetLabel, promptScope),
        [role, promptScope, selectedAction, targetLabel]
    );
    const compactSuggestions = useMemo(() => suggestions.slice(0, 3), [suggestions]);
    const scopedStarterTransformations = useMemo(
        () =>
            starterTransformations.filter((starter) =>
                !Array.isArray(starter.scopes) || starter.scopes.includes(promptScope)
            ),
        [promptScope]
    );
    const scopeDisplayLabel =
        scope === 'workspace'
            ? 'Whole workspace'
            : scope === 'source'
              ? 'Selected source'
              : scope === 'nodes'
                ? 'Selected nodes'
                : scope === 'branch'
                  ? 'Selected branch'
                  : 'Selected node';
    const plannedRoute = useMemo(() => {
        if (!role || !selectedAction) {
            return {
                role,
                action: selectedAction,
                outputShape: selectedVisual,
                promptOverridesAction: false
            };
        }
        const localPrompt = customPrompt.trim();
        const outputShape =
            selectedVisual === 'auto'
                ? inferOutputShape(localPrompt, selectedAction.id)
                : selectedVisual;
        const promptOverridesAction =
            Boolean(localPrompt) &&
            sourceOrReviewActionIds.has(selectedAction.id) &&
            looksLikeGenerativePrompt(localPrompt);
        const shouldRouteForRequestedOutput =
            promptOverridesAction ||
            selectedVisual === 'auto' ||
            selectedVisual !== 'mind_map' ||
            (localPrompt && selectedAction.id !== 'custom_prompt');
        const route = shouldRouteForRequestedOutput
            ? routeForOutputShape({
                  outputShape: promptOverridesAction ? 'graph_draft' : outputShape,
                  profiles,
                  promptScope,
                  fallbackRole: role,
                  fallbackAction: selectedAction
              })
            : { role, action: selectedAction };
        return {
            role: route.role,
            action: route.action,
            outputShape,
            promptOverridesAction
        };
    }, [customPrompt, profiles, promptScope, role, selectedAction, selectedVisual]);
    const willSeedInitialGraph =
        scope === 'workspace' &&
        nodes.length === 0 &&
        selectedVisual !== 'no_visual' &&
        actionsThatDraftNodes.has(plannedRoute.action?.id);
    const contextUsedLabel = useMemo(() => {
        if (scope === 'source' || selectedContextSources.length) {
            return 'Selected source(s)';
        }
        const promptAsksForSources = /\b(source|sources|citation|cite|cited|evidence|document|ground|support|reference)\b/i.test(
            customPrompt
        );
        if (
            loadedSources.length &&
            (promptAsksForSources || sourceOrReviewActionIds.has(plannedRoute.action?.id || ''))
        ) {
            return 'Source library';
        }
        if (nodes.length || selectedNodeIds.length || targetNodeId) {
            return 'Workspace graph';
        }
        return 'No sources';
    }, [
        customPrompt,
        loadedSources.length,
        nodes.length,
        plannedRoute.action?.id,
        scope,
        selectedContextSources.length,
        selectedNodeIds.length,
        targetNodeId
    ]);

    const updateRole = (roleId) => {
        const nextRole = profiles.find((profile) => profile.id === roleId);
        setSelectedRoleId(roleId);
        setSelectedActionId(getDefaultActionForProfile(nextRole, promptScope));
    };

    const openSourcePicker = () => {
        pushNode(DataSourceSelect, {
            mode: 'ask_ai_context',
            returnModal: PromptModal,
            returnProps: {
                scope,
                nodeId,
                nodeIds,
                sourceId: propSourceId,
                source,
                sources,
                initialRoleId: selectedRoleId || role?.id,
                initialActionId: selectedAction?.id || selectedActionId,
                initialPrompt: customPrompt,
                initialVisual: selectedVisual,
                initialContextSourceIds: selectedContextSourceIds,
                initialContextSourceId: selectedContextSourceIds[0] || ''
            }
        });
    };

    const applyStarterTransformation = (starter) => {
        setCustomPrompt(starter.prompt);
        setSelectedVisual(starter.visual || 'auto');
        setSelectedRoleId(starter.roleId || selectedRoleId);
        setSelectedActionId(starter.actionId || selectedActionId);
        setStageMessage('');
        setStageDebug(null);
        setGenerationStage('');
    };

    const stagePreviewRequest = async () => {
        if (!role || !selectedAction || isGeneratingPreview) {
            return;
        }
        const localPrompt = customPrompt.trim();
        if (selectedVisual === 'auto' && !localPrompt) {
            setStageMessage('Ask a question or describe what you want AI to make.');
            setGenerationStage('');
            setStageDebug(null);
            return;
        }

        const {
            role: effectiveRole,
            action: effectiveAction,
            outputShape: inferredShape
        } = plannedRoute;

        if (effectiveAction.id === 'custom_prompt' && !localPrompt) {
            setStageMessage('Add a custom instruction before generating this preview.');
            setGenerationStage('');
            setStageDebug(null);
            return;
        }

        setIsGeneratingPreview(true);
        setGenerationStage('Preparing request');
        setStageMessage('');
        setStageContext([
            { label: 'Prompt', value: localPrompt || effectiveAction.label },
            { label: 'Role', value: effectiveRole.label },
            { label: 'Output', value: selectedVisual === 'auto' ? 'Auto' : selectedVisual }
        ]);
        setStageDebug(null);
        const childEdges = edges.filter((edge) => edge.source === targetNodeId);
        const sourceRefs =
            scope === 'source'
                ? selectedSourcePayload?.source_refs || []
                : targetData.sourceRefs || [];
        const shouldDraftNode = selectedVisual !== 'no_visual' && actionsThatDraftNodes.has(effectiveAction.id);
        const normalizedScope =
            scope === 'workspace'
                ? { type: 'workspace' }
                : scope === 'source'
                  ? selectedSourcePayload?.scope || { type: 'source', source_id: targetSourceId }
                  : scope === 'nodes'
                    ? { type: 'nodes', node_ids: selectedNodeIds }
                  : { type: scope || 'node', node_id: targetNodeId };
        const shouldSeedInitialGraph =
            scope === 'workspace' &&
            nodes.length === 0 &&
            shouldDraftNode &&
            selectedVisual !== 'no_visual';
        const promptText = localPrompt || effectiveAction.label;
        const changeIntent = inferAIDraftChangeIntent(
            promptText,
            activeAIDraftSession?.session_id ? 'update' : 'supplement'
        );
        const memoryContext = buildAIDraftMemoryContext({
            nodes,
            edges,
            scope: normalizedScope,
            sourceRefs,
            selectedSourcePayload,
            activeDraftSession: activeAIDraftSession,
            prompt: promptText,
            changeIntent,
            outputMode: shouldSeedInitialGraph ? 'initial_graph_seed' : 'draft_preview'
        });
        setStageContext([
            { label: 'Scope', value: normalizedScope.type },
            {
                label: 'Context',
                value:
                    normalizedScope.type === 'nodes'
                        ? `${selectedNodeIds.length} selected nodes`
                        : selectedSourcePayload?.metadata?.selected_source_count
                          ? `${selectedSourcePayload.metadata.selected_source_count} selected sources`
                          : selectedSourcePayload?.metadata?.selected_source_title ||
                            targetLabel
            },
            {
                label: 'Sources',
                value: selectedSourcePayload?.metadata?.selected_source_chunk_count
                    ? `${selectedSourcePayload.metadata.selected_source_chunk_count} sections`
                    : selectedContextSources.length
                      ? `${selectedContextSources.length} source${selectedContextSources.length === 1 ? '' : 's'}`
                      : 'Workspace graph only'
            }
        ]);
        const { draftNodes, draftEdges } = buildFallbackDraftGraph({
            shouldDraftNode,
            inferredShape,
            effectiveAction,
            targetLabel,
            targetNodeId,
            localPrompt,
            compactSuggestions,
            sourceRefs,
            selectedVisual
        });
        const draftAnnotations =
            effectiveAction.id === 'custom_prompt'
                ? []
                : compactSuggestions.map((suggestion, index) => ({
                      id: `suggestion-${index + 1}`,
                      type: 'follow_up_suggestion',
                      title: suggestion,
                      body: suggestion
                  }));
        const fallbackSession = createAIDraftSession({
            workspaceId: flowId || '',
            scope: normalizedScope,
            role: effectiveRole.label,
            intent: effectiveAction.id,
            prompt: promptText,
            draftNodes,
            draftEdges,
            draftAnnotations,
            modelPolicy: selectedModel === 'auto' ? 'balanced' : 'explicit',
            selectedModel: selectedModel === 'auto' ? 'auto' : selectedModel,
            modelReason:
                selectedModel === 'auto'
                    ? 'Backend unavailable; model would be selected by intent.'
                    : 'User selected the model explicitly.',
            metadata: {
                role_id: role.id,
                routed_role_id: effectiveRole.id,
                action_label: effectiveAction.label,
                output_shape: inferredShape,
                requested_visual: selectedVisual,
                preview_mode: 'local_fallback',
                change_intent: changeIntent,
                follow_up_memory: memoryContext,
                source_node_id:
                    scope === 'workspace' || scope === 'source' || scope === 'nodes'
                        ? null
                        : targetNodeId,
                source_context: selectedSourcePayload?.metadata
            }
        });
        const legacyPreview = {
            preview_id: fallbackSession.session_id,
            ai_action_id: fallbackSession.session_id,
            workspace_id: flowId || '',
            scope: normalizedScope,
            source_node_id:
                scope === 'workspace' || scope === 'source' || scope === 'nodes'
                    ? null
                    : targetNodeId,
            role: effectiveRole.label,
            role_id: effectiveRole.id,
            action: effectiveAction.id,
            action_label: effectiveAction.label,
            custom_prompt: localPrompt || null,
            input_node_ids:
                scope === 'branch'
                    ? [targetNodeId, ...childEdges.map((edge) => edge.target)]
                    : scope === 'nodes'
                      ? selectedNodeIds
                    : targetNodeId
                      ? [targetNodeId]
                      : [],
            draft_nodes: draftNodes,
            draft_edges: draftEdges,
            draft_annotations: draftAnnotations,
            validation_report: {
                status: 'not_run',
                message: 'Waiting for Agent A/C preview contract integration.'
            },
            source_refs: sourceRefs,
            assumptions: customPrompt.trim()
                ? [`User instruction: ${localPrompt}`]
                : [],
            metadata: {
                preview_mode: 'local_fallback',
                output_shape: inferredShape,
                requested_visual: selectedVisual,
                change_intent: changeIntent,
                follow_up_memory: memoryContext,
                model: selectedModel === 'auto' ? 'auto' : selectedModel,
                model_tier: selectedModel === 'auto' ? 'auto' : 'explicit',
                model_reason:
                    selectedModel === 'auto'
                        ? 'Backend unavailable; model would be selected by intent.'
                        : 'User selected the model explicitly.',
                source_context: selectedSourcePayload?.metadata
            }
        };
        const recordDraftSessionRun = ({ session, status, generatedNodeIds = [] }) => {
            const preview = session?.ai_action_run
                ? {
                      ai_action_run: session.ai_action_run,
                      workspace_id: flowId || '',
                      scope: normalizedScope
                  }
                : legacyPreview;
            recordAIActionRun(
                createAIActionRun({
                    preview,
                    status,
                    generatedNodeIds
                })
            );
        };

        const activateSession = (session) => {
            const nextSession = session?.session_id
                ? session
                : session?.draft_session?.session_id
                  ? session.draft_session
                  : session?.session?.session_id
                    ? session.session
                    : fallbackSession;
            setGeneratedHelperPreview('nodeAiActionRequest', legacyPreview);
            setActiveAIActionPreview(undefined);
            setActiveAIDraftSession(nextSession);
            if (scope === 'branch' || scope === 'node') {
                setSelectedBranchId(targetNodeId);
                setInspectorNodeId(targetNodeId);
            } else if (scope === 'workspace' || scope === 'source' || scope === 'nodes') {
                setSelectedBranchId(undefined);
                setInspectorNodeId(undefined);
            }
            recordDraftSessionRun({ session: nextSession, status: 'previewed' });
            const resolvedShape = shapeFromSession(nextSession, inferredShape);
            setActiveView(viewForOutputShape(resolvedShape, effectiveAction.id));
            recordActivity({
                type: 'ai_preview_requested',
                title: `${effectiveRole.label}: ${effectiveAction.label}`,
                summary: `Staged preview-first ${scope} AI action for ${targetLabel}.`,
                node_ids: targetNodeId ? [targetNodeId] : [],
                metadata: {
                    scope,
                    source_id: targetSourceId,
                    node_ids: selectedNodeIds,
                    role: effectiveRole.label,
                    action: effectiveAction.id,
                    visual: selectedVisual,
                    output_shape: resolvedShape,
                    model: selectedModel
                }
            });
            setGenerationStage('Building preview');
            setStageMessage('Draft session generated. Refine it in the drafting table before accepting.');
            window.setTimeout(() => popNode(), 150);
        };

        const seedInitialGraph = (session) => {
            const candidateSession = session?.session_id
                ? session
                : session?.draft_session?.session_id
                  ? session.draft_session
                  : session?.session?.session_id
                    ? session.session
                    : fallbackSession;
            if (isLocalFallbackDraftSession(candidateSession)) {
                setStageMessage('AI generation did not complete, so no starter canvas was created. Check the backend/model configuration and try again.');
                setStageDebug({
                    timestamp: new Date().toISOString(),
                    mode: 'blocked_local_fallback',
                    diagnosis: [
                        'The draft session was marked local_fallback.',
                        'Initial graph creation requires a real backend/model draft session.'
                    ],
                    session: {
                        session_id: candidateSession?.session_id || '',
                        metadata: candidateSession?.metadata || {},
                        revision_count: Array.isArray(candidateSession?.revisions)
                            ? candidateSession.revisions.length
                            : 0
                    }
                });
                return;
            }
            if (shouldPreferFallbackInitialSeed({
                session: candidateSession,
                inferredShape
            })) {
                setStageMessage('AI generation was too generic for an initial TraceSpace map, so no starter canvas was created. Try again after the model path is available.');
                setStageDebug({
                    timestamp: new Date().toISOString(),
                    mode: 'blocked_generic_initial_seed',
                    diagnosis: [
                        'The backend returned a draft, but it looked like a generic scaffold.',
                        'Initial graph creation now blocks generic scaffolds instead of accepting them.'
                    ],
                    session: {
                        session_id: candidateSession?.session_id || '',
                        selected_model: candidateSession?.selected_model || '',
                        metadata: candidateSession?.metadata || {},
                        node_titles:
                            candidateSession?.revisions?.[candidateSession.revisions.length - 1]?.draft_nodes?.map((node) => node.title).slice(0, 12) || []
                    }
                });
                return;
            }
            setGenerationStage('Building preview');
            const nextSession = candidateSession;
            const accepted = acceptAIDraftSession({
                session: nextSession,
                nodes: [],
                edges: [],
                mode: 'append'
            });
            recordDraftSessionRun({
                session: nextSession,
                status: 'accepted',
                generatedNodeIds: accepted.accept_result.accepted_node_ids
            });
            const laidOutGraph = layoutInitialSeedGraph({
                nodes: accepted.nodes,
                edges: accepted.edges,
                shape: inferredShape
            });
            setNodes(laidOutGraph.nodes);
            setEdges(laidOutGraph.edges);
            setActiveAIActionPreview(undefined);
            setActiveAIDraftSession(undefined);
            clearGeneratedHelperPreview('nodeAiActionRequest');
            setSelectedBranchId(undefined);
            setInspectorNodeId(undefined);
            const resolvedShape = shapeFromSession(nextSession, inferredShape);
            setActiveView(viewForOutputShape(resolvedShape, effectiveAction.id));
            setGenerationStage('Saving starter graph');
            if (flowId) {
                setSaveStatus('dirty');
                window.setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('docmap:save-workspace-now'));
                }, 50);
            }
            recordActivity({
                type: 'ai_initial_graph_seeded',
                title: `${effectiveRole.label}: Initial graph`,
                summary: `Created the initial ${viewForOutputShape(resolvedShape, effectiveAction.id)} canvas from Ask AI.`,
                node_ids: accepted.accept_result.accepted_node_ids,
                metadata: {
                    scope,
                    role: effectiveRole.label,
                    action: effectiveAction.id,
                    visual: selectedVisual,
                    output_shape: resolvedShape,
                    mode: 'initial_seed',
                    accepted_node_ids: accepted.accept_result.accepted_node_ids,
                    accepted_edge_ids: accepted.accept_result.accepted_edge_ids,
                    preview_diff: accepted.accept_result.preview_diff,
                    filters_changed: false,
                    model: selectedModel
                },
                status: 'completed'
            });
            setStageMessage('Initial graph created. You can now iterate directly on the canvas.');
            setStageDebug(null);
            window.setTimeout(() => popNode(), 150);
        };

        try {
            const endpoint = flowId ? draftSessionEndpoint({ flowId }) : '';
            setGenerationStage('Selecting source context');
            const requestPayload = buildAIDraftSessionRequestPayload({
                role: effectiveRole,
                action: effectiveAction,
                scope: normalizedScope,
                prompt: promptText,
                selectedModel,
                selectedSourcePayload,
                desiredOutputs: ['graph_draft', 'no_visual'].includes(inferredShape) ? [] : [inferredShape],
                workspaceBrief,
                memoryContext,
                changeIntent,
                metadata: {
                    requested_visual: selectedVisual,
                    output_shape: inferredShape,
                    routed_role_id: effectiveRole.id,
                    routed_action_id: effectiveAction.id,
                    change_intent: changeIntent,
                    follow_up_memory: memoryContext
                }
            });
            setGenerationStage('Choosing model');
            setStageContext([
                { label: 'Model policy', value: selectedModel === 'auto' ? 'Auto by intent' : 'Explicit model' },
                { label: 'Requested model', value: selectedModel === 'auto' ? 'Auto' : selectedModel },
                { label: 'Preview mode', value: shouldSeedInitialGraph ? 'Initial graph' : 'Draft preview' }
            ]);
            setGenerationStage('Calling AI model');
            const response = endpoint
                ? await axios.post(endpoint, requestPayload)
                : null;
            setGenerationStage('Validating draft');
            if (shouldSeedInitialGraph) {
                if (!response?.data) {
                    setStageMessage('AI generation did not return a draft session, so no starter canvas was created.');
                    setStageDebug({
                        timestamp: new Date().toISOString(),
                        mode: 'empty_response',
                        endpoint,
                        diagnosis: ['The request completed, but no draft session was returned.'],
                        payload: summarizeDraftRequestForDebug(requestPayload)
                    });
                    return;
                }
                seedInitialGraph(response.data);
            } else {
                activateSession(response?.data || fallbackSession);
            }
        } catch (error) {
            const detail = messageFromGenerationError(error);
            const endpoint = flowId ? draftSessionEndpoint({ flowId }) : '';
            setGenerationStage('Validating draft');
            const requestPayload = buildAIDraftSessionRequestPayload({
                role: effectiveRole,
                action: effectiveAction,
                scope: normalizedScope,
                prompt: promptText,
                selectedModel,
                selectedSourcePayload,
                desiredOutputs: ['graph_draft', 'no_visual'].includes(inferredShape) ? [] : [inferredShape],
                workspaceBrief,
                memoryContext,
                changeIntent,
                metadata: {
                    requested_visual: selectedVisual,
                    output_shape: inferredShape,
                    routed_role_id: effectiveRole.id,
                    routed_action_id: effectiveAction.id,
                    change_intent: changeIntent,
                    follow_up_memory: memoryContext
                }
            });
            setStageDebug(buildGenerationDebugSnapshot({
                endpoint,
                requestPayload,
                error,
                mode: shouldSeedInitialGraph ? 'initial_seed_failed' : 'preview_failed'
            }));
            if (shouldSeedInitialGraph) {
                setStageMessage(`AI generation failed; no starter canvas was created. ${detail}`);
                return;
            }
            const fallbackWithWarning = {
                ...fallbackSession,
                warnings: [String(detail)],
                revisions: fallbackSession.revisions.map((revision) => ({
                    ...revision,
                    validation_report: {
                        ...revision.validation_report,
                        status: 'fallback',
                        message: 'Backend draft session was unavailable; staged a local draft.'
                    }
                })),
                metadata: {
                    ...fallbackSession.metadata,
                    backend_warning: String(detail)
                }
            };
            activateSession(fallbackWithWarning);
        } finally {
            setIsGeneratingPreview(false);
        }
    };

    if (!isPreviewFlow) {
        return (
            <div className="modal-container prompts-selection">
                <div className="title">
                    <div>
                        <img src={PROMPTSvg} alt="Prompts Svg" />
                        <p>Legacy Personas</p>
                    </div>
                    <img src={CROSSSvg} alt="Cross Svg" onClick={() => popNode()} />
                </div>
                <div className="legacy-prompt-banner">
                    Legacy data-source flow is read-only. Use Ask AI on a node, branch,
                    or workspace to route an intent through the right preview-first role.
                </div>
                <div className="prompt-model-selector">
                    <label htmlFor="model-select">OpenAI model</label>
                    <select
                        id="model-select"
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                    >
                        {modelOptions.map((modelName) => (
                            <option key={modelName} value={modelName}>
                                {modelName === 'auto'
                                    ? 'Auto select by intent'
                                    : modelName}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="legacy-persona-strip">
                    {legacyPersonaNames.map((name) => (
                        <span key={name}>{name}</span>
                    ))}
                </div>
                <div className="prompts">
                    {legacyAgents.map((agentName) => (
                        <Prompts
                            key={agentName}
                            agentName={agentName}
                            activeAgent={activeAgent}
                            setActiveAgent={setActiveAgent}
                            id={sourceId}
                            selectedModel={selectedModel}
                        />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="modal-container prompts-selection ai-action-modal">
            <div className="title">
                <div>
                    <img src={PROMPTSvg} alt="Prompts Svg" />
                    <p>Ask AI</p>
                </div>
                <img src={CROSSSvg} alt="Cross Svg" onClick={() => popNode()} />
            </div>
            <div className="ai-action-scope">
                <span>{scopeDisplayLabel}</span>
                <strong>{targetLabel}</strong>
            </div>
            <div className="ai-action-brief-context">
                <span>Workspace brief</span>
                <strong>
                    {hasWorkspaceBriefContext(workspaceBrief)
                        ? workspaceBrief.goal || workspaceBrief.domain_context || 'Brief configured'
                        : 'No brief configured'}
                </strong>
                {hasWorkspaceBriefContext(workspaceBrief) ? (
                    <small>
                        Ask AI will use this as the project foundation; your question refines this run.
                    </small>
                ) : (
                    <small>
                        Add a brief when you want project-level goals, audience, output style, and review rules.
                    </small>
                )}
            </div>
            <div className="ai-action-source-context">
                <div>
                    <span>Source context</span>
                    <strong>
                        {scope === 'source'
                            ? targetLabel
                            : selectedContextSources.length > 1
                              ? `${selectedContextSources.length} sources selected`
                              : selectedContextSources.length === 1
                                ? selectedContextSources[0].title || selectedContextSources[0].id
                              : loadedSources.length
                                ? `${loadedSources.length} loaded source${loadedSources.length === 1 ? '' : 's'} available`
                                : 'No source attached'}
                    </strong>
                </div>
                {scope === 'source' ? null : (
                    <div className="ai-action-source-summary">
                        {selectedContextSources.length
                            ? selectedContextSources.slice(0, 2).map((selectedSource) => (
                                  <span key={selectedSource.id}>
                                      {selectedSource.title || selectedSource.id}
                                  </span>
                              ))
                            : <span>Whole workspace context</span>}
                        {selectedContextSources.length > 2 ? (
                            <span>+{selectedContextSources.length - 2} more</span>
                        ) : null}
                    </div>
                )}
                <button type="button" onClick={openSourcePicker}>
                    Manage sources
                </button>
            </div>
            <div className="ai-action-request-summary">
                <div>
                    <span>Context used</span>
                    <strong>{contextUsedLabel}</strong>
                </div>
                <div>
                    <span>Routed as</span>
                    <strong>
                        {plannedRoute.role?.label || 'Select a role'} / {plannedRoute.action?.label || 'Select an action'}
                    </strong>
                </div>
                {plannedRoute.promptOverridesAction ? (
                    <small>
                        Your prompt looks generative, so this will run as Workflow Mapper / Custom prompt.
                    </small>
                ) : null}
            </div>
            <div className="ai-action-starter-library">
                <div>
                    <strong>Starter transformations</strong>
                    <span>{scopedStarterTransformations.length} ready prompts</span>
                </div>
                <div className="ai-action-starter-grid">
                    {scopedStarterTransformations.map((starter) => (
                        <button
                            type="button"
                            key={starter.id}
                            onClick={() => applyStarterTransformation(starter)}
                            className={customPrompt === starter.prompt ? 'selected' : ''}
                        >
                            <strong>{starter.label}</strong>
                            <small>{starter.description}</small>
                        </button>
                    ))}
                </div>
            </div>
            <div className="ai-action-natural">
                <label>
                    Ask anything
                    <textarea
                        value={customPrompt}
                        onChange={(event) => setCustomPrompt(event.target.value)}
                        placeholder={
                            initialPromptPlaceholder ||
                            'Example: turn this commissioning plan into a task-ready workflow.'
                        }
                    />
                </label>
                <label>
                    Visual
                    <select
                        value={selectedVisual}
                        onChange={(event) => setSelectedVisual(event.target.value)}
                    >
                        {VISUAL_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <details className="ai-action-advanced">
                <summary>Advanced routing</summary>
                {role ? (
                    <p className="ai-action-description">{role.description}</p>
                ) : null}
                <div className="ai-action-grid">
                    <label>
                        Role hint
                        <select
                            value={role?.id || ''}
                            onChange={(event) => updateRole(event.target.value)}
                        >
                            {profiles.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                    {profile.group}: {profile.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Action hint
                        <select
                            value={selectedAction?.id || ''}
                            onChange={(event) => setSelectedActionId(event.target.value)}
                        >
                            {actions.map((action) => (
                                <option key={action.id} value={action.id}>
                                    {action.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <label className="ai-action-model-policy">
                    Model
                    <select
                        value={selectedModel}
                        onChange={(event) => setSelectedModel(event.target.value)}
                    >
                        {modelOptions.map((modelName) => (
                            <option key={modelName} value={modelName}>
                                {modelName === 'auto'
                                    ? 'Auto select'
                                    : modelName}
                            </option>
                        ))}
                    </select>
                </label>
            </details>
            <div className="ai-action-suggestions">
                <div>
                    <strong>Quick refinements</strong>
                </div>
                {compactSuggestions.map((suggestion) => (
                    <button
                        type="button"
                        key={suggestion}
                        onClick={() => setCustomPrompt(suggestion)}
                    >
                        {suggestion}
                    </button>
                ))}
            </div>
            {stageMessage ? (
                <div className="ai-action-stage-message">{stageMessage}</div>
            ) : null}
            {isGeneratingPreview ? (
                <div className="ai-action-stage-card" aria-label="AI generation progress">
                    <div className="ai-action-stage-now">
                        <span>{generationStage || 'Preparing request'}</span>
                        <strong>
                            {AI_GENERATION_STAGE_HELP[generationStage] ||
                                'Preparing the AI draft workflow.'}
                        </strong>
                    </div>
                    <div className="ai-action-stage-progress">
                        {AI_GENERATION_STAGES.map((stage) => {
                            const currentIndex = AI_GENERATION_STAGES.indexOf(generationStage);
                            const stageIndex = AI_GENERATION_STAGES.indexOf(stage);
                            const stageState =
                                stageIndex < currentIndex
                                    ? 'complete'
                                    : stage === generationStage
                                      ? 'active'
                                      : 'pending';
                            return (
                                <span key={stage} className={`ai-action-stage-${stageState}`}>
                                    {stage}
                                </span>
                            );
                        })}
                    </div>
                    {stageContext.length ? (
                        <div className="ai-action-stage-context">
                            {stageContext.map((item) => (
                                <div key={`${item.label}-${item.value}`}>
                                    <span>{item.label}</span>
                                    <strong>{formatStageContextValue(item.value)}</strong>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}
            {stageDebug ? (
                <details className="ai-action-debug" open>
                    <summary>Generation debug</summary>
                    <pre>{JSON.stringify(stageDebug, null, 2)}</pre>
                </details>
            ) : null}
            <div className="ai-action-footer">
                <button type="button" className="secondary" onClick={() => popNode()}>
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={stagePreviewRequest}
                    disabled={isGeneratingPreview}
                >
                    {isGeneratingPreview
                        ? generationStage || 'Preparing request'
                        : willSeedInitialGraph
                          ? 'Create initial graph'
                          : 'Preview changes'}
                </button>
            </div>
        </div>
    );
};

export default PromptModal;
