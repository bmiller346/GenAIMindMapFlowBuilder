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
    getStraightPath,
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
import MapStylePanel from './global-components/MapStylePanel.jsx';
import ActivityPanel from './global-components/ActivityPanel.jsx';
import SourcesPanel from './global-components/SourcesPanel.jsx';
import IntegrationsPanel from './global-components/IntegrationsPanel.jsx';
import AutomationsPanel from './global-components/AutomationsPanel.jsx';
import ManualNodeControls from './global-components/ManualNodeControls.jsx';
import AiHelpersPanel from './global-components/AiHelpersPanel.jsx';
import AiGenerationProgress from './global-components/AiGenerationProgress.jsx';
import SourceDraftReviewPanel from './global-components/SourceDraftReviewPanel.jsx';
import WorkspaceNudgeSurface from './global-components/WorkspaceNudgeSurface.jsx';
import DataSourceSelect from './global-components/DataSourceSelect.jsx';
import PromptModal from './modals/PromptModal.jsx';
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
import { reflowSiblingSubtrees } from './utils/manualNodes';
import {
    KG_RELATIONSHIP_MODE_OPTIONS,
    KG_RELATIONSHIP_MODES,
    getKgRelationshipSummary,
    shouldShowKgSemanticEdge
} from './utils/kgRelationshipFilters';
import useActivityStore from './stores/activityStore';
import useAutomationStore from './stores/automationStore';
import {
    getMapStyleCanvasBackground,
    getMapStyleClassNames,
    getMapStyleGridColor,
    normalizeMapStyle
} from './utils/mapStyles';

