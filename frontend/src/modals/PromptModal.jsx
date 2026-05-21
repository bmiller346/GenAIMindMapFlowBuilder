import PROMPTSvg from "../assets/prompt.svg";
import CROSSSvg from "../assets/cross.svg";
import Prompts from "../global-components/Prompts";
import DataSourceSelect from "../global-components/DataSourceSelect";
import { useMemo, useRef, useState } from "react";
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
    buildAIDraftMemoryContext,
    buildAIDraftSessionRequestPayload,
    buildSelectedSourceDraftPayload,
    buildSelectedSourcesDraftPayload,
    createAIDraftSession,
    inferAIDraftChangeIntent,
    inferAIDraftEvidencePreferences,
    inferAIDraftExpansionPreferences,
    normalizeAIDraftCitationPolicy,
    normalizeAIDraftEvidenceMode,
    normalizeAIDraftExpansionTarget
} from "../utils/aiDraftSessions";
import { createAIActionRun } from "../utils/aiActionRuns";
import { buildSourceLibraryProjection, WORKSPACE_BRIEF_SOURCE_ID } from "../views/graphProjection";
import { ASK_AI_GENERATION_PROGRESS_EVENT } from "../utils/askAiGenerationProgress";
import { buildLocalGuidedFallbackDraft, isSankeyDraftRequest } from "../utils/localSankeyDraft";
import {
    desiredOutputsForPrompt,
    inferOutputShape,
    routeForOutputShape,
    viewForOutputShape as viewForOutputShapeRoute
} from "../utils/promptRouting";
import {
    STARTER_GROUPS,
    VISUAL_OPTIONS,
    sortStarterRecipes,
    starterGroupId,
    starterSurfaceLabel,
    visualLabel
} from "../utils/promptStarterRecipes";

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

const EXPANSION_TARGET_OPTIONS = [
    {
        id: 'selected_node',
        label: 'Selected node',
        scopes: ['node', 'branch', 'nodes', 'workspace', 'source']
    },
    {
        id: 'existing_children',
        label: 'Existing children',
        scopes: ['node', 'branch']
    },
    {
        id: 'leaves',
        label: 'Branch leaves',
        scopes: ['branch']
    },
    {
        id: 'whole_branch',
        label: 'Whole branch',
        scopes: ['branch']
    }
];

const defaultExpansionTargetForScope = (scope = '') =>
    scope === 'branch' ? 'leaves' : 'selected_node';

const expansionTargetLabel = (target = '') =>
    EXPANSION_TARGET_OPTIONS.find((option) => option.id === target)?.label || 'Selected node';

const expansionTargetSummary = (target = '') => ({
    existing_children: 'Existing child anchors',
    leaves: 'Branch leaf anchors',
    whole_branch: 'Whole branch anchors',
    selected_node: 'Selected node anchor'
}[target] || 'Selected node anchor');

const EVIDENCE_MODE_OPTIONS = [
    { id: 'workspace', label: 'Workspace only' },
    { id: 'uploaded_sources', label: 'Uploaded sources' },
    { id: 'general_knowledge', label: 'General knowledge' },
    { id: 'web_sources', label: 'Web/current sources' },
    { id: 'sharepoint', label: 'SharePoint/internal' }
];

const CITATION_POLICY_OPTIONS = [
    { id: 'required', label: 'Required' },
    { id: 'preferred', label: 'Preferred' },
    { id: 'not_required', label: 'Not required' }
];

const evidenceModeLabel = (mode = '') =>
    EVIDENCE_MODE_OPTIONS.find((option) => option.id === mode)?.label || 'Workspace only';

const citationPolicyLabel = (policy = '') =>
    CITATION_POLICY_OPTIONS.find((option) => option.id === policy)?.label || 'Preferred';

const viewForOutputShape = (shape, actionId) =>
    viewForOutputShapeRoute(shape, actionId, viewForAction);

const MAP_REVIEW_SCOPES = new Set(['workspace', 'source', 'nodes']);
const MAP_CANVAS_VIEWS = new Set(['mindmap', 'knowledgeGraph']);
const STRUCTURED_REVIEW_VIEWS = new Set(['flowchart', 'outline', 'executive', 'tasks', 'kanban', 'table']);
const CANVAS_REVIEW_VIEWS = new Set(['mindmap', 'knowledgeGraph', 'flowchart', 'outline', 'executive', 'tasks', 'kanban', 'table']);

const mapFallbackCanvas = (fallback) =>
    MAP_CANVAS_VIEWS.has(fallback) ? fallback : 'mindmap';

const viewForDraftReview = ({ scopeType, requestedView, activeCanvasView }) => {
    if (!MAP_REVIEW_SCOPES.has(scopeType)) {
        return requestedView;
    }
    if (STRUCTURED_REVIEW_VIEWS.has(requestedView)) {
        return mapFallbackCanvas(activeCanvasView);
    }
    if (CANVAS_REVIEW_VIEWS.has(requestedView)) {
        return requestedView;
    }
    return mapFallbackCanvas(activeCanvasView);
};

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
    if (shape === 'executive_summary' || shape === 'executive_output') {
        return 'reference';
    }
    if (shape === 'news_article' || shape === 'newsletter') {
        return 'reference';
    }
    if (shape === 'table') {
        return 'reference';
    }
    return 'concept';
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
    'Building preview'
];

