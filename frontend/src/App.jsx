import {
    Background,
    BaseEdge,
    Controls,
    EdgeLabelRenderer,
    MiniMap,
    Panel,
    ReactFlow,
    getBezierPath,
    getSmoothStepPath,
    useNodesInitialized,
    useOnSelectionChange,
    useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiMaximize2, FiMessageSquare, FiMove, FiTrash2 } from 'react-icons/fi';
import { nodeTypes } from './nodes/nodeTypes.js';
import { useShallow } from 'zustand/shallow';
import useStore from './stores/store.js';
import Modal from './global-components/Modal.jsx';
import Prompts from './global-components/Prompts.jsx';
import AddDataSource from './global-components/AddDataSource.jsx';
import getLayoutedElements from './utils/setLayout.js';
import modalStore from './stores/modalStore';
import AskMultiple from './global-components/AskMultiple.jsx';
import Header from './global-components/Header.jsx';
import Drawer from './global-components/Drawer.jsx';
import flowStore from './stores/flowStore.js';
import NodeInspector from './global-components/NodeInspector.jsx';
import EdgeInspector from './global-components/EdgeInspector.jsx';
import GraphValidationPanel from './global-components/GraphValidationPanel.jsx';
import LocalViewsPanel from './views/LocalViewsPanel.jsx';
import CanvasStructuredView from './views/CanvasStructuredView.jsx';
import WorkspaceBriefPanel from './global-components/WorkspaceBriefPanel.jsx';
import ActivityPanel from './global-components/ActivityPanel.jsx';
import SourcesPanel from './global-components/SourcesPanel.jsx';
import IntegrationsPanel from './global-components/IntegrationsPanel.jsx';
import AutomationsPanel from './global-components/AutomationsPanel.jsx';
import ManualNodeControls from './global-components/ManualNodeControls.jsx';
import AiHelpersPanel from './global-components/AiHelpersPanel.jsx';
import SourceDraftReviewPanel from './global-components/SourceDraftReviewPanel.jsx';
import WorkspaceNudgeSurface from './global-components/WorkspaceNudgeSurface.jsx';
import DataSourceSelect from './global-components/DataSourceSelect.jsx';
import PromptModal from './modals/PromptModal.jsx';
import { getLocalSetting, setLocalSetting, SETTINGS_KEYS } from './config/localSettings';
import { parseFlowSnapshot, stringifyFlowSnapshot } from './utils/flowSnapshots';
import { rememberWorkspace, selectStartupWorkspace } from './utils/workspaceSession';
import useActivityStore from './stores/activityStore';
import useAutomationStore from './stores/automationStore';

const CANVAS_VIEWS = new Set(['mindmap', 'knowledgeGraph', 'outline', 'executive', 'tasks', 'table']);
const STRUCTURED_CANVAS_VIEWS = new Set(['outline', 'executive', 'tasks', 'table']);
const STRUCTURED_AI_PRESETS = {
    tasks: {
        role: 'task-planner',
        action: 'generate_tasks',
        scope: 'branch'
    },
    table: {
        role: 'data-table-interpreter',
        action: 'interpret_table_data',
        scope: 'workspace'
    }
};
const TASK_CANVAS_TYPES = new Set([
    'task',
    'procedure',
    'workflow',
    'step',
    'decision',
    'dependency',
    'requirement',
    'needs_review'
]);
const HIERARCHY_EDGE_TYPES = new Set([
    '',
    'contains',
    'parent_child',
    'parent-child',
    'child',
    'section',
    'subtopic',
    'branch',
    'step',
    'smoothstep'
]);

const nodeData = (node) => node?.data || {};

const nodeSourceRefs = (node) => {
    const data = nodeData(node);
    return Array.isArray(data.source_refs)
        ? data.source_refs
        : Array.isArray(data.data?.source_refs)
          ? data.data.source_refs
          : [];
};

const hasSourceEvidence = (ref) =>
    Boolean(
        ref?.document_id ||
            ref?.source_type ||
            ref?.query_id ||
            ref?.table_name ||
            ref?.database_id ||
            ref?.result_hash
    );

const nodeTypeValue = (node) => {
    const data = nodeData(node);
    return data.node_type || node.type || '';
};

const humanizeRelationship = (value = '') =>
    String(value || 'relationship')
        .replaceAll('_', ' ')
        .replaceAll('-', ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());