const CANVAS_VIEWS = new Set(['mindmap', 'knowledgeGraph', 'flowchart', 'outline', 'executive', 'tasks', 'kanban', 'table']);
const STRUCTURED_CANVAS_VIEWS = new Set(['flowchart', 'outline', 'executive', 'tasks', 'kanban', 'table']);
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
    const kgSummary = getKgRelationshipSummary(edge);
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
        : [kgSummary.relationship_label || humanizeRelationship(relationshipType), confidence].filter(Boolean).join(' / ');
    return {
        relationship_type: relationshipType || 'contains',
        kind: isHierarchy ? 'hierarchy' : 'relationship',
        family: kgSummary.family,
        familyLabel: kgSummary.family_label,
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
            : getStraightPath(pathArgs);
    const labelClassName = [
        'semantic-edge-label',
        semantic.kind === 'hierarchy'
            ? 'semantic-edge-label--hierarchy'
            : 'semantic-edge-label--relationship',
        semantic.tone ? `semantic-edge-label--${semantic.tone}` : '',
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

    const childrenByParent = edges
        .filter((edge) => HIERARCHY_EDGE_TYPES.has(edgeRelationshipType(edge)))
        .reduce((children, edge) => {
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

const REVIEWABLE_DRAFT_STATUSES = new Set(['', 'draft', 'drafting', 'previewed', 'generated', 'needs_review']);

const isReviewableDraftSessionSummary = (session = {}) =>
    Boolean(
        session?.session_id &&
            REVIEWABLE_DRAFT_STATUSES.has(String(session.status || '').toLowerCase())
    );

const sortByNewestCreatedAt = (left = {}, right = {}) =>
    Date.parse(right.created_at || '') - Date.parse(left.created_at || '');

const truncateInsightText = (value = '', maxLength = 132) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength - 1).trim()}...`;
};

const kgNodeTitle = (node = {}) => {
    const data = nodeData(node);
    return (
        data.title ||
        data.label ||
        data.content ||
        data.body ||
        data.summary ||
        data.data?.title ||
        data.data?.summ ||
        node.id ||
        'Untitled'
    );
};

const numericEdgeConfidence = (edge = {}) => {
    const value = edge.confidence || edge.data?.confidence || edge.metadata?.confidence;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
};

const KG_INSIGHT_FAMILY_PRIORITY = {
    risks: 0,
    dependencies: 1,
    approvals: 2,
    ownership: 3,
    metrics: 4,
    evidence: 5,
    related: 6
};

const buildKgRelationshipModeCounts = (edges = []) =>
    Object.fromEntries(
        KG_RELATIONSHIP_MODE_OPTIONS.map((option) => [
            option.id,
            edges.filter((edge) =>
                shouldShowKgSemanticEdge(edge, option.id, { includeHierarchy: false })
            ).length
        ])
    );

const buildKgTopInsights = ({ nodes = [], edges = [], mode = KG_RELATIONSHIP_MODES.INSIGHTS, limit = 4 } = {}) => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return edges
        .filter((edge) =>
            shouldShowKgSemanticEdge(edge, mode, { includeHierarchy: false })
        )
        .filter((edge) => edge.id && nodeById.has(edge.source) && nodeById.has(edge.target))
        .map((edge) => {
            const summary = getKgRelationshipSummary(edge);
            const sourceTitle = kgNodeTitle(nodeById.get(edge.source));
            const targetTitle = kgNodeTitle(nodeById.get(edge.target));
            const rationale =
                edge.data?.rationale ||
                edge.metadata?.rationale ||
                edge.rationale ||
                edge.data?.source_signal ||
                '';
            return {
                id: edge.id,
                family: summary.family,
                familyLabel: summary.family_short_label || summary.family_label,
                relationship: summary.relationship_label,
                sourceTitle,
                targetTitle,
                confidence: numericEdgeConfidence(edge),
                rationale: truncateInsightText(rationale)
            };
        })
        .sort(
            (left, right) =>
                (KG_INSIGHT_FAMILY_PRIORITY[left.family] ?? 9) -
                    (KG_INSIGHT_FAMILY_PRIORITY[right.family] ?? 9) ||
                right.confidence - left.confidence ||
                left.sourceTitle.localeCompare(right.sourceTitle)
        )
        .slice(0, limit);
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

const edgeMatchesCanvasLens = (edge, activeCanvasView) => {
    const relationshipType = edgeRelationshipType(edge);
    const isHierarchy = HIERARCHY_EDGE_TYPES.has(relationshipType);

    if (activeCanvasView === 'mindmap') {
        return isHierarchy;
    }
    if (activeCanvasView === 'knowledgeGraph') {
        return true;
    }
    if (activeCanvasView === 'flowchart') {
        return (
            isHierarchy ||
            /depend|requires|prerequisite|blocked_by|blocks|handoff|process|sequence|next|precedes|decision/.test(
                relationshipType
            )
        );
    }

    return isHierarchy;
};

const buildKgFocusNodeIds = (edges = [], focusNodeIds = []) => {
    const originalFocusIds = new Set(focusNodeIds.filter(Boolean));
    const visibleIds = new Set(originalFocusIds);
    if (originalFocusIds.size === 0) {
        return visibleIds;
    }

    edges.forEach((edge) => {
        if (originalFocusIds.has(edge.source)) {
            visibleIds.add(edge.target);
        }
        if (originalFocusIds.has(edge.target)) {
            visibleIds.add(edge.source);
        }
    });
    return visibleIds;
};

const buildNodeDepths = (nodes = [], edges = []) => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const childIds = new Set();
    const childrenByParent = edges.reduce((lookup, edge) => {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || !isHierarchyEdge(edge)) {
            return lookup;
        }
        childIds.add(edge.target);
        const children = lookup.get(edge.source) || [];
        children.push(edge.target);
        lookup.set(edge.source, children);
        return lookup;
    }, new Map());
    const roots = nodes
        .map((node) => node.id)
        .filter((nodeId) => !childIds.has(nodeId));
    const depths = new Map(roots.map((nodeId) => [nodeId, 0]));
    const queue = roots.map((nodeId) => ({ nodeId, depth: 0 }));

    while (queue.length > 0) {
        const { nodeId, depth } = queue.shift();
        (childrenByParent.get(nodeId) || []).forEach((childId) => {
            const nextDepth = depth + 1;
            if (!depths.has(childId) || nextDepth < depths.get(childId)) {
                depths.set(childId, nextDepth);
                queue.push({ nodeId: childId, depth: nextDepth });
            }
        });
    }

    return depths;
};

const projectCanvasGraph = ({
    nodes,
    edges,
    activeCanvasView,
    activeGraphFilters,
    selectedBranchId,
    canvasNodeDensity,
    mapStyle,
    kgRelationshipMode = KG_RELATIONSHIP_MODES.INSIGHTS,
    kgFocusNodeIds = []
}) => {
    const hasBranchScope = Boolean(selectedBranchId);
    const branchIds = collectVisibleBranchIds(nodes, edges, selectedBranchId);
    const filters = Array.isArray(activeGraphFilters) ? activeGraphFilters : [];
    const normalizedMapStyle = normalizeMapStyle(mapStyle);
    const nodeDepths = buildNodeDepths(nodes, edges);
    const isKnowledgeGraph = activeCanvasView === 'knowledgeGraph';
    const visibleEdges = edges
        .filter((edge) => edgeMatchesCanvasLens(edge, activeCanvasView))
        .filter((edge) =>
            isKnowledgeGraph
                ? shouldShowKgSemanticEdge(edge, kgRelationshipMode, { includeHierarchy: true })
                : true
        );
    const kgFocusIds = isKnowledgeGraph
        ? buildKgFocusNodeIds(visibleEdges, kgFocusNodeIds)
        : new Set();
    const hasKgFocus = isKnowledgeGraph && kgFocusIds.size > 0;
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
            const kgMutedClass = hasKgFocus && isProjected && !kgFocusIds.has(node.id)
                ? 'kg-node-muted'
                : '';
            const emphasis = node.data?.display?.emphasis || '';
            const emphasisClass = emphasis ? `canvas-node-emphasis-${emphasis}` : '';
            const depth = nodeDepths.get(node.id) || 0;
            const depthClass =
                normalizedMapStyle.hierarchy === 'depth'
                    ? `canvas-node-depth-${Math.min(depth, 3)}`
                    : '';
            return {
                ...node,
                hidden: !isProjected,
                className: [nextClassName, densityClass, kgMutedClass, emphasisClass, depthClass]
                    .filter(Boolean)
                    .join(' ')
            };
        }),
        edges: visibleEdges.map((edge) => {
            const isProjected = projectedIds.has(edge.source) && projectedIds.has(edge.target);
            const isOutOfScope =
                hasBranchScope && (!branchIds.has(edge.source) || !branchIds.has(edge.target));
            const semantic = edgeSemanticInfo(edge);
            const isKgMuted =
                hasKgFocus && !kgFocusIds.has(edge.source) && !kgFocusIds.has(edge.target);
            return {
                ...edge,
                type: isKnowledgeGraph ? 'semantic' : edge.type,
                label: isKnowledgeGraph ? semantic.label : edge.label,
                data: {
                    ...(edge.data || {}),
                    semantic_edge: isKnowledgeGraph
                        ? {
                              ...semantic,
                              kgMuted: isKgMuted
                          }
                        : undefined
                },
                hidden: !isProjected,
                className: canvasEdgeClassName({
                    className: [edge.className, isKgMuted ? 'kg-edge-muted' : ''].filter(Boolean).join(' '),
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
        setActiveAIDraftSession: state.setActiveAIDraftSession,
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
        setActiveAIDraftSession,
        setActiveView,
        setViewPort,
        setWorkspaceBrief,
        setMapStyle,
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
    const [workspaceDockTab, setWorkspaceDockTab] = useState('guidance');
    const [workspaceDockCollapsed, setWorkspaceDockCollapsed] = useState(false);
    const [workspaceDockOffset, setWorkspaceDockOffset] = useState({ x: 16, y: -16 });
    const [workspaceDockWidth, setWorkspaceDockWidth] = useState(17.65);
    const [aiUsage, setAIUsage] = useState();
    const [aiUsageStatus, setAIUsageStatus] = useState('');
    const [aiUsageReviewStatus, setAIUsageReviewStatus] = useState('');
    const [nextStepsOpenToken, setNextStepsOpenToken] = useState(0);
    const [kgRelationshipTrayCollapsed, setKgRelationshipTrayCollapsed] = useState(false);
    const [kgRelationshipTrayOffset, setKgRelationshipTrayOffset] = useState({ x: 0, y: 0 });
    const [kgRelationshipMode, setKgRelationshipMode] = useState(() =>
        getLastKgRelationshipMode()
    );
    const kgRelationshipModeCounts = useMemo(
        () => buildKgRelationshipModeCounts(edges),
        [edges]
    );
    const kgTopInsights = useMemo(
        () =>
            buildKgTopInsights({
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
    const pushNode = modalStore((s) => s.pushNode);
    const [flowList, setFlowList] = useState([]);
    const [isSourcesOpen, setIsSourcesOpen] = useState(false);
    const [isAiHelpersOpen, setIsAiHelpersOpen] = useState(false);
    const [aiGenerationProgress, setAiGenerationProgress] = useState(null);
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
                y: Math.max(-(window.innerHeight - 180), Math.min(nextY, 0))
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

    const startWorkspaceDockResize = useCallback((event) => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = workspaceDockWidth;

        const handlePointerMove = (moveEvent) => {
            const widthDelta = (moveEvent.clientX - startX) / 16;
            setWorkspaceDockWidth(Math.max(15.5, Math.min(startWidth + widthDelta, 27)));
        };

        const stopResize = () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', stopResize);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', stopResize);
    }, [workspaceDockWidth]);

    const startKgRelationshipTrayDrag = useCallback((event) => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        const startOffset = kgRelationshipTrayOffset;

        const handlePointerMove = (moveEvent) => {
            const nextX = startOffset.x + moveEvent.clientX - startX;
            const nextY = startOffset.y + moveEvent.clientY - startY;
            setKgRelationshipTrayOffset({
                x: Math.max(-(window.innerWidth / 2 - 160), Math.min(nextX, window.innerWidth / 2 - 160)),
                y: Math.max(-72, Math.min(nextY, window.innerHeight - 240))
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
    }, [kgRelationshipTrayOffset]);

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
                canvasNodeDensity,
                mapStyle,
                kgRelationshipMode,
                kgFocusNodeIds: selectedCanvasNodes.map((node) => node.id)
            }),
        [
            activeCanvasView,
            activeGraphFilters,
            canvasNodeDensity,
            edges,
            kgRelationshipMode,
            mapStyle,
            nodes,
            selectedBranchId,
            selectedCanvasNodes
        ]
    );
    const isStructuredCanvasView = STRUCTURED_CANVAS_VIEWS.has(activeCanvasView);
    const renderedCanvasGraph = useMemo(() => {
        if (!isStructuredCanvasView) {
            return canvasGraph;
        }
        return {
            nodes: [],
            edges: []
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

    const openEmptyCanvasAskAi = useCallback((options = {}) => {
        setSelectedBranchId(undefined);
        setInspectorNodeId(undefined);
        pushNode(PromptModal, {
            scope: 'workspace',
            initialPrompt: options?.initialPrompt,
            initialVisual: options?.initialVisual
        });
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
        setIsAiHelpersOpen(true);
        setNextStepsOpenToken((token) => token + 1);
    }, []);

    const openNextStepsFromDock = useCallback(() => {
        setIsAiHelpersOpen(true);
        setNextStepsOpenToken((token) => token + 1);
    }, []);

    const reflowCanvasGraph = useCallback(() => {
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

    useEffect(() => {
        if (workspaceDockTab === 'next') {
            setWorkspaceDockTab('guidance');
        }
    }, [workspaceDockTab]);

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
                edgeTypes={edgeTypes}
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
                className={[
                    getMapStyleClassNames(mapStyle),
                    activeCanvasView === 'knowledgeGraph' && selectedCanvasNodes.length > 0
                        ? 'kg-focus-active'
                        : ''
                ].filter(Boolean).join(' ')}
                minZoom={0.2}
                maxZoom={2.5}
                multiSelectionKeyCode={['Control', 'Meta']}
            >
                <Background
                    gap={28}
                    size={1}
                    color={backgroundGridColor}
                    style={{ backgroundColor: canvasBackgroundColor }}
                />
                {aiGenerationProgress ? (
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
                            scopeLabel={aiProgressScopeLabel}
                            draftStateLabel={
                                aiProgressStatus === 'failed'
                                    ? 'No changes applied'
                                    : aiProgressStatus === 'completed'
                                      ? 'Ready for review'
                                      : 'Pending review'
                            }
                            scopeDescription={aiProgressDescription}
                            onDismiss={() => setAiGenerationProgress(null)}
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
                        onSelectBranch={setSelectedBranchId}
                        onFocusInMap={focusStructuredNodeInMap}
                        onApplyFilters={setActiveGraphFilters}
                        onOpenSources={openEmptyCanvasSources}
                        onAskAi={openEmptyCanvasAskAi}
                        onBackToMap={() => setActiveView('mindmap')}
                        onStartManual={openManualStart}
                        onGenerateTaskCandidates={() => openStructuredAiPreset('tasks')}
                        onCreateStructuredTable={() => openStructuredAiPreset('table')}
                    />
                ) : null}
                <Panel
                    position="bottom-left"
                    style={{
                        display: 'block',
                        transform: `translate(${workspaceDockOffset.x}px, ${workspaceDockOffset.y}px)`
                    }}
                >
                    <section
                        className={`workspace-dock ${workspaceDockCollapsed ? 'workspace-dock--collapsed' : ''}`}
                        aria-label="Workspace tools"
                        style={{ '--workspace-dock-width': `${workspaceDockWidth}rem` }}
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
                                <div className="workspace-dock-section workspace-guide-panel">
                                    {hasWorkspaceNextSteps ? (
                                        <div className="workspace-next-steps-launcher">
                                            <div className="workspace-dock-header">
                                                <strong>Next steps</strong>
                                                <span>{workspaceNextSteps.length}</span>
                                            </div>
                                            <p>
                                                Reopen recommended AI actions for the current workspace.
                                            </p>
                                            <button type="button" onClick={openNextStepsFromDock}>
                                                Open next steps
                                            </button>
                                        </div>
                                    ) : null}
                                    <WorkspaceNudgeSurface
                                        validationIssues={validationReport?.issues || []}
                                        onFocusNode={focusNodeForReview}
                                        onOpenSources={() => setIsSourcesOpen(true)}
                                        onOpenAiHelpers={() => setIsAiHelpersOpen(true)}
                                    />
                                    {!hasWorkspaceNextSteps ? (
                                        <div className="workspace-guide-empty">
                                            <strong>Guide</strong>
                                            <p>
                                                {hasWorkspaceContentNodes
                                                    ? 'No recommended AI actions right now.'
                                                    : 'Create the first workspace node before guidance starts making recommendations.'}
                                            </p>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                            {workspaceDockTab === 'build' ? (
                                <div className="workspace-flow-controls">
                                    <WorkspaceBriefPanel embedded />
                                    <MapStylePanel />
                                    <ManualNodeControls />
                                </div>
                            ) : null}
                        </div>
                        {!workspaceDockCollapsed ? (
                            <button
                                type="button"
                                className="workspace-dock-resize-handle"
                                title="Resize panel"
                                aria-label="Resize workspace panel"
                                onPointerDown={startWorkspaceDockResize}
                            >
                                <FiMaximize2 />
                            </button>
                        ) : null}
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
                {activeCanvasView === 'knowledgeGraph' && nodes.length > 0 ? (
                    <Panel
                        position="top-center"
                        style={{
                            display: 'block',
                            transform: `translate(${kgRelationshipTrayOffset.x}px, ${kgRelationshipTrayOffset.y}px)`
                        }}
                    >
                        <section
                            className={`kg-relationship-controls ${kgRelationshipTrayCollapsed ? 'kg-relationship-controls--collapsed' : ''}`}
                            aria-label="Knowledge graph relationship focus"
                        >
                            <div className="kg-relationship-header">
                                <button
                                    type="button"
                                    className="kg-relationship-icon-button"
                                    title="Move relationship tray"
                                    aria-label="Move relationship tray"
                                    onPointerDown={startKgRelationshipTrayDrag}
                                >
                                    <FiMove />
                                </button>
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
                                                    onClick={() => setInspectorEdgeId(insight.id)}
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
                    </Panel>
                ) : null}
                <Panel
                    position="bottom-right"
                    style={{ display: 'block' }}
                >
                    <AiHelpersPanel
                        hidden={!isAiHelpersOpen}
                        selectedNodes={selectedNodes || []}
                        autoOpenToken={nextStepsOpenToken}
                        summaryLabel={nextStepsOpenToken ? 'Next steps' : 'AI Helpers'}
                        onClose={() => setIsAiHelpersOpen(false)}
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
