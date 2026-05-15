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
    legacyPersonaNames
} from "../prompts/promptsModel";
import { getWorkspaceNodeData } from "../utils/manualNodes";
import {
    acceptAIDraftSession,
    buildAIDraftSessionRequestPayload,
    buildSelectedSourceDraftPayload,
    buildSelectedSourcesDraftPayload,
    createAIDraftSession
} from "../utils/aiDraftSessions";
import { buildSourceLibraryProjection } from "../views/graphProjection";

const viewForAction = (actionId) => {
    if (actionId.includes('question')) {
        return 'sme';
    }
    if (actionId.includes('source') || actionId.includes('unsupported')) {
        return 'sources';
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
    { id: 'mind_map', label: 'Mind Map' },
    { id: 'outline', label: 'Outline' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'table', label: 'Table' },
    { id: 'flow_chart', label: 'Flowchart' },
    { id: 'knowledge_graph', label: 'Knowledge Graph' },
    { id: 'chart', label: 'Chart' },
    { id: 'kanban', label: 'Kanban' },
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
    source_coverage: 'sources',
    no_visual: 'mindmap'
};

const OUTPUT_SHAPE_ROUTE = {
    tasks: { roleId: 'task-planner', actionId: 'generate_tasks' },
    checklist: { roleId: 'training-guide-builder', actionId: 'generate_checklist' },
    table: { roleId: 'data-table-interpreter', actionId: 'interpret_table_data' },
    chart: { roleId: 'data-table-interpreter', actionId: 'interpret_table_data' },
    flow_chart: { roleId: 'workflow-mapper', actionId: 'custom_prompt' },
    knowledge_graph: { roleId: 'gap-analyst', actionId: 'find_duplicate_overlapping_nodes' },
    outline: { roleId: 'training-guide-builder', actionId: 'generate_training_outline' },
    kanban: { roleId: 'task-planner', actionId: 'generate_tasks' },
    source_coverage: { roleId: 'source-ref-repair', actionId: 'find_missing_source_support' },
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

const layoutInitialSeedGraph = ({ nodes = [], edges = [], shape = '' } = {}) => {
    if (!nodes.length) {
        return { nodes, edges };
    }

    if (!['checklist', 'tasks'].includes(shape)) {
        return {
            nodes: nodes.map((node, index) => ({
                ...node,
                position: {
                    x: 240 + (index % 2) * 390,
                    y: 140 + Math.floor(index / 2) * 150
                }
            })),
            edges
        };
    }

    const incoming = new Set(edges.map((edge) => edge.target));
    const root = nodes.find((node) => !incoming.has(node.id)) || nodes[0];
    const children = nodes.filter((node) => node.id !== root.id);
    const top = 90;
    const gap = 118;
    const rootY = top + Math.max(0, (children.length - 1) * gap) / 2;
    const decorateNode = (node, position, variant) => ({
        ...node,
        position,
        data: {
            ...(node.data || {}),
            display: {
                ...(node.data?.display || {}),
                layoutMode: 'compact-task-stack'
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

    const laidOutNodes = [
        decorateNode(root, { x: 140, y: rootY }, 'checklist-root'),
        ...children.map((node, index) =>
            decorateNode(node, { x: 560, y: top + index * gap }, 'checklist-step')
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
    const nextAction =
        roleActions.find((action) => action.id === route.actionId) ||
        roleActions.find((action) => action.id === 'custom_prompt') ||
        fallbackAction ||
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

const customPromptDraftBranches = (prompt) => {
    const topic = topicFromCustomPrompt(prompt);
    const lower = String(prompt || '').toLowerCase();
    if (/\b(saas|software as a service|subscription software)\b/.test(lower) && /\b(model|business|revenue|go[- ]to[- ]market|gtm)\b/.test(lower)) {
        return {
            rootTitle: topic && !topic.toLowerCase().includes('saas')
                ? `SaaS business model for ${topic}`
                : 'SaaS business model',
            rootSummary: 'Subscription software model linking customer value, acquisition, pricing, retention, and unit economics.',
            branches: [
                ['Target customers', 'Define ICP segments, buyer personas, urgent pain points, and willingness to pay.', 'category'],
                ['Value proposition', 'Connect the product promise to measurable outcomes such as time saved, revenue lift, risk reduction, or workflow quality.', 'category'],
                ['Acquisition channels', 'Map inbound, outbound, partner, product-led, and paid channels with CAC and sales-cycle assumptions.', 'category'],
                ['Pricing and packaging', 'Set free trial or freemium entry, tiered plans, usage limits, add-ons, annual discounts, and expansion paths.', 'category'],
                ['Revenue engine', 'Track MRR, ARR, ARPA, gross margin, expansion revenue, churn, and net revenue retention.', 'category'],
                ['Product and operations', 'Cover onboarding, activation, support, reliability, security, integrations, roadmap, and customer success motions.', 'category'],
                ['Risks and assumptions', 'Validate market demand, competitive differentiation, CAC payback, churn drivers, compliance needs, and funding runway.', 'question']
            ]
        };
    }
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
    if (lower.includes('grilled cheese') || lower.includes('grill cheese')) {
        return [
            'Gather bread, cheese, butter, and a skillet.',
            'Butter one side of each bread slice.',
            'Place cheese between the unbuttered sides.',
            'Cook over medium-low heat until the first side is golden.',
            'Flip and cook until the cheese melts and the second side is golden.',
            'Rest briefly, slice, and serve warm.'
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
        const branchNodes = customPlan.branches.map(([title, summary, nodeType], index) => ({
            id: `${rootId}-branch-${index + 1}`,
            parent_id: rootId,
            title,
            summary,
            node_type: nodeType,
            status: sourceRefs.length ? 'ai_generated' : 'needs_review',
            source_refs: sourceRefs,
            metadata: {
                output_shape: inferredShape,
                visual_mode: selectedVisual,
                branch_index: index + 1
            }
        }));
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
                    source_node_id: rootId,
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

const modelOptions = ['auto', ...supportedOpenAIModels];

const draftSessionEndpoint = ({ flowId }) =>
    `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions`;

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
    const willSeedInitialGraph =
        scope === 'workspace' &&
        nodes.length === 0 &&
        selectedVisual !== 'no_visual';

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

    const stagePreviewRequest = async () => {
        if (!role || !selectedAction || isGeneratingPreview) {
            return;
        }
        const localPrompt = customPrompt.trim();
        if (selectedVisual === 'auto' && !localPrompt) {
            setStageMessage('Ask a question or describe what you want AI to make.');
            return;
        }

        const inferredShape =
            selectedVisual === 'auto'
                ? inferOutputShape(localPrompt, selectedAction.id)
                : selectedVisual;
        const {
            role: effectiveRole,
            action: effectiveAction
        } = selectedVisual === 'auto' || selectedVisual !== 'mind_map'
            ? routeForOutputShape({
                  outputShape: inferredShape,
                  profiles,
                  promptScope,
                  fallbackRole: role,
                  fallbackAction: selectedAction
              })
            : { role, action: selectedAction };

        if (effectiveAction.id === 'custom_prompt' && !localPrompt) {
            setStageMessage('Add a custom instruction before generating this preview.');
            return;
        }

        setIsGeneratingPreview(true);
        setStageMessage('');
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
        const shouldSeedInitialGraph =
            scope === 'workspace' &&
            nodes.length === 0 &&
            shouldDraftNode &&
            selectedVisual !== 'no_visual';
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
            prompt: localPrompt || effectiveAction.label,
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
                model: selectedModel === 'auto' ? 'auto' : selectedModel,
                model_tier: selectedModel === 'auto' ? 'auto' : 'explicit',
                model_reason:
                    selectedModel === 'auto'
                        ? 'Backend unavailable; model would be selected by intent.'
                        : 'User selected the model explicitly.',
                source_context: selectedSourcePayload?.metadata
            }
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
            const nextSession = shouldPreferFallbackInitialSeed({
                session: candidateSession,
                inferredShape
            })
                ? fallbackSession
                : candidateSession;
            const accepted = acceptAIDraftSession({
                session: nextSession,
                nodes: [],
                edges: [],
                mode: 'append'
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
            window.setTimeout(() => popNode(), 150);
        };

        try {
            const endpoint = flowId ? draftSessionEndpoint({ flowId }) : '';
            const response = endpoint
                ? await axios.post(
                      endpoint,
                      buildAIDraftSessionRequestPayload({
                          role: effectiveRole,
                          action: effectiveAction,
                          scope: normalizedScope,
                          prompt: localPrompt || effectiveAction.label,
                          selectedModel,
                          selectedSourcePayload,
                          desiredOutputs: ['graph_draft', 'no_visual'].includes(inferredShape) ? [] : [inferredShape],
                          metadata: {
                              requested_visual: selectedVisual,
                              output_shape: inferredShape,
                              routed_role_id: effectiveRole.id,
                              routed_action_id: effectiveAction.id
                          }
                      })
                  )
                : null;
            if (shouldSeedInitialGraph) {
                seedInitialGraph(response?.data || fallbackSession);
            } else {
                activateSession(response?.data || fallbackSession);
            }
        } catch (error) {
            const detail =
                error.response?.data?.detail?.message ||
                error.response?.data?.detail ||
                error.message ||
                'Unable to generate preview.';
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
            if (shouldSeedInitialGraph) {
                seedInitialGraph(fallbackWithWarning);
            } else {
                activateSession(fallbackWithWarning);
            }
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
            <div className="ai-action-natural">
                <label>
                    Ask anything
                    <textarea
                        value={customPrompt}
                        onChange={(event) => setCustomPrompt(event.target.value)}
                        placeholder="Example: how do I make a grilled cheese?"
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
                        ? willSeedInitialGraph
                            ? 'Creating graph'
                            : 'Preparing preview'
                        : willSeedInitialGraph
                          ? 'Create initial graph'
                          : 'Preview changes'}
                </button>
            </div>
        </div>
    );
};

export default PromptModal;