const edgeRelationshipType = (edge = {}) =>
    String(
        edge.relationship_type ||
            edge.data?.relationship_type ||
            edge.data?.relationshipType ||
            edge.metadata?.relationship_type ||
            edge.type ||
            ''
    )
        .trim()
        .toLowerCase();

const formatEdgeConfidence = (confidence) => {
    if (confidence === undefined || confidence === null || confidence === '') {
        return '';
    }
    const numeric = Number(confidence);
    if (Number.isFinite(numeric)) {
        const normalized = numeric > 1 ? numeric : numeric * 100;
        return `${Math.round(normalized)}%`;
    }
    return String(confidence);
};

const edgeSemanticTone = (relationshipType = '') => {
    if (/conflict|contradict|risk|block/.test(relationshipType)) {
        return 'conflict';
    }
    if (/depend|requires|prerequisite|blocked_by|blocks/.test(relationshipType)) {
        return 'dependency';
    }
    if (/support|evidence|source|proves|validates|cites/.test(relationshipType)) {
        return 'evidence';
    }
    if (/duplicate|overlap|similar|same/.test(relationshipType)) {
        return 'overlap';
    }
    return 'related';
};

const edgeSemanticInfo = (edge = {}) => {
    const relationshipType = edgeRelationshipType(edge);
    const isHierarchy = HIERARCHY_EDGE_TYPES.has(relationshipType);
    const confidence = formatEdgeConfidence(
        edge.confidence || edge.data?.confidence || edge.metadata?.confidence
    );
    const rationale =
        edge.data?.rationale ||
        edge.metadata?.rationale ||
        edge.rationale ||
        edge.data?.source_signal ||
        '';
    const label = isHierarchy
        ? 'Structure'
        : [humanizeRelationship(relationshipType), confidence].filter(Boolean).join(' / ');
    return {
        relationship_type: relationshipType || 'contains',
        kind: isHierarchy ? 'hierarchy' : 'relationship',
        tone: isHierarchy ? 'hierarchy' : edgeSemanticTone(relationshipType),
        label,
        confidence,
        rationale,
        tooltip: [
            isHierarchy ? 'Hierarchy edge: structure' : `Relationship edge: ${humanizeRelationship(relationshipType)}`,
            confidence ? `Confidence: ${confidence}` : '',
            rationale ? `Rationale: ${rationale}` : ''
        ]
            .filter(Boolean)
            .join('\n')
    };
};

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
            : getBezierPath(pathArgs);
    const labelClassName = [
        'semantic-edge-label',
        semantic.kind === 'hierarchy'
            ? 'semantic-edge-label--hierarchy'
            : 'semantic-edge-label--relationship',
        semantic.tone ? `semantic-edge-label--${semantic.tone}` : ''
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
        </>
    );
};

const nodeMatchesCanvasLens = (node, activeCanvasView) => {
    const data = nodeData(node);
    const type = nodeTypeValue(node);
    if (activeCanvasView === 'tasks') {
        return TASK_CANVAS_TYPES.has(type);
    }
    if (activeCanvasView === 'table') {
        return Boolean(data.table_rows?.length || data.table_columns?.length || data.data?.df?.length);
    }
    if (activeCanvasView === 'knowledgeGraph') {
        return node.type !== 'dataSource';
    }
    return true;
};

const nodeMatchesGraphFilter = (node, filterId) => {
    const data = nodeData(node);
    const type = nodeTypeValue(node);
    const sourceRefs = nodeSourceRefs(node);

    if (filterId === 'source-backed') {
        return sourceRefs.some(hasSourceEvidence);
    }
    if (filterId === 'needs-review') {
        return data.status === 'needs_review' || type === 'needs_review';
    }
    if (filterId === 'manual') {
        return Boolean(data.manual);
    }
    if (filterId === 'ai-generated') {
        return !data.manual && data.status !== 'approved' && data.status !== 'reviewed';
    }
    if (filterId === 'tasks-only') {
        return TASK_CANVAS_TYPES.has(type);
    }
    if (filterId === 'unassigned') {
        return TASK_CANVAS_TYPES.has(type) && !data.owner_id;
    }
    if (filterId === 'missing-due-date') {
        return TASK_CANVAS_TYPES.has(type) && !data.due_date;
    }
    if (filterId === 'missing-source') {
        return node.type !== 'dataSource' && !sourceRefs.some(hasSourceEvidence);
    }
    if (filterId === 'low-confidence') {
        const confidence = Number(data.confidence);
        return data.confidence !== '' && Number.isFinite(confidence) && confidence < 0.6;
    }
    if (filterId === 'hidden-from-export') {
        return Boolean(data.hidden_from_export);
    }
    return true;
};

