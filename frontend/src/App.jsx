import {
    Background,
    BaseEdge,
    Controls,
    EdgeLabelRenderer,
    MiniMap,
    Panel,
    ReactFlow,
    SelectionMode,
    applyNodeChanges,
    getBezierPath,
    getSmoothStepPath,
    getStraightPath,
    useNodesInitialized,
    useOnSelectionChange,
    useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiMaximize2, FiMessageSquare, FiSend, FiTrash2 } from 'react-icons/fi';
import { nodeTypes } from './nodes/nodeTypes.js';
import { useShallow } from 'zustand/shallow';
import useStore from './stores/store.js';
import Modal from './global-components/Modal.jsx';
import Prompts from './global-components/Prompts.jsx';
import getLayoutedElements from './utils/setLayout.js';
import modalStore from './stores/modalStore';
import Header from './global-components/Header.jsx';
import Drawer from './global-components/Drawer.jsx';
import flowStore from './stores/flowStore.js';
import NodeInspector from './global-components/NodeInspector.jsx';
import EdgeInspector from './global-components/EdgeInspector.jsx';
import LocalViewsPanel from './views/LocalViewsPanel.jsx';
import CanvasStructuredView from './views/CanvasStructuredView.jsx';
import FloatingDock from './global-components/FloatingDock.jsx';
import ActivityPanel from './global-components/ActivityPanel.jsx';
import SourcesPanel from './global-components/SourcesPanel.jsx';
import IntegrationsPanel from './global-components/IntegrationsPanel.jsx';
import AutomationsPanel from './global-components/AutomationsPanel.jsx';
import { WORKSPACE_DOCK_OPEN_TAB_EVENT } from './global-components/WorkspaceDock.jsx';
import ShellPropertiesPanelHost from './shell/ShellPropertiesPanelHost.jsx';
import ShellReviewTrayHost from './shell/ShellReviewTrayHost.jsx';
import ShellOverlayHost from './shell/ShellOverlayHost.jsx';
import ShellStatusBar from './shell/ShellStatusBar.jsx';
import ShellWorkspaceNavigatorHost from './shell/ShellWorkspaceNavigatorHost.jsx';
import WorkspaceShellAdapter from './shell/WorkspaceShellAdapter.jsx';
import { DEFAULT_SHELL_RIBBON_TABS } from './shell/ShellRibbon.jsx';
import useShellLayoutState from './shell/useShellLayoutState.js';
import useWorkspaceShellRouter from './shell/useWorkspaceShellRouter.js';
import useShellStore, { SHELL_LOCAL_OUTPUT_TRAY_BY_VIEW } from './stores/shellStore.js';
import {
    FlowchartLensRibbonGroup,
    KnowledgeGraphRelationshipRibbonGroup,
    MindmapRelationshipRibbonGroup
} from './ribbon/RelationshipRibbonGroups.jsx';
import {
    AiRibbonGroups,
    HomeRibbonGroups,
    OutputsRibbonGroups,
    ReviewRibbonGroups,
    SourcesRibbonGroups
} from './ribbon/AiRibbonGroups.jsx';
import MapRibbonHost from './ribbon/MapRibbonHost.jsx';
import AiHelpersPanel from './global-components/AiHelpersPanel.jsx';
import AiGenerationProgress from './global-components/AiGenerationProgress.jsx';
import SourceDraftReviewPanel from './global-components/SourceDraftReviewPanel.jsx';
import DataSourceSelect from './global-components/DataSourceSelect.jsx';
import PromptModal from './modals/PromptModal.jsx';
import { isUiShellRibbonEnabled } from './config/uiShellFeatureFlag.js';
import {
    getLastKgRelationshipMode,
    getLocalSetting,
    saveLastKgRelationshipMode,
    setLocalSetting,
    SETTINGS_KEYS
} from './config/localSettings';
import { parseFlowSnapshot, stringifyFlowSnapshot } from './utils/flowSnapshots';
import { rememberWorkspace, selectStartupWorkspace } from './utils/workspaceSession';
import { ASK_AI_GENERATION_PROGRESS_EVENT } from './utils/askAiGenerationProgress';
import { buildWorkspaceNextSteps } from './utils/workspaceNudges';
import { FLOWCHART_DISPLAY_MODES } from './views/flowchart/flowchartDisplay.js';
import { FLOWCHART_LENSES } from './views/flowchart/flowchartLens.js';
import { createWorkspaceEdge, reflowSiblingSubtrees } from './utils/manualNodes';
import {
    buildAIDraftMemoryContext,
    buildAIDraftSessionRequestPayload,
    inferAIDraftChangeIntent
} from './utils/aiDraftSessions';
import {
    KG_RELATIONSHIP_MODE_OPTIONS,
    KG_RELATIONSHIP_MODES
} from './utils/kgRelationshipFilters';
import useActivityStore from './stores/activityStore';
import useAutomationStore from './stores/automationStore';
import {
    getMapStyleCanvasBackground,
    getMapStyleClassNames,
    getMapStyleGridColor,
    normalizeMapStyle
} from './utils/mapStyles';
import {
    MINDMAP_RELATIONSHIP_MODE_OPTIONS,
    MINDMAP_RELATIONSHIP_MODES,
    buildBranchColorAssignments as buildProjectedBranchColorAssignments,
    buildMindmapStructureEdgeIds as buildProjectedMindmapStructureEdgeIds,
    buildKgRelationshipModeCounts as buildProjectedKgRelationshipModeCounts,
    buildKgTopInsights as buildProjectedKgTopInsights,
    isHierarchyEdge,
    kgNodeTitle,
    nodeData,
    nodeSourceRefs,
    projectCanvasGraph as projectCanvasGraphForView,
    truncateInsightText
} from './utils/canvasProjection';

const CANVAS_VIEWS = new Set(['mindmap', 'knowledgeGraph', 'flowchart', 'outline', 'executive', 'tasks', 'kanban', 'table']);
const STRUCTURED_CANVAS_VIEWS = new Set(['flowchart', 'outline', 'executive', 'tasks', 'kanban', 'table']);
const SHELL_OUTPUT_SURFACE_VIEWS = new Set(['chartData', 'mondayInput', 'mondayStatus']);
const SHELL_METADATA_RIGHT_PANEL_KINDS = new Set(['node', 'edge', 'branch', 'source']);
const AI_HELPERS_GUIDE_PANEL_ID = 'aiHelpers';
const NEXT_STEPS_GUIDE_PANEL_ID = 'nextSteps';
const CANVAS_VIEW_LABELS = {
    mindmap: 'Mind map',
    knowledgeGraph: 'Knowledge graph',
    flowchart: 'Flowchart',
    outline: 'Outline',
    executive: 'Executive',
    tasks: 'Tasks',
    kanban: 'Kanban',
    table: 'Table'
};
const ASK_AI_STAGE_ID = {
    'Preparing request': 'preparing_request',
    'Selecting source context': 'gathering_context',
    'Choosing model': 'choosing_model',
    'Calling AI model': 'calling_model',
    'Validating draft': 'validating_draft',
    'Building preview': 'opening_preview'
};
const ASK_AI_STAGE_PROGRESS = {
    preparing_request: 12,
    gathering_context: 28,
    choosing_model: 42,
    calling_model: 64,
    validating_draft: 84,
    opening_preview: 96
};
const SELECTION_QUICK_ASK_MODES = [
    { id: 'auto', label: 'Auto' },
    { id: 'answer', label: 'Answer' },
    { id: 'draft', label: 'Draft' }
];
const REACT_FLOW_FIT_VIEW_OPTIONS = { maxZoom: 1 };
const REACT_FLOW_PRO_OPTIONS = { hideAttribution: true };
const REACT_FLOW_MULTI_SELECTION_KEYS = ['Control', 'Meta', 'Shift'];
const SELECTION_QUICK_ASK_ACTION_TERMS =
    /\b(add|append|build|change|convert|create|draft|expand|generate|make|organize|propose|replace|rewrite|split|turn|update)\b/i;
const SELECTION_QUICK_ASK_QUESTION_STARTERS =
    /^(what|why|how|when|where|who|which|can you explain|explain|describe|tell me|clarify|summarize|define)\b/i;
const normalizeAskAiProgressStatus = (status = '') => {
    if (['success', 'fallback', 'completed'].includes(status)) {
        return 'completed';
    }
    if (['error', 'blocked', 'failed'].includes(status)) {
        return 'failed';
    }
    if (status === 'canceled') {
        return 'canceled';
    }
    return 'running';
};
const progressEventsForDisplay = (events = []) =>
    [...(Array.isArray(events) ? events : [])]
        .reverse()
        .map((event) => ({
            id: event.id,
            stage: event.stage,
            message: event.detail || event.message || event.label || event.title,
            time: event.time || event.updatedAt
        }));
const hasRoutableNextStep = (step = {}) => {
    const action = step.action || {};
    const outputType = action.output_type || action.view;
    if (action.type === 'reset_branch') {
        return true;
    }
    if (action.type === 'open_view') {
        return ['sources', 'gaps', 'tasks'].includes(action.view);
    }
    if (action.type === 'ai_enrichment') {
        return outputType === 'knowledge_graph';
    }
    if (action.type === 'generate_output') {
        return ['tasks', 'checklist', 'flow_chart', 'chart', 'knowledge_graph'].includes(outputType);
    }
    return false;
};
const STRUCTURED_AI_PRESETS = {
    connections: {
        role: 'gap-analyst',
        action: 'find_duplicate_overlapping_nodes',
        scope: 'workspace',
        visual: 'knowledge_graph',
        view: 'connections',
        prompt:
            'Find cross-branch connection candidates in the current workspace. Do not rewrite the hierarchy. Propose relationship edges only when there is a clear signal, and include duplicates, overlaps, dependencies, supporting relationships, conflicts, blockers, rationale, confidence, and review state.'
    },
    softwareOverlap: {
        role: 'enterprise-tool-rationalization',
        action: 'find_duplicate_tools',
        scope: 'workspace',
        visual: 'software_overlap_report',
        view: 'connections',
        prompt:
            'Create a software overlap and rationalization report for this workspace. Compare applications, systems, capabilities, supported workflows, user groups, owners, approval/security status, integrations, license or usage signals, replacement or retired status, source support, confidence, scoring factors, evidence, and recommended owner review. Label findings as potential overlap unless the evidence proves a duplicate.'
    },
    tasks: {
        role: 'task-planner',
        action: 'generate_tasks',
        scope: 'branch',
        visual: 'tasks',
        view: 'preview',
        prompt:
            'Create task candidates from the current workspace scope. Include action-oriented titles, status, priority, owner cues, due-date cues, dependencies, blockers, and review state.'
    },
    kanban: {
        role: 'task-planner',
        action: 'generate_tasks',
        scope: 'branch',
        visual: 'kanban',
        view: 'tasks',
        prompt:
            'Create a Kanban-ready board from the current workspace scope. Supplement the graph with task nodes or task metadata, board status columns, priority, owner cues, due-date cues, dependencies, blockers, and review state so Kanban is populated after review.'
    },
    table: {
        role: 'data-table-interpreter',
        action: 'interpret_table_data',
        scope: 'workspace',
        visual: 'table',
        view: 'chartData',
        prompt:
            'Create a structured table from the current workspace. Supplement nodes with stable columns, row candidates, source-backed evidence, and review flags.'
    },
    executive: {
        role: 'enterprise-readiness-planner',
        action: 'create_stakeholder_review_package',
        scope: 'workspace',
        visual: 'executive_summary',
        view: 'executive',
        prompt:
            'Make this workspace executive-ready. Supplement missing key findings, recommended actions, risks, required decisions, confidence, source-backed appendix entries, and review state while preserving the current graph.'
    }
};
const sourceRecordId = (source = {}) =>
    source.id || source.source_document_id || source.document_id || source.component_id || '';

const dataSourceNodeId = (node = {}) => {
    const data = node.data || {};
    return (
        data.document_id ||
        data.source_document_id ||
        data.source_document?.id ||
        data.source_document?.document_id ||
        data.component_id ||
        node.id
    );
};

const draftSessionEndpoint = ({ flowId }) =>
    `http://localhost:8000/api/workspaces/${encodeURIComponent(flowId)}/ai/draft-sessions`;

const nodeMessageEndpoint = ({ flowId }) =>
    `http://localhost:8000/api/workspaces/${encodeURIComponent(flowId)}/ai/node-message`;

const shouldDraftSelectionQuickAsk = (prompt = '') => {
    const text = String(prompt || '').trim();
    if (!text) {
        return false;
    }
    return SELECTION_QUICK_ASK_ACTION_TERMS.test(text) && !SELECTION_QUICK_ASK_QUESTION_STARTERS.test(text);
};

const REVIEWABLE_DRAFT_STATUSES = new Set(['', 'draft', 'drafting', 'previewed', 'generated', 'needs_review']);

const isReviewableDraftSessionSummary = (session = {}) =>
    Boolean(
        session?.session_id &&
            REVIEWABLE_DRAFT_STATUSES.has(String(session.status || '').toLowerCase())
    );

const sortByNewestCreatedAt = (left = {}, right = {}) =>
    Date.parse(right.created_at || '') - Date.parse(left.created_at || '');

const SemanticEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
    data
}) => {
    const setInspectorEdgeId = useStore((state) => state.setInspectorEdgeId);
    const semantic = data?.semantic_edge || {};
    const pathArgs = {
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition
    };
    const [edgePath, labelX, labelY] =
        semantic.kind === 'hierarchy'
            ? getSmoothStepPath(pathArgs)
            : getStraightPath(pathArgs);
    const labelClassName = [
        'semantic-edge-label',
        semantic.kind === 'hierarchy'
            ? 'semantic-edge-label--hierarchy'
            : 'semantic-edge-label--relationship',
        semantic.tone ? `semantic-edge-label--${semantic.tone}` : '',
        semantic.mindmapRelationship ? 'semantic-edge-label--mindmap' : '',
        semantic.kgMuted ? 'kg-edge-muted' : ''
    ]
        .filter(Boolean)
        .join(' ');
    const openInspector = (event) => {
        event?.stopPropagation?.();
        setInspectorEdgeId(id);
    };
    const handleLabelKeyDown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        event.preventDefault();
        openInspector(event);
    };

    return (
        <>
            <g className="semantic-edge-hit-area">
                <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
                <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18}>
                    <title>{semantic.tooltip || semantic.label || 'Graph edge'}</title>
                </path>
            </g>
            {semantic.kind === 'hierarchy' ? null : (
                <EdgeLabelRenderer>
                    <div
                        className={labelClassName}
                        style={{
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`
                        }}
                        title={semantic.tooltip || semantic.label || 'Graph edge'}
                        role="button"
                        tabIndex={0}
                        onClick={openInspector}
                        onKeyDown={handleLabelKeyDown}
                        aria-label={`Open ${semantic.label || 'relationship'} edge details`}
                    >
                        {semantic.label || 'Relationship'}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};

const edgeTypes = { semantic: SemanticEdge };

const isEditableEventTarget = (target) => {
    if (!target || !(target instanceof HTMLElement)) {
        return false;
    }
    const tagName = target.tagName.toLowerCase();
    return (
        target.isContentEditable ||
        ['input', 'textarea', 'select', 'option'].includes(tagName) ||
        Boolean(target.closest('[contenteditable="true"]'))
    );
};

const haveSameNodeIds = (left = [], right = []) => {
    if (left.length !== right.length) {
        return false;
    }
    return left.every((node, index) => node?.id === right[index]?.id);
};

const App = () => {
    const nodeType = useMemo(() => nodeTypes, []);
    const selector = (state) => ({
        trigger: state.trigger,
        nodes: state.nodes,
        edges: state.edges,
        onNodesChange: state.onNodesChange,
        onEdgesChange: state.onEdgesChange,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        activeView: state.activeView,
        activeCanvasView: state.activeCanvasView,
        activeGraphFilters: state.activeGraphFilters,
        setActiveGraphFilters: state.setActiveGraphFilters,
        canvasNodeDensity: state.canvasNodeDensity,
        mapStyle: state.mapStyle,
        selectedBranchId: state.selectedBranchId,
        workspaceBrief: state.workspaceBrief,
        sourceLibrary: state.sourceLibrary,
        setSelectedBranchId: state.setSelectedBranchId,
        inspectorNodeId: state.inspectorNodeId,
        setInspectorNodeId: state.setInspectorNodeId,
        inspectorEdgeId: state.inspectorEdgeId,
        setInspectorEdgeId: state.setInspectorEdgeId,
        activeAIActionPreview: state.activeAIActionPreview,
        activeAIDraftSession: state.activeAIDraftSession,
        pendingSourceDraft: state.pendingSourceDraft,
        clearPendingSourceDraft: state.clearPendingSourceDraft,
        setActiveAIDraftSession: state.setActiveAIDraftSession,
        setActiveAIActionPreview: state.setActiveAIActionPreview,
        setActiveView: state.setActiveView,
        setViewPort: state.setViewPort,
        setWorkspaceBrief: state.setWorkspaceBrief,
        setMapStyle: state.setMapStyle,
        setSourceLibrary: state.setSourceLibrary,
        setAIActionRuns: state.setAIActionRuns
    });
    const {
        trigger,
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        setNodes,
        setEdges,
        activeView,
        activeCanvasView,
        activeGraphFilters,
        setActiveGraphFilters,
        canvasNodeDensity,
        mapStyle,
        selectedBranchId,
        workspaceBrief,
        sourceLibrary,
        setSelectedBranchId,
        inspectorNodeId,
        setInspectorNodeId,
        inspectorEdgeId,
        setInspectorEdgeId,
        activeAIActionPreview,
        activeAIDraftSession,
        pendingSourceDraft,
        clearPendingSourceDraft,
        setActiveAIDraftSession,
        setActiveAIActionPreview,
        setActiveView,
        setViewPort,
        setWorkspaceBrief,
        setMapStyle,
        setSourceLibrary,
        setAIActionRuns
    } = useStore(useShallow(selector));
    const shellActions = useShellLayoutState();
    const shellActiveScope = useShellStore((state) => state.activeScope);
    const useWorkspaceShell = useMemo(() => isUiShellRibbonEnabled(), []);
    const areNodesIntialised = useNodesInitialized();
    const [isDrawer, setIsDrawer] = useState(false);
    const setRfInstance = flowStore((s) => s.setRfInstance);
    const setFlow = flowStore((s) => s.setFlow);
    const setFlowName = flowStore((s) => s.setFlowName);
    const setFlowType = flowStore((s) => s.setFlowType);
    const setSavedSnapshot = flowStore((s) => s.setSavedSnapshot);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const setActivityEvents = useActivityStore((s) => s.setActivityEvents);
    const recordActivity = useActivityStore((s) => s.recordActivity);
    const setAutomations = useAutomationStore((s) => s.setAutomations);
    const [selectedNodes, setSelectedNodes] = useState();
    const [selectedCanvasNodes, setSelectedCanvasNodes] = useState([]);
    const [selectionAskPrompt, setSelectionAskPrompt] = useState('');
    const [selectionAskMode, setSelectionAskMode] = useState('auto');
    const [selectionAskStatus, setSelectionAskStatus] = useState('');
    const [selectionAskAnswer, setSelectionAskAnswer] = useState('');
    const additiveSelectionAnchorRef = useRef(new Set());
    const additiveSelectionPendingRef = useRef(false);
    const additiveSelectionActiveRef = useRef(false);
    const [validationReport, setValidationReport] = useState();
    const [aiUsage, setAIUsage] = useState();
    const [aiUsageStatus, setAIUsageStatus] = useState('');
    const [aiUsageReviewStatus, setAIUsageReviewStatus] = useState('');
    const [nextStepsOpenToken, setNextStepsOpenToken] = useState(0);
    const [kgRelationshipTrayCollapsed, setKgRelationshipTrayCollapsed] = useState(false);
    const [mindmapRelationshipTrayCollapsed, setMindmapRelationshipTrayCollapsed] = useState(true);
    const [kgRelationshipMode, setKgRelationshipMode] = useState(() =>
        getLastKgRelationshipMode()
    );
    const [mindmapRelationshipMode, setMindmapRelationshipMode] = useState(MINDMAP_RELATIONSHIP_MODES.OFF);
    const [flowchartLens, setFlowchartLens] = useState(FLOWCHART_LENSES.PROCESS);
    const [flowchartDisplayMode, setFlowchartDisplayMode] = useState(FLOWCHART_DISPLAY_MODES.CARDS);
    const kgRelationshipModeCounts = useMemo(
        () => buildProjectedKgRelationshipModeCounts(edges),
        [edges]
    );
    const kgTopInsights = useMemo(
        () =>
            buildProjectedKgTopInsights({
                nodes,
                edges,
                mode: kgRelationshipMode
            }),
        [edges, kgRelationshipMode, nodes]
    );
    const reactFlow = useReactFlow();
    const { fitView } = useReactFlow();
    const popNode = modalStore((s) => s.popNode);

    const selectKgRelationshipMode = (mode) => {
        setKgRelationshipMode(saveLastKgRelationshipMode(mode));
    };
    const handleMoveEnd = useCallback(
        (event, viewport) => setViewPort(viewport),
        [setViewPort]
    );
    const pushNode = modalStore((s) => s.pushNode);
    const [flowList, setFlowList] = useState([]);
    const [isSourcesOpen, setIsSourcesOpen] = useState(false);
    const [isAiHelpersOpen, setIsAiHelpersOpen] = useState(false);
    const [aiGenerationProgress, setAiGenerationProgress] = useState(null);
    const [isAiProgressExpanded, setIsAiProgressExpanded] = useState(false);
    const {
        leftPanelKind,
        workspaceDockActiveTab,
        workspaceDockCollapsed,
        workspaceDockWidth,
        workspaceShellLeftWidth
    } = shellActions;
    const [lightMode, setLightMode] = useState(
        () => getLocalSetting(SETTINGS_KEYS.theme) === 'light'
    );
    const flow_id = flowStore((s) => s.flow_id);
    const refreshAIUsage = useCallback(async () => {
        if (!flow_id) {
            setAIUsage(undefined);
            return;
        }
        setAIUsageStatus('Loading usage...');
        try {
            const response = await axios.get(
                `http://localhost:8000/api/workspaces/${flow_id}/ai/usage`
            );
            setAIUsage(response.data || {});
            setAIUsageStatus('');
        } catch (error) {
            setAIUsageStatus('Usage unavailable');
        }
    }, [flow_id]);

    useEffect(() => {
        if (flow_id && nodes.length === 0) {
            refreshAIUsage();
        }
    }, [flow_id, nodes.length, refreshAIUsage]);

    useEffect(() => {
        const handleAskAiGenerationProgress = (event) => {
            const snapshot = event?.detail;
            if (!snapshot?.requestId) {
                return;
            }
            setAiGenerationProgress(snapshot);
        };
        window.addEventListener(ASK_AI_GENERATION_PROGRESS_EVENT, handleAskAiGenerationProgress);
        return () => {
            window.removeEventListener(ASK_AI_GENERATION_PROGRESS_EVENT, handleAskAiGenerationProgress);
        };
    }, []);

    useEffect(() => {
        if (!aiGenerationProgress) {
            return undefined;
        }
        const normalizedStatus = normalizeAskAiProgressStatus(aiGenerationProgress.status);
        if (normalizedStatus !== 'completed') {
            return undefined;
        }
        const timeout = window.setTimeout(() => {
            setAiGenerationProgress((currentProgress) =>
                currentProgress?.requestId === aiGenerationProgress.requestId
                    ? null
                    : currentProgress
            );
        }, 1800);
        return () => window.clearTimeout(timeout);
    }, [aiGenerationProgress]);

    const openUsageDraftSession = useCallback(
        async (session) => {
            if (!flow_id || !session?.session_id) {
                return;
            }
            setAIUsageReviewStatus('Opening draft session...');
            try {
                const response = await axios.get(
                    `http://localhost:8000/api/workspaces/${encodeURIComponent(flow_id)}/ai/draft-sessions/${encodeURIComponent(session.session_id)}`
                );
                setInspectorNodeId(undefined);
                setInspectorEdgeId(undefined);
                if (useWorkspaceShell) {
                    shellActions.closeRightPanel();
                }
                setActiveAIDraftSession(response.data || session);
                setAIUsageReviewStatus('Draft session opened for review.');
            } catch (error) {
                setAIUsageReviewStatus('Draft session unavailable');
            }
        },
        [flow_id, setActiveAIDraftSession, setInspectorEdgeId, setInspectorNodeId, shellActions, useWorkspaceShell]
    );

    const latestReviewableDraftSession = useMemo(
        () =>
            (Array.isArray(aiUsage?.sessions) ? aiUsage.sessions : [])
                .filter(isReviewableDraftSessionSummary)
                .sort(sortByNewestCreatedAt)[0],
        [aiUsage?.sessions]
    );

    const openLatestReviewableDraftSession = useCallback(() => {
        if (latestReviewableDraftSession) {
            openUsageDraftSession(latestReviewableDraftSession);
            return;
        }
        refreshAIUsage();
    }, [latestReviewableDraftSession, openUsageDraftSession, refreshAIUsage]);

    const activeMetadataNodeId =
        useWorkspaceShell && shellActions.rightPanel?.kind === 'node'
            ? shellActions.rightPanel.id
            : inspectorNodeId;
    const selectedNodeIssues = useMemo(() => {
        if (!activeMetadataNodeId || !validationReport?.issues) {
            return [];
        }

        return validationReport.issues.filter(
            (issue) => issue.nodeId === activeMetadataNodeId
        );
    }, [activeMetadataNodeId, validationReport]);
    const canvasGraph = useMemo(
        () =>
            projectCanvasGraphForView({
                nodes,
                edges,
                activeCanvasView,
                activeGraphFilters,
                selectedBranchId,
                canvasNodeDensity,
                mapStyle,
                kgRelationshipMode,
                mindmapRelationshipMode,
                kgFocusNodeIds: selectedCanvasNodes.map((node) => node.id)
            }),
        [
            activeCanvasView,
            activeGraphFilters,
            canvasNodeDensity,
            edges,
            kgRelationshipMode,
            mapStyle,
            mindmapRelationshipMode,
            nodes,
            selectedBranchId,
            selectedCanvasNodes
        ]
    );
    const mindmapBranchLegend = useMemo(() => {
        if ((activeView !== 'mindmap' && activeCanvasView !== 'mindmap') || nodes.length === 0) {
            return [];
        }
        const structuralEdgeIds = buildProjectedMindmapStructureEdgeIds(nodes, edges);
        const assignments = buildProjectedBranchColorAssignments(nodes, edges, structuralEdgeIds);
        return assignments.branchRoots
            .map(({ nodeId, colorIndex }) => ({
                id: nodeId,
                colorIndex,
                title: truncateInsightText(kgNodeTitle(nodes.find((node) => node.id === nodeId)), 42)
            }))
            .filter((branch) => branch.id)
            .slice(0, 10);
    }, [activeCanvasView, activeView, edges, nodes]);
    const isStructuredCanvasView = STRUCTURED_CANVAS_VIEWS.has(activeCanvasView);
    const shouldShowCanvasLens =
        CANVAS_VIEWS.has(activeView) || CANVAS_VIEWS.has(activeCanvasView);
    const isShellOutputSurfaceView =
        useWorkspaceShell && SHELL_OUTPUT_SURFACE_VIEWS.has(activeView);
    const renderedCanvasGraph = useMemo(() => {
        if (!isStructuredCanvasView && !isShellOutputSurfaceView) {
            return canvasGraph;
        }
        return {
            nodes: [],
            edges: []
        };
    }, [canvasGraph, isShellOutputSurfaceView, isStructuredCanvasView]);
    const selectedVisibleNodes = useMemo(() => {
        return renderedCanvasGraph.nodes.filter((node) => !node.hidden && node.selected);
    }, [renderedCanvasGraph.nodes]);
    const selectedVisibleNodeKey = useMemo(
        () => selectedVisibleNodes.map((node) => node.id).sort().join('|'),
        [selectedVisibleNodes]
    );
    useEffect(() => {
        setSelectionAskAnswer('');
        setSelectionAskStatus('');
    }, [selectedVisibleNodeKey]);
    const isSelectionAskBusy = selectionAskStatus === 'Asking AI...' || selectionAskStatus === 'Preparing draft...';
    useWorkspaceShellRouter({
        activeAIDraftSession,
        activeView,
        bottomTray: shellActions.bottomTray,
        enabled: useWorkspaceShell,
        inspectorEdgeId,
        inspectorNodeId,
        openDraftReviewTray: shellActions.openDraftReviewTray,
        openLocalOutputReviewTray: shellActions.openLocalOutputReviewTray,
        openRightPanel: shellActions.openRightPanel,
        openSourceDraftReviewTray: shellActions.openSourceDraftReviewTray,
        closeBottomTray: shellActions.closeBottomTray,
        closeRightPanel: shellActions.closeRightPanel,
        pendingSourceDraft,
        rightPanel: shellActions.rightPanel,
        setInspectorEdgeId,
        setInspectorNodeId
    });

    const shouldRenderRightPropertiesPanel =
        useWorkspaceShell &&
        SHELL_METADATA_RIGHT_PANEL_KINDS.has(shellActions.rightPanel?.kind) &&
        Boolean(shellActions.rightPanel?.id);
    const isShellGuidePanelOpen =
        useWorkspaceShell &&
        shellActions.rightPanel?.kind === 'guide' &&
        Boolean(shellActions.rightPanel?.id);
    const shouldRenderShellAiHelpersPanel =
        isShellGuidePanelOpen && !isStructuredCanvasView;
    const shouldRenderInspectorDock = Boolean(
        (!useWorkspaceShell && (inspectorNodeId || inspectorEdgeId)) ||
            (!useWorkspaceShell && activeAIDraftSession) ||
            (!useWorkspaceShell && activeAIActionPreview)
    );
    const isInspectorOpen = shouldRenderInspectorDock;
    const isFocusPanelOpen =
        (useWorkspaceShell ? isShellGuidePanelOpen : isAiHelpersOpen) || isInspectorOpen;
    const selectedBranchNode = useMemo(
        () => nodes.find((node) => node.id === selectedBranchId),
        [nodes, selectedBranchId]
    );
    const selectedBranchTitle =
        selectedBranchNode?.data?.title ||
        selectedBranchNode?.data?.content ||
        selectedBranchNode?.data?.summ ||
        selectedBranchId ||
        '';
    const clearBranchLens = useCallback(() => {
        setSelectedBranchId(undefined);
        if (useWorkspaceShell && shellActions.rightPanel?.kind === 'branch') {
            shellActions.closeRightPanel();
        }
    }, [setSelectedBranchId, shellActions, useWorkspaceShell]);
    const lastLayoutTriggerRef = useRef(trigger);
    const closeNodeInspector = useCallback(() => {
        setInspectorNodeId(undefined);
        if (useWorkspaceShell) {
            shellActions.closeRightPanel();
        }
        const currentNodes = useStore.getState().nodes;
        setNodes(
            currentNodes.map((node) =>
                node.selected ? { ...node, selected: false } : node
            )
        );
    }, [setInspectorNodeId, setNodes, shellActions, useWorkspaceShell]);
    const openEdgeInspector = useCallback(
        (event, edge) => {
            if (typeof event === 'string') {
                setIsAiHelpersOpen(false);
                if (useWorkspaceShell) {
                    setInspectorEdgeId(undefined);
                    setInspectorNodeId(undefined);
                    shellActions.openRightPanel({ kind: 'edge', id: event });
                } else {
                    setInspectorEdgeId(event);
                }
                return;
            }
            event?.stopPropagation?.();
            const edgeId = typeof edge === 'string' ? edge : edge?.id;
            if (edgeId) {
                setIsAiHelpersOpen(false);
                if (useWorkspaceShell) {
                    setInspectorEdgeId(undefined);
                    setInspectorNodeId(undefined);
                    shellActions.openRightPanel({ kind: 'edge', id: edgeId });
                } else {
                    setInspectorEdgeId(edgeId);
                }
            }
        },
        [setInspectorEdgeId, setInspectorNodeId, shellActions, useWorkspaceShell]
    );
    const closeEdgeInspector = useCallback(() => {
        setInspectorEdgeId(undefined);
        if (useWorkspaceShell) {
            shellActions.closeRightPanel();
        }
    }, [setInspectorEdgeId, shellActions, useWorkspaceShell]);
    const focusNodeForReview = useCallback(
        (nodeId) => {
            if (!nodeId) {
                return;
            }

            const node = nodes.find((item) => item.id === nodeId);
            setIsAiHelpersOpen(false);
            setInspectorEdgeId(undefined);
            if (useWorkspaceShell) {
                setInspectorNodeId(undefined);
                shellActions.openRightPanel({ kind: 'node', id: nodeId });
                shellActions.setRibbonTab('map', { inspect: 'node' });
            } else {
                setInspectorNodeId(nodeId);
            }

            if (!node) {
                return;
            }

            setNodes(
                nodes.map((item) => ({
                    ...item,
                    selected: item.id === nodeId
                }))
            );

            const nodeWidth = node.measured?.width || node.width || 260;
            const nodeHeight = node.measured?.height || node.height || 140;
            reactFlow.setCenter(
                (node.position?.x || 0) + nodeWidth / 2,
                (node.position?.y || 0) + nodeHeight / 2,
                { duration: 420, zoom: 1 }
            );
        },
        [nodes, reactFlow, setInspectorEdgeId, setInspectorNodeId, setNodes, shellActions, useWorkspaceShell]
    );

    const clearNodeSelection = useCallback(() => {
        const currentNodes = useStore.getState().nodes;
        setNodes(currentNodes.map((node) => (node.selected ? { ...node, selected: false } : node)));
        setSelectedCanvasNodes([]);
        setSelectedNodes(undefined);
    }, [setNodes]);

    const syncCanvasSelection = useCallback((nextNodes) => {
        const nextSelectedNodes = nextNodes.filter((node) => node.selected);
        setSelectedCanvasNodes(nextSelectedNodes);
        const responseNodes = nextSelectedNodes.filter((node) => node.type === 'response');
        if (
            responseNodes.length > 1 &&
            responseNodes.length <= 4 &&
            responseNodes.length === nextSelectedNodes.length
        ) {
            setSelectedNodes(responseNodes);
        } else {
            setSelectedNodes(undefined);
        }
    }, []);

    const mergeAdditiveSelectionAnchors = useCallback(
        (nextNodes) => {
            const anchorIds = additiveSelectionAnchorRef.current;
            if (
                anchorIds.size === 0 ||
                (!additiveSelectionPendingRef.current && !additiveSelectionActiveRef.current)
            ) {
                return nextNodes;
            }
            let changed = false;
            const mergedNodes = nextNodes.map((node) => {
                if (!anchorIds.has(node.id) || node.selected) {
                    return node;
                }
                changed = true;
                return { ...node, selected: true };
            });
            return changed ? mergedNodes : nextNodes;
        },
        []
    );

    const handleNodesChange = useCallback(
        (changes) => {
            if (
                additiveSelectionAnchorRef.current.size === 0 ||
                (!additiveSelectionPendingRef.current && !additiveSelectionActiveRef.current)
            ) {
                onNodesChange(changes);
                return;
            }
            const nextNodes = mergeAdditiveSelectionAnchors(
                applyNodeChanges(changes, useStore.getState().nodes)
            );
            setNodes(nextNodes);
            syncCanvasSelection(nextNodes);
        },
        [mergeAdditiveSelectionAnchors, onNodesChange, setNodes, syncCanvasSelection]
    );

    const handleCanvasPointerDownCapture = useCallback((event) => {
        if (!event.shiftKey || event.button !== 0) {
            additiveSelectionAnchorRef.current = new Set();
            additiveSelectionPendingRef.current = false;
            return;
        }
        const selectedIds = useStore
            .getState()
            .nodes.filter((node) => node.selected)
            .map((node) => node.id);
        additiveSelectionAnchorRef.current = new Set(selectedIds);
        additiveSelectionPendingRef.current = selectedIds.length > 0;
        window.setTimeout(() => {
            if (!additiveSelectionActiveRef.current) {
                additiveSelectionPendingRef.current = false;
                additiveSelectionAnchorRef.current = new Set();
            }
        }, 0);
    }, []);

    const handleSelectionStart = useCallback((event) => {
        if (event.shiftKey && additiveSelectionAnchorRef.current.size > 0) {
            additiveSelectionActiveRef.current = true;
            additiveSelectionPendingRef.current = false;
            return;
        }
        additiveSelectionAnchorRef.current = new Set();
        additiveSelectionPendingRef.current = false;
        additiveSelectionActiveRef.current = false;
    }, []);

    const handleSelectionEnd = useCallback(
        () => {
            const anchorIds = additiveSelectionAnchorRef.current;
            if (anchorIds.size > 0) {
                const nextNodes = mergeAdditiveSelectionAnchors(useStore.getState().nodes);
                setNodes(nextNodes);
                syncCanvasSelection(nextNodes);
            }
            additiveSelectionAnchorRef.current = new Set();
            additiveSelectionPendingRef.current = false;
            additiveSelectionActiveRef.current = false;
        },
        [mergeAdditiveSelectionAnchors, setNodes, syncCanvasSelection]
    );

    const handleNodeClick = useCallback(
        (event, node) => {
            if (!event?.ctrlKey && !event?.metaKey && !event?.shiftKey) {
                if (useWorkspaceShell) {
                    setIsAiHelpersOpen(false);
                    setInspectorEdgeId(undefined);
                    setInspectorNodeId(undefined);
                    shellActions.openRightPanel({ kind: 'node', id: node.id });
                }
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const currentNodes = useStore.getState().nodes;
            const nextNodes = currentNodes.map((item) =>
                item.id === node.id ? { ...item, selected: !item.selected } : item
            );
            setNodes(nextNodes);
            syncCanvasSelection(nextNodes);
        },
        [setInspectorEdgeId, setInspectorNodeId, setNodes, shellActions, syncCanvasSelection, useWorkspaceShell]
    );

    const deleteSelectedNodes = useCallback(() => {
        const currentNodes = useStore.getState().nodes;
        const currentEdges = useStore.getState().edges;
        const selectedIds = new Set(currentNodes.filter((node) => node.selected).map((node) => node.id));
        if (selectedIds.size === 0) {
            return;
        }
        const deletedIds = new Set(selectedIds);
        if (selectedIds.size === 1) {
            const childrenByParent = currentEdges.reduce((children, edge) => {
                const next = children.get(edge.source) || [];
                next.push(edge.target);
                children.set(edge.source, next);
                return children;
            }, new Map());
            const queue = [...selectedIds];
            while (queue.length > 0) {
                const nodeId = queue.shift();
                (childrenByParent.get(nodeId) || []).forEach((childId) => {
                    if (!deletedIds.has(childId)) {
                        deletedIds.add(childId);
                        queue.push(childId);
                    }
                });
            }
        }
        const descendantCount = deletedIds.size - selectedIds.size;
        if (
            descendantCount > 0 &&
            !window.confirm(
                `Delete ${selectedIds.size} selected node${selectedIds.size === 1 ? '' : 's'} and ${descendantCount} child node${descendantCount === 1 ? '' : 's'}?`
            )
        ) {
            return;
        }

        const reflowParentIds = [
            ...new Set(
                currentEdges
                    .filter((edge) => deletedIds.has(edge.target) && !deletedIds.has(edge.source))
                    .map((edge) => edge.source)
            )
        ];
        const nextEdges = currentEdges.filter(
            (edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)
        );
        const nextNodes = reflowParentIds.reduce(
            (reflowedNodes, parentId) =>
                reflowSiblingSubtrees({
                    nodes: reflowedNodes,
                    edges: nextEdges,
                    parentId,
                    compact: true
                }),
            currentNodes.filter((node) => !deletedIds.has(node.id))
        );

        setNodes(nextNodes);
        setEdges(nextEdges);
        if (deletedIds.has(selectedBranchId)) {
            setSelectedBranchId(undefined);
        }
        if (deletedIds.has(inspectorNodeId)) {
            setInspectorNodeId(undefined);
        }
        if (
            useWorkspaceShell &&
            shellActions.rightPanel?.kind === 'node' &&
            deletedIds.has(shellActions.rightPanel.id)
        ) {
            shellActions.closeRightPanel();
        }
        if (
            currentEdges.some(
                (edge) =>
                    edge.id === inspectorEdgeId &&
                    (deletedIds.has(edge.source) || deletedIds.has(edge.target))
            )
        ) {
            setInspectorEdgeId(undefined);
        }
        if (
            useWorkspaceShell &&
            shellActions.rightPanel?.kind === 'edge' &&
            currentEdges.some(
                (edge) =>
                    edge.id === shellActions.rightPanel.id &&
                    (deletedIds.has(edge.source) || deletedIds.has(edge.target))
            )
        ) {
            shellActions.closeRightPanel();
        }
        setSelectedCanvasNodes([]);
        setSelectedNodes(undefined);
        setSaveStatus('dirty');
        window.setTimeout(() => setSaveStatus('dirty'), 100);
        recordActivity({
            type: 'manual_nodes_deleted',
            title: 'Deleted selected nodes',
            summary: `Deleted ${deletedIds.size} node${deletedIds.size === 1 ? '' : 's'}.`,
            node_ids: [...deletedIds],
            metadata: {
                selected_nodes: selectedIds.size,
                deleted_nodes: deletedIds.size,
                descendant_nodes: descendantCount
            }
        });
    }, [
        inspectorNodeId,
        inspectorEdgeId,
        recordActivity,
        selectedBranchId,
        setEdges,
        setInspectorEdgeId,
        setInspectorNodeId,
        setNodes,
        setSaveStatus,
        setSelectedBranchId,
        shellActions,
        useWorkspaceShell
    ]);

    const askAiAboutSelection = useCallback(() => {
        const selectedIds = selectedVisibleNodes.map((node) => node.id);
        if (selectedIds.length === 0) {
            return;
        }
        pushNode(PromptModal, {
            scope: 'nodes',
            nodeIds: selectedIds
        });
    }, [pushNode, selectedVisibleNodes]);

    const submitSelectionQuickAsk = useCallback(
        async (event) => {
            event?.preventDefault?.();
            const prompt = selectionAskPrompt.trim();
            const selectedIds = selectedVisibleNodes.map((node) => node.id);
            if (!prompt || selectedIds.length === 0) {
                return;
            }
            if (!flow_id) {
                setSelectionAskStatus('Save or reopen this workspace before asking AI.');
                return;
            }

            const mode =
                selectionAskMode === 'auto'
                    ? shouldDraftSelectionQuickAsk(prompt)
                        ? 'draft'
                        : 'answer'
                    : selectionAskMode;
            const normalizedScope = { type: 'nodes', node_ids: selectedIds };
            const sourceRefs = selectedVisibleNodes.flatMap(nodeSourceRefs);

            setSelectionAskAnswer('');
            setSelectionAskStatus(mode === 'draft' ? 'Preparing draft...' : 'Asking AI...');

            if (mode === 'answer') {
                try {
                    const response = await axios.post(nodeMessageEndpoint({ flowId: flow_id }), {
                        prompt,
                        scope: normalizedScope,
                        role: 'Ask AI',
                        selected_model: 'auto',
                        model: null,
                        model_policy: 'balanced',
                        source_refs: sourceRefs,
                        metadata: {
                            preview_mode: 'selection_quick_message',
                            selected_node_count: selectedIds.length
                        }
                    });
                    const answer = String(response?.data?.answer || '').trim();
                    setSelectionAskAnswer(answer || 'No answer returned for this selection.');
                    setSelectionAskStatus('');
                    recordActivity({
                        type: 'selection_quick_ai_answered',
                        title: 'Answered selected-node question',
                        summary: prompt,
                        node_ids: selectedIds,
                        metadata: {
                            scope: 'nodes',
                            selected_node_count: selectedIds.length,
                            model: response?.data?.selected_model || 'auto'
                        }
                    });
                } catch (error) {
                    const detail =
                        error.response?.data?.detail?.message ||
                        error.response?.data?.detail ||
                        error.message ||
                        'Unable to answer from this selection.';
                    setSelectionAskStatus(String(detail));
                }
                return;
            }

            try {
                const role = { id: 'workflow-mapper', label: 'Workflow Mapper' };
                const action = { id: 'custom_prompt', label: 'Custom prompt' };
                const changeIntent = inferAIDraftChangeIntent(
                    prompt,
                    activeAIDraftSession?.session_id ? 'update' : 'supplement'
                );
                const memoryContext = buildAIDraftMemoryContext({
                    nodes,
                    edges,
                    scope: normalizedScope,
                    sourceRefs,
                    activeDraftSession: activeAIDraftSession,
                    prompt,
                    changeIntent,
                    outputMode: 'selection_quick_draft'
                });
                const requestPayload = buildAIDraftSessionRequestPayload({
                    role,
                    action,
                    scope: normalizedScope,
                    prompt,
                    selectedModel: 'auto',
                    workspaceBrief,
                    memoryContext,
                    changeIntent,
                    expansionMode: 'exploratory',
                    expansionTarget: 'selected_node',
                    evidenceMode: 'workspace',
                    citationPolicy: 'preferred',
                    metadata: {
                        preview_mode: 'selection_quick_draft',
                        routed_role_id: role.id,
                        routed_action_id: action.id,
                        selected_node_count: selectedIds.length
                    }
                });
                const response = await axios.post(draftSessionEndpoint({ flowId: flow_id }), requestPayload);
                setActiveAIActionPreview(undefined);
                setActiveAIDraftSession(response.data);
                setSelectionAskPrompt('');
                setSelectionAskStatus('Draft ready for review.');
                recordActivity({
                    type: 'selection_quick_ai_draft_requested',
                    title: 'Drafted from selected nodes',
                    summary: prompt,
                    node_ids: selectedIds,
                    metadata: {
                        scope: 'nodes',
                        selected_node_count: selectedIds.length,
                        role: role.label,
                        action: action.id
                    }
                });
            } catch (error) {
                const detail =
                    error.response?.data?.detail?.message ||
                    error.response?.data?.detail ||
                    error.message ||
                    'Unable to prepare a draft for this selection.';
                setSelectionAskStatus(String(detail));
            }
        },
        [
            activeAIDraftSession,
            edges,
            flow_id,
            nodes,
            recordActivity,
            selectedVisibleNodes,
            selectionAskMode,
            selectionAskPrompt,
            setActiveAIDraftSession,
            setActiveAIActionPreview,
            workspaceBrief
        ]
    );

    const createKgRelationshipFromSelection = useCallback(() => {
        const selectedResponseNodes = selectedVisibleNodes.filter((node) => node.type === 'response');
        if (selectedResponseNodes.length !== 2) {
            return;
        }
        const [sourceNode, targetNode] = selectedResponseNodes;
        const existingEdge = edges.find(
            (edge) =>
                edge.source === sourceNode.id &&
                edge.target === targetNode.id &&
                !isHierarchyEdge(edge)
        );
        if (existingEdge) {
            openEdgeInspector(existingEdge.id);
            return;
        }
        const sourceTitle = nodeData(sourceNode).title || sourceNode.id;
        const targetTitle = nodeData(targetNode).title || targetNode.id;
        const sourceRefs = [
            ...nodeSourceRefs(sourceNode),
            ...nodeSourceRefs(targetNode)
        ].slice(0, 8);
        const edge = createWorkspaceEdge(sourceNode.id, targetNode.id, {
            relationship_type: 'related_to',
            label: 'Related',
            confidence: '0.5',
            rationale: `Manual relationship created between ${sourceTitle} and ${targetTitle}.`,
            source_signal: 'Manual review',
            review_state: 'needs_review',
            source_refs: sourceRefs,
            metadata: {
                authored_from_view: 'knowledgeGraph',
                source_node_title: sourceTitle,
                target_node_title: targetTitle
            }
        });
        setEdges([...edges, edge]);
        setSaveStatus('dirty');
        window.setTimeout(() => {
            window.dispatchEvent(new Event('docmap:save-workspace-now'));
        }, 0);
        recordActivity({
            type: 'kg_relationship_created',
            title: 'Knowledge graph relationship created',
            summary: `${sourceTitle} was connected to ${targetTitle}.`,
            node_ids: [sourceNode.id, targetNode.id],
            metadata: {
                edge_id: edge.id,
                relationship_type: edge.relationship_type
            },
            status: 'completed'
        });
        openEdgeInspector(edge.id);
    }, [edges, openEdgeInspector, recordActivity, selectedVisibleNodes, setEdges, setSaveStatus]);

    const openShellAiGuide = useCallback(
        ({
            source = 'workspace',
            scope = 'workspace',
            nodeId,
            sourceId,
            action = '',
            initialPrompt = '',
            initialVisual = 'auto',
            summary = 'Opened shell AI guide for the whole workspace.'
        } = {}) => {
            if (scope !== 'branch') {
                setSelectedBranchId(undefined);
            }
            setInspectorNodeId(undefined);
            setInspectorEdgeId(undefined);
            setIsAiHelpersOpen(false);
            if (scope === 'source' && sourceId) {
                modalStore.getState().setSourceId(sourceId);
            }
            shellActions.setRibbonTab('ai', { source, action });
            if (scope === 'source' && sourceId) {
                shellActions.setActiveScope({ type: 'source', sourceId });
            } else {
                shellActions.setActiveScope(
                    scope === 'branch' && nodeId
                        ? { type: 'branch', nodeId }
                        : { type: 'workspace' }
                );
            }
            shellActions.openGuidePanel(AI_HELPERS_GUIDE_PANEL_ID);
            recordActivity({
                type: 'ai_action_picker_opened',
                title: 'Workspace Ask AI opened',
                summary,
                metadata: {
                    scope,
                    source_id: sourceId || '',
                    action,
                    initial_prompt: initialPrompt,
                    initial_visual: initialVisual,
                    surface: 'shell_right_rail'
                }
            });
        },
        [
            recordActivity,
            setInspectorEdgeId,
            setInspectorNodeId,
            setSelectedBranchId,
            shellActions
        ]
    );

    const openStructuredAiPreset = useCallback(
        (presetKey) => {
            const preset = STRUCTURED_AI_PRESETS[presetKey];
            if (!preset || (!useWorkspaceShell && !flow_id)) {
                return;
            }
            const preferredScope =
                preset.scope === 'branch' && selectedBranchId ? 'branch' : preset.scope;
            if (preset.view) {
                setActiveView(preset.view);
            }
            shellActions.setRibbonTab('ai', { preset: presetKey });
            shellActions.setActiveScope(
                preferredScope === 'branch'
                    ? { type: 'branch', nodeId: selectedBranchId }
                    : { type: 'workspace' }
            );
            if (useWorkspaceShell) {
                const reviewTray = SHELL_LOCAL_OUTPUT_TRAY_BY_VIEW[preset.view];
                if (reviewTray) {
                    shellActions.openLocalOutputReviewTray(reviewTray, {
                        id: presetKey,
                        view: preset.view
                    });
                    recordActivity({
                        type: 'ai_action_picker_opened',
                        title: 'Workspace Ask AI opened',
                        summary: `Opened shell review tray for preview-first action: ${preset.action}.`,
                        metadata: {
                            scope: preferredScope,
                            action: preset.action || '',
                            initial_prompt: preset.prompt || '',
                            initial_visual: preset.visual || 'auto',
                            surface: 'shell_review_tray'
                        }
                    });
                    return;
                }
                openShellAiGuide({
                    source: 'ribbonPreset',
                    scope: preferredScope,
                    nodeId: preferredScope === 'branch' ? selectedBranchId : undefined,
                    action: preset.action || '',
                    initialPrompt: preset.prompt || '',
                    initialVisual: preset.visual || 'auto',
                    summary: `Opened shell AI guide for preview-first action: ${preset.action}.`
                });
                return;
            }
            pushNode(PromptModal, {
                scope: preferredScope,
                nodeId: preferredScope === 'branch' ? selectedBranchId : undefined,
                initialRoleId: preset.role,
                initialActionId: preset.action,
                initialPrompt: preset.prompt,
                initialVisual: preset.visual || 'auto'
            });
            recordActivity({
                type: 'ai_action_picker_opened',
                title: 'Workspace Ask AI opened',
                summary: `Opened preview-first AI action: ${preset.action}.`,
                metadata: {
                    scope: preferredScope,
                    action: preset.action || ''
                }
            });
        },
        [
            flow_id,
            openShellAiGuide,
            pushNode,
            recordActivity,
            selectedBranchId,
            setActiveView,
            shellActions,
            useWorkspaceShell
        ]
    );

    const openWorkspaceDockTab = useCallback((tab) => {
        const dockTab = tab === 'workspace' ? 'guidance' : tab;
        shellActions.openWorkspaceNavigation('workspace', {
            tab: dockTab,
            collapsed: false,
            width: workspaceDockWidth
        });
        window.dispatchEvent(
            new CustomEvent(WORKSPACE_DOCK_OPEN_TAB_EVENT, {
                detail: { tab: dockTab }
            })
        );
    }, [shellActions, workspaceDockWidth]);

    const openSourcesLibrary = useCallback(() => {
        if (useWorkspaceShell) {
            setIsSourcesOpen(false);
            shellActions.openSourceLibrary({ width: workspaceDockWidth });
            return;
        }
        setIsSourcesOpen(true);
    }, [shellActions, useWorkspaceShell, workspaceDockWidth]);

    const closeShellSourcesLibrary = useCallback(() => {
        shellActions.openWorkspaceNavigation('workspace', {
            tab: 'sources',
            collapsed: false,
            width: workspaceDockWidth
        });
    }, [shellActions, workspaceDockWidth]);

    const openEmptyCanvasSources = useCallback(() => {
        if (useWorkspaceShell) {
            shellActions.setRibbonTab('sources', 'sourceIntake');
            shellActions.openBottomTray('sources', {
                id: 'source-intake',
                context: 'sourceIntake'
            });
            return;
        }
        openWorkspaceDockTab('sources');
        pushNode(DataSourceSelect);
    }, [openWorkspaceDockTab, pushNode, shellActions, useWorkspaceShell]);

    const openEmptyCanvasAskAi = useCallback((options = {}) => {
        const promptScope = options?.scope || 'workspace';
        const promptNodeId = options?.nodeId || undefined;
        const promptNodeIds = Array.isArray(options?.nodeIds) ? options.nodeIds.filter(Boolean) : [];
        setSelectedBranchId(undefined);
        setInspectorNodeId(promptScope === 'node' ? promptNodeId : undefined);
        setInspectorEdgeId(undefined);
        setIsAiHelpersOpen(false);
        shellActions.setRibbonTab('ai', { source: 'emptyCanvas' });
        shellActions.setActiveScope(
            promptScope === 'node' && promptNodeId
                ? { type: 'node', nodeId: promptNodeId }
                : promptScope === 'nodes' && promptNodeIds.length
                  ? { type: 'nodes', nodeIds: promptNodeIds }
                  : { type: 'workspace' }
        );
        pushNode(PromptModal, {
            scope: promptScope,
            nodeId: promptNodeId,
            nodeIds: promptNodeIds,
            initialPrompt: options?.initialPrompt,
            initialVisual: options?.initialVisual || 'auto',
            initialExpansionTarget: options?.initialExpansionTarget,
            initialEvidenceMode: sourceLibrary.length ? 'uploaded_sources' : 'auto',
            initialCitationPolicy: sourceLibrary.length ? 'required' : 'auto',
            initialChangeIntent: options?.initialChangeIntent,
            initialRequestMetadata: options?.initialRequestMetadata,
            initialPromptPlaceholder:
                'Describe what you want TraceSpace to build, explain, connect, or turn into a reviewable package.'
        });
        recordActivity({
            type: 'ai_action_picker_opened',
            title: 'Workspace Ask AI opened',
            summary: useWorkspaceShell
                ? 'Opened the freeform Ask AI composer from the empty canvas.'
                : 'Opened preview-first AI actions from the empty canvas.',
            metadata: {
                scope: promptScope,
                node_id: promptNodeId || null,
                node_ids: promptNodeIds,
                surface: useWorkspaceShell ? 'shell_prompt_modal' : 'modal',
                ...(options?.initialRequestMetadata || {})
            }
        });
    }, [
        pushNode,
        recordActivity,
        setInspectorEdgeId,
        setInspectorNodeId,
        setSelectedBranchId,
        shellActions,
        sourceLibrary.length,
        useWorkspaceShell
    ]);

    const openEmptyCanvasStarterGuide = useCallback(() => {
        setSelectedBranchId(undefined);
        setInspectorNodeId(undefined);
        setInspectorEdgeId(undefined);
        setIsAiHelpersOpen(false);
        if (useWorkspaceShell) {
            openShellAiGuide({
                source: 'emptyCanvas',
                action: 'guided_starters',
                initialVisual: 'auto',
                summary: 'Opened shell AI guide for guided starts from the empty canvas.'
            });
            return;
        }
        shellActions.setRibbonTab('ai', { source: 'emptyCanvas', action: 'guided_starters' });
        shellActions.setActiveScope({ type: 'workspace' });
        pushNode(PromptModal, {
            scope: 'workspace',
            initialVisual: 'auto',
            initialEvidenceMode: sourceLibrary.length ? 'uploaded_sources' : 'auto',
            initialCitationPolicy: sourceLibrary.length ? 'required' : 'auto',
            initialPromptPlaceholder:
                'Choose a guided start below, or describe what you want TraceSpace to build first.'
        });
        recordActivity({
            type: 'ai_action_picker_opened',
            title: 'Guided starts opened',
            summary: 'Opened the guided-start catalog from the empty canvas.',
            metadata: {
                scope: 'workspace',
                action: 'guided_starters',
                initial_visual: 'auto',
                source_count: sourceLibrary.length
            }
        });
    }, [
        openShellAiGuide,
        pushNode,
        recordActivity,
        setInspectorEdgeId,
        setInspectorNodeId,
        setSelectedBranchId,
        shellActions,
        sourceLibrary.length,
        useWorkspaceShell
    ]);

    const openManualStart = useCallback(() => {
        openWorkspaceDockTab('build');
    }, [openWorkspaceDockTab]);

    const closeAiHelpersPanel = useCallback(() => {
        if (useWorkspaceShell) {
            shellActions.closeRightPanel();
            return;
        }
        setIsAiHelpersOpen(false);
    }, [shellActions, useWorkspaceShell]);

    const openAiHelpersPanel = useCallback(
        (guideId = AI_HELPERS_GUIDE_PANEL_ID) => {
            setInspectorNodeId(undefined);
            setInspectorEdgeId(undefined);
            if (useWorkspaceShell) {
                setIsAiHelpersOpen(false);
                shellActions.openGuidePanel(guideId);
                return;
            }
            setIsAiHelpersOpen(true);
        },
        [setInspectorEdgeId, setInspectorNodeId, shellActions, useWorkspaceShell]
    );

    const openShellWorkspaceAskAi = useCallback(() => {
        openEmptyCanvasAskAi();
    }, [openEmptyCanvasAskAi]);

    const openShellSourceAskAi = useCallback(
        (options = {}) => {
            if (!useWorkspaceShell) {
                return false;
            }
            const { sources = [], preferredScope = 'source', nodeId } = options;
            const preset = options.preset || options;
            const firstSource = sources[0];
            const sourceId = firstSource?.id || firstSource?.source_document_id || firstSource?.document_id;
            openShellAiGuide({
                source: 'sourceLibrary',
                scope: preferredScope === 'branch' ? 'branch' : sourceId ? 'source' : 'workspace',
                nodeId,
                sourceId,
                action: preset.action || preset.actionId || '',
                initialPrompt: preset.initialPrompt || preset.prompt || '',
                initialVisual: preset.initialVisual || preset.visual || 'auto',
                summary: sourceId
                    ? `Opened shell AI guide for source: ${firstSource?.title || sourceId}.`
                    : 'Opened shell AI guide for source review.'
            });
            return true;
        },
        [openShellAiGuide, useWorkspaceShell]
    );

    const focusStructuredNodeInMap = useCallback(
        (nodeId) => {
            setActiveView('mindmap');
            window.setTimeout(() => focusNodeForReview(nodeId), 0);
        },
        [focusNodeForReview, setActiveView]
    );

    const fitSelectedNodes = useCallback(() => {
        const selectedIds = new Set(selectedVisibleNodes.map((node) => node.id));
        if (selectedIds.size === 0) {
            return;
        }
        const flowNodes = reactFlow.getNodes().filter((node) => selectedIds.has(node.id));
        if (flowNodes.length) {
            reactFlow.fitView({ nodes: flowNodes, duration: 360, maxZoom: 1.12 });
        }
    }, [reactFlow, selectedVisibleNodes]);

    const openNextStepsAfterDraftAccept = useCallback(() => {
        setNextStepsOpenToken((token) => token + 1);
        openAiHelpersPanel(NEXT_STEPS_GUIDE_PANEL_ID);
    }, [openAiHelpersPanel]);

    const openNextStepsFromDock = useCallback(() => {
        setNextStepsOpenToken((token) => token + 1);
        openAiHelpersPanel(NEXT_STEPS_GUIDE_PANEL_ID);
    }, [openAiHelpersPanel]);

    const reflowCanvasGraph = useCallback(() => {
        if (STRUCTURED_CANVAS_VIEWS.has(activeCanvasView)) {
            window.dispatchEvent(
                new CustomEvent('docmap:reflow-canvas-skipped', {
                    detail: { view: activeCanvasView, reason: 'structured_view' }
                })
            );
            return;
        }
        const graphNodes = reactFlow.getNodes();
        const graphEdges = reactFlow.getEdges();
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            graphNodes,
            graphEdges,
            { mode: activeCanvasView }
        );
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        setSaveStatus('dirty');
        window.setTimeout(() => fitView({ nodes: layoutedNodes, maxZoom: 1 }), 50);
    }, [activeCanvasView, fitView, reactFlow, setEdges, setNodes, setSaveStatus]);

    useEffect(() => {
        window.addEventListener('docmap:reflow-canvas', reflowCanvasGraph);
        return () => window.removeEventListener('docmap:reflow-canvas', reflowCanvasGraph);
    }, [reflowCanvasGraph]);

    const onChange = useCallback(
        ({ nodes }) => {
            setSelectedCanvasNodes((current) =>
                haveSameNodeIds(current, nodes) ? current : nodes
            );
            const responseNodes = nodes.filter(
                (ele) => ele.type === 'response'
            );
            if (responseNodes.length === 0) {
                setSelectedNodes(undefined);
                return;
            }
            if (responseNodes.length !== nodes.length) {
                setSelectedNodes(undefined);
                return;
            }
            if (responseNodes.length > 1 && responseNodes.length <= 4) {
                setSelectedNodes(responseNodes);
            } else if (responseNodes.length > 4) {
                setSelectedNodes(undefined);
            }
        },
        []
    );

    useOnSelectionChange({
        onChange
    });

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (!['Delete', 'Backspace'].includes(event.key)) {
                return;
            }
            if (isEditableEventTarget(event.target)) {
                return;
            }
            const currentNodes = useStore.getState().nodes;
            if (!currentNodes.some((node) => node.selected)) {
                return;
            }
            event.preventDefault();
            deleteSelectedNodes();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteSelectedNodes]);

    useEffect(() => {
        const responseNodes = nodes.filter(
            (node) => node.selected && node.type === 'response'
        );
        if (responseNodes.length > 1 && responseNodes.length <= 4) {
            setSelectedNodes(responseNodes);
        } else if (responseNodes.length <= 1) {
            setSelectedNodes(undefined);
        }
    }, [nodes]);

    // const setFlowId = flowStore((s) => s.setFlow);
    // const flow_id = flowStore((s) => s.flow_id);
    // const setFlowName = flowStore((s) => s.setFlowName);

    // useEffect(() => {
    //     axios
    //         .get(`http://localhost:8000/flows`)
    //         .then((res) => {
    //             if (res.data.length > 0 && Array.isArray(res.data)) {
    //                 setFlowId(res.data.flow_id)
    //                 setFlowName(res.data.flow_name);
    //             } else if (!Array.isArray(res.data)) {
    //                 pushNode(ErrorModal);
    //             } else {
    //                 pushNode(DataSourceSelect);
    //             }
    //         })
    //         .catch((err) => pushNode(LoadingModal));
    // }, []);

    useEffect(() => {
        // if (nodes.length > 0) {
        //     setTimeout(() => {
        //         const data = reactFlow.getNodes()
        //         const { nodes: newNodes, edges: newEdges } = getLayoutedElements(data, edges)
        //         setNodes(newNodes)
        //         setEdges(newEdges)
        //     }, 90)
        //     setTimeout(() => {
        //         popNode();
        //         reactFlow.fitView()
        //     }, 95)

        // }
        if (
            areNodesIntialised &&
            trigger !== undefined &&
            lastLayoutTriggerRef.current !== trigger
        ) {
            lastLayoutTriggerRef.current = trigger;
            setTimeout(() => {
                const data = reactFlow.getNodes();
                const { nodes: newNodes, edges: newEdges } =
                    getLayoutedElements(data, edges);
                setNodes(newNodes);
                setEdges(newEdges);
                fitView({ nodes: newNodes, maxZoom: 1 });
                if (modalStore.getState().node?.name === 'LoadingModal') {
                    popNode();
                }
            }, 1000);
        }
    }, [areNodesIntialised, trigger]);

    useEffect(() => {
        setLocalSetting(SETTINGS_KEYS.theme, lightMode ? 'light' : 'dark');
    }, [lightMode]);

    useEffect(() => {
        if (flow_id) {
            return;
        }

        let isCanceled = false;

        const loadStartupWorkspace = async () => {
            try {
                const response = await axios.get('http://localhost:8000/flows');
                if (isCanceled) {
                    return;
                }

                const flows = Array.isArray(response.data) ? response.data : [];
                setFlowList(flows);
                const workspace = selectStartupWorkspace(flows);

                if (!workspace) {
                    return;
                }

                const snapshot = parseFlowSnapshot(workspace.flow_json);
                setFlow(workspace.flow_id);
                rememberWorkspace(workspace.flow_id);
                setFlowName(workspace.flow_name);
                setFlowType(workspace.flow_type || 'manual');
                setNodes(snapshot.nodes || []);
                setEdges(snapshot.edges || []);
                setWorkspaceBrief(snapshot.workspace_brief || {});
                setMapStyle(snapshot.map_style || {});
                setSourceLibrary(snapshot.source_library || []);
                setAIActionRuns(snapshot.ai_action_runs || []);
                setActivityEvents(snapshot.activity_events || [], workspace.flow_id);
                setAutomations(snapshot.automations || []);
                setViewPort(snapshot.viewport || {});
                setSavedSnapshot(
                    snapshot,
                    stringifyFlowSnapshot(snapshot),
                    workspace.flow_name,
                    workspace.flow_type || 'manual'
                );
                setSaveStatus('saved');
            } catch (error) {
                console.warn('Could not restore the last workspace', error);
            }
        };

        loadStartupWorkspace();

        return () => {
            isCanceled = true;
        };
    }, [
        flow_id,
        setActivityEvents,
        setAutomations,
        setEdges,
        setFlow,
        setFlowName,
        setFlowType,
        setNodes,
        setSavedSnapshot,
        setSaveStatus,
        setAIActionRuns,
        setSourceLibrary,
        setViewPort,
        setMapStyle,
        setWorkspaceBrief
    ]);

    const aiProgressStageId =
        ASK_AI_STAGE_ID[aiGenerationProgress?.stage] || 'preparing_request';
    const aiProgressStatus = normalizeAskAiProgressStatus(aiGenerationProgress?.status);
    const aiProgressContextItems = Array.isArray(aiGenerationProgress?.context)
        ? aiGenerationProgress.context
        : [];
    const aiProgressEvents = progressEventsForDisplay(aiGenerationProgress?.events);
    const aiProgressTitle = aiGenerationProgress?.role?.label
        ? aiGenerationProgress?.previewMode === 'source_upload'
          ? aiGenerationProgress.role.label
          : `${aiGenerationProgress.role.label} is drafting`
        : 'Ask AI is drafting';
    const aiProgressScopeLabel =
        aiGenerationProgress?.previewMode === 'source_upload'
            ? 'Source intake'
            : aiGenerationProgress?.previewMode === 'initial_graph_seed'
            ? 'Initial graph draft'
            : aiGenerationProgress?.scope?.type
              ? `${aiGenerationProgress.scope.type} draft`
              : 'Canvas draft';
    const aiProgressDescription =
        aiProgressStatus === 'failed'
            ? aiGenerationProgress?.message || 'The draft did not complete. No canvas changes were applied.'
            : aiGenerationProgress?.previewMode === 'source_upload'
              ? 'The source is being parsed and converted into workspace context.'
            : 'No canvas changes are applied until you review and accept the draft.';
    const isAiGenerationActive = Boolean(aiGenerationProgress) && aiProgressStatus === 'running';
    const shouldShowEmptyCanvasState = nodes.length === 0 && (!aiGenerationProgress || isAiGenerationActive);
    const hasWorkspaceContentNodes = nodes.some((node) => node.type !== 'dataSource');
    const workspaceNextSteps = useMemo(
        () =>
            buildWorkspaceNextSteps({
                nodes,
                edges,
                sourceLibrary,
                workspaceBrief,
                selectedBranchId,
                filters: activeGraphFilters
            }).steps.filter(hasRoutableNextStep),
        [activeGraphFilters, edges, nodes, selectedBranchId, sourceLibrary, workspaceBrief]
    );
    const hasWorkspaceNextSteps = workspaceNextSteps.length > 0;
    const currentMapStyle = normalizeMapStyle(mapStyle);
    const canvasBackgroundColor = getMapStyleCanvasBackground(currentMapStyle, lightMode);
    const backgroundGridColor = getMapStyleGridColor(currentMapStyle, lightMode);
    const isLocalOutputView = !CANVAS_VIEWS.has(activeView);
    const closeActiveDraftTray = useCallback(() => {
        setActiveAIDraftSession(undefined);
        shellActions.closeBottomTray();
    }, [setActiveAIDraftSession, shellActions]);

    const openIssuesReviewTray = useCallback(() => {
        shellActions.openValidationIssuesTray(flow_id);
    }, [flow_id, shellActions]);

    const requestWorkspaceSave = useCallback(() => {
        if (!flow_id) {
            return;
        }
        setSaveStatus('dirty');
        window.setTimeout(() => {
            window.dispatchEvent(new Event('docmap:save-workspace-now'));
        }, 0);
    }, [flow_id, setSaveStatus]);

    const applyBranchProperties = useCallback(
        (branchId, draft = {}) => {
            if (!branchId) {
                return;
            }
            const nextTitle = String(draft.title || '').trim();
            setNodes(
                useStore.getState().nodes.map((node) => {
                    if (node.id !== branchId) {
                        return node;
                    }
                    const data = node.data || {};
                    return {
                        ...node,
                        data: {
                            ...data,
                            title: nextTitle || data.title || data.content || data.summ || branchId,
                            node_type: String(draft.node_type || data.node_type || 'concept').trim(),
                            status: String(draft.status || data.status || 'reviewed').trim(),
                            owner_id: String(draft.owner_id || '').trim(),
                            due_date: String(draft.due_date || '').trim(),
                            summary: String(draft.summary || '').trim(),
                            ...(data.manual
                                ? {
                                      data: {
                                          ...(data.data || {}),
                                          summ: nextTitle || data.data?.summ
                                      }
                                  }
                                : {})
                        }
                    };
                })
            );
            requestWorkspaceSave();
            recordActivity({
                type: 'branch_metadata_applied',
                title: 'Branch metadata applied',
                summary: `Updated branch metadata for ${nextTitle || branchId}.`,
                node_ids: [branchId],
                metadata: {
                    node_type: draft.node_type,
                    status: draft.status,
                    owner_id: draft.owner_id,
                    due_date: draft.due_date
                },
                status: 'completed'
            });
        },
        [recordActivity, requestWorkspaceSave, setNodes]
    );

    const applySourceProperties = useCallback(
        (sourceId, draft = {}) => {
            if (!sourceId) {
                return;
            }
            const cleaned = {
                title: String(draft.title || sourceId).trim() || sourceId,
                status: String(draft.status || 'uploaded').trim(),
                classification: String(draft.classification || '').trim(),
                version: String(draft.version || '').trim(),
                path: String(draft.path || '').trim()
            };
            const hasDocumentList =
                sourceLibrary &&
                typeof sourceLibrary === 'object' &&
                !Array.isArray(sourceLibrary) &&
                Array.isArray(sourceLibrary.documents);
            const sourceList = Array.isArray(sourceLibrary)
                ? sourceLibrary
                : hasDocumentList
                  ? sourceLibrary.documents
                  : [];
            let matched = false;
            const nextSourceList = sourceList.map((source) => {
                if (sourceRecordId(source) !== sourceId) {
                    return source;
                }
                matched = true;
                return {
                    ...source,
                    ...cleaned,
                    id: source.id || sourceId,
                    metadata: {
                        ...(source.metadata || {}),
                        path: cleaned.path,
                        version: cleaned.version,
                        classification: cleaned.classification
                    }
                };
            });
            if (!matched) {
                nextSourceList.push({
                    id: sourceId,
                    type: '',
                    type_label: 'Source',
                    ...cleaned,
                    metadata: {
                        path: cleaned.path,
                        version: cleaned.version,
                        classification: cleaned.classification
                    }
                });
            }
            setSourceLibrary(
                hasDocumentList
                    ? {
                          ...sourceLibrary,
                          documents: nextSourceList
                      }
                    : nextSourceList
            );
            setNodes(
                useStore.getState().nodes.map((node) => {
                    if (node.type !== 'dataSource' || dataSourceNodeId(node) !== sourceId) {
                        return node;
                    }
                    const data = node.data || {};
                    return {
                        ...node,
                        data: {
                            ...data,
                            title: cleaned.title,
                            name: cleaned.title,
                            status: cleaned.status,
                            path: cleaned.path,
                            relative_path: cleaned.path,
                            source_document: {
                                ...(data.source_document || {}),
                                title: cleaned.title,
                                name: cleaned.title,
                                status: cleaned.status,
                                path: cleaned.path,
                                relative_path: cleaned.path,
                                version: cleaned.version,
                                classification: cleaned.classification
                            }
                        }
                    };
                })
            );
            requestWorkspaceSave();
            recordActivity({
                type: 'source_metadata_applied',
                title: 'Source metadata applied',
                summary: `Updated source metadata for ${cleaned.title}.`,
                source_ids: [sourceId],
                metadata: cleaned,
                status: 'completed'
            });
        },
        [recordActivity, requestWorkspaceSave, setNodes, setSourceLibrary, sourceLibrary]
    );

    const shellStatusItems = useMemo(() => {
        const contentNodes = nodes.filter((node) => node.type !== 'dataSource' && !node.hidden);
        const sourcedCount = contentNodes.filter((node) => nodeSourceRefs(node).length > 0).length;
        const reviewIssueCount = Array.isArray(validationReport?.issues)
            ? validationReport.issues.length
            : 0;
        const items = [
            {
                id: 'view',
                label: 'View',
                value: CANVAS_VIEW_LABELS[activeCanvasView] || activeCanvasView || 'Canvas'
            }
        ];

        if (selectedVisibleNodes.length > 0) {
            items.push({
                id: 'selection',
                label: 'Selected',
                value: String(selectedVisibleNodes.length),
                tone: 'accent'
            });
        }

        if (contentNodes.length > 0) {
            items.push({
                id: 'sources',
                label: 'Sources',
                value: `${sourcedCount}/${contentNodes.length}`
            });
        }

        if (reviewIssueCount > 0) {
            items.push({
                id: 'review',
                label: 'Review',
                value: String(reviewIssueCount),
                tone: 'warning'
            });
        }

        return items;
    }, [activeCanvasView, nodes, selectedVisibleNodes.length, validationReport]);

    const shellTemporaryOverrides = useMemo(() => {
        const overrides = [];
        if (selectedBranchId) {
            overrides.push({
                id: 'branch',
                label: `Branch: ${selectedBranchTitle || 'Selected branch'}`,
                onClear: clearBranchLens
            });
        }
        if (activeGraphFilters.length > 0) {
            overrides.push({
                id: 'filters',
                label: `${activeGraphFilters.length} active ${activeGraphFilters.length === 1 ? 'filter' : 'filters'}`,
                onClear: () => setActiveGraphFilters([])
            });
        }
        if (
            activeCanvasView === 'mindmap' &&
            mindmapRelationshipMode !== MINDMAP_RELATIONSHIP_MODES.OFF
        ) {
            const label =
                MINDMAP_RELATIONSHIP_MODE_OPTIONS.find((option) => option.id === mindmapRelationshipMode)?.label ||
                'Relationship labels';
            overrides.push({
                id: 'mindmap-relationships',
                label,
                onClear: () => setMindmapRelationshipMode(MINDMAP_RELATIONSHIP_MODES.OFF)
            });
        }
        if (
            activeCanvasView === 'knowledgeGraph' &&
            kgRelationshipMode !== KG_RELATIONSHIP_MODES.INSIGHTS
        ) {
            const label =
                KG_RELATIONSHIP_MODE_OPTIONS.find((option) => option.id === kgRelationshipMode)?.label ||
                'Knowledge graph lens';
            overrides.push({
                id: 'knowledge-graph-relationships',
                label,
                onClear: () => selectKgRelationshipMode(KG_RELATIONSHIP_MODES.INSIGHTS)
            });
        }
        return overrides;
    }, [
        activeCanvasView,
        activeGraphFilters,
        clearBranchLens,
        kgRelationshipMode,
        mindmapRelationshipMode,
        selectKgRelationshipMode,
        selectedBranchId,
        selectedBranchTitle,
        setActiveGraphFilters
    ]);

    const shellSelectionActions = useMemo(() => {
        if (isStructuredCanvasView) {
            return [];
        }
        const actions = [];
        if (selectedBranchId) {
            actions.push({
                id: 'branch-properties',
                label: 'Branch properties',
                onClick: () => shellActions.openBranchMetadata(selectedBranchId)
            });
        }
        if (!selectedVisibleNodes.length) {
            return actions;
        }
        if (activeCanvasView === 'knowledgeGraph' && selectedVisibleNodes.length === 2) {
            actions.push({
                id: 'connect',
                label: 'Connect',
                onClick: createKgRelationshipFromSelection
            });
        }
        actions.push(
            {
                id: 'ask',
                label: 'Ask',
                icon: <FiMessageSquare />,
                onClick: askAiAboutSelection
            },
            {
                id: 'fit',
                label: 'Fit',
                icon: <FiMaximize2 />,
                onClick: fitSelectedNodes
            },
            {
                id: 'delete',
                label: 'Delete',
                icon: <FiTrash2 />,
                tone: 'danger',
                onClick: deleteSelectedNodes
            },
            {
                id: 'clear',
                label: 'Clear',
                onClick: clearNodeSelection
            }
        );
        return actions;
    }, [
        activeCanvasView,
        askAiAboutSelection,
        clearNodeSelection,
        createKgRelationshipFromSelection,
        deleteSelectedNodes,
        fitSelectedNodes,
        isStructuredCanvasView,
        selectedBranchId,
        shellActions,
        selectedVisibleNodes.length
    ]);

    const shellStatusBar = useWorkspaceShell ? (
        <ShellStatusBar
            actions={shellSelectionActions}
            items={shellStatusItems}
            overrides={shellTemporaryOverrides}
            progress={aiGenerationProgress ? {
                status: aiProgressStatus,
                progress:
                    aiProgressStatus === 'completed'
                        ? 100
                        : ASK_AI_STAGE_PROGRESS[aiProgressStageId],
                title: aiProgressTitle,
                latestStatus: aiGenerationProgress?.detail || aiGenerationProgress?.message,
                scopeLabel: aiProgressScopeLabel,
                onExpand: () => setIsAiProgressExpanded(true),
                onDismiss: () => setAiGenerationProgress(null)
            } : null}
        />
    ) : null;

    const shellBottomTray = useWorkspaceShell && shellActions.bottomTray ? (
        <ShellReviewTrayHost
            activeAIDraftSession={activeAIDraftSession}
            activeView={activeView}
            bottomTray={shellActions.bottomTray}
            clearPendingSourceDraft={clearPendingSourceDraft}
            edges={edges}
            flowId={flow_id}
            nodes={nodes}
            onActiveViewChange={setActiveView}
            onCloseActiveDraftTray={closeActiveDraftTray}
            onCloseTray={shellActions.closeBottomTray}
            onDraftAccepted={openNextStepsAfterDraftAccept}
            onOpenBottomTray={shellActions.openBottomTray}
            onOpenLocalOutputReviewTray={shellActions.openLocalOutputReviewTray}
            onOpenSourceAskAi={openShellSourceAskAi}
            onReportChange={setValidationReport}
            onSelectEdge={openEdgeInspector}
            onSelectNode={focusNodeForReview}
            pendingSourceDraft={pendingSourceDraft}
        />
    ) : null;
    const shellAiHelpersPanel = shouldRenderShellAiHelpersPanel ? (
        <AiHelpersPanel
            hidden={false}
            selectedNodes={selectedNodes || []}
            autoOpenToken={nextStepsOpenToken}
            initialScopeType={shellActiveScope?.type === 'source' ? 'source_document' : ''}
            summaryLabel={
                shellActions.rightPanel?.id === NEXT_STEPS_GUIDE_PANEL_ID
                    ? 'Next steps'
                    : 'AI Helpers'
            }
            onClose={closeAiHelpersPanel}
        />
    ) : null;
    const shellRightPanel = shellAiHelpersPanel || (shouldRenderRightPropertiesPanel ? (
        <ShellPropertiesPanelHost
            edges={edges}
            nodes={nodes}
            onApplyBranch={applyBranchProperties}
            onApplySource={applySourceProperties}
            onClearBranch={clearBranchLens}
            onCloseBranch={shellActions.closeRightPanel}
            onCloseEdge={closeEdgeInspector}
            onCloseNode={closeNodeInspector}
            onFocusBranchNode={focusNodeForReview}
            rightPanel={shellActions.rightPanel}
            selectedNodeIssues={selectedNodeIssues}
            sourceLibrary={sourceLibrary}
            workspaceBrief={workspaceBrief}
        />
    ) : null);
    const shellOverlayLayer = <ShellOverlayHost overlay={shellActions.overlay} />;
    const handleBranchLensChange = useCallback(
        (branchId) => {
            if (selectedBranchId === branchId) {
                clearBranchLens();
                return;
            }

            setSelectedBranchId(branchId);
            if (useWorkspaceShell && shellActions.rightPanel?.kind === 'branch') {
                shellActions.openBranchMetadata(branchId);
            }
        },
        [clearBranchLens, selectedBranchId, setSelectedBranchId, shellActions, useWorkspaceShell]
    );
    const openShellReviewView = useCallback(
        (view) => {
            setActiveView(view);
            shellActions.setRibbonTab('review', { view });
        },
        [setActiveView, shellActions]
    );
    const openShellOutputView = useCallback(
        (view) => {
            setActiveView(view);
            shellActions.setRibbonTab('outputs', { view });
        },
        [setActiveView, shellActions]
    );
    const handleShellRibbonTabChange = useCallback(
        (tab, context = null) => {
            if (tab === 'map') {
                setActiveView('mindmap');
                shellActions.setRibbonTab('map', context || { view: 'mindmap' });
                return;
            }
            shellActions.setRibbonTab(tab, context);
        },
        [setActiveView, shellActions]
    );
    const openSourceRepairAi = useCallback(() => {
        openEmptyCanvasAskAi({
            initialPrompt:
                'Find missing or weak source support in this workspace. Return source-backed repair candidates with evidence, confidence, and review notes before applying anything.',
            initialVisual: 'review_annotations'
        });
    }, [openEmptyCanvasAskAi]);
    const renderShellRibbonContent = useCallback(
        ({ activeTab }) => {
            if (activeTab === 'home') {
                return (
                    <HomeRibbonGroups
                        canUseWorkspace={Boolean(flow_id)}
                        onOpenMap={() => {
                            setActiveView('mindmap');
                            shellActions.setRibbonTab('map', { view: 'mindmap' });
                        }}
                        onOpenOutline={() => {
                            setActiveView('outline');
                            shellActions.setRibbonTab('home', { view: 'outline' });
                        }}
                        onOpenTasks={() => {
                            setActiveView('tasks');
                            shellActions.setRibbonTab('home', { view: 'tasks' });
                        }}
                        onOpenWorkspace={() => openWorkspaceDockTab('workspace')}
                        onOpenActivity={() => openWorkspaceDockTab('activity')}
                        onOpenHealth={() => openWorkspaceDockTab('health')}
                        onAddSource={openEmptyCanvasSources}
                        onAskAi={() => openEmptyCanvasAskAi()}
                        onStartManual={openManualStart}
                        onOpenNextSteps={openNextStepsFromDock}
                    />
                );
            }
            if (activeTab === 'ai') {
                return (
                    <AiRibbonGroups
                        canUseWorkspace={Boolean(flow_id)}
                        onFindConnections={() => openStructuredAiPreset('connections')}
                        onFindSoftwareOverlap={() => openStructuredAiPreset('softwareOverlap')}
                        onCreateStructuredTable={() => openStructuredAiPreset('table')}
                        onGenerateTasks={() => openStructuredAiPreset('tasks')}
                    />
                );
            }
            if (activeTab === 'review') {
                return (
                    <ReviewRibbonGroups
                        canReview={nodes.length > 0}
                        onOpenConnections={() => openShellReviewView('connections')}
                        onOpenTaskPreview={() => openShellReviewView('preview')}
                        onOpenIssues={() => openShellReviewView('gaps')}
                        onOpenSources={() => openShellReviewView('sources')}
                    />
                );
            }
            if (activeTab === 'sources') {
                return (
                    <SourcesRibbonGroups
                        canUseWorkspace={Boolean(flow_id)}
                        hasSources={sourceLibrary.length > 0}
                        onOpenLibrary={openSourcesLibrary}
                        onAddSource={openEmptyCanvasSources}
                        onReviewSources={() => openShellReviewView('sources')}
                        onRepairSources={openSourceRepairAi}
                        onOpenSourceHealth={() => openWorkspaceDockTab('health')}
                    />
                );
            }
            if (activeTab === 'outputs') {
                return (
                    <OutputsRibbonGroups
                        canOpenOutputs={nodes.length > 0}
                        onOpenTable={() => openShellOutputView('table')}
                        onOpenExecutive={() => openShellOutputView('executive')}
                        onOpenFlowchart={() => openShellOutputView('flowchart')}
                        onOpenTasks={() => openShellOutputView('tasks')}
                        onOpenKanban={() => openShellOutputView('kanban')}
                        onOpenChecklist={() => openShellReviewView('checklist')}
                        onOpenImplementationPackage={() => openShellOutputView('mondayInput')}
                        onOpenStatusReview={() => openShellOutputView('mondayStatus')}
                    />
                );
            }

            return activeTab === 'map' && CANVAS_VIEWS.has(activeView) ? (
                <div className="shell-ribbon-command-stack">
                    <MapRibbonHost />
                    {activeView === 'mindmap' && nodes.length > 0 ? (
                        <MindmapRelationshipRibbonGroup
                            options={MINDMAP_RELATIONSHIP_MODE_OPTIONS}
                            mode={mindmapRelationshipMode}
                            modeCounts={kgRelationshipModeCounts}
                            offMode={MINDMAP_RELATIONSHIP_MODES.OFF}
                            branchLegend={mindmapBranchLegend}
                            selectedBranchId={selectedBranchId}
                            collapsed={mindmapRelationshipTrayCollapsed}
                            onModeChange={setMindmapRelationshipMode}
                            onBranchFocus={handleBranchLensChange}
                            onToggleCollapsed={() =>
                                setMindmapRelationshipTrayCollapsed((current) => !current)
                            }
                        />
                    ) : null}
                    {activeCanvasView === 'knowledgeGraph' && nodes.length > 0 ? (
                        <KnowledgeGraphRelationshipRibbonGroup
                            options={KG_RELATIONSHIP_MODE_OPTIONS}
                            mode={kgRelationshipMode}
                            modeCounts={kgRelationshipModeCounts}
                            collapsed={kgRelationshipTrayCollapsed}
                            topInsights={kgTopInsights}
                            onModeChange={selectKgRelationshipMode}
                            onToggleCollapsed={() =>
                                setKgRelationshipTrayCollapsed((current) => !current)
                            }
                            onOpenInsight={openEdgeInspector}
                        />
                    ) : null}
                    {activeCanvasView === 'flowchart' && nodes.length > 0 ? (
                        <FlowchartLensRibbonGroup
                            mode={flowchartLens}
                            displayMode={flowchartDisplayMode}
                            onModeChange={setFlowchartLens}
                            onDisplayModeChange={setFlowchartDisplayMode}
                        />
                    ) : null}
                </div>
            ) : (
                <div className="shell-ribbon__placeholder" aria-label="Ribbon command groups">
                    <span>Workspace commands</span>
                </div>
            );
        },
        [
            activeCanvasView,
            activeView,
            focusNodeForReview,
            flow_id,
            flowchartDisplayMode,
            flowchartLens,
            handleBranchLensChange,
            kgRelationshipMode,
            kgRelationshipModeCounts,
            kgRelationshipTrayCollapsed,
            kgTopInsights,
            mindmapBranchLegend,
            mindmapRelationshipMode,
            mindmapRelationshipTrayCollapsed,
            nodes.length,
            openEmptyCanvasAskAi,
            openEmptyCanvasSources,
            openEdgeInspector,
            openManualStart,
            openNextStepsFromDock,
            openSourceRepairAi,
            openSourcesLibrary,
            openWorkspaceDockTab,
            openShellOutputView,
            openShellReviewView,
            openStructuredAiPreset,
            selectKgRelationshipMode,
            selectedBranchId,
            setActiveView,
            setFlowchartDisplayMode,
            setFlowchartLens,
            shellActions,
            sourceLibrary.length
        ]
    );

    const workspaceNavigator = (
        <ShellWorkspaceNavigatorHost
            activeTab={workspaceDockActiveTab}
            leftPanelKind={leftPanelKind}
            onActiveTabChange={shellActions.setLeftPanelTab}
            collapsed={workspaceDockCollapsed}
            onCollapsedChange={shellActions.setLeftPanelCollapsed}
            width={workspaceDockWidth}
            onWidthChange={shellActions.setLeftPanelWidth}
            enabled={useWorkspaceShell}
            flowId={flow_id}
            isFocusPanelOpen={isFocusPanelOpen}
            isStructuredCanvasView={isStructuredCanvasView}
            nodes={nodes}
            edges={edges}
            validationReport={validationReport}
            onValidationReportChange={setValidationReport}
            onSelectNode={focusNodeForReview}
            onOpenSources={openSourcesLibrary}
            onOpenAiHelpers={() => openAiHelpersPanel(AI_HELPERS_GUIDE_PANEL_ID)}
            aiUsage={aiUsage}
            aiUsageStatus={aiUsageStatus}
            aiUsageReviewStatus={aiUsageReviewStatus}
            onRefreshAiUsage={refreshAIUsage}
            onOpenUsageDraftSession={openUsageDraftSession}
            onOpenIssuesTray={openIssuesReviewTray}
            onOpenWorkspaceNavigation={shellActions.openWorkspaceNavigation}
            onSelectBranch={setSelectedBranchId}
            hasWorkspaceNextSteps={hasWorkspaceNextSteps}
            workspaceNextSteps={workspaceNextSteps}
            onOpenNextSteps={openNextStepsFromDock}
            hasWorkspaceContentNodes={hasWorkspaceContentNodes}
            sourceNavigator={
                <SourcesPanel
                    embedded
                    isOpen={useWorkspaceShell && leftPanelKind === 'sources'}
                    onClose={closeShellSourcesLibrary}
                    onOpenSourceProperties={(sourceId) => {
                        shellActions.openSourceMetadata(sourceId);
                        closeShellSourcesLibrary();
                    }}
                    onAskAIForSources={openShellSourceAskAi}
                    onSelectNode={focusNodeForReview}
                />
            }
        />
    );
    const shellLeftPanel = useWorkspaceShell && isFocusPanelOpen ? null : workspaceNavigator;
    const workspaceBody = (
        <>
            <Drawer
                isDrawer={isDrawer}
                setIsDrawer={setIsDrawer}
                flowList={flowList}
                setFlowList={setFlowList}
                onOpenSources={openSourcesLibrary}
                onToggleAiHelpers={() => {
                    if (useWorkspaceShell) {
                        if (shellActions.rightPanel?.kind === 'guide') {
                            shellActions.closeRightPanel();
                        } else {
                            openAiHelpersPanel(AI_HELPERS_GUIDE_PANEL_ID);
                        }
                        return;
                    }
                    setIsAiHelpersOpen((current) => {
                        const nextOpen = !current;
                        if (nextOpen) {
                            setInspectorNodeId(undefined);
                            setInspectorEdgeId(undefined);
                        }
                        return nextOpen;
                    });
                }}
            />
            <ActivityPanel />
            <SourcesPanel
                isOpen={!useWorkspaceShell && isSourcesOpen}
                onClose={() => setIsSourcesOpen(false)}
                onSelectNode={focusNodeForReview}
            />
            <IntegrationsPanel validationReport={validationReport} />
            <AutomationsPanel validationReport={validationReport} />
            <ReactFlow
                nodeTypes={nodeType}
                edgeTypes={edgeTypes}
                nodes={renderedCanvasGraph.nodes}
                edges={renderedCanvasGraph.edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                onEdgeClick={openEdgeInspector}
                onPointerDownCapture={handleCanvasPointerDownCapture}
                onMoveEnd={handleMoveEnd}
                onSelectionStart={handleSelectionStart}
                onSelectionEnd={handleSelectionEnd}
                colorMode={lightMode ? 'light' : 'dark'}
                fitView={true}
                fitViewOptions={REACT_FLOW_FIT_VIEW_OPTIONS}
                proOptions={REACT_FLOW_PRO_OPTIONS}
                onInit={setRfInstance}
                className={[
                    getMapStyleClassNames(mapStyle),
                    activeCanvasView === 'knowledgeGraph' && selectedCanvasNodes.length > 0
                        ? 'kg-focus-active'
                        : ''
                ].filter(Boolean).join(' ')}
                minZoom={0.2}
                maxZoom={2.5}
                selectionKeyCode="Shift"
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode={REACT_FLOW_MULTI_SELECTION_KEYS}
            >
                <Background
                    gap={28}
                    size={1}
                    color={backgroundGridColor}
                    style={{ backgroundColor: canvasBackgroundColor }}
                />
                {aiGenerationProgress && (!useWorkspaceShell || isAiProgressExpanded) ? (
                    <Panel
                        position="bottom-center"
                        className="ai-generation-progress-dock"
                        style={{ display: 'block' }}
                    >
                        <AiGenerationProgress
                            status={aiProgressStatus}
                            stageId={aiProgressStageId}
                            progress={
                                aiProgressStatus === 'completed'
                                    ? 100
                                    : ASK_AI_STAGE_PROGRESS[aiProgressStageId]
                            }
                            title={aiProgressTitle}
                            subtitle={aiGenerationProgress?.action?.label || 'Working in a draft layer'}
                            latestStatus={aiGenerationProgress?.detail || aiGenerationProgress?.message}
                            contextItems={aiProgressContextItems}
                            events={aiProgressEvents}
                            showEventFeed
                            defaultEventFeedOpen={useWorkspaceShell}
                            scopeLabel={aiProgressScopeLabel}
                            draftStateLabel={
                                aiProgressStatus === 'failed'
                                    ? 'No changes applied'
                                    : aiProgressStatus === 'completed'
                                      ? 'Ready for review'
                                      : 'Pending review'
                            }
                            scopeDescription={aiProgressDescription}
                            dismissLabel={useWorkspaceShell ? 'Back to status bar' : 'Dismiss progress'}
                            dismissWhileRunning={useWorkspaceShell}
                            onDismiss={() => {
                                if (useWorkspaceShell) {
                                    setIsAiProgressExpanded(false);
                                    return;
                                }
                                setAiGenerationProgress(null);
                            }}
                        />
                    </Panel>
                ) : null}
                {isShellOutputSurfaceView ? (
                    <Panel
                        position="top-left"
                        className="shell-output-surface-panel"
                        style={{ display: 'block' }}
                    >
                        <LocalViewsPanel
                            hidden={false}
                            outputOnly
                            onSelectNode={focusNodeForReview}
                            onSelectEdge={openEdgeInspector}
                        />
                    </Panel>
                ) : null}
                {!isStructuredCanvasView ? (
                    <>
                        {renderedCanvasGraph.nodes.length > 0 ? (
                            <Controls
                                position="bottom-right"
                                fitViewOptions={{ maxZoom: 1 }}
                                showInteractive={false}
                            />
                        ) : null}
                        {renderedCanvasGraph.nodes.length >= 5 && !isFocusPanelOpen ? (
                            <MiniMap
                                position="bottom-right"
                                pannable
                                zoomable
                                nodeStrokeWidth={3}
                                maskColor={
                                    lightMode
                                        ? 'rgba(247, 247, 247, 0.68)'
                                        : 'rgba(10, 10, 10, 0.68)'
                                }
                                nodeColor={(node) =>
                                    node.selected
                                        ? '#eece47'
                                        : node.data?.manual
                                          ? '#b77bff'
                                          : '#6ea8fe'
                                }
                            />
                        ) : null}
                        {shouldShowEmptyCanvasState ? (
                            <Panel
                                position="top-center"
                                className={`canvas-empty-state-panel ${isAiGenerationActive ? 'canvas-empty-state-panel--minimized' : ''}`}
                                style={{ display: 'block' }}
                            >
                                <section
                                    className={`canvas-empty-state ${isAiGenerationActive ? 'canvas-empty-state--minimized' : ''}`}
                                    aria-label="Empty workspace"
                                >
                                    {isAiGenerationActive ? (
                                        <>
                                            <span>Starting workspace</span>
                                            <p>AI is drafting the first reviewable map.</p>
                                        </>
                                    ) : (
                                        <>
                                            <span>Start your think space</span>
                                            <p>Add sources, ask AI, or create the first node manually.</p>
                                            <div>
                                                {latestReviewableDraftSession ? (
                                                    <button type="button" onClick={openLatestReviewableDraftSession}>
                                                        Resume draft
                                                    </button>
                                                ) : null}
                                                <button type="button" onClick={openEmptyCanvasSources}>
                                                    Add sources
                                                </button>
                                                <button type="button" onClick={openEmptyCanvasAskAi}>
                                                    Ask AI
                                                </button>
                                                <button type="button" onClick={openEmptyCanvasStarterGuide}>
                                                    Guided starts
                                                </button>
                                                <button type="button" onClick={openManualStart}>
                                                    Start with node
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </section>
                            </Panel>
                        ) : null}
                    </>
                ) : null}
                {isStructuredCanvasView ? (
                    <CanvasStructuredView
                        view={activeCanvasView}
                        nodes={nodes}
                        edges={edges}
                        activeGraphFilters={activeGraphFilters}
                        selectedBranchId={selectedBranchId}
                        onOpenNode={focusNodeForReview}
                        onSelectEdge={openEdgeInspector}
                        onSelectBranch={setSelectedBranchId}
                        onFocusInMap={focusStructuredNodeInMap}
                        onApplyFilters={setActiveGraphFilters}
                        onOpenSources={openEmptyCanvasSources}
                        onAskAi={openEmptyCanvasAskAi}
                        onBackToMap={() => setActiveView('mindmap')}
                        onStartManual={openManualStart}
                        onGenerateTaskCandidates={() => openStructuredAiPreset('tasks')}
                        onPrepareKanbanBoard={() => openStructuredAiPreset('kanban')}
                        onCreateStructuredTable={() => openStructuredAiPreset('table')}
                        onCreateExecutiveOutput={() => openStructuredAiPreset('executive')}
                        flowchartLens={flowchartLens}
                        flowchartDisplayMode={flowchartDisplayMode}
                    />
                ) : null}
                {!useWorkspaceShell && workspaceNavigator ? (
                    <FloatingDock
                        id="workspaceTools"
                        ariaLabel="Workspace tools dock"
                        className="workspace-tools-floating-dock"
                        defaultPlacement={{ dock: 'left', offset: { x: 0, y: 96 } }}
                        controlsPlacement="child"
                    >
                        {workspaceNavigator}
                    </FloatingDock>
                ) : null}
                {!useWorkspaceShell && selectedBranchId && !isStructuredCanvasView && !isFocusPanelOpen ? (
                    <Panel position="top-left" style={{ display: 'block' }}>
                        <section className="canvas-scope-banner" aria-label="Active canvas scope">
                            <span>Branch lens</span>
                            <strong>{selectedBranchTitle || 'Selected branch'}</strong>
                            <small>Other visible nodes stay dimmed for context.</small>
                            <div className="canvas-scope-banner__actions">
                                {useWorkspaceShell ? (
                                    <button
                                        type="button"
                                        onClick={() => shellActions.openBranchMetadata(selectedBranchId)}
                                    >
                                        Properties
                                    </button>
                                ) : null}
                                <button type="button" onClick={clearBranchLens}>
                                    Clear
                                </button>
                            </div>
                        </section>
                    </Panel>
                ) : null}
                {!useWorkspaceShell && selectedVisibleNodes.length && !isStructuredCanvasView && !isFocusPanelOpen ? (
                    <Panel position="bottom-center" style={{ display: 'block' }}>
                        <section className="selection-action-bar" aria-label="Selected node actions">
                            <div className="selection-action-main">
                                <strong>
                                    {selectedVisibleNodes.length} selected
                                </strong>
                                {selectedBranchId ? <span>Branch lens active</span> : null}
                                {activeCanvasView === 'knowledgeGraph' && selectedVisibleNodes.length === 2 ? (
                                    <button type="button" onClick={createKgRelationshipFromSelection}>
                                        Connect
                                    </button>
                                ) : null}
                                <button type="button" onClick={askAiAboutSelection}>
                                    <FiMessageSquare />
                                    More
                                </button>
                                <button type="button" onClick={fitSelectedNodes}>
                                    <FiMaximize2 />
                                    Fit
                                </button>
                                <button
                                    type="button"
                                    className="selection-action-danger"
                                    onClick={deleteSelectedNodes}
                                >
                                    <FiTrash2 />
                                    Delete
                                </button>
                                <button type="button" onClick={clearNodeSelection}>
                                    Clear
                                </button>
                                {selectedBranchId ? (
                                    <button type="button" onClick={clearBranchLens}>
                                        Clear lens
                                    </button>
                                ) : null}
                            </div>
                            <form className="selection-quick-ask" onSubmit={submitSelectionQuickAsk}>
                                <div className="selection-quick-mode" aria-label="Quick Ask AI mode">
                                    {SELECTION_QUICK_ASK_MODES.map((mode) => (
                                        <button
                                            key={mode.id}
                                            type="button"
                                            className={selectionAskMode === mode.id ? 'active' : ''}
                                            onClick={() => setSelectionAskMode(mode.id)}
                                        >
                                            {mode.label}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    value={selectionAskPrompt}
                                    onChange={(event) => setSelectionAskPrompt(event.target.value)}
                                    placeholder="Ask about the selected nodes..."
                                    aria-label="Ask AI about selected nodes"
                                />
                                <button type="submit" disabled={!selectionAskPrompt.trim() || isSelectionAskBusy}>
                                    <FiSend />
                                </button>
                            </form>
                            {selectionAskStatus || selectionAskAnswer ? (
                                <div className="selection-quick-result">
                                    {selectionAskStatus ? <span>{selectionAskStatus}</span> : null}
                                    {selectionAskAnswer ? <p>{selectionAskAnswer}</p> : null}
                                </div>
                            ) : null}
                        </section>
                    </Panel>
                ) : null}
                {!useWorkspaceShell && shouldShowCanvasLens && (!isFocusPanelOpen || isStructuredCanvasView) ? (
                    <FloatingDock
                        id="canvasLens"
                        ariaLabel="Canvas lens toolbar"
                        className="canvas-lens-floating-dock"
                        defaultPlacement={{
                            dock: shouldShowCanvasLens ? 'top' : 'right',
                            offset: shouldShowCanvasLens
                                ? { x: 0, y: 0 }
                                : { x: -12, y: 86 }
                        }}
                    >
                        <LocalViewsPanel
                            hidden={false}
                            onSelectNode={focusNodeForReview}
                            onSelectEdge={openEdgeInspector}
                        />
                    </FloatingDock>
                ) : null}
                {!useWorkspaceShell && isLocalOutputView && !isFocusPanelOpen ? (
                    <FloatingDock
                        id="workspaceOutput"
                        ariaLabel="Workspace output workflow"
                        className="workspace-output-floating-dock"
                        defaultPlacement={{
                            dock: 'left',
                            offset: { x: 0, y: 96 }
                        }}
                    >
                        <LocalViewsPanel
                            hidden={false}
                            onSelectNode={focusNodeForReview}
                            onSelectEdge={openEdgeInspector}
                        />
                    </FloatingDock>
                ) : null}
                {!useWorkspaceShell && activeView === 'mindmap' && nodes.length > 0 && !isFocusPanelOpen ? (
                    <FloatingDock
                        id="mindmapRelationships"
                        ariaLabel="Mind map relationship lens"
                        className="mindmap-relationship-floating-dock"
                        defaultPlacement={{
                            dock: 'top',
                            offset: { x: 420, y: 0 }
                        }}
                    >
                        <section
                            className="kg-relationship-controls mindmap-relationship-controls"
                            aria-label="Mind map relationship lens"
                        >
                            <div className="kg-relationship-header">
                                <div>
                                    <span>Map lens</span>
                                    <strong>
                                        {MINDMAP_RELATIONSHIP_MODE_OPTIONS.find((option) => option.id === mindmapRelationshipMode)?.label ||
                                            'Structure Only'}
                                    </strong>
                                </div>
                            </div>
                            <div className="kg-relationship-mode-buttons mindmap-relationship-mode-buttons">
                                {MINDMAP_RELATIONSHIP_MODE_OPTIONS.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        className={mindmapRelationshipMode === option.id ? 'active' : ''}
                                        title={option.description}
                                        onClick={() => setMindmapRelationshipMode(option.id)}
                                    >
                                        <span>{option.shortLabel || option.label}</span>
                                        <small>
                                            {option.id === MINDMAP_RELATIONSHIP_MODES.OFF
                                                ? 'tree'
                                                : kgRelationshipModeCounts[option.id] || 0}
                                        </small>
                                    </button>
                                ))}
                            </div>
                            {mindmapBranchLegend.length ? (
                                <div className="mindmap-branch-legend" aria-label="Mind map branches">
                                    {mindmapBranchLegend.map((branch) => (
                                        <button
                                            key={branch.id}
                                            type="button"
                                            className={[
                                                `canvas-branch-color-${branch.colorIndex}`,
                                                selectedBranchId === branch.id ? 'active' : ''
                                            ]
                                                .filter(Boolean)
                                                .join(' ')}
                                            title={`Focus ${branch.title}`}
                                            onClick={() =>
                                                setSelectedBranchId(
                                                    selectedBranchId === branch.id ? undefined : branch.id
                                                )
                                            }
                                        >
                                            <span />
                                            <strong>{branch.title}</strong>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </section>
                    </FloatingDock>
                ) : null}
                {!useWorkspaceShell && activeCanvasView === 'knowledgeGraph' && nodes.length > 0 ? (
                    <FloatingDock
                        id="kgRelationships"
                        ariaLabel="Knowledge graph relationship toolbar"
                        className="kg-relationship-floating-dock"
                        defaultPlacement={{
                            dock: 'top',
                            offset: { x: 420, y: 0 }
                        }}
                    >
                        <section
                            className={`kg-relationship-controls ${kgRelationshipTrayCollapsed ? 'kg-relationship-controls--collapsed' : ''}`}
                            aria-label="Knowledge graph relationship focus"
                        >
                            <div className="kg-relationship-header">
                                <div>
                                    <span>KG focus</span>
                                    <strong>
                                        {KG_RELATIONSHIP_MODE_OPTIONS.find((option) => option.id === kgRelationshipMode)?.label ||
                                            'Insight Focus'}
                                    </strong>
                                </div>
                                <button
                                    type="button"
                                    className="kg-relationship-icon-button"
                                    title={kgRelationshipTrayCollapsed ? 'Expand relationship tray' : 'Collapse relationship tray'}
                                    aria-label={kgRelationshipTrayCollapsed ? 'Expand relationship tray' : 'Collapse relationship tray'}
                                    onClick={() => setKgRelationshipTrayCollapsed((current) => !current)}
                                >
                                    {kgRelationshipTrayCollapsed ? <FiChevronRight /> : <FiChevronLeft />}
                                </button>
                            </div>
                            <div className="kg-relationship-mode-buttons">
                                {KG_RELATIONSHIP_MODE_OPTIONS.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        className={kgRelationshipMode === option.id ? 'active' : ''}
                                        title={option.description}
                                        onClick={() => selectKgRelationshipMode(option.id)}
                                    >
                                        <span>{option.shortLabel || option.label}</span>
                                        <small>{kgRelationshipModeCounts[option.id] || 0}</small>
                                    </button>
                                ))}
                            </div>
                            {!kgRelationshipTrayCollapsed ? (
                                <>
                                    <div className="kg-top-insights" aria-label="Knowledge graph top insights">
                                        {kgTopInsights.length ? (
                                            kgTopInsights.map((insight) => (
                                                <button
                                                    key={insight.id}
                                                    type="button"
                                                    title={insight.rationale || `${insight.sourceTitle} ${insight.relationship} ${insight.targetTitle}`}
                                                    onClick={() => {
                                                        setIsAiHelpersOpen(false);
                                                        setInspectorEdgeId(insight.id);
                                                    }}
                                                >
                                                    <span>{insight.familyLabel}</span>
                                                    <strong>{insight.sourceTitle}</strong>
                                                    <small>
                                                        {insight.relationship} {insight.targetTitle}
                                                    </small>
                                                </button>
                                            ))
                                        ) : (
                                            <p>No accepted relationships in this focus yet.</p>
                                        )}
                                    </div>
                                    <p className="kg-relationship-hint">
                                        Use Outputs / Connections for the review table and copy or download export.
                                    </p>
                                </>
                            ) : null}
                        </section>
                    </FloatingDock>
                ) : null}
                {!useWorkspaceShell ? (
                    <Panel
                        position="bottom-right"
                        style={{ display: 'block' }}
                    >
                        <AiHelpersPanel
                            hidden={!isAiHelpersOpen || isStructuredCanvasView}
                            selectedNodes={selectedNodes || []}
                            autoOpenToken={nextStepsOpenToken}
                            summaryLabel={nextStepsOpenToken ? 'Next steps' : 'AI Helpers'}
                            onClose={closeAiHelpersPanel}
                        />
                    </Panel>
                ) : null}
                {shouldRenderInspectorDock ? (
                    <FloatingDock
                        id="metadataInspector"
                        ariaLabel="Node metadata drawer"
                        className="metadata-inspector-floating-dock"
                        defaultPlacement={{
                            dock: 'right',
                            offset: { x: 0, y: 92 }
                        }}
                    >
                        {inspectorEdgeId ? (
                            <EdgeInspector
                                selectedEdgeId={inspectorEdgeId}
                                onClose={closeEdgeInspector}
                            />
                        ) : (
                            <NodeInspector
                                selectedNodeId={inspectorNodeId}
                                validationIssues={selectedNodeIssues}
                                onClose={closeNodeInspector}
                                onAiDraftAccepted={openNextStepsAfterDraftAccept}
                            />
                        )}
                    </FloatingDock>
                ) : null}
                {!useWorkspaceShell ? <SourceDraftReviewPanel /> : null}
            </ReactFlow>
        </>
    );

    return (
        <div
            className={[
                'app',
                lightMode ? 'light' : 'dark',
                useWorkspaceShell ? 'ui-shell-ribbon-enabled' : ''
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <Modal ChildProp={Prompts} />
            <Header
                setIsDrawer={setIsDrawer}
                flowList={flowList}
                setFlowList={setFlowList}
                lightMode={lightMode}
                setLightMode={setLightMode}
                onWorkspaceAskAi={useWorkspaceShell ? openShellWorkspaceAskAi : undefined}
                workspaceNavigationTabs={useWorkspaceShell ? DEFAULT_SHELL_RIBBON_TABS : []}
                activeWorkspaceNavigationTab={shellActions.activeRibbonTab}
                onWorkspaceNavigationChange={handleShellRibbonTabChange}
            />
            {useWorkspaceShell ? (
                <WorkspaceShellAdapter
                    activeRibbonTab={shellActions.activeRibbonTab}
                    onRibbonTabChange={handleShellRibbonTabChange}
                    renderRibbonContent={renderShellRibbonContent}
                    leftWidth={workspaceShellLeftWidth}
                    leftPanel={shellLeftPanel}
                    centerCanvas={workspaceBody}
                    statusBar={shellStatusBar}
                    rightPanel={shellRightPanel}
                    bottomTray={shellBottomTray}
                    overlayLayer={shellOverlayLayer}
                />
            ) : (
                workspaceBody
            )}
        </div>
    );
};

export default App;