const AI_GENERATION_STAGE_HELP = {
    'Preparing request': 'Packaging your prompt, scope, role, and requested output.',
    'Selecting source context': 'Collecting workspace nodes and selected source sections.',
    'Choosing model': 'Applying the model policy for this kind of draft.',
    'Calling AI model': 'Waiting for the model to produce structured draft JSON.',
    'Validating draft': 'Checking the draft contract, citations, and review flags.',
    'Building preview': 'Preparing the non-canonical preview before anything changes.'
};

const AI_MODEL_WAIT_UPDATES = [
    'Still waiting on the model response. The draft will stay staged until you review it.',
    'Keeping the request open while the provider builds the structured draft.',
    'No canvas changes have been applied. This is still a preview-first run.',
    'The model call can take longer with source sections or larger workspace context.'
];

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
    initialExpansionMode = 'exploratory',
    initialExpansionTarget = '',
    initialEvidenceMode = '',
    initialCitationPolicy = '',
    initialChangeIntent = '',
    initialSourceRefs = [],
    initialPromptPlaceholder = '',
    initialContextSourceId = '',
    initialContextSourceIds,
    onGenerationProgress
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
        activeCanvasView: state.activeCanvasView,
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
        activeCanvasView,
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
    const [selectedExpansionMode, setSelectedExpansionMode] = useState(initialExpansionMode || 'exploratory');
    const [selectedExpansionTarget, setSelectedExpansionTarget] = useState(
        normalizeAIDraftExpansionTarget(
            initialExpansionTarget || defaultExpansionTargetForScope(scope)
        )
    );
    const [selectedEvidenceMode, setSelectedEvidenceMode] = useState(
        normalizeAIDraftEvidenceMode(
            initialEvidenceMode || (scope === 'source' ? 'uploaded_sources' : 'workspace')
        )
    );
    const [selectedCitationPolicy, setSelectedCitationPolicy] = useState(
        normalizeAIDraftCitationPolicy(
            initialCitationPolicy || (scope === 'source' ? 'required' : 'preferred')
        )
    );
    const [selectedContextSourceIds, setSelectedContextSourceIds] = useState(() => {
        const hasExplicitContextSelection = Array.isArray(initialContextSourceIds);
        const defaultContextSourceIds =
            !hasExplicitContextSelection && !initialContextSourceId && hasWorkspaceBriefContext(workspaceBrief)
                ? [WORKSPACE_BRIEF_SOURCE_ID]
                : [];
        return Array.from(
            new Set([
                ...defaultContextSourceIds,
                ...(Array.isArray(initialContextSourceIds) ? initialContextSourceIds : []),
                initialContextSourceId || ''
            ].filter(Boolean))
        );
    });
    const [customPrompt, setCustomPrompt] = useState(initialPrompt || '');
    const [stageMessage, setStageMessage] = useState('');
    const [generationStage, setGenerationStage] = useState('');
    const [generationStageDetail, setGenerationStageDetail] = useState('');
    const [stageEvents, setStageEvents] = useState([]);
    const [stageContext, setStageContext] = useState([]);
    const [stageDebug, setStageDebug] = useState(null);
    const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
    const stageEventCounter = useRef(0);
    const isFormDismissedRef = useRef(false);
    const modelWaitIntervalRef = useRef(null);
    const progressSnapshotRef = useRef({ events: [] });
    const didManuallySetExpansionModeRef = useRef(false);
    const didManuallySetExpansionTargetRef = useRef(Boolean(initialExpansionTarget));
    const didManuallySetEvidenceModeRef = useRef(Boolean(initialEvidenceMode));
    const didManuallySetCitationPolicyRef = useRef(Boolean(initialCitationPolicy));
    const promptScope = scope === 'nodes' ? 'node' : scope || 'node';

    const isPreviewFlow = Boolean(scope);
    const targetData = targetNode ? getWorkspaceNodeData(targetNode) : {};
    const loadedSources = useMemo(
        () =>
            buildSourceLibraryProjection(nodes, edges, workspaceBrief, sourceLibrary, {
                includeWorkspaceBriefSource: true
            }).sources,
        [edges, nodes, sourceLibrary, workspaceBrief]
    );
    const selectedContextSources = loadedSources.filter((source) =>
        selectedContextSourceIds.includes(source.id)
    );
    const adHocSourceRefs = Array.isArray(initialSourceRefs)
        ? initialSourceRefs.filter((ref) => ref && typeof ref === 'object')
        : [];
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
    const shouldUseWorkspaceBrief =
        scope === 'source' ||
        selectedContextSourceIds.includes(WORKSPACE_BRIEF_SOURCE_ID);
    const effectiveWorkspaceBrief = shouldUseWorkspaceBrief ? workspaceBrief : {};
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
    const expansionTargetOptions = useMemo(() => {
        const options = EXPANSION_TARGET_OPTIONS.filter((option) =>
            option.scopes.includes(promptScope)
        );
        return options.length ? options : EXPANSION_TARGET_OPTIONS.slice(0, 1);
    }, [promptScope]);
    const expansionPlanLabel = `${selectedExpansionMode === 'strict' ? 'Strict' : 'Exploratory'} / ${expansionTargetLabel(selectedExpansionTarget)}`;
    const evidencePlanLabel = `${evidenceModeLabel(selectedEvidenceMode)} / ${citationPolicyLabel(selectedCitationPolicy)}`;
    const scopedStarterTransformations = useMemo(
        () =>
            starterTransformations.filter((starter) =>
                !Array.isArray(starter.scopes) || starter.scopes.includes(promptScope)
            ),
        [promptScope]
    );
    const groupedStarterTransformations = useMemo(
        () =>
            STARTER_GROUPS.map((group) => ({
                ...group,
                starters: sortStarterRecipes(
                    scopedStarterTransformations.filter(
                        (starter) => starterGroupId(starter) === group.id
                    )
                )
            })).filter((group) => group.starters.length > 0),
        [scopedStarterTransformations]
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
    const plannedDesiredOutputs = useMemo(
        () =>
            desiredOutputsForPrompt({
                inferredShape: plannedRoute.outputShape,
                prompt: customPrompt.trim()
            }),
        [customPrompt, plannedRoute.outputShape]
    );
    const isConnectedPackagePlanned = plannedDesiredOutputs.includes('connected_picture_package');
    const resolvedOutputLabel = isConnectedPackagePlanned
        ? selectedVisual === 'connected_picture_package'
            ? 'Connected package'
            : 'Auto -> connected package'
        : selectedVisual === 'auto'
          ? `Auto -> ${visualLabel(plannedRoute.outputShape)}`
          : visualLabel(selectedVisual);
    const suggestions = useMemo(
        () => getFollowUpSuggestions(plannedRoute.role || role, plannedRoute.action || selectedAction, targetLabel, promptScope),
        [plannedRoute.role, plannedRoute.action, role, promptScope, selectedAction, targetLabel]
    );
    const compactSuggestions = useMemo(() => suggestions.slice(0, 3), [suggestions]);
    const willSeedInitialGraph =
        scope === 'workspace' &&
        nodes.length === 0 &&
        !isConnectedPackagePlanned &&
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

    const emitGenerationProgress = (snapshot) => {
        if (!snapshot?.requestId) {
            return;
        }
        if (typeof onGenerationProgress === 'function') {
            try {
                onGenerationProgress(snapshot);
            } catch (error) {
                console.warn('Ask AI progress callback failed', error);
            }
        }
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(
                new CustomEvent(ASK_AI_GENERATION_PROGRESS_EVENT, {
                    detail: snapshot
                })
            );
        }
    };

    const publishGenerationProgress = (updates = {}) => {
        const nextSnapshot = {
            ...progressSnapshotRef.current,
            ...updates,
            updatedAt: new Date().toISOString()
        };
        progressSnapshotRef.current = nextSnapshot;
        emitGenerationProgress(nextSnapshot);
        return nextSnapshot;
    };

    const updateStageContext = (context) => {
        if (!isFormDismissedRef.current) {
            setStageContext(context);
        }
        publishGenerationProgress({ context });
    };

    const updateStageMessage = (message, status) => {
        if (!isFormDismissedRef.current) {
            setStageMessage(message);
        }
        publishGenerationProgress({ message, status: status || progressSnapshotRef.current.status });
    };

    const updateStageDebug = (debug) => {
        if (!isFormDismissedRef.current) {
            setStageDebug(debug);
        }
        publishGenerationProgress({ debug });
    };

    const updateGenerationProgress = (stage, detail, updates = {}) => {
        stageEventCounter.current += 1;
        const nextDetail = detail || AI_GENERATION_STAGE_HELP[stage] || 'Working on the AI draft workflow.';
        const nextEvents = [
            {
                id: `${stageEventCounter.current}-${stage}`,
                stage,
                detail: nextDetail
            },
            ...(progressSnapshotRef.current.events || [])
        ].slice(0, 5);
        if (!isFormDismissedRef.current) {
            setGenerationStage(stage);
            setGenerationStageDetail(nextDetail);
            setStageEvents(nextEvents);
        }
        publishGenerationProgress({
            status: 'running',
            ...updates,
            stage,
            detail: nextDetail,
            events: nextEvents
        });
    };

    const stopModelWaitProgressUpdates = () => {
        if (modelWaitIntervalRef.current && typeof window !== 'undefined') {
            window.clearInterval(modelWaitIntervalRef.current);
        }
        modelWaitIntervalRef.current = null;
    };

    const startModelWaitProgressUpdates = () => {
        stopModelWaitProgressUpdates();
        if (typeof window === 'undefined') {
            return;
        }
        let updateIndex = 0;
        modelWaitIntervalRef.current = window.setInterval(() => {
            const detail = AI_MODEL_WAIT_UPDATES[updateIndex % AI_MODEL_WAIT_UPDATES.length];
            updateGenerationProgress('Calling AI model', detail);
            updateIndex += 1;
        }, 4500);
    };

    const acceptGenerationRequest = ({
        effectiveRole,
        effectiveAction,
        inferredShape,
        normalizedScope,
        promptText,
        shouldSeedInitialGraph
    }) => {
        const startedAt = new Date().toISOString();
        const requestedView = viewForOutputShape(inferredShape, effectiveAction.id);
        const reviewView = viewForDraftReview({
            scopeType: normalizedScope.type,
            requestedView,
            activeCanvasView
        });
        if (reviewView !== activeCanvasView) {
            setActiveView(reviewView);
        }
        publishGenerationProgress({
            requestId: `ask-ai-${startedAt}-${stageEventCounter.current}`,
            status: 'accepted',
            startedAt,
            source: 'PromptModal',
            scope: normalizedScope,
            prompt: promptText,
            role: {
                id: effectiveRole.id,
                label: effectiveRole.label
            },
            action: {
                id: effectiveAction.id,
                label: effectiveAction.label
            },
            target: {
                label: targetLabel,
                nodeId: targetNodeId || null,
                sourceId: targetSourceId || null,
                nodeIds: selectedNodeIds
            },
            outputShape: inferredShape,
            requestedVisual: selectedVisual,
            selectedModel,
            previewMode: shouldSeedInitialGraph ? 'initial_graph_seed' : 'draft_preview',
            message: STRUCTURED_REVIEW_VIEWS.has(requestedView)
                ? 'Ask AI request accepted. Returning to the map while the draft is generated for review.'
                : 'Ask AI request accepted. Generation is continuing in the background.'
        });
        isFormDismissedRef.current = true;
        popNode();
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
                initialExpansionMode: selectedExpansionMode,
                initialExpansionTarget: selectedExpansionTarget,
                initialEvidenceMode: selectedEvidenceMode,
                initialCitationPolicy: selectedCitationPolicy,
                initialChangeIntent,
                initialSourceRefs: adHocSourceRefs,
                initialContextSourceIds: selectedContextSourceIds,
                initialContextSourceId: selectedContextSourceIds[0] || '',
                onGenerationProgress
            }
        });
    };

    const applyStarterTransformation = (starter) => {
        setCustomPrompt(starter.prompt);
        setSelectedVisual(starter.visual || 'auto');
        didManuallySetExpansionModeRef.current = false;
        didManuallySetExpansionTargetRef.current = false;
        didManuallySetEvidenceModeRef.current = false;
        didManuallySetCitationPolicyRef.current = false;
        setSelectedExpansionMode(starter.expansionMode || 'exploratory');
        setSelectedExpansionTarget(
            normalizeAIDraftExpansionTarget(
                starter.expansionTarget || defaultExpansionTargetForScope(promptScope)
            )
        );
        const inferredEvidence = inferAIDraftEvidencePreferences({
            prompt: starter.prompt,
            scope: { type: promptScope },
            selectedSourceCount: selectedContextSources.length,
            loadedSourceCount: loadedSources.length,
            fallbackEvidenceMode: starter.evidenceMode,
            fallbackCitationPolicy: starter.citationPolicy
        });
        setSelectedEvidenceMode(inferredEvidence.evidenceMode);
        setSelectedCitationPolicy(inferredEvidence.citationPolicy);
        setSelectedRoleId(starter.roleId || selectedRoleId);
        setSelectedActionId(starter.actionId || selectedActionId);
        setStageMessage('');
        setStageDebug(null);
        setGenerationStage('');
        setGenerationStageDetail('');
        setStageEvents([]);
        progressSnapshotRef.current = { events: [] };
    };

    const applyPromptExpansionInference = (nextPrompt) => {
        const inferredPreferences = inferAIDraftExpansionPreferences({
            prompt: nextPrompt,
            scope: { type: promptScope },
            fallbackMode: selectedExpansionMode,
            fallbackTarget: selectedExpansionTarget
        });
        if (!didManuallySetExpansionModeRef.current) {
            setSelectedExpansionMode(inferredPreferences.expansionMode);
        }
        if (
            !didManuallySetExpansionTargetRef.current &&
            expansionTargetOptions.some((option) => option.id === inferredPreferences.expansionTarget)
        ) {
            setSelectedExpansionTarget(inferredPreferences.expansionTarget);
        }
    };

    const applyPromptEvidenceInference = (nextPrompt) => {
        const inferredPreferences = inferAIDraftEvidencePreferences({
            prompt: nextPrompt,
            scope: { type: promptScope },
            selectedSourceCount: selectedContextSources.length,
            loadedSourceCount: loadedSources.length,
            fallbackEvidenceMode: selectedEvidenceMode,
            fallbackCitationPolicy: selectedCitationPolicy
        });
        if (!didManuallySetEvidenceModeRef.current) {
            setSelectedEvidenceMode(inferredPreferences.evidenceMode);
        }
        if (!didManuallySetCitationPolicyRef.current) {
            setSelectedCitationPolicy(inferredPreferences.citationPolicy);
        }
    };

    const updateCustomPrompt = (nextPrompt) => {
        setCustomPrompt(nextPrompt);
        applyPromptExpansionInference(nextPrompt);
        applyPromptEvidenceInference(nextPrompt);
    };

    const stagePreviewRequest = async () => {
        if (!role || !selectedAction || isGeneratingPreview) {
            return;
        }
        const localPrompt = customPrompt.trim();
        if (selectedVisual === 'auto' && !localPrompt) {
            setStageMessage('Ask a question or describe what you want AI to make.');
            setGenerationStage('');
            setGenerationStageDetail('');
            setStageEvents([]);
            setStageDebug(null);
            return;
        }

        const {
            role: effectiveRole,
            action: effectiveAction,
            outputShape: inferredShape
        } = plannedRoute;
        const desiredOutputs = desiredOutputsForPrompt({ inferredShape, prompt: localPrompt || effectiveAction.label });
        const isConnectedPackageRequest = desiredOutputs.includes('connected_picture_package');

        if (effectiveAction.id === 'custom_prompt' && !localPrompt) {
            setStageMessage('Add a custom instruction before generating this preview.');
            setGenerationStage('');
            setGenerationStageDetail('');
            setStageEvents([]);
            setStageDebug(null);
            return;
        }

        isFormDismissedRef.current = false;
        progressSnapshotRef.current = { events: [] };
        stopModelWaitProgressUpdates();
        setIsGeneratingPreview(true);
        setStageMessage('');
        setStageEvents([]);
        updateGenerationProgress('Preparing request', 'Starting the Ask AI draft request.');
        updateStageContext([
            { label: 'Prompt', value: localPrompt || effectiveAction.label },
            { label: 'Role', value: effectiveRole.label },
            {
                label: 'Output',
                value: isConnectedPackageRequest
                    ? 'Connected package'
                    : selectedVisual === 'auto'
                      ? visualLabel(inferredShape)
                      : visualLabel(selectedVisual)
            }
        ]);
        setStageDebug(null);
        const failPreflight = (error) => {
            stopModelWaitProgressUpdates();
            const detail = messageFromGenerationError(error, 'Unable to prepare the Ask AI preview.');
            updateStageMessage(`Ask AI setup failed before the request was sent. ${detail}`, 'error');
            updateStageDebug({
                timestamp: new Date().toISOString(),
                mode: 'request_setup_failed',
                diagnosis: [
                    'The request failed while preparing local context, before the backend/model call could begin.'
                ],
                error: detail
            });
            publishGenerationProgress({
                status: 'failed',
                message: detail
            });
            if (!isFormDismissedRef.current) {
                setIsGeneratingPreview(false);
            }
        };
        let childEdges = [];
        let sourceRefs = [];
        try {
            childEdges = edges.filter((edge) => edge.source === targetNodeId);
            sourceRefs =
                scope === 'source'
                    ? selectedSourcePayload?.source_refs || []
                    : [...(targetData.sourceRefs || []), ...adHocSourceRefs];
        } catch (error) {
            failPreflight(error);
            return;
        }
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
            !isConnectedPackageRequest &&
            selectedVisual !== 'no_visual';
        const promptText = localPrompt || effectiveAction.label;
        const changeIntent =
            initialChangeIntent ||
            inferAIDraftChangeIntent(
                promptText,
                activeAIDraftSession?.session_id ? 'update' : 'supplement'
            );
        let memoryContext = null;
        try {
            memoryContext = buildAIDraftMemoryContext({
                nodes,
                edges,
                scope: normalizedScope,
                sourceRefs,
                adHocSourceRefs,
                selectedSourcePayload,
                activeDraftSession: activeAIDraftSession,
                prompt: promptText,
                changeIntent,
                outputMode: shouldSeedInitialGraph ? 'initial_graph_seed' : 'draft_preview'
            });
        } catch (error) {
            failPreflight(error);
            return;
        }
        updateGenerationProgress(
            'Selecting source context',
            selectedSourcePayload?.metadata?.selected_source_count
                ? `Using ${selectedSourcePayload.metadata.selected_source_count} selected source${selectedSourcePayload.metadata.selected_source_count === 1 ? '' : 's'} plus the scoped workspace graph.`
                : selectedContextSources.length
                  ? `Using ${selectedContextSources.length} chosen source${selectedContextSources.length === 1 ? '' : 's'} plus the scoped workspace graph.`
                  : 'Using the scoped workspace graph and any source refs already attached to it.'
        );
        updateStageContext([
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
        let draftNodes = [];
        let draftEdges = [];
        let localGuidedDraft = null;
        try {
            ({ draftNodes, draftEdges } = buildFallbackDraftGraph({
                shouldDraftNode,
                inferredShape,
                effectiveAction,
                targetLabel,
                targetNodeId,
                localPrompt,
                compactSuggestions,
                sourceRefs,
                selectedVisual
            }));
            localGuidedDraft = buildLocalGuidedFallbackDraft({
                prompt: promptText,
                outputShape: inferredShape,
                requestedVisual: selectedVisual,
                requestedOutputs: desiredOutputs,
                sourceRefs
            });
            if (localGuidedDraft?.draftNodes?.length) {
                draftNodes = localGuidedDraft.draftNodes;
                draftEdges = localGuidedDraft.draftEdges;
            }
        } catch (error) {
            failPreflight(error);
            return;
        }
        const draftAnnotations = localGuidedDraft
            ? localGuidedDraft.draftAnnotations
            : effectiveAction.id === 'custom_prompt'
              ? []
              : compactSuggestions.map((suggestion, index) => ({
                    id: `suggestion-${index + 1}`,
                    type: 'follow_up_suggestion',
                    title: suggestion,
                    body: suggestion
                }));
        const localFallbackMode = isSankeyDraftRequest({ prompt: promptText })
            ? localGuidedDraft?.draftNodes?.length
                ? 'sankey_structured_rows'
                : 'sankey_context_needed'
            : localGuidedDraft?.draftNodes?.length
              ? 'guided_start_scaffold'
              : localGuidedDraft
                ? 'guided_context_needed'
                : 'generic';
        const fallbackSession = createAIDraftSession({
            workspaceId: flowId || '',
            scope: normalizedScope,
            role: effectiveRole.label,
            intent: effectiveAction.id,
            prompt: promptText,
            draftNodes,
            draftEdges,
            draftAnnotations,
            generatedArtifacts: localGuidedDraft?.generatedArtifacts || [],
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
                requested_output_shapes: desiredOutputs,
                requested_visual: selectedVisual,
                expansion_mode: selectedExpansionMode,
                expansion_target: selectedExpansionTarget,
                evidence_mode: selectedEvidenceMode,
                citation_policy: selectedCitationPolicy,
                source_policy_requires_citation: selectedCitationPolicy === 'required',
                preview_mode: 'local_fallback',
                local_fallback_mode: localFallbackMode,
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
            generated_artifacts: localGuidedDraft?.generatedArtifacts || [],
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
                requested_output_shapes: desiredOutputs,
                requested_visual: selectedVisual,
                expansion_mode: selectedExpansionMode,
                expansion_target: selectedExpansionTarget,
                evidence_mode: selectedEvidenceMode,
                citation_policy: selectedCitationPolicy,
                source_policy_requires_citation: selectedCitationPolicy === 'required',
                change_intent: changeIntent,
                local_fallback_mode: localFallbackMode,
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

        const activateSession = (session, progressStatus = 'success') => {
            const nextSession = session?.session_id
                ? session
                : session?.draft_session?.session_id
                  ? session.draft_session
                  : session?.session?.session_id
                    ? session.session
                    : fallbackSession;
            if (isLocalFallbackDraftSession(nextSession)) {
                setGeneratedHelperPreview('nodeAiActionRequest', legacyPreview);
            } else {
                clearGeneratedHelperPreview('nodeAiActionRequest');
            }
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
            const requestedView = viewForOutputShape(resolvedShape, effectiveAction.id);
            setActiveView(
                viewForDraftReview({
                    scopeType: normalizedScope.type,
                    requestedView,
                    activeCanvasView
                })
            );
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
                    expansion_mode: selectedExpansionMode,
                    expansion_target: selectedExpansionTarget,
                    expansion_plan: expansionPlanLabel,
                    evidence_mode: selectedEvidenceMode,
                    citation_policy: selectedCitationPolicy,
                    evidence_plan: evidencePlanLabel,
                    model: selectedModel
                }
            });
            updateGenerationProgress('Building preview', 'Draft session is ready. Opening the review surface.', {
                status: progressStatus
            });
            updateStageMessage('Draft session generated. Refine it in the drafting table before accepting.', progressStatus);
            if (!isFormDismissedRef.current) {
                window.setTimeout(() => popNode(), 150);
            }
        };

        const seedInitialGraph = async (session) => {
            const candidateSession = session?.session_id
                ? session
                : session?.draft_session?.session_id
                  ? session.draft_session
                  : session?.session?.session_id
                    ? session.session
                    : fallbackSession;
            if (isLocalFallbackDraftSession(candidateSession)) {
                updateStageMessage('AI generation did not complete, so no starter canvas was created. Check the backend/model configuration and try again.', 'blocked');
                updateStageDebug({
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
                updateStageMessage('AI generation was too generic for an initial TraceSpace map, so no starter canvas was created. Try again after the model path is available.', 'blocked');
                updateStageDebug({
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
            activateSession(candidateSession);
            updateStageMessage('Starter draft generated. Review and accept it before it changes the canvas.', 'success');
        };

        acceptGenerationRequest({
            effectiveRole,
            effectiveAction,
            inferredShape,
            normalizedScope,
            promptText,
            shouldSeedInitialGraph
        });

        try {
            const endpoint = flowId ? draftSessionEndpoint({ flowId }) : '';
            const requestPayload = buildAIDraftSessionRequestPayload({
                role: effectiveRole,
                action: effectiveAction,
                scope: normalizedScope,
                prompt: promptText,
                selectedModel,
                selectedSourcePayload,
                adHocSourceRefs,
                desiredOutputs,
                workspaceBrief: effectiveWorkspaceBrief,
                memoryContext,
                changeIntent,
                expansionMode: selectedExpansionMode,
                expansionTarget: selectedExpansionTarget,
                evidenceMode: selectedEvidenceMode,
                citationPolicy: selectedCitationPolicy,
                metadata: {
                    requested_visual: selectedVisual,
                    output_shape: inferredShape,
                    requested_output_shapes: desiredOutputs,
                    expansion_mode: selectedExpansionMode,
                    expansion_target: selectedExpansionTarget,
                    evidence_mode: selectedEvidenceMode,
                    citation_policy: selectedCitationPolicy,
                    source_policy_requires_citation: selectedCitationPolicy === 'required',
                    routed_role_id: effectiveRole.id,
                    routed_action_id: effectiveAction.id,
                    change_intent: changeIntent,
                    follow_up_memory: memoryContext
                }
            });
            publishGenerationProgress({
                request: summarizeDraftRequestForDebug(requestPayload)
            });
            updateGenerationProgress(
                'Choosing model',
                selectedModel === 'auto'
                    ? 'Using auto model policy so the backend can choose for this intent and context.'
                    : `Using the explicitly requested ${selectedModel} model.`
            );
            updateStageContext([
                { label: 'Model policy', value: selectedModel === 'auto' ? 'Auto by intent' : 'Explicit model' },
                { label: 'Evidence', value: evidencePlanLabel },
                { label: 'Preview mode', value: shouldSeedInitialGraph ? 'Initial graph' : 'Draft preview' }
            ]);
            updateGenerationProgress(
                'Calling AI model',
                'Sent the structured draft request. Waiting for the provider response.'
            );
            startModelWaitProgressUpdates();
            const response = endpoint
                ? await axios.post(endpoint, requestPayload)
                : null;
            stopModelWaitProgressUpdates();
            updateGenerationProgress(
                'Validating draft',
                'Model response received. Checking the draft contract before previewing.'
            );
            if (shouldSeedInitialGraph) {
                if (!response?.data) {
                    updateStageMessage('AI generation did not return a draft session, so no starter canvas was created.', 'error');
                    updateStageDebug({
                        timestamp: new Date().toISOString(),
                        mode: 'empty_response',
                        endpoint,
                        diagnosis: ['The request completed, but no draft session was returned.'],
                        payload: summarizeDraftRequestForDebug(requestPayload)
                    });
                    return;
                }
                await seedInitialGraph(response.data);
            } else {
                activateSession(response?.data || fallbackSession, response?.data ? 'success' : 'fallback');
            }
        } catch (error) {
            const detail = messageFromGenerationError(error);
            const endpoint = flowId ? draftSessionEndpoint({ flowId }) : '';
            updateGenerationProgress('Validating draft', 'The request returned an error; preparing the debug details.');
            const requestPayload = buildAIDraftSessionRequestPayload({
                role: effectiveRole,
                action: effectiveAction,
                scope: normalizedScope,
                prompt: promptText,
                selectedModel,
                selectedSourcePayload,
                adHocSourceRefs,
                desiredOutputs,
                workspaceBrief: effectiveWorkspaceBrief,
                memoryContext,
                changeIntent,
                expansionMode: selectedExpansionMode,
                expansionTarget: selectedExpansionTarget,
                evidenceMode: selectedEvidenceMode,
                citationPolicy: selectedCitationPolicy,
                metadata: {
                    requested_visual: selectedVisual,
                    output_shape: inferredShape,
                    requested_output_shapes: desiredOutputs,
                    expansion_mode: selectedExpansionMode,
                    expansion_target: selectedExpansionTarget,
                    evidence_mode: selectedEvidenceMode,
                    citation_policy: selectedCitationPolicy,
                    source_policy_requires_citation: selectedCitationPolicy === 'required',
                    routed_role_id: effectiveRole.id,
                    routed_action_id: effectiveAction.id,
                    change_intent: changeIntent,
                    follow_up_memory: memoryContext
                }
            });
            updateStageDebug(buildGenerationDebugSnapshot({
                endpoint,
                requestPayload,
                error,
                mode: shouldSeedInitialGraph ? 'initial_seed_failed' : 'preview_failed'
            }));
            if (shouldSeedInitialGraph) {
                updateStageMessage(`AI generation failed; no starter canvas was created. ${detail}`, 'error');
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
            activateSession(fallbackWithWarning, 'fallback');
        } finally {
            stopModelWaitProgressUpdates();
            if (!isFormDismissedRef.current) {
                setIsGeneratingPreview(false);
            }
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
                {hasWorkspaceBriefContext(workspaceBrief) && shouldUseWorkspaceBrief ? (
                    <small>
                        Ask AI will use this as the project foundation; your question refines this run.
                    </small>
                ) : hasWorkspaceBriefContext(workspaceBrief) ? (
                    <small>
                        Brief configured but not selected for this run.
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
                <div>
                    <span>Output mode</span>
                    <strong>{resolvedOutputLabel}</strong>
                </div>
                <div>
                    <span>Expansion plan</span>
                    <strong>{expansionPlanLabel}</strong>
                </div>
                <div>
                    <span>Attach under</span>
                    <strong>{expansionTargetSummary(selectedExpansionTarget)}</strong>
                </div>
                <div>
                    <span>Evidence mode</span>
                    <strong>{evidenceModeLabel(selectedEvidenceMode)}</strong>
                </div>
                <div>
                    <span>Citations</span>
                    <strong>{citationPolicyLabel(selectedCitationPolicy)}</strong>
                </div>
                {plannedRoute.promptOverridesAction ? (
                    <small>
                        Your prompt looks generative, so this will run as Workflow Mapper / Custom prompt.
                    </small>
                ) : null}
            </div>
            <div className="ai-action-starter-library">
                <div className="ai-action-starter-heading">
                    <div>
                        <strong>Guided starts</strong>
                        <span>{scopedStarterTransformations.length} recipes</span>
                    </div>
                    <p>
                        Recipes prefill Ask AI and target an output. They are not extra app
                        modes; accepted drafts feed the same workspace model.
                    </p>
                </div>
                <div className="ai-action-surface-map" aria-label="TraceSpace surface model">
                    <span>
                        <strong>8</strong>
                        workspace views
                    </span>
                    <span>
                        <strong>{scopedStarterTransformations.length}</strong>
                        guided starts
                    </span>
                    <span>
                        <strong>Review</strong>
                        then accept
                    </span>
                </div>
                <div className="ai-action-starter-groups">
                    {groupedStarterTransformations.map((group) => (
                        <section key={group.id} className="ai-action-starter-group">
                            <div className="ai-action-starter-group-header">
                                <strong>{group.label}</strong>
                                <span>{group.detail}</span>
                            </div>
                            <div className="ai-action-starter-grid">
                                {group.starters.map((starter) => (
                                    <button
                                        type="button"
                                        key={starter.id}
                                        onClick={() => applyStarterTransformation(starter)}
                                        className={customPrompt === starter.prompt ? 'selected' : ''}
                                    >
                                        <span>{starterSurfaceLabel(starter)}</span>
                                        <strong>{starter.label}</strong>
                                        <small>{starter.description}</small>
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
            <div className="ai-action-natural">
                <label>
                    Ask anything
                    <textarea
                        value={customPrompt}
                        onChange={(event) => updateCustomPrompt(event.target.value)}
                        placeholder={
                            initialPromptPlaceholder ||
                            'Example: turn this commissioning plan into a task-ready workflow.'
                        }
                    />
                </label>
                <label>
                    Output mode
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
                    {isConnectedPackagePlanned ? (
                        <small className="ai-action-output-hint">
                            Auto will stage a connected package: map, relationships, evidence, tasks, and repair targets.
                        </small>
                    ) : null}
                </label>
                <label>
                    Expansion
                    <select
                        value={selectedExpansionMode}
                        onChange={(event) => {
                            didManuallySetExpansionModeRef.current = true;
                            setSelectedExpansionMode(event.target.value);
                        }}
                    >
                        <option value="exploratory">Exploratory</option>
                        <option value="strict">Strict</option>
                    </select>
                </label>
                <label>
                    Expansion target
                    <select
                        value={selectedExpansionTarget}
                        onChange={(event) => {
                            didManuallySetExpansionTargetRef.current = true;
                            setSelectedExpansionTarget(event.target.value);
                        }}
                    >
                        {expansionTargetOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Evidence mode
                    <select
                        value={selectedEvidenceMode}
                        onChange={(event) => {
                            didManuallySetEvidenceModeRef.current = true;
                            const nextMode = event.target.value;
                            setSelectedEvidenceMode(nextMode);
                            if (!didManuallySetCitationPolicyRef.current) {
                                setSelectedCitationPolicy(
                                    ['uploaded_sources', 'web_sources', 'sharepoint'].includes(nextMode)
                                        ? 'required'
                                        : nextMode === 'general_knowledge'
                                          ? 'not_required'
                                          : 'preferred'
                                );
                            }
                        }}
                    >
                        {EVIDENCE_MODE_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Citations
                    <select
                        value={selectedCitationPolicy}
                        onChange={(event) => {
                            didManuallySetCitationPolicyRef.current = true;
                            setSelectedCitationPolicy(event.target.value);
                        }}
                    >
                        {CITATION_POLICY_OPTIONS.map((option) => (
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
                        onClick={() => updateCustomPrompt(suggestion)}
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
                            {generationStageDetail ||
                                AI_GENERATION_STAGE_HELP[generationStage] ||
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
                    {stageEvents.length ? (
                        <div className="ai-action-stage-events" aria-label="AI generation activity">
                            {stageEvents.map((event) => (
                                <div key={event.id}>
                                    <span>{event.stage}</span>
                                    <strong>{event.detail}</strong>
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
                        : isConnectedPackagePlanned
                          ? 'Preview package'
                        : willSeedInitialGraph
                          ? 'Create initial graph'
                          : 'Preview changes'}
                </button>
            </div>
        </div>
    );
};

export default PromptModal;