const collectVisibleBranchIds = (nodes, edges, selectedBranchId) => {
    if (!selectedBranchId) {
        return new Set(nodes.map((node) => node.id));
    }

    const childrenByParent = edges.reduce((children, edge) => {
        const next = children.get(edge.source) || [];
        next.push(edge.target);
        children.set(edge.source, next);
        return children;
    }, new Map());
    const visibleIds = new Set([selectedBranchId]);
    const queue = [selectedBranchId];
    while (queue.length > 0) {
        const current = queue.shift();
        (childrenByParent.get(current) || []).forEach((childId) => {
            if (!visibleIds.has(childId)) {
                visibleIds.add(childId);
                queue.push(childId);
            }
        });
    }
    return visibleIds;
};

const CANVAS_OUT_OF_SCOPE_NODE_CLASS = 'canvas-node-out-of-scope';
const CANVAS_OUT_OF_SCOPE_EDGE_CLASS = 'canvas-edge-out-of-scope';

const formatUsageNumber = (value) => {
    const count = Number(value || 0);
    if (!Number.isFinite(count) || count <= 0) {
        return '0';
    }
    return count.toLocaleString();
};

const scopedClassName = (className = '', scopeClass, isActive) => {
    const classes = String(className || '')
        .split(/\s+/)
        .filter(
            (value) =>
                value &&
                value !== CANVAS_OUT_OF_SCOPE_NODE_CLASS &&
                !value.startsWith('canvas-node-density-') &&
                value !== CANVAS_OUT_OF_SCOPE_EDGE_CLASS
        );
    if (isActive) {
        classes.push(scopeClass);
    }
    return classes.join(' ') || undefined;
};

const canvasEdgeClassName = ({
    className = '',
    isOutOfScope = false,
    semantic,
    activeCanvasView
}) => {
    const classes = String(className || '')
        .split(/\s+/)
        .filter(
            (value) =>
                value &&
                value !== CANVAS_OUT_OF_SCOPE_EDGE_CLASS &&
                !value.startsWith('semantic-edge-') &&
                value !== 'semantic-edge'
        );
    if (isOutOfScope) {
        classes.push(CANVAS_OUT_OF_SCOPE_EDGE_CLASS);
    }
    if (activeCanvasView === 'knowledgeGraph' && semantic) {
        classes.push('semantic-edge');
        classes.push(
            semantic.kind === 'hierarchy'
                ? 'semantic-edge-hierarchy'
                : 'semantic-edge-relationship'
        );
        classes.push(`semantic-edge-${semantic.tone || 'related'}`);
    }
    return classes.join(' ') || undefined;
};

const projectCanvasGraph = ({
    nodes,
    edges,
    activeCanvasView,
    activeGraphFilters,
    selectedBranchId,
    canvasNodeDensity
}) => {
    const hasBranchScope = Boolean(selectedBranchId);
    const branchIds = collectVisibleBranchIds(nodes, edges, selectedBranchId);
    const filters = Array.isArray(activeGraphFilters) ? activeGraphFilters : [];
    const projectedIds = new Set(
        nodes
            .filter((node) => nodeMatchesCanvasLens(node, activeCanvasView))
            .filter((node) => filters.every((filterId) => nodeMatchesGraphFilter(node, filterId)))
            .map((node) => node.id)
    );

    return {
        nodes: nodes.map((node) => {
            const isProjected = projectedIds.has(node.id);
            const isOutOfScope = hasBranchScope && !branchIds.has(node.id);
            const densityClass = canvasNodeDensity
                ? `canvas-node-density-${canvasNodeDensity}`
                : 'canvas-node-density-compact';
            const nextClassName = scopedClassName(
                node.className,
                CANVAS_OUT_OF_SCOPE_NODE_CLASS,
                isProjected && isOutOfScope
            );
            return {
                ...node,
                hidden: !isProjected,
                className: [nextClassName, densityClass].filter(Boolean).join(' ')
            };
        }),
        edges: edges.map((edge) => {
            const isProjected = projectedIds.has(edge.source) && projectedIds.has(edge.target);
            const isOutOfScope =
                hasBranchScope && (!branchIds.has(edge.source) || !branchIds.has(edge.target));
            const semantic = edgeSemanticInfo(edge);
            const isKnowledgeGraph = activeCanvasView === 'knowledgeGraph';
            return {
                ...edge,
                type: isKnowledgeGraph ? 'semantic' : edge.type,
                label: isKnowledgeGraph ? semantic.label : edge.label,
                data: {
                    ...(edge.data || {}),
                    semantic_edge: isKnowledgeGraph ? semantic : undefined
                },
                hidden: !isProjected,
                className: canvasEdgeClassName({
                    className: edge.className,
                    isOutOfScope: isProjected && isOutOfScope,
                    semantic,
                    activeCanvasView
                })
            };
        })
    };
};

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

const App = () => {
    const nodeType = useMemo(() => nodeTypes, []);
    const edgeType = useMemo(() => ({ semantic: SemanticEdge }), []);
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
        canvasNodeDensity: state.canvasNodeDensity,
        selectedBranchId: state.selectedBranchId,
        setSelectedBranchId: state.setSelectedBranchId,
        inspectorNodeId: state.inspectorNodeId,
        setInspectorNodeId: state.setInspectorNodeId,
        inspectorEdgeId: state.inspectorEdgeId,
        setInspectorEdgeId: state.setInspectorEdgeId,
        setActiveAIDraftSession: state.setActiveAIDraftSession,
        setViewPort: state.setViewPort,
        setWorkspaceBrief: state.setWorkspaceBrief,
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
        canvasNodeDensity,
        selectedBranchId,
        setSelectedBranchId,
        inspectorNodeId,
        setInspectorNodeId,
        inspectorEdgeId,
        setInspectorEdgeId,
        setActiveAIDraftSession,
        setViewPort,
        setWorkspaceBrief,
        setSourceLibrary,
        setAIActionRuns
    } = useStore(useShallow(selector));
    const areNodesIntialised = useNodesInitialized();
    const [askMultipleClass, setAskMultipleClass] = useState();
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
    const [validationReport, setValidationReport] = useState();
    const [workspaceDockTab, setWorkspaceDockTab] = useState('sources');
    const [workspaceDockCollapsed, setWorkspaceDockCollapsed] = useState(false);
    const [workspaceDockOffset, setWorkspaceDockOffset] = useState({ x: 0, y: 0 });
    const [aiUsage, setAIUsage] = useState();
    const [aiUsageStatus, setAIUsageStatus] = useState('');
    const [aiUsageReviewStatus, setAIUsageReviewStatus] = useState('');
    const [nextStepsOpenToken, setNextStepsOpenToken] = useState(0);
    const reactFlow = useReactFlow();
    const { fitView } = useReactFlow();
    const popNode = modalStore((s) => s.popNode);
    const pushNode = modalStore((s) => s.pushNode);
    const [flowList, setFlowList] = useState([]);
    const [isSourcesOpen, setIsSourcesOpen] = useState(false);
    const [isAiHelpersOpen, setIsAiHelpersOpen] = useState(false);
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
        if (workspaceDockTab === 'health') {
            refreshAIUsage();
        }
    }, [refreshAIUsage, workspaceDockTab]);

    const startWorkspaceDockDrag = useCallback((event) => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        const startOffset = workspaceDockOffset;

        const handlePointerMove = (moveEvent) => {
            const nextX = startOffset.x + moveEvent.clientX - startX;
            const nextY = startOffset.y + moveEvent.clientY - startY;
            setWorkspaceDockOffset({
                x: Math.max(0, Math.min(nextX, window.innerWidth - 120)),
                y: Math.max(-48, Math.min(nextY, window.innerHeight - 180))
            });
        };

        const stopDrag = () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', stopDrag);
            window.removeEventListener('pointercancel', stopDrag);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', stopDrag);
        window.addEventListener('pointercancel', stopDrag);
    }, [workspaceDockOffset]);

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
                setActiveAIDraftSession(response.data || session);
                setAIUsageReviewStatus('Draft session opened for review.');
            } catch (error) {
                setAIUsageReviewStatus('Draft session unavailable');
            }
        },
        [flow_id, setActiveAIDraftSession, setInspectorEdgeId, setInspectorNodeId]
    );

    const selectedNodeIssues = useMemo(() => {
        if (!inspectorNodeId || !validationReport?.issues) {
            return [];
        }

        return validationReport.issues.filter(
            (issue) => issue.nodeId === inspectorNodeId
        );
    }, [inspectorNodeId, validationReport]);
    const canvasGraph = useMemo(
        () =>
            projectCanvasGraph({
                nodes,
                edges,
                activeCanvasView,
                activeGraphFilters,
                selectedBranchId,
                canvasNodeDensity
            }),
        [activeCanvasView, activeGraphFilters, canvasNodeDensity, edges, nodes, selectedBranchId]
    );
    const isStructuredCanvasView = STRUCTURED_CANVAS_VIEWS.has(activeCanvasView);
    const renderedCanvasGraph = useMemo(() => {
        if (!isStructuredCanvasView) {
            return canvasGraph;
        }
        return {
            nodes: canvasGraph.nodes.map((node) => ({ ...node, hidden: true })),
            edges: canvasGraph.edges.map((edge) => ({ ...edge, hidden: true }))
        };
    }, [canvasGraph, isStructuredCanvasView]);
    const selectedVisibleNodes = useMemo(() => {
        return renderedCanvasGraph.nodes.filter((node) => !node.hidden && node.selected);
    }, [renderedCanvasGraph.nodes]);
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
    const lastLayoutTriggerRef = useRef(trigger);
    const closeNodeInspector = useCallback(() => {
        setInspectorNodeId(undefined);
        const currentNodes = useStore.getState().nodes;
        setNodes(
            currentNodes.map((node) =>
                node.selected ? { ...node, selected: false } : node
            )
        );
    }, [setInspectorNodeId, setNodes]);
    const openEdgeInspector = useCallback(
        (event, edge) => {
            event?.stopPropagation?.();
            if (edge?.id) {
                setInspectorEdgeId(edge.id);
            }
        },
        [setInspectorEdgeId]
    );
    const closeEdgeInspector = useCallback(() => {
        setInspectorEdgeId(undefined);
    }, [setInspectorEdgeId]);
    const focusNodeForReview = useCallback(
        (nodeId) => {
            if (!nodeId) {
                return;
            }

            const node = nodes.find((item) => item.id === nodeId);
            setInspectorNodeId(nodeId);

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
        [nodes, reactFlow, setInspectorNodeId, setNodes]
    );

    const clearNodeSelection = useCallback(() => {
        const currentNodes = useStore.getState().nodes;
        setNodes(currentNodes.map((node) => (node.selected ? { ...node, selected: false } : node)));
        setSelectedCanvasNodes([]);
        setSelectedNodes(undefined);
        setAskMultipleClass('deanimate');
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
            setAskMultipleClass('animate');
        } else {
            setSelectedNodes(undefined);
            setAskMultipleClass('deanimate');
        }
    }, []);

    const handleNodeClick = useCallback(
        (event, node) => {
            if (!event?.ctrlKey && !event?.metaKey) {
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
        [setNodes, syncCanvasSelection]
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

        setNodes(currentNodes.filter((node) => !deletedIds.has(node.id)));
        setEdges(
            currentEdges.filter(
                (edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)
            )
        );
        if (deletedIds.has(selectedBranchId)) {
            setSelectedBranchId(undefined);
        }
        if (deletedIds.has(inspectorNodeId)) {
            setInspectorNodeId(undefined);
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
        setSelectedCanvasNodes([]);
        setSelectedNodes(undefined);
        setAskMultipleClass('deanimate');
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
        setSelectedBranchId
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

    const openStructuredAiPreset = useCallback(
        (presetKey) => {
            const preset = STRUCTURED_AI_PRESETS[presetKey];
            if (!preset || !flow_id) {
                return;
            }
            const preferredScope =
                preset.scope === 'branch' && selectedBranchId ? 'branch' : preset.scope;
            pushNode(PromptModal, {
                scope: preferredScope,
                nodeId: preferredScope === 'branch' ? selectedBranchId : undefined,
                initialRoleId: preset.role,
                initialActionId: preset.action
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
        [flow_id, pushNode, recordActivity, selectedBranchId]
    );

    const openEmptyCanvasSources = useCallback(() => {
        setWorkspaceDockTab('sources');
        pushNode(DataSourceSelect);
    }, [pushNode]);

    const openEmptyCanvasAskAi = useCallback(() => {
        setSelectedBranchId(undefined);
        setInspectorNodeId(undefined);
        pushNode(PromptModal, { scope: 'workspace' });
        recordActivity({
            type: 'ai_action_picker_opened',
            title: 'Workspace Ask AI opened',
            summary: 'Opened preview-first AI actions from the empty canvas.',
            metadata: {
                scope: 'workspace'
            }
        });
    }, [pushNode, recordActivity, setInspectorNodeId, setSelectedBranchId]);

    const openManualStart = useCallback(() => {
        setWorkspaceDockTab('build');
    }, []);

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
        setIsAiHelpersOpen(true);
        setNextStepsOpenToken((token) => token + 1);
    }, []);

    const reflowCanvasGraph = useCallback(() => {
        const graphNodes = reactFlow.getNodes();
        const graphEdges = reactFlow.getEdges();
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            graphNodes,
            graphEdges
        );
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        setSaveStatus('dirty');
        window.setTimeout(() => fitView({ nodes: layoutedNodes, maxZoom: 1 }), 50);
    }, [fitView, reactFlow, setEdges, setNodes, setSaveStatus]);

    useEffect(() => {
        window.addEventListener('docmap:reflow-canvas', reflowCanvasGraph);
        return () => window.removeEventListener('docmap:reflow-canvas', reflowCanvasGraph);
    }, [reflowCanvasGraph]);

    const onChange = useCallback(
        ({ nodes }) => {
            setSelectedCanvasNodes(nodes);
            const responseNodes = nodes.filter(
                (ele) => ele.type === 'response'
            );
            if (responseNodes.length === 0) {
                setSelectedNodes(undefined);
                setAskMultipleClass('deanimate');
                return;
            }
            if (responseNodes.length !== nodes.length) {
                setSelectedNodes(undefined);
                setAskMultipleClass('deanimate');
                return;
            }
            if (responseNodes.length > 1 && responseNodes.length <= 4) {
                setSelectedNodes(responseNodes);
                setAskMultipleClass('animate');
            } else if (
                responseNodes.length > 4 &&
                askMultipleClass === 'animate'
            ) {
                setAskMultipleClass('deanimate');
            }
        },
        [askMultipleClass]
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
            setAskMultipleClass('animate');
        } else if (responseNodes.length <= 1) {
            setSelectedNodes(undefined);
            setAskMultipleClass('deanimate');
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
                popNode();
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
        setWorkspaceBrief
    ]);

    return (
        <div className={lightMode ? 'app light' : 'app dark'}>
            <Modal ChildProp={Prompts} />
            <Header
                setIsDrawer={setIsDrawer}
                flowList={flowList}
                setFlowList={setFlowList}
                lightMode={lightMode}
                setLightMode={setLightMode}
            />
            <Drawer
                isDrawer={isDrawer}
                setIsDrawer={setIsDrawer}
                flowList={flowList}
                setFlowList={setFlowList}
                onOpenSources={() => setIsSourcesOpen(true)}
                onToggleAiHelpers={() =>
                    setIsAiHelpersOpen((current) => !current)
                }
            />
            <ActivityPanel />
            <SourcesPanel
                isOpen={isSourcesOpen}
                onClose={() => setIsSourcesOpen(false)}
                onSelectNode={setInspectorNodeId}
            />
            <IntegrationsPanel validationReport={validationReport} />
            <AutomationsPanel validationReport={validationReport} />
            <ReactFlow
                nodeTypes={nodeType}
                edgeTypes={edgeType}
                nodes={renderedCanvasGraph.nodes}
                edges={renderedCanvasGraph.edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                onEdgeClick={openEdgeInspector}
                onMoveEnd={(event, viewport) => setViewPort(viewport)}
                colorMode={lightMode ? 'light' : 'dark'}
                fitView={true}
                fitViewOptions={{ maxZoom: 1 }}
                proOptions={{ hideAttribution: true }}
                onInit={setRfInstance}
                minZoom={0.2}
                maxZoom={2.5}
                multiSelectionKeyCode={['Control', 'Meta']}
            >
                <Background
                    gap={28}
                    size={1}
                    color={lightMode ? '#d8d8d8' : '#2d2d2d'}
                />
                {!isStructuredCanvasView ? (
                    <>
                        {renderedCanvasGraph.nodes.length > 0 ? (
                            <Controls
                                position="bottom-right"
                                fitViewOptions={{ maxZoom: 1 }}
                                showInteractive={false}
                            />
                        ) : null}
                        {renderedCanvasGraph.nodes.length >= 5 && !isAiHelpersOpen ? (
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
                        {nodes.length === 0 ? (
                            <Panel
                                position="top-center"
                                className="canvas-empty-state-panel"
                                style={{ display: 'block' }}
                            >
                                <section className="canvas-empty-state" aria-label="Empty workspace">
                                    <span>Start your think space</span>
                                    <p>Add sources, ask AI, or create the first node manually.</p>
                                    <div>
                                        <button type="button" onClick={openEmptyCanvasSources}>
                                            Add sources
                                        </button>
                                        <button type="button" onClick={openEmptyCanvasAskAi}>
                                            Ask AI
                                        </button>
                                        <button type="button" onClick={openManualStart}>
                                            Start with node
                                        </button>
                                    </div>
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
                        onGenerateTaskCandidates={() => openStructuredAiPreset('tasks')}
                        onCreateStructuredTable={() => openStructuredAiPreset('table')}
                    />
                ) : null}
                <Panel
                    position="top-left"
                    style={{
                        display: 'block',
                        transform: `translate(${workspaceDockOffset.x}px, ${workspaceDockOffset.y}px)`
                    }}
                >
                    <section
                        className={`workspace-dock ${workspaceDockCollapsed ? 'workspace-dock--collapsed' : ''}`}
                        aria-label="Workspace tools"
                    >
                        <nav className="workspace-dock-tabs" aria-label="Workspace panel">
                            <div className="workspace-dock-panel-actions">
                                <button
                                    type="button"
                                    className="workspace-dock-icon-button workspace-dock-drag-handle"
                                    title="Move panel"
                                    aria-label="Move workspace panel"
                                    onPointerDown={startWorkspaceDockDrag}
                                >
                                    <FiMove />
                                </button>
                                <button
                                    type="button"
                                    className="workspace-dock-icon-button"
                                    title={workspaceDockCollapsed ? 'Expand panel' : 'Collapse panel'}
                                    aria-label={workspaceDockCollapsed ? 'Expand workspace panel' : 'Collapse workspace panel'}
                                    onClick={() => setWorkspaceDockCollapsed((current) => !current)}
                                >
                                    {workspaceDockCollapsed ? <FiChevronRight /> : <FiChevronLeft />}
                                </button>
                            </div>
                            {[
                                ['sources', 'Sources'],
                                ['health', 'Health'],
                                ['guidance', 'Guide'],
                                ['build', 'Build']
                            ].map(([id, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    className={workspaceDockTab === id ? 'active' : ''}
                                    onClick={() => setWorkspaceDockTab(id)}
                                >
                                    {label}
                                </button>
                            ))}
                        </nav>
                        <div className="workspace-dock-content">
                            {workspaceDockTab === 'sources' ? (
                                <div className="workspace-dock-section">
                                    <div className="workspace-dock-header">
                                        <strong>Sources</strong>
                                        <button type="button" onClick={() => setIsSourcesOpen(true)}>
                                            Library
                                        </button>
                                    </div>
                                    <AddDataSource />
                                </div>
                            ) : null}
                            {workspaceDockTab === 'health' ? (
                                <div className="workspace-dock-section">
                                    <GraphValidationPanel
                                        flowId={flow_id}
                                        nodes={nodes}
                                        edges={edges}
                                        onSelectNode={focusNodeForReview}
                                        onReportChange={setValidationReport}
                                        defaultExpanded
                                    />
                                    <section className="workspace-ai-usage" aria-label="Workspace AI usage">
                                        <div>
                                            <strong>AI usage</strong>
                                            <button type="button" onClick={refreshAIUsage}>
                                                Refresh
                                            </button>
                                        </div>
                                        <p>
                                            {formatUsageNumber(aiUsage?.total_tokens)} tokens
                                            {aiUsage?.estimated_cost_usd
                                                ? ` · ${aiUsage.estimated_cost_usd} est.`
                                                : ''}
                                        </p>
                                        <span>
                                            {aiUsageStatus ||
                                                `${formatUsageNumber(aiUsage?.session_count)} draft sessions tracked`}
                                        </span>
                                        {aiUsageReviewStatus ? <small>{aiUsageReviewStatus}</small> : null}
                                        {Array.isArray(aiUsage?.sessions) && aiUsage.sessions.length ? (
                                            <details>
                                                <summary>Details</summary>
                                                <div className="workspace-ai-usage-sessions">
                                                    {aiUsage.sessions.slice(0, 5).map((session) => (
                                                        <article key={session.session_id || session.created_at}>
                                                            <div>
                                                                <strong>{session.selected_model || 'auto'}</strong>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openUsageDraftSession(session)}
                                                                    disabled={!session.session_id}
                                                                >
                                                                    Review
                                                                </button>
                                                            </div>
                                                            <span>
                                                                {formatUsageNumber(session.total_tokens)} tokens
                                                                {session.estimated_cost_usd
                                                                    ? ` · ${session.estimated_cost_usd} est.`
                                                                    : ''}
                                                            </span>
                                                            <small>
                                                                {session.status || 'draft'} ·{' '}
                                                                {formatUsageNumber(session.revisions?.length)} revisions
                                                            </small>
                                                        </article>
                                                    ))}
                                                </div>
                                            </details>
                                        ) : null}
                                    </section>
                                </div>
                            ) : null}
                            {workspaceDockTab === 'guidance' ? (
                                <WorkspaceNudgeSurface
                                    validationIssues={validationReport?.issues || []}
                                    onFocusNode={focusNodeForReview}
                                    onOpenSources={() => setIsSourcesOpen(true)}
                                    onOpenAiHelpers={() => setIsAiHelpersOpen(true)}
                                />
                            ) : null}
                            {workspaceDockTab === 'build' ? (
                                <div className="workspace-flow-controls">
                                    <WorkspaceBriefPanel embedded />
                                    <ManualNodeControls />
                                </div>
                            ) : null}
                        </div>
                    </section>
                </Panel>
                <Panel position="bottom">
                    <AskMultiple
                        data={askMultipleClass}
                        selectedNodes={selectedNodes}
                    />
                </Panel>
                {selectedBranchId ? (
                    <Panel position="top-left" style={{ display: 'block' }}>
                        <section className="canvas-scope-banner" aria-label="Active canvas scope">
                            <span>Branch lens</span>
                            <strong>{selectedBranchTitle || 'Selected branch'}</strong>
                            <small>Other visible nodes stay dimmed for context.</small>
                            <button type="button" onClick={() => setSelectedBranchId(undefined)}>
                                Clear
                            </button>
                        </section>
                    </Panel>
                ) : null}
                {selectedVisibleNodes.length ? (
                    <Panel position="bottom-center" style={{ display: 'block' }}>
                        <section className="selection-action-bar" aria-label="Selected node actions">
                            <strong>
                                {selectedVisibleNodes.length} selected
                            </strong>
                            {selectedBranchId ? <span>Branch lens active</span> : null}
                            <button type="button" onClick={askAiAboutSelection}>
                                <FiMessageSquare />
                                Ask AI
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
                                <button type="button" onClick={() => setSelectedBranchId(undefined)}>
                                    Clear lens
                                </button>
                            ) : null}
                        </section>
                    </Panel>
                ) : null}
                <Panel
                    position={CANVAS_VIEWS.has(activeView) ? 'top-center' : 'top-right'}
                    style={{ display: 'block' }}
                >
                    <LocalViewsPanel
                        hidden={false}
                        onSelectNode={focusNodeForReview}
                        onSelectEdge={setInspectorEdgeId}
                    />
                </Panel>
                <Panel
                    position="bottom-right"
                    style={{ display: 'block' }}
                >
                    <AiHelpersPanel
                        hidden={!isAiHelpersOpen}
                        selectedNodes={selectedNodes || []}
                        autoOpenToken={nextStepsOpenToken}
                        summaryLabel={nextStepsOpenToken ? 'Next steps' : 'AI Helpers'}
                    />
                </Panel>
                <Panel
                    position="top-right"
                    style={{ display: 'block' }}
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
                </Panel>
                <SourceDraftReviewPanel />
            </ReactFlow>
        </div>
    );
};

export default App;
