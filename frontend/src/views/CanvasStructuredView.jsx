import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { FiGitBranch, FiMap } from 'react-icons/fi';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import KanbanBoardView from './KanbanBoardView.jsx';
import { getSavedTableViews, saveSavedTableViews } from '../config/localSettings.js';
import { createWorkspaceEdge, reflowSiblingSubtrees } from '../utils/manualNodes.js';
import {
    buildFilteredGraphProjection,
    getExecutiveOutputProjection,
    getFlowchartProjection,
    getKanbanColumns,
    getTaskCandidateRows,
    getTaskRows
} from './graphProjection.js';

const VIEW_LABELS = {
    executive: 'Executive',
    outline: 'Outline',
    tasks: 'Tasks',
    kanban: 'Kanban',
    table: 'Table',
    flowchart: 'Flowchart'
};

const TASK_STATUS_OPTIONS = [
    'ai_generated',
    'needs_review',
    'in_progress',
    'blocked',
    'done',
    'reviewed',
    'approved',
    'rejected',
    'deprecated'
];

const TASK_PRIORITY_OPTIONS = ['', 'low', 'medium', 'high', 'critical'];
const TABLE_MODES = [
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'responsibility', label: 'Responsibility' },
    { id: 'evidence', label: 'Evidence' },
    { id: 'risks', label: 'Risks' },
    { id: 'readiness', label: 'Readiness' },
    { id: 'density', label: 'Density' },
    { id: 'condensed', label: 'Condensed' }
];
const FILTER_LABELS = {
    'source-backed': 'Source-backed',
    'needs-review': 'Needs review',
    manual: 'Manual',
    'ai-generated': 'AI-generated',
    'tasks-only': 'Tasks only',
    unassigned: 'Unassigned',
    'missing-due-date': 'Missing due date',
    'missing-source': 'Missing source',
    'low-confidence': 'Low confidence',
    'hidden-from-export': 'Hidden'
};
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

const edgeRelationshipType = (edge = {}) =>
    edge.relationship_type ||
    edge.data?.relationship_type ||
    edge.data?.relationshipType ||
    edge.data?.type ||
    edge.type ||
    '';

const isHierarchyEdge = (edge = {}) =>
    HIERARCHY_EDGE_TYPES.has(
        String(edgeRelationshipType(edge) || '')
            .trim()
            .toLowerCase()
    );

const sourceLabel = (node) => {
    const ref = node.source_ref || {};
    return [ref.document_id, ref.page ? `p. ${ref.page}` : '', ref.section]
        .filter(Boolean)
        .join(' | ') || 'No source';
};

const sourceEvidenceStatus = (node) => {
    const refs = Array.isArray(node.source_refs) ? node.source_refs : [];
    const confidence = numericConfidenceValue(node);
    if (!refs.length) {
        return { tone: 'missing', label: 'Missing evidence', detail: 'No source linked' };
    }
    if (confidence !== null && confidence < 0.6) {
        return { tone: 'low', label: 'Low confidence', detail: sourceLabel(node) };
    }
    if (refs.some((ref) => ref.quote_snippet || ref.quote || ref.text)) {
        return { tone: 'strong', label: 'Quote-backed', detail: sourceLabel(node) };
    }
    if (
        refs.some((ref) =>
            ref.query_id || ref.table_name || ref.database_id || ref.result_hash || ref.source_type
        )
    ) {
        return { tone: 'structured', label: 'Structured source', detail: sourceLabel(node) };
    }
    return { tone: 'partial', label: 'Source linked', detail: sourceLabel(node) };
};

const EvidenceCell = ({ row, onOpenSources }) => {
    const evidence = sourceEvidenceStatus(row);
    return (
        <div className="canvas-structured-evidence-cell">
            <span className={`canvas-structured-evidence-badge is-${evidence.tone}`}>
                {evidence.label}
            </span>
            <small>{evidence.detail}</small>
            {evidence.tone === 'missing' || evidence.tone === 'low' ? (
                <button type="button" onClick={onOpenSources}>
                    Review
                </button>
            ) : null}
        </div>
    );
};

const rowTypeLabel = (node) => {
    if (node.table_rows?.length) {
        return `${node.node_type} table`;
    }
    return node.node_type || 'node';
};

const tableShapeLabel = (node) => {
    if (!node.table_rows?.length) {
        return '-';
    }
    return `${node.table_rows.length} x ${node.table_columns?.length || '-'} table`;
};

const confidenceLabel = (node) => {
    if (node.confidence === undefined || node.confidence === null || node.confidence === '') {
        return '-';
    }
    const numeric = Number(String(node.confidence).replace('%', ''));
    if (!Number.isFinite(numeric)) {
        return String(node.confidence);
    }
    const normalized = String(node.confidence).includes('%') || numeric > 1 ? numeric : numeric * 100;
    return `${Math.round(normalized)}%`;
};

const numericConfidenceValue = (node) => {
    if (node.confidence === undefined || node.confidence === null || node.confidence === '') {
        return null;
    }
    const numeric = Number(String(node.confidence).replace('%', ''));
    if (!Number.isFinite(numeric)) {
        return null;
    }
    return String(node.confidence).includes('%') || numeric > 1 ? numeric / 100 : numeric;
};

const rowReadiness = (node) => {
    const factors = [
        {
            id: 'summary',
            label: 'Summary',
            ready: Boolean(summaryText(node))
        },
        {
            id: 'source',
            label: 'Evidence',
            ready: Boolean(node.source_refs?.length)
        },
        {
            id: 'confidence',
            label: 'Confidence',
            ready: (numericConfidenceValue(node) ?? 0) >= 0.6
        },
        {
            id: 'review',
            label: 'Reviewed',
            ready: node.status !== 'needs_review' && node.node_type !== 'needs_review'
        },
        {
            id: 'owner',
            label: 'Owner',
            ready: Boolean(node.owner_id)
        }
    ];
    const readyCount = factors.filter((factor) => factor.ready).length;
    const score = Math.round((readyCount / factors.length) * 100);
    return {
        score,
        label: score >= 80 ? 'Ready' : score >= 50 ? 'Partial' : 'Needs work',
        factors,
        missing: factors.filter((factor) => !factor.ready).map((factor) => factor.label)
    };
};

const summaryText = (node) => {
    const value = node.summary || node.query || '';
    return typeof value === 'string' ? value : '';
};

const parentLookupFromEdges = (edges = []) =>
    edges.reduce((parents, edge) => {
        if (edge.source && edge.target && isHierarchyEdge(edge) && !parents.has(edge.target)) {
            parents.set(edge.target, edge.source);
        }
        return parents;
    }, new Map());

const childrenLookupFromEdges = (edges = []) =>
    edges.reduce((children, edge) => {
        if (!edge.source || !edge.target || !isHierarchyEdge(edge)) {
            return children;
        }
        const nextChildren = children.get(edge.source) || [];
        nextChildren.push(edge.target);
        children.set(edge.source, nextChildren);
        return children;
    }, new Map());

const reorderHierarchySiblingEdges = (edges = [], parentId, orderedSiblingIds = []) => {
    if (!parentId || !orderedSiblingIds.length) {
        return edges;
    }
    const siblingIdSet = new Set(orderedSiblingIds);
    const edgeByTarget = new Map();
    const remainingEdges = [];
    let insertionIndex = -1;
    edges.forEach((edge) => {
        const isSiblingEdge =
            edge.source === parentId && siblingIdSet.has(edge.target) && isHierarchyEdge(edge);
        if (isSiblingEdge) {
            if (insertionIndex === -1) {
                insertionIndex = remainingEdges.length;
            }
            edgeByTarget.set(edge.target, edge);
            return;
        }
        remainingEdges.push(edge);
    });

    const reorderedSiblingEdges = orderedSiblingIds.map(
        (siblingId) => edgeByTarget.get(siblingId) || createWorkspaceEdge(parentId, siblingId)
    );
    const nextEdges = [...remainingEdges];
    nextEdges.splice(
        insertionIndex >= 0 ? insertionIndex : nextEdges.length,
        0,
        ...reorderedSiblingEdges
    );
    return nextEdges;
};

const collectDescendantIds = (childrenByParent, rootId) => {
    const descendants = new Set();
    const stack = [...(childrenByParent.get(rootId) || [])];
    while (stack.length) {
        const currentId = stack.pop();
        if (!currentId || descendants.has(currentId)) {
            continue;
        }
        descendants.add(currentId);
        stack.push(...(childrenByParent.get(currentId) || []));
    }
    return descendants;
};

const branchTableRows = (projection, collapsedRowIds = new Set()) => {
    const parentByChild = parentLookupFromEdges(projection.edges);
    const visibleIds = new Set(projection.nodes.map((node) => node.id));
    const visited = new Set();
    const rows = [];

    const visit = (node, depth = 0) => {
        if (!node || visited.has(node.id) || !visibleIds.has(node.id)) {
            return;
        }
        visited.add(node.id);
        const parentId = parentByChild.get(node.id);
        const childIds = (projection.childrenByParent.get(node.id) || []).filter((childId) =>
            visibleIds.has(childId)
        );
        rows.push({
            ...node,
            depth,
            child_count: childIds.length,
            collapsed: collapsedRowIds.has(node.id),
            parent_id: parentId || '',
            parent_title: parentId ? projection.nodeLookup.get(parentId)?.title || parentId : ''
        });
        if (collapsedRowIds.has(node.id)) {
            return;
        }
        childIds
            .map((childId) => projection.nodeLookup.get(childId))
            .filter(Boolean)
            .forEach((child) => visit(child, depth + 1));
    };

    projection.roots.forEach((root) => visit(root, 0));
    projection.nodes.forEach((node) => visit(node, 0));
    return rows;
};

const branchTableSummary = (rows = []) => {
    const confidenceValues = rows
        .map(numericConfidenceValue)
        .filter((value) => value !== null);
    const averageConfidence =
        confidenceValues.length > 0
            ? confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length
            : null;
    const readinessValues = rows.map((row) => rowReadiness(row).score);
    const averageReadiness =
        readinessValues.length > 0
            ? readinessValues.reduce((total, value) => total + value, 0) / readinessValues.length
            : null;
    return {
        itemCount: rows.length,
        needsReviewCount: rows.filter(
            (row) => row.status === 'needs_review' || row.node_type === 'needs_review'
        ).length,
        unsourcedCount: rows.filter((row) => !row.source_refs?.length).length,
        unassignedCount: rows.filter((row) => !row.owner_id).length,
        riskCount: rows.filter((row) => row.risk_severity || row.priority === 'critical').length,
        condensedCount: rows.filter((row) => condensedDetailCount(row) > 0).length,
        averageConfidence,
        averageReadiness
    };
};

const childDetailRows = (children = []) =>
    children.map((child) => ({
        title: child.title || child.id,
        type: rowTypeLabel(child),
        status: child.status || '',
        owner: child.owner_id || '',
        priority: child.priority || '',
        summary: summaryText(child),
        evidence: sourceEvidenceStatus(child).label,
        source: sourceLabel(child),
        confidence: confidenceLabel(child),
        source_node_id: child.id
    }));

const condensedDetailRows = (node) =>
    (Array.isArray(node?.table_rows) ? node.table_rows : []).filter((detailRow) =>
        detailRow?.source_node_id
    );

const condensedDetailCount = (node) => condensedDetailRows(node).length;
const CONDENSED_SYNC_FIELDS = [
    'title',
    'type',
    'status',
    'owner',
    'priority',
    'summary',
    'evidence',
    'source',
    'confidence',
    'source_node_id'
];

const condensedDetailNeedsSync = (detailRow = {}, freshDetailRow = {}) =>
    CONDENSED_SYNC_FIELDS.some(
        (field) => String(detailRow?.[field] ?? '') !== String(freshDetailRow?.[field] ?? '')
    );

const isDensityCandidate = (node) =>
    (Number(node?.child_count) || 0) >= 4 || condensedDetailCount(node) > 0;

const densityRecommendation = (node) => {
    const childCount = Number(node?.child_count) || 0;
    const detailCount = condensedDetailCount(node);
    if (childCount >= 8 && detailCount === 0) {
        return 'Condense branch';
    }
    if (childCount >= 4 && detailCount === 0) {
        return 'Review for condense';
    }
    if (childCount >= 4 && detailCount > 0) {
        return 'Partially condensed';
    }
    if (detailCount > 0) {
        return 'Review details';
    }
    return 'No action';
};

const OutlineItem = ({ node, projection, depth, onOpenNode }) => {
    const children = (projection.childrenByParent.get(node.id) || [])
        .map((childId) => projection.nodeLookup.get(childId))
        .filter(Boolean);
    const summary = summaryText(node);

    return (
        <li className="canvas-structured-outline-item">
            <div className="canvas-structured-outline-row" style={{ '--depth': depth }}>
                <button
                    type="button"
                    className="canvas-structured-title"
                    onClick={() => onOpenNode?.(node.id)}
                >
                    {node.title}
                </button>
                <span>{rowTypeLabel(node)}</span>
                <small>{node.status || 'current'}</small>
                {summary ? <p>{summary}</p> : null}
            </div>
            {children.length > 0 ? (
                <ol>
                    {children.map((child) => (
                        <OutlineItem
                            key={child.id}
                            node={child}
                            projection={projection}
                            depth={depth + 1}
                            onOpenNode={onOpenNode}
                        />
                    ))}
                </ol>
            ) : null}
        </li>
    );
};

const EmptyStructuredView = ({ view, label, onOpenSources, onAskAi, onStartManual }) => (
    <div className="canvas-structured-empty">
        <strong>
            {view === 'kanban'
                ? 'Start a Kanban board'
                : view === 'flowchart'
                  ? 'Start a flowchart'
                  : 'No accepted graph nodes yet'}
        </strong>
        <span>
            {view === 'kanban'
                ? 'Ask AI to shape work into board columns, add sources, or create the first task node.'
                : view === 'flowchart'
                  ? 'Ask AI to identify steps, decisions, handoffs, and dependencies, or start from source material.'
                : `${label} will populate after you accept or create nodes in the workspace.`}
        </span>
        <div className="canvas-structured-empty-actions">
            <button type="button" onClick={onOpenSources}>
                Add sources
            </button>
            <button
                type="button"
                onClick={() =>
                    onAskAi?.(
                        view === 'kanban'
                            ? {
                                  initialVisual: 'kanban',
                                  initialPrompt: 'Create a Kanban board from this workspace with backlog, in-progress, blocked, done, and follow-up question cards.'
                              }
                            : view === 'flowchart'
                              ? {
                                    initialVisual: 'flow_chart',
                                    initialPrompt: 'Create a flowchart from this workspace with ordered steps, decision points, dependencies, handoffs, exception paths, and source-backed review notes.'
                                }
                            : undefined
                    )
                }
            >
                Ask AI
            </button>
            <button type="button" onClick={onStartManual}>
                Start with node
            </button>
        </div>
    </div>
);

const EmptyFilteredView = ({ label }) => (
    <div className="canvas-structured-empty inline">
        <strong>No rows match this view</strong>
        <span>{label} is built from the current workspace. Clear filters or select a broader branch to see rows.</span>
    </div>
);

const ActiveFilterChips = ({ filters = [] }) => {
    const activeFilters = Array.isArray(filters) ? filters.filter(Boolean) : [];
    if (!activeFilters.length) {
        return null;
    }
    return (
        <div className="canvas-structured-filter-chips" aria-label="Active graph filters">
            {activeFilters.map((filterId) => (
                <span key={filterId}>{FILTER_LABELS[filterId] || filterId}</span>
            ))}
        </div>
    );
};

const ExecutiveList = ({ title, items = [], empty = 'No items projected.' }) => (
    <section className="canvas-structured-executive-section">
        <div className="canvas-structured-section-header">
            <strong>{title}</strong>
            <span>{items.length}</span>
        </div>
        {items.length ? (
            <div className="canvas-structured-executive-list">
                {items.map((item) => (
                    <article key={item.id} className="canvas-structured-executive-item">
                        <strong>{item.title}</strong>
                        {item.description ? <p>{item.description}</p> : null}
                        <small>
                            {[
                                item.status,
                                item.priority ? `priority: ${item.priority}` : '',
                                item.owner_id ? `owner: ${item.owner_id}` : '',
                                item.due_date ? `due: ${item.due_date}` : '',
                                item.source_backed ? 'source-backed' : 'needs review'
                            ]
                                .filter(Boolean)
                                .join(' | ')}
                        </small>
                    </article>
                ))}
            </div>
        ) : (
            <div className="canvas-structured-empty inline">
                <strong>{empty}</strong>
            </div>
        )}
    </section>
);

const FlowchartView = ({ flowchart, onOpenNode, onAskAi }) => {
    if (!flowchart.steps.length) {
        return (
            <div className="canvas-structured-empty inline">
                <strong>No flowchart steps projected</strong>
                <span>Ask AI to infer process steps, decisions, and handoffs from the current scope.</span>
                <button
                    type="button"
                    onClick={() =>
                        onAskAi?.({
                            initialVisual: 'flow_chart',
                            initialPrompt: 'Create a flowchart from this workspace with ordered steps, decision points, dependencies, handoffs, exception paths, and source-backed review notes.'
                        })
                    }
                >
                    Ask AI to draft flowchart
                </button>
            </div>
        );
    }

    return (
        <div className="canvas-flowchart-view" aria-label="Flowchart">
            <div className="canvas-flowchart-lane">
                {flowchart.steps.map((step, index) => {
                    const outgoing = flowchart.connectors.filter((connector) => connector.source === step.id);
                    return (
                        <div key={step.id} className="canvas-flowchart-step-wrap">
                            <article
                                className={[
                                    'canvas-flowchart-step',
                                    `canvas-flowchart-step-${step.flow_kind}`,
                                    `canvas-flowchart-shape-${step.shape || 'process'}`
                                ].join(' ')}
                            >
                                <div className="canvas-flowchart-symbol-shell">
                                    <div className="canvas-flowchart-symbol">
                                        <span>{step.flow_kind === 'decision' ? 'Decision' : step.shape}</span>
                                        <button type="button" onClick={() => onOpenNode?.(step.id)}>
                                            {step.title}
                                        </button>
                                    </div>
                                </div>
                                <div className="canvas-flowchart-step-meta">
                                    <small>{step.source_backed ? 'source-backed' : 'needs source review'}</small>
                                    {summaryText(step) ? <p>{summaryText(step)}</p> : null}
                                </div>
                            </article>
                            {index < flowchart.steps.length - 1 ? (
                                <div
                                    className={[
                                        'canvas-flowchart-connectors',
                                        step.flow_kind === 'decision' ? 'canvas-flowchart-branches' : ''
                                    ].join(' ')}
                                >
                                    {outgoing.length ? (
                                        outgoing.map((connector) => (
                                            <button
                                                type="button"
                                                key={connector.id}
                                                className={`canvas-flowchart-connector canvas-flowchart-connector-${connector.branch_kind || 'default'}`}
                                                onClick={() => onOpenNode?.(connector.target)}
                                            >
                                                <strong>{connector.label}</strong>
                                                <span>{connector.target_title}</span>
                                                {connector.condition ? <small>{connector.condition}</small> : null}
                                            </button>
                                        ))
                                    ) : (
                                        <span className="canvas-flowchart-connector">Next</span>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            <aside className="canvas-flowchart-summary">
                <strong>Flow signals</strong>
                <span>{flowchart.metadata.step_count} steps</span>
                <span>{flowchart.metadata.connector_count} connectors</span>
                <span>{flowchart.metadata.decision_count} decisions</span>
                <span>{flowchart.metadata.source_backed_count} sourced</span>
                <button
                    type="button"
                    onClick={() =>
                        onAskAi?.({
                            initialVisual: 'flow_chart',
                            initialPrompt: 'Improve this flowchart with clearer step order, decision paths, dependencies, handoffs, and source-backed review notes.'
                        })
                    }
                >
                    Ask AI to improve flow
                </button>
            </aside>
        </div>
    );
};

const CanvasStructuredView = ({
    view,
    nodes = [],
    edges = [],
    activeGraphFilters = [],
    selectedBranchId,
    onOpenNode,
    onSelectBranch,
    onFocusInMap,
    onApplyFilters,
    onOpenSources,
    onAskAi,
    onBackToMap,
    onStartManual,
    onGenerateTaskCandidates,
    onCreateStructuredTable
}) => {
    const projection = useMemo(
        () =>
            buildFilteredGraphProjection(nodes, edges, {
                branchId: selectedBranchId,
                filters: activeGraphFilters
            }),
        [activeGraphFilters, edges, nodes, selectedBranchId]
    );
    const taskRows = useMemo(() => getTaskRows(projection), [projection]);
    const [collapsedTableRowIds, setCollapsedTableRowIds] = useState([]);
    const collapsedTableRows = useMemo(
        () => new Set(collapsedTableRowIds),
        [collapsedTableRowIds]
    );
    const allWorkBreakdownRows = useMemo(() => branchTableRows(projection), [projection]);
    const workBreakdownRows = useMemo(
        () => branchTableRows(projection, collapsedTableRows),
        [collapsedTableRows, projection]
    );
    const workBreakdownSummary = useMemo(
        () => branchTableSummary(allWorkBreakdownRows),
        [allWorkBreakdownRows]
    );
    const kanbanColumns = useMemo(() => getKanbanColumns(projection), [projection]);
    const flowchart = useMemo(() => getFlowchartProjection(projection), [projection]);
    const executiveOutput = useMemo(
        () => getExecutiveOutputProjection(projection, { title: 'Executive Output' }),
        [projection]
    );
    const potentialTaskRows = useMemo(
        () => getTaskCandidateRows(projection).slice(0, 24),
        [projection]
    );
    const setNodes = useStore((state) => state.setNodes);
    const setEdges = useStore((state) => state.setEdges);
    const flowId = flowStore((state) => state.flow_id);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const [tableMode, setTableMode] = useState('breakdown');
    const [selectedTableRowIds, setSelectedTableRowIds] = useState([]);
    const [bulkEdit, setBulkEdit] = useState({ owner_id: '', status: '', priority: '' });
    const [savedTableViews, setSavedTableViews] = useState(() => getSavedTableViews());
    const [draggedTableRowId, setDraggedTableRowId] = useState('');
    const [tableDropTarget, setTableDropTarget] = useState({ rowId: '', position: '' });
    const [expandedCondensedRowIds, setExpandedCondensedRowIds] = useState([]);
    const [hierarchyUndoNotice, setHierarchyUndoNotice] = useState(null);
    const hierarchyUndoTimerRef = useRef(null);
    const label = VIEW_LABELS[view] || 'Structured view';
    const displayedWorkBreakdownRows = useMemo(
        () => {
            if (tableMode === 'condensed') {
                return workBreakdownRows.filter((row) => condensedDetailCount(row) > 0);
            }
            if (tableMode === 'density') {
                return workBreakdownRows.filter(isDensityCandidate);
            }
            return workBreakdownRows;
        },
        [tableMode, workBreakdownRows]
    );

    useEffect(() => {
        const visibleIds = new Set(displayedWorkBreakdownRows.map((row) => row.id));
        setSelectedTableRowIds((current) => current.filter((rowId) => visibleIds.has(rowId)));
        setExpandedCondensedRowIds((current) => current.filter((rowId) => visibleIds.has(rowId)));
    }, [displayedWorkBreakdownRows]);

    useEffect(
        () => () => {
            if (hierarchyUndoTimerRef.current) {
                window.clearTimeout(hierarchyUndoTimerRef.current);
            }
        },
        []
    );

    const markDirty = () => {
        if (flowId) {
            setSaveStatus('dirty');
        }
    };

    useEffect(() => {
        let didSync = false;
        const syncedAt = new Date().toISOString();
        const nextNodes = nodes.map((node) => {
            const rows = Array.isArray(node.data?.df) ? node.data.df : [];
            if (!rows.some((row) => row?.source_node_id)) {
                return node;
            }
            const nextRows = rows.map((row) => {
                const sourceNode = projection.nodeLookup.get(row?.source_node_id);
                if (!row?.source_node_id || !sourceNode) {
                    return row;
                }
                const [freshDetailRow] = childDetailRows([sourceNode]);
                if (!condensedDetailNeedsSync(row, freshDetailRow)) {
                    return row;
                }
                didSync = true;
                return {
                    ...row,
                    ...freshDetailRow,
                    auto_synced_at: syncedAt
                };
            });
            if (nextRows === rows || nextRows.every((row, index) => row === rows[index])) {
                return node;
            }
            return {
                ...node,
                data: {
                    ...(node.data || {}),
                    df: nextRows,
                    data: {
                        ...(node.data?.data || {}),
                        df: nextRows
                    }
                }
            };
        });
        if (didSync) {
            setNodes(nextNodes);
            markDirty();
        }
    }, [flowId, nodes, projection.nodeLookup, setNodes, setSaveStatus]);

    const updateTaskField = (nodeId, key, value, options = {}) => {
        setNodes(
            nodes.map((node) => {
                if (node.id !== nodeId) {
                    return node;
                }

                const taskProjection =
                    node.data?.task_projection &&
                    typeof node.data.task_projection === 'object'
                        ? {
                              ...node.data.task_projection,
                              ...(node.data.task_projection.accepted
                                  ? { [key === 'status' ? 'preview_status' : key]: value }
                                  : {})
                          }
                        : node.data?.task_projection;

                return {
                    ...node,
                    data: {
                        ...node.data,
                        [key]: value,
                        ...(key === 'owner_id' ? { assignee: value } : {}),
                        task_projection: taskProjection
                    }
                };
            })
        );
        markDirty();
        if (options.record !== false) {
            recordActivity({
                type: 'task_metadata_changed',
                title: 'Task metadata changed',
                summary: `Updated ${key.replaceAll('_', ' ')} for a task.`,
                node_ids: [nodeId],
                metadata: { field: key, value },
                status: 'completed'
            });
        }
    };

    const updateNodeField = (nodeId, key, value, options = {}) => {
        setNodes(
            nodes.map((node) => {
                if (node.id !== nodeId) {
                    return node;
                }
                return {
                    ...node,
                    data: {
                        ...node.data,
                        [key]: value,
                        ...(key === 'owner_id' ? { assignee: value } : {})
                    }
                };
            })
        );
        markDirty();
        if (options.record !== false) {
            recordActivity({
                type: 'node_metadata_changed',
                title: 'Node metadata changed',
                summary: `Updated ${key.replaceAll('_', ' ')} from the table view.`,
                node_ids: [nodeId],
                metadata: { field: key, value },
                status: 'completed'
            });
        }
    };

    const allTableRowsSelected =
        displayedWorkBreakdownRows.length > 0 &&
        selectedTableRowIds.length === displayedWorkBreakdownRows.length;
    const hasBulkEditChanges = Object.values(bulkEdit).some((value) => value !== '');
    const densityCondenseCandidates = useMemo(
        () =>
            displayedWorkBreakdownRows.filter(
                (row) => tableMode === 'density' && row.child_count >= 4 && condensedDetailCount(row) === 0
            ),
        [displayedWorkBreakdownRows, tableMode]
    );
    const tableParentByChild = useMemo(() => parentLookupFromEdges(edges), [edges]);
    const tableChildrenByParent = useMemo(() => childrenLookupFromEdges(edges), [edges]);

    const createHierarchyUndoSnapshot = () => ({
        nodes: structuredClone(nodes),
        edges: structuredClone(edges)
    });

    const restoreHierarchyUndoSnapshot = (snapshot) => {
        if (!snapshot) {
            return;
        }
        setNodes(structuredClone(snapshot.nodes || []));
        setEdges(structuredClone(snapshot.edges || []));
        markDirty();
        setHierarchyUndoNotice(null);
        if (hierarchyUndoTimerRef.current) {
            window.clearTimeout(hierarchyUndoTimerRef.current);
            hierarchyUndoTimerRef.current = null;
        }
        recordActivity({
            type: 'table_hierarchy_undo',
            title: 'Undid table hierarchy change',
            summary: 'Restored the previous table hierarchy.',
            status: 'completed'
        });
    };

    const showHierarchyUndoNotice = ({ message, snapshot }) => {
        if (hierarchyUndoTimerRef.current) {
            window.clearTimeout(hierarchyUndoTimerRef.current);
        }
        const undo = () => restoreHierarchyUndoSnapshot(snapshot);
        setHierarchyUndoNotice({ message, undo });
        hierarchyUndoTimerRef.current = window.setTimeout(() => {
            setHierarchyUndoNotice(null);
            hierarchyUndoTimerRef.current = null;
        }, 8000);
        return undo;
    };

    const toggleTableRowSelection = (rowId) => {
        setSelectedTableRowIds((current) =>
            current.includes(rowId)
                ? current.filter((id) => id !== rowId)
                : [...current, rowId]
        );
    };

    const toggleAllTableRows = () => {
        setSelectedTableRowIds(
            allTableRowsSelected ? [] : displayedWorkBreakdownRows.map((row) => row.id)
        );
    };

    const toggleTableRowCollapse = (rowId) => {
        setCollapsedTableRowIds((current) =>
            current.includes(rowId)
                ? current.filter((id) => id !== rowId)
                : [...current, rowId]
        );
    };

    const toggleCondensedPreview = (rowId) => {
        setExpandedCondensedRowIds((current) =>
            current.includes(rowId)
                ? current.filter((id) => id !== rowId)
                : [...current, rowId]
        );
    };

    const reparentTableRow = (rowId, nextParentId, actionLabel) => {
        if (!rowId || rowId === nextParentId) {
            return false;
        }
        const undoSnapshot = createHierarchyUndoSnapshot();
        const parentByChild = parentLookupFromEdges(edges);
        const currentParentId = parentByChild.get(rowId) || '';
        const childrenByParent = childrenLookupFromEdges(edges);
        if (nextParentId && collectDescendantIds(childrenByParent, rowId).has(nextParentId)) {
            return false;
        }
        if (currentParentId === nextParentId) {
            return false;
        }

        const nextEdges = edges.filter((edge) => !(edge.target === rowId && isHierarchyEdge(edge)));
        if (nextParentId) {
            nextEdges.push(createWorkspaceEdge(nextParentId, rowId));
        }

        const movedNode = nodes.find((node) => node.id === rowId);
        const nextNodes = nextParentId && movedNode
            ? nodes.map((node) =>
                  node.id === rowId
                      ? {
                            ...node,
                            position: {
                                ...(node.position || {}),
                                x:
                                    (nodes.find((item) => item.id === nextParentId)?.position?.x || 0) +
                                    300
                            }
                        }
                      : node
              )
            : nodes;

        setEdges(nextEdges);
        setNodes(
            [currentParentId, nextParentId]
                .filter(Boolean)
                .reduce(
                    (currentNodes, parentId) =>
                        reflowSiblingSubtrees({
                            nodes: currentNodes,
                            edges: nextEdges,
                            parentId,
                            anchorNodeId: rowId,
                            compact: true
                        }),
                    nextNodes
                )
        );
        markDirty();
        const movedLabel = movedNode?.data?.title || movedNode?.id || rowId;
        const undo = showHierarchyUndoNotice({
            message: `${actionLabel} ${movedLabel}.`,
            snapshot: undoSnapshot
        });
        recordActivity({
            type: 'table_hierarchy_changed',
            title: 'Table hierarchy changed',
            summary: `${actionLabel} ${movedLabel}.`,
            node_ids: [rowId, nextParentId].filter(Boolean),
            metadata: {
                node_id: rowId,
                previous_parent_id: currentParentId,
                next_parent_id: nextParentId || ''
            },
            status: 'completed',
            undo
        });
        return true;
    };

    const moveTableRowUnder = (rowId, parentId) => {
        const moved = reparentTableRow(rowId, parentId, 'Moved');
        if (moved) {
            setCollapsedTableRowIds((current) => current.filter((id) => id !== parentId));
        }
        return moved;
    };

    const promoteTableRow = (row) => {
        const parentByChild = parentLookupFromEdges(edges);
        const parentId = parentByChild.get(row.id);
        if (!parentId) {
            return;
        }
        reparentTableRow(row.id, parentByChild.get(parentId) || '', 'Promoted');
    };

    const demoteTableRow = (row, rowIndex, rows = workBreakdownRows) => {
        const previousSibling = [...rows]
            .slice(0, rowIndex)
            .reverse()
            .find((candidate) => candidate.depth === row.depth);
        if (!previousSibling) {
            return;
        }
        reparentTableRow(row.id, previousSibling.id, 'Demoted');
    };

    const canReorderTableRow = (row, direction) => {
        const parentId = tableParentByChild.get(row.id);
        if (!parentId) {
            return false;
        }
        const siblingIds = tableChildrenByParent.get(parentId) || [];
        const siblingIndex = siblingIds.indexOf(row.id);
        if (direction === 'up') {
            return siblingIndex > 0;
        }
        return siblingIndex >= 0 && siblingIndex < siblingIds.length - 1;
    };

    const reorderTableRow = (row, direction) => {
        const parentId = tableParentByChild.get(row.id);
        if (!parentId) {
            return;
        }
        const undoSnapshot = createHierarchyUndoSnapshot();
        const siblingIds = [...(tableChildrenByParent.get(parentId) || [])];
        const siblingIndex = siblingIds.indexOf(row.id);
        const nextIndex = direction === 'up' ? siblingIndex - 1 : siblingIndex + 1;
        if (siblingIndex < 0 || nextIndex < 0 || nextIndex >= siblingIds.length) {
            return;
        }

        [siblingIds[siblingIndex], siblingIds[nextIndex]] = [
            siblingIds[nextIndex],
            siblingIds[siblingIndex]
        ];

        const nextEdges = reorderHierarchySiblingEdges(edges, parentId, siblingIds);
        setEdges(nextEdges);
        setNodes(
            reflowSiblingSubtrees({
                nodes,
                edges: nextEdges,
                parentId,
                anchorNodeId: row.id,
                compact: true
            })
        );
        markDirty();
        const undo = showHierarchyUndoNotice({
            message: `Moved ${row.title || row.id} ${direction}.`,
            snapshot: undoSnapshot
        });
        recordActivity({
            type: 'table_hierarchy_reordered',
            title: 'Reordered table row',
            summary: `Moved ${row.title || row.id} ${direction}.`,
            node_ids: [row.id, parentId],
            metadata: {
                node_id: row.id,
                parent_id: parentId,
                direction
            },
            status: 'completed',
            undo
        });
    };

    const moveTableRowAdjacent = (rowId, targetId, placement) => {
        const targetParentId = tableParentByChild.get(targetId);
        if (!rowId || !targetId || rowId === targetId || !targetParentId) {
            return false;
        }
        const undoSnapshot = createHierarchyUndoSnapshot();

        const currentParentId = tableParentByChild.get(rowId) || '';
        const childrenByParent = childrenLookupFromEdges(edges);
        if (
            targetParentId === rowId ||
            collectDescendantIds(childrenByParent, rowId).has(targetParentId)
        ) {
            return false;
        }

        const siblingIds = (tableChildrenByParent.get(targetParentId) || []).filter(
            (siblingId) => siblingId !== rowId
        );
        const targetIndex = siblingIds.indexOf(targetId);
        if (targetIndex < 0) {
            return false;
        }
        siblingIds.splice(placement === 'before' ? targetIndex : targetIndex + 1, 0, rowId);

        let nextEdges = edges.filter((edge) => !(edge.target === rowId && isHierarchyEdge(edge)));
        nextEdges.push(createWorkspaceEdge(targetParentId, rowId));
        nextEdges = reorderHierarchySiblingEdges(nextEdges, targetParentId, siblingIds);

        setEdges(nextEdges);
        setNodes(
            [currentParentId, targetParentId]
                .filter(Boolean)
                .reduce(
                    (currentNodes, parentId) =>
                        reflowSiblingSubtrees({
                            nodes: currentNodes,
                            edges: nextEdges,
                            parentId,
                            anchorNodeId: rowId,
                            compact: true
                        }),
                    nodes
                )
        );
        markDirty();
        const movedLabel = nodes.find((node) => node.id === rowId)?.data?.title || rowId;
        const targetLabel = nodes.find((node) => node.id === targetId)?.data?.title || targetId;
        const undo = showHierarchyUndoNotice({
            message: `Moved ${movedLabel} ${placement} ${targetLabel}.`,
            snapshot: undoSnapshot
        });
        recordActivity({
            type: 'table_hierarchy_reordered',
            title: 'Reordered table row',
            summary: `Moved ${movedLabel} ${placement} ${targetLabel}.`,
            node_ids: [rowId, targetId, targetParentId],
            metadata: {
                node_id: rowId,
                target_id: targetId,
                parent_id: targetParentId,
                placement
            },
            status: 'completed',
            undo
        });
        return true;
    };

    const condenseChildrenToTable = (row) => {
        const childIds = tableChildrenByParent.get(row.id) || [];
        const childRows = childIds
            .map((childId) => projection.nodeLookup.get(childId))
            .filter(Boolean);
        if (!childRows.length) {
            return;
        }

        const undoSnapshot = createHierarchyUndoSnapshot();
        const childrenByParent = childrenLookupFromEdges(edges);
        const descendantIds = collectDescendantIds(childrenByParent, row.id);
        const descendantEdgeIds = new Set(
            edges
                .filter(
                    (edge) =>
                        isHierarchyEdge(edge) &&
                        descendantIds.has(edge.target) &&
                        (edge.source === row.id || descendantIds.has(edge.source))
                )
                .map((edge) => edge.id)
        );
        const existingRows = Array.isArray(row.table_rows) ? row.table_rows : [];
        const existingSourceNodeIds = new Set(
            existingRows.map((detailRow) => detailRow?.source_node_id).filter(Boolean)
        );
        const detailRows = childDetailRows(childRows).filter(
            (detailRow) => !existingSourceNodeIds.has(detailRow.source_node_id)
        );
        if (!detailRows.length) {
            setCollapsedTableRowIds((current) =>
                current.includes(row.id) ? current : [...current, row.id]
            );
        }
        const nextRows = [...existingRows, ...detailRows];

        setNodes(
            nodes.map((node) => {
                if (node.id === row.id) {
                    return {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            node_type: node.data?.node_type || row.node_type || 'reference',
                            df: nextRows,
                            display: {
                                ...(node.data?.display || {}),
                                collapsed: true
                            },
                            data: {
                                ...(node.data?.data || {}),
                                df: nextRows
                            },
                            metadata: {
                                ...(node.data?.metadata || {}),
                                condensed_child_count: childRows.length,
                                condensed_at: new Date().toISOString()
                            }
                        }
                    };
                }
                if (descendantIds.has(node.id)) {
                    return {
                        ...node,
                        hidden: true
                    };
                }
                return node;
            })
        );
        setEdges(
            edges.map((edge) =>
                descendantEdgeIds.has(edge.id)
                    ? {
                          ...edge,
                          hidden: true
                      }
                    : edge
            )
        );
        setCollapsedTableRowIds((current) =>
            current.includes(row.id) ? current : [...current, row.id]
        );
        markDirty();
        const undo = showHierarchyUndoNotice({
            message: `Condensed ${childRows.length} child${childRows.length === 1 ? '' : 'ren'} into ${row.title || row.id}.`,
            snapshot: undoSnapshot
        });
        recordActivity({
            type: 'table_children_condensed',
            title: 'Condensed children into table',
            summary: `Converted ${childRows.length} child node${childRows.length === 1 ? '' : 's'} into structured detail rows.`,
            node_ids: [row.id, ...childIds],
            metadata: {
                parent_id: row.id,
                child_count: childRows.length,
                added_detail_rows: detailRows.length
            },
            status: 'completed',
            undo
        });
    };

    const condenseDensityCandidates = () => {
        if (!densityCondenseCandidates.length) {
            return;
        }
        const undoSnapshot = createHierarchyUndoSnapshot();
        const childrenByParent = childrenLookupFromEdges(edges);
        const hiddenNodeIds = new Set();
        const hiddenEdgeIds = new Set();
        const parentUpdates = new Map();

        densityCondenseCandidates.forEach((row) => {
            const childIds = tableChildrenByParent.get(row.id) || [];
            const childRows = childIds
                .map((childId) => projection.nodeLookup.get(childId))
                .filter(Boolean);
            if (!childRows.length) {
                return;
            }
            const existingRows = Array.isArray(row.table_rows) ? row.table_rows : [];
            const existingSourceNodeIds = new Set(
                existingRows.map((detailRow) => detailRow?.source_node_id).filter(Boolean)
            );
            const detailRows = childDetailRows(childRows).filter(
                (detailRow) => !existingSourceNodeIds.has(detailRow.source_node_id)
            );
            const descendantIds = collectDescendantIds(childrenByParent, row.id);
            descendantIds.forEach((nodeId) => hiddenNodeIds.add(nodeId));
            edges.forEach((edge) => {
                if (
                    isHierarchyEdge(edge) &&
                    descendantIds.has(edge.target) &&
                    (edge.source === row.id || descendantIds.has(edge.source))
                ) {
                    hiddenEdgeIds.add(edge.id);
                }
            });
            parentUpdates.set(row.id, {
                detailRows,
                nextRows: [...existingRows, ...detailRows],
                childCount: childRows.length
            });
        });

        if (!parentUpdates.size) {
            return;
        }
        const condensedAt = new Date().toISOString();
        setNodes(
            nodes.map((node) => {
                const parentUpdate = parentUpdates.get(node.id);
                if (parentUpdate) {
                    return {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            node_type: node.data?.node_type || 'reference',
                            df: parentUpdate.nextRows,
                            display: {
                                ...(node.data?.display || {}),
                                collapsed: true
                            },
                            data: {
                                ...(node.data?.data || {}),
                                df: parentUpdate.nextRows
                            },
                            metadata: {
                                ...(node.data?.metadata || {}),
                                condensed_child_count: parentUpdate.childCount,
                                condensed_at: condensedAt
                            }
                        }
                    };
                }
                if (hiddenNodeIds.has(node.id)) {
                    return {
                        ...node,
                        hidden: true
                    };
                }
                return node;
            })
        );
        setEdges(
            edges.map((edge) =>
                hiddenEdgeIds.has(edge.id)
                    ? {
                          ...edge,
                          hidden: true
                      }
                    : edge
            )
        );
        setCollapsedTableRowIds((current) => {
            const next = new Set(current);
            parentUpdates.forEach((_, parentId) => next.add(parentId));
            return [...next];
        });
        markDirty();
        const undo = showHierarchyUndoNotice({
            message: `Condensed ${parentUpdates.size} dense branch${parentUpdates.size === 1 ? '' : 'es'}.`,
            snapshot: undoSnapshot
        });
        recordActivity({
            type: 'table_density_condensed',
            title: 'Condensed dense branches',
            summary: `Condensed ${parentUpdates.size} dense branch${parentUpdates.size === 1 ? '' : 'es'} from Density mode.`,
            node_ids: [...parentUpdates.keys()],
            metadata: {
                branch_count: parentUpdates.size,
                hidden_node_count: hiddenNodeIds.size
            },
            status: 'completed',
            undo
        });
    };

    const expandCondensedChildren = (row) => {
        const sourceNodeIds = new Set(
            (Array.isArray(row.table_rows) ? row.table_rows : [])
                .map((detailRow) => detailRow?.source_node_id)
                .filter(Boolean)
        );
        const childIds = tableChildrenByParent.get(row.id) || [];
        const idsToReveal = childIds.filter((childId) => sourceNodeIds.has(childId));
        if (!idsToReveal.length) {
            return;
        }

        const undoSnapshot = createHierarchyUndoSnapshot();
        const childrenByParent = childrenLookupFromEdges(edges);
        const revealIds = new Set();
        idsToReveal.forEach((childId) => {
            revealIds.add(childId);
            collectDescendantIds(childrenByParent, childId).forEach((descendantId) =>
                revealIds.add(descendantId)
            );
        });
        const revealEdgeIds = new Set(
            edges
                .filter(
                    (edge) =>
                        isHierarchyEdge(edge) &&
                        revealIds.has(edge.target) &&
                        (edge.source === row.id || revealIds.has(edge.source))
                )
                .map((edge) => edge.id)
        );

        setNodes(
            nodes.map((node) => {
                if (node.id === row.id) {
                    return {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            display: {
                                ...(node.data?.display || {}),
                                collapsed: false
                            },
                            metadata: {
                                ...(node.data?.metadata || {}),
                                condensed_expanded_at: new Date().toISOString()
                            }
                        }
                    };
                }
                if (revealIds.has(node.id)) {
                    return {
                        ...node,
                        hidden: false
                    };
                }
                return node;
            })
        );
        setEdges(
            edges.map((edge) =>
                revealEdgeIds.has(edge.id)
                    ? {
                          ...edge,
                          hidden: false
                      }
                    : edge
            )
        );
        setCollapsedTableRowIds((current) => current.filter((rowId) => rowId !== row.id));
        markDirty();
        const undo = showHierarchyUndoNotice({
            message: `Expanded ${idsToReveal.length} condensed child${idsToReveal.length === 1 ? '' : 'ren'} from ${row.title || row.id}.`,
            snapshot: undoSnapshot
        });
        recordActivity({
            type: 'table_children_expanded',
            title: 'Expanded condensed children',
            summary: `Revealed ${idsToReveal.length} condensed child node${idsToReveal.length === 1 ? '' : 's'} on the map.`,
            node_ids: [row.id, ...idsToReveal],
            metadata: {
                parent_id: row.id,
                child_count: idsToReveal.length
            },
            status: 'completed',
            undo
        });
    };

    const revealCondensedDetailSource = (parentRow, detailRow) => {
        const sourceNodeId = detailRow?.source_node_id;
        if (!sourceNodeId) {
            return;
        }
        const undoSnapshot = createHierarchyUndoSnapshot();
        const childrenByParent = childrenLookupFromEdges(edges);
        const revealIds = new Set([sourceNodeId]);
        collectDescendantIds(childrenByParent, sourceNodeId).forEach((descendantId) =>
            revealIds.add(descendantId)
        );
        const revealEdgeIds = new Set(
            edges
                .filter(
                    (edge) =>
                        isHierarchyEdge(edge) &&
                        revealIds.has(edge.target) &&
                        (edge.source === parentRow.id || revealIds.has(edge.source))
                )
                .map((edge) => edge.id)
        );

        setNodes(
            nodes.map((node) => {
                if (node.id === parentRow.id) {
                    return {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            display: {
                                ...(node.data?.display || {}),
                                collapsed: false
                            }
                        }
                    };
                }
                if (revealIds.has(node.id)) {
                    return {
                        ...node,
                        hidden: false
                    };
                }
                return node;
            })
        );
        setEdges(
            edges.map((edge) =>
                revealEdgeIds.has(edge.id)
                    ? {
                          ...edge,
                          hidden: false
                      }
                    : edge
            )
        );
        setCollapsedTableRowIds((current) => current.filter((rowId) => rowId !== parentRow.id));
        markDirty();
        const undo = showHierarchyUndoNotice({
            message: `Revealed ${detailRow.title || sourceNodeId}.`,
            snapshot: undoSnapshot
        });
        recordActivity({
            type: 'table_condensed_detail_revealed',
            title: 'Revealed condensed detail',
            summary: `Revealed ${detailRow.title || sourceNodeId} from condensed detail.`,
            node_ids: [parentRow.id, sourceNodeId],
            metadata: {
                parent_id: parentRow.id,
                source_node_id: sourceNodeId
            },
            status: 'completed',
            undo
        });
        onFocusInMap?.(sourceNodeId);
    };

    const markCondensedDetailReviewed = (parentRow, detailRow) => {
        const sourceNodeId = detailRow?.source_node_id;
        if (!sourceNodeId) {
            return;
        }
        const reviewedAt = new Date().toISOString();
        setNodes(
            nodes.map((node) => {
                if (node.id === sourceNodeId) {
                    return {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            status: 'reviewed',
                            review_state: 'reviewed',
                            metadata: {
                                ...(node.data?.metadata || {}),
                                reviewed_from_condensed_table_at: reviewedAt
                            }
                        }
                    };
                }
                if (node.id === parentRow.id) {
                    const nextRows = (Array.isArray(node.data?.df) ? node.data.df : []).map((row) =>
                        row?.source_node_id === sourceNodeId
                            ? {
                                  ...row,
                                  status: 'reviewed',
                                  review_state: 'reviewed',
                                  reviewed_at: reviewedAt
                              }
                            : row
                    );
                    return {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            df: nextRows,
                            data: {
                                ...(node.data?.data || {}),
                                df: nextRows
                            }
                        }
                    };
                }
                return node;
            })
        );
        markDirty();
        recordActivity({
            type: 'table_condensed_detail_reviewed',
            title: 'Reviewed condensed detail',
            summary: `Marked ${detailRow.title || sourceNodeId} reviewed from the condensed preview.`,
            node_ids: [parentRow.id, sourceNodeId],
            metadata: {
                parent_id: parentRow.id,
                source_node_id: sourceNodeId
            },
            status: 'completed'
        });
    };

    const tableDropPositionForEvent = (event, rowId) => {
        const parentId = tableParentByChild.get(rowId);
        const bounds = event.currentTarget.getBoundingClientRect();
        const ratio = bounds.height ? (event.clientY - bounds.top) / bounds.height : 0.5;
        if (parentId && ratio < 0.28) {
            return 'before';
        }
        if (parentId && ratio > 0.72) {
            return 'after';
        }
        return 'inside';
    };

    const canDropTableRow = (rowId, targetId, position) => {
        if (!rowId || !targetId || rowId === targetId) {
            return false;
        }
        const childrenByParent = childrenLookupFromEdges(edges);
        if (position === 'inside') {
            return !collectDescendantIds(childrenByParent, rowId).has(targetId);
        }
        const targetParentId = tableParentByChild.get(targetId);
        if (!targetParentId || targetParentId === rowId) {
            return false;
        }
        return !collectDescendantIds(childrenByParent, rowId).has(targetParentId);
    };

    const handleTableDragStart = (event, rowId) => {
        setDraggedTableRowId(rowId);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', rowId);
    };

    const handleTableDragOver = (event, rowId) => {
        const draggedId = draggedTableRowId || event.dataTransfer.getData('text/plain');
        if (!draggedId || draggedId === rowId) {
            return;
        }
        const position = tableDropPositionForEvent(event, rowId);
        if (!canDropTableRow(draggedId, rowId, position)) {
            setTableDropTarget({ rowId: '', position: '' });
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setTableDropTarget({ rowId, position });
    };

    const handleTableDrop = (event, rowId) => {
        event.preventDefault();
        const draggedId = draggedTableRowId || event.dataTransfer.getData('text/plain');
        const position = tableDropTarget.rowId === rowId
            ? tableDropTarget.position
            : tableDropPositionForEvent(event, rowId);
        setDraggedTableRowId('');
        setTableDropTarget({ rowId: '', position: '' });
        if (!canDropTableRow(draggedId, rowId, position)) {
            return;
        }
        if (position === 'inside') {
            moveTableRowUnder(draggedId, rowId);
            return;
        }
        moveTableRowAdjacent(draggedId, rowId, position);
    };

    const clearTableDragState = () => {
        setDraggedTableRowId('');
        setTableDropTarget({ rowId: '', position: '' });
    };

    const applyBulkEdit = () => {
        const changedEntries = Object.entries(bulkEdit).filter(([, value]) => value !== '');
        if (!selectedTableRowIds.length || !changedEntries.length) {
            return;
        }
        const selectedIds = new Set(selectedTableRowIds);
        setNodes(
            nodes.map((node) => {
                if (!selectedIds.has(node.id)) {
                    return node;
                }
                const changedData = Object.fromEntries(changedEntries);
                return {
                    ...node,
                    data: {
                        ...node.data,
                        ...changedData,
                        ...(changedData.owner_id ? { assignee: changedData.owner_id } : {})
                    }
                };
            })
        );
        markDirty();
        recordActivity({
            type: 'table_bulk_metadata_changed',
            title: 'Bulk updated table rows',
            summary: `Updated ${selectedTableRowIds.length} table row${selectedTableRowIds.length === 1 ? '' : 's'}.`,
            node_ids: selectedTableRowIds,
            metadata: Object.fromEntries(changedEntries),
            status: 'completed'
        });
    };

    const saveCurrentTableView = () => {
        const defaultName = selectedBranchId
            ? `${projection.nodeLookup.get(selectedBranchId)?.title || 'Branch'} - ${tableMode}`
            : `Workspace - ${tableMode}`;
        const name = window.prompt('Name this table view', defaultName);
        if (!name?.trim()) {
            return;
        }
        const nextViews = saveSavedTableViews([
            {
                id: `table-view-${Date.now()}`,
                name,
                mode: tableMode,
                branchId: selectedBranchId || '',
                filters: activeGraphFilters,
                createdAt: new Date().toISOString()
            },
            ...savedTableViews
        ]);
        setSavedTableViews(nextViews);
    };

    const applySavedTableView = (viewId) => {
        const savedView = savedTableViews.find((item) => item.id === viewId);
        if (!savedView) {
            return;
        }
        setTableMode(savedView.mode || 'breakdown');
        onSelectBranch?.(savedView.branchId || undefined);
        onApplyFilters?.(savedView.filters || []);
    };

    const deleteSavedTableView = (viewId) => {
        setSavedTableViews(saveSavedTableViews(savedTableViews.filter((item) => item.id !== viewId)));
    };

    const confirmTaskCandidate = (row) => {
        const acceptedAt = new Date().toISOString();
        setNodes(
            nodes.map((node) => {
                if (node.id !== row.id) {
                    return node;
                }

                const nextStatus = row.preview_status || 'needs_review';
                const nextPriority = row.priority || node.data?.priority || '';
                const nextOwner = row.owner_id || node.data?.owner_id || '';
                const nextDue = row.due_date || node.data?.due_date || '';

                return {
                    ...node,
                    data: {
                        ...node.data,
                        node_type: row.preview_type || 'task',
                        status: nextStatus,
                        priority: nextPriority,
                        owner_id: nextOwner,
                        due_date: nextDue,
                        task_projection: {
                            ...(node.data?.task_projection || {}),
                            accepted: true,
                            accepted_at: acceptedAt,
                            preview_type: row.preview_type || 'task',
                            preview_status: nextStatus,
                            priority: nextPriority,
                            owner_id: nextOwner,
                            due_date: nextDue,
                            generated_preview_id: '',
                            generated_preview_item_id: ''
                        }
                    }
                };
            })
        );
        markDirty();
        recordActivity({
            type: 'task_candidate_confirmed',
            title: 'Confirmed task candidate',
            summary: `Confirmed ${row.title || row.id} as a task.`,
            node_ids: [row.id],
            metadata: {
                preview_type: row.preview_type || 'task',
                preview_status: row.preview_status || 'needs_review'
            },
            status: 'completed'
        });
    };

    const moveKanbanTask = (nodeId, status) => {
        if (!nodeId) {
            return;
        }
        const row = taskRows.find((task) => task.id === nodeId);
        if (!row || row.status === status) {
            return;
        }
        updateTaskField(nodeId, 'status', status);
    };

    if (nodes.length === 0) {
        return (
            <section className={`canvas-structured-view canvas-structured-view-${view}`} aria-label={label}>
                <EmptyStructuredView
                    view={view}
                    label={label}
                    onOpenSources={onOpenSources}
                    onAskAi={onAskAi}
                    onStartManual={onStartManual}
                />
            </section>
        );
    }

    return (
        <section className={`canvas-structured-view canvas-structured-view-${view}`} aria-label={label}>
            <header className="canvas-structured-header">
                <div className="canvas-structured-header-main">
                    <span>
                        {view === 'table'
                            ? selectedBranchId
                                ? 'View selected branch as table'
                                : 'View workspace as table'
                            : 'Workspace view'}
                    </span>
                    <strong>
                        {view === 'table' && selectedBranchId
                            ? projection.nodeLookup.get(selectedBranchId)?.title || label
                            : label}
                    </strong>
                </div>
                <p>
                    {projection.nodes.length} nodes, {projection.edges.length} links
                    {activeGraphFilters.length ? `, ${activeGraphFilters.length} filters` : ''}
                </p>
                <ActiveFilterChips filters={activeGraphFilters} />
                <div className="canvas-structured-header-actions">
                    {view === 'flowchart' ? (
                        <button
                            type="button"
                            className="canvas-structured-header-action"
                            onClick={() =>
                                onAskAi?.({
                                    initialVisual: 'flow_chart',
                                    initialPrompt: 'Improve this flowchart with clearer step order, decision paths, dependencies, handoffs, and source-backed review notes.'
                                })
                            }
                        >
                            <FiGitBranch aria-hidden="true" />
                            Improve flow
                        </button>
                    ) : null}
                    {view === 'table' ? (
                        <button
                            type="button"
                            className="canvas-structured-header-action"
                            onClick={onCreateStructuredTable}
                        >
                            Create structured table
                        </button>
                    ) : null}
                    {onBackToMap ? (
                        <button
                            type="button"
                            className="canvas-structured-header-secondary"
                            onClick={onBackToMap}
                        >
                            <FiMap aria-hidden="true" />
                            Map
                        </button>
                    ) : null}
                </div>
            </header>

            {view === 'flowchart' ? (
                <FlowchartView
                    flowchart={flowchart}
                    onOpenNode={onOpenNode}
                    onAskAi={onAskAi}
                />
            ) : null}

            {view === 'outline' ? (
                projection.roots.length > 0 ? (
                    <ol className="canvas-structured-outline">
                        {projection.roots.map((root) => (
                            <OutlineItem
                                key={root.id}
                                node={root}
                                projection={projection}
                                depth={0}
                                onOpenNode={onOpenNode}
                            />
                        ))}
                    </ol>
                ) : (
                    <EmptyFilteredView label={label} />
                )
            ) : null}

            {view === 'executive' ? (
                <div className="canvas-structured-executive">
                    <section className="canvas-structured-executive-summary">
                        <strong>Summary</strong>
                        <p>{executiveOutput.summary}</p>
                        <div>
                            <span>{executiveOutput.metadata.source_backed_node_count} sourced</span>
                            <span>{executiveOutput.metadata.task_count} actions</span>
                            <span>{executiveOutput.metadata.needs_review_count} review</span>
                        </div>
                    </section>
                    <ExecutiveList title="Key Findings" items={executiveOutput.key_findings} />
                    <ExecutiveList title="Recommended Actions" items={executiveOutput.recommended_actions} />
                    <ExecutiveList title="Risks" items={executiveOutput.risks} />
                    <ExecutiveList title="Required Decisions" items={executiveOutput.required_decisions} />
                    <ExecutiveList
                        title="Source-backed Appendix"
                        items={executiveOutput.source_backed_appendix}
                    />
                </div>
            ) : null}

            {view === 'tasks' ? (
                <div className="canvas-structured-task-surface">
                    <section className="canvas-structured-task-section">
                        <div className="canvas-structured-section-header">
                            <strong>Confirmed tasks</strong>
                            <span>{taskRows.length}</span>
                        </div>
                        {taskRows.length > 0 ? (
                            <div className="canvas-structured-table-wrap">
                                <table className="canvas-structured-table">
                                    <thead>
                                        <tr>
                                            <th>Task</th>
                                            <th>Type</th>
                                            <th>Status</th>
                                            <th>Priority</th>
                                            <th>Owner</th>
                                            <th>Due</th>
                                            <th>Source</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {taskRows.map((row) => (
                                            <tr key={row.id}>
                                                <td>
                                                    <button type="button" onClick={() => onOpenNode?.(row.id)}>
                                                        {row.title}
                                                    </button>
                                                    {summaryText(row) ? <p>{summaryText(row)}</p> : null}
                                                </td>
                                                <td>{rowTypeLabel(row)}</td>
                                                <td>
                                                    <select
                                                        className="canvas-structured-task-control"
                                                        value={row.status || 'needs_review'}
                                                        onChange={(event) =>
                                                            updateTaskField(row.id, 'status', event.target.value)
                                                        }
                                                        aria-label={`Status for ${row.title}`}
                                                    >
                                                        {TASK_STATUS_OPTIONS.map((status) => (
                                                            <option key={status} value={status}>
                                                                {status}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <select
                                                        className="canvas-structured-task-control"
                                                        value={row.priority || ''}
                                                        onChange={(event) =>
                                                            updateTaskField(row.id, 'priority', event.target.value)
                                                        }
                                                        aria-label={`Priority for ${row.title}`}
                                                    >
                                                        {TASK_PRIORITY_OPTIONS.map((priority) => (
                                                            <option key={priority || 'none'} value={priority}>
                                                                {priority || 'None'}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <input
                                                        className="canvas-structured-task-control"
                                                        value={row.owner_id || ''}
                                                        placeholder="Owner"
                                                        onChange={(event) =>
                                                            updateTaskField(row.id, 'owner_id', event.target.value, {
                                                                record: false
                                                            })
                                                        }
                                                        onBlur={(event) =>
                                                            updateTaskField(row.id, 'owner_id', event.target.value)
                                                        }
                                                        aria-label={`Owner for ${row.title}`}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className="canvas-structured-task-control"
                                                        value={row.due_date || ''}
                                                        placeholder="Due"
                                                        onChange={(event) =>
                                                            updateTaskField(row.id, 'due_date', event.target.value, {
                                                                record: false
                                                            })
                                                        }
                                                        onBlur={(event) =>
                                                            updateTaskField(row.id, 'due_date', event.target.value)
                                                        }
                                                        aria-label={`Due date for ${row.title}`}
                                                    />
                                                </td>
                                                <td>{sourceLabel(row)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="canvas-structured-empty inline">
                                <strong>No tasks yet</strong>
                                <span>Create task candidates from the graph, then accept the ones that should become canonical.</span>
                                <button type="button" onClick={onGenerateTaskCandidates}>
                                    Generate task candidates
                                </button>
                            </div>
                        )}
                    </section>
                    {potentialTaskRows.length > 0 ? (
                        <section className="canvas-structured-task-section">
                            <div className="canvas-structured-section-header">
                                <strong>Potential tasks</strong>
                                <span>{potentialTaskRows.length}</span>
                            </div>
                            <div className="canvas-structured-potential-list">
                                {potentialTaskRows.map((row) => (
                                    <article
                                        key={row.id}
                                        className="canvas-structured-potential-item"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => onOpenNode?.(row.id)}
                                        >
                                            <strong>{row.title}</strong>
                                            <span>{rowTypeLabel(row)} · candidate</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="canvas-structured-confirm-task"
                                            onClick={() => confirmTaskCandidate(row)}
                                        >
                                            Confirm
                                        </button>
                                    </article>
                                ))}
                            </div>
                        </section>
                    ) : null}
                </div>
            ) : null}

            {view === 'kanban' ? (
                taskRows.length > 0 ? (
                    <KanbanBoardView
                        columns={kanbanColumns}
                        onOpenNode={onOpenNode}
                        onMoveTask={moveKanbanTask}
                    />
                ) : (
                    <div className="canvas-structured-empty inline">
                        <strong>No tasks on the board yet</strong>
                        <span>Confirm task candidates or generate tasks, then move them across columns.</span>
                        <button type="button" onClick={onGenerateTaskCandidates}>
                            Generate task candidates
                        </button>
                    </div>
                )
            ) : null}

            {view === 'table' ? (
                projection.nodes.length > 0 ? (
                    <div className="canvas-structured-table-surface">
                        <section className="canvas-structured-branch-summary">
                            <div>
                                <span>{selectedBranchId ? 'Selected branch' : 'Workspace'}</span>
                                <strong>
                                    {workBreakdownSummary.itemCount} item{workBreakdownSummary.itemCount === 1 ? '' : 's'}
                                </strong>
                            </div>
                            <dl>
                                <div>
                                    <dt>Needs review</dt>
                                    <dd>{workBreakdownSummary.needsReviewCount}</dd>
                                </div>
                                <div>
                                    <dt>Unsourced</dt>
                                    <dd>{workBreakdownSummary.unsourcedCount}</dd>
                                </div>
                                <div>
                                    <dt>Unassigned</dt>
                                    <dd>{workBreakdownSummary.unassignedCount}</dd>
                                </div>
                                <div>
                                    <dt>Risks</dt>
                                    <dd>{workBreakdownSummary.riskCount}</dd>
                                </div>
                                <div>
                                    <dt>Condensed</dt>
                                    <dd>{workBreakdownSummary.condensedCount}</dd>
                                </div>
                                <div>
                                    <dt>Avg confidence</dt>
                                    <dd>
                                        {workBreakdownSummary.averageConfidence === null
                                            ? '-'
                                            : `${Math.round(workBreakdownSummary.averageConfidence * 100)}%`}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Handoff ready</dt>
                                    <dd>
                                        {workBreakdownSummary.averageReadiness === null
                                            ? '-'
                                            : `${Math.round(workBreakdownSummary.averageReadiness)}%`}
                                    </dd>
                                </div>
                            </dl>
                        </section>
                        {hierarchyUndoNotice ? (
                            <div className="canvas-structured-undo-toast" role="status">
                                <span>{hierarchyUndoNotice.message}</span>
                                <button type="button" onClick={hierarchyUndoNotice.undo}>
                                    Undo
                                </button>
                                <button
                                    type="button"
                                    aria-label="Dismiss hierarchy undo"
                                    onClick={() => setHierarchyUndoNotice(null)}
                                >
                                    x
                                </button>
                            </div>
                        ) : null}
                        <div className="canvas-structured-table-mode" role="tablist" aria-label="Table mode">
                            {TABLE_MODES.map((mode) => (
                                <button
                                    key={mode.id}
                                    type="button"
                                    className={tableMode === mode.id ? 'active' : ''}
                                    onClick={() => setTableMode(mode.id)}
                                    role="tab"
                                    aria-selected={tableMode === mode.id}
                                >
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                        <section className="canvas-structured-saved-views" aria-label="Saved table views">
                            <div>
                                <strong>Saved views</strong>
                                <button type="button" onClick={saveCurrentTableView}>
                                    Save current
                                </button>
                            </div>
                            {savedTableViews.length ? (
                                <div className="canvas-structured-saved-view-list">
                                    {savedTableViews.map((savedView) => (
                                        <span key={savedView.id}>
                                            <button
                                                type="button"
                                                onClick={() => applySavedTableView(savedView.id)}
                                                title={[
                                                    savedView.branchId ? `branch: ${savedView.branchId}` : 'workspace',
                                                    savedView.mode,
                                                    savedView.filters?.length ? `${savedView.filters.length} filters` : ''
                                                ]
                                                    .filter(Boolean)
                                                    .join(' | ')}
                                            >
                                                {savedView.name}
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={`Delete saved view ${savedView.name}`}
                                                onClick={() => deleteSavedTableView(savedView.id)}
                                            >
                                                x
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p>Save branch/mode/filter combinations you revisit.</p>
                            )}
                        </section>
                        {selectedTableRowIds.length > 0 ? (
                            <section className="canvas-structured-bulk-edit" aria-label="Bulk table edits">
                                <strong>
                                    {selectedTableRowIds.length} selected
                                </strong>
                                <input
                                    value={bulkEdit.owner_id}
                                    placeholder="Owner"
                                    onChange={(event) =>
                                        setBulkEdit((current) => ({
                                            ...current,
                                            owner_id: event.target.value
                                        }))
                                    }
                                    aria-label="Bulk owner"
                                />
                                <select
                                    value={bulkEdit.status}
                                    onChange={(event) =>
                                        setBulkEdit((current) => ({
                                            ...current,
                                            status: event.target.value
                                        }))
                                    }
                                    aria-label="Bulk status"
                                >
                                    <option value="">Status</option>
                                    {TASK_STATUS_OPTIONS.map((status) => (
                                        <option key={status} value={status}>
                                            {status}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={bulkEdit.priority}
                                    onChange={(event) =>
                                        setBulkEdit((current) => ({
                                            ...current,
                                            priority: event.target.value
                                        }))
                                    }
                                    aria-label="Bulk priority"
                                >
                                    <option value="">Priority</option>
                                    {TASK_PRIORITY_OPTIONS.filter(Boolean).map((priority) => (
                                        <option key={priority} value={priority}>
                                            {priority}
                                        </option>
                                    ))}
                                </select>
                                <button type="button" onClick={applyBulkEdit} disabled={!hasBulkEditChanges}>
                                    Apply
                                </button>
                                <button
                                    type="button"
                                    className="canvas-structured-bulk-secondary"
                                    onClick={() => setSelectedTableRowIds([])}
                                >
                                    Clear
                                </button>
                            </section>
                        ) : null}
                        {tableMode === 'density' ? (
                            <section className="canvas-structured-density-actions" aria-label="Density actions">
                                <strong>{densityCondenseCandidates.length} suggested</strong>
                                <span>
                                    Branches with 4+ child nodes and no condensed detail rows.
                                </span>
                                <button
                                    type="button"
                                    onClick={condenseDensityCandidates}
                                    disabled={!densityCondenseCandidates.length}
                                >
                                    Condense suggested
                                </button>
                            </section>
                        ) : null}
                        <div className="canvas-structured-table-wrap">
                            <table className="canvas-structured-table canvas-structured-work-breakdown">
                                <thead>
                                    <tr>
                                        <th>
                                            <input
                                                type="checkbox"
                                                checked={allTableRowsSelected}
                                                onChange={toggleAllTableRows}
                                                aria-label="Select all table rows"
                                            />
                                        </th>
                                        <th>{selectedBranchId ? 'Work item' : 'Title'}</th>
                                        <th>Actions</th>
                                        <th>Parent</th>
                                        {tableMode === 'breakdown' ? (
                                            <>
                                                <th>Type</th>
                                                <th>Status</th>
                                                <th>Owner</th>
                                                <th>Priority</th>
                                                <th>Summary</th>
                                                <th>Source</th>
                                                <th>Confidence</th>
                                                <th>Table</th>
                                            </>
                                        ) : null}
                                        {tableMode === 'responsibility' ? (
                                            <>
                                                <th>Owner</th>
                                                <th>Status</th>
                                                <th>Priority</th>
                                                <th>Due</th>
                                                <th>Input needed</th>
                                            </>
                                        ) : null}
                                        {tableMode === 'evidence' ? (
                                            <>
                                                <th>Source</th>
                                                <th>Confidence</th>
                                                <th>Review state</th>
                                                <th>Summary</th>
                                            </>
                                        ) : null}
                                        {tableMode === 'risks' ? (
                                            <>
                                                <th>Status</th>
                                                <th>Priority</th>
                                                <th>Risk</th>
                                                <th>Owner</th>
                                                <th>Summary</th>
                                            </>
                                        ) : null}
                                        {tableMode === 'readiness' ? (
                                            <>
                                                <th>Readiness</th>
                                                <th>Missing factors</th>
                                                <th>Owner</th>
                                                <th>Evidence</th>
                                                <th>Review</th>
                                            </>
                                        ) : null}
                                        {tableMode === 'density' ? (
                                            <>
                                                <th>Child nodes</th>
                                                <th>Condensed details</th>
                                                <th>Review load</th>
                                                <th>Suggestion</th>
                                                <th>Summary</th>
                                            </>
                                        ) : null}
                                        {tableMode === 'condensed' ? (
                                            <>
                                                <th>Detail rows</th>
                                                <th>Hidden branch</th>
                                                <th>Evidence</th>
                                                <th>Summary</th>
                                                <th>Table shape</th>
                                            </>
                                        ) : null}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tableMode === 'condensed' && displayedWorkBreakdownRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={9}>
                                                No condensed detail rows in this scope yet.
                                            </td>
                                        </tr>
                                    ) : null}
                                    {tableMode === 'density' && displayedWorkBreakdownRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={9}>
                                                No dense branches in this scope yet.
                                            </td>
                                        </tr>
                                    ) : null}
                                    {displayedWorkBreakdownRows.map((row, rowIndex) => (
                                        <Fragment key={row.id}>
                                        <tr
                                            className={[
                                                draggedTableRowId === row.id ? 'is-dragging' : '',
                                                tableDropTarget.rowId === row.id
                                                    ? `is-drop-target is-drop-${tableDropTarget.position}`
                                                    : ''
                                            ]
                                                .filter(Boolean)
                                                .join(' ')}
                                            onDragOver={(event) => handleTableDragOver(event, row.id)}
                                            onDragLeave={() => setTableDropTarget({ rowId: '', position: '' })}
                                            onDrop={(event) => handleTableDrop(event, row.id)}
                                        >
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTableRowIds.includes(row.id)}
                                                    onChange={() => toggleTableRowSelection(row.id)}
                                                    aria-label={`Select ${row.title}`}
                                                />
                                            </td>
                                            <td style={{ '--depth': row.depth || 0 }}>
                                                <div className="canvas-structured-work-item">
                                                    <button
                                                        type="button"
                                                        className="canvas-structured-row-drag"
                                                        draggable
                                                        onDragStart={(event) => handleTableDragStart(event, row.id)}
                                                        onDragEnd={clearTableDragState}
                                                        aria-label={`Drag ${row.title} to another row`}
                                                        title="Drag to the top, middle, or bottom of a row"
                                                    >
                                                        ::
                                                    </button>
                                                    <button type="button" onClick={() => onOpenNode?.(row.id)}>
                                                        {row.title}
                                                    </button>
                                                    {condensedDetailCount(row) > 0 ? (
                                                        <span className="canvas-structured-condensed-badge">
                                                            {condensedDetailCount(row)} detail
                                                            {condensedDetailCount(row) === 1 ? '' : 's'}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="canvas-structured-row-actions">
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectBranch?.(row.id)}
                                                        disabled={selectedBranchId === row.id}
                                                    >
                                                        Scope
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onFocusInMap?.(row.id)}
                                                    >
                                                        Map
                                                    </button>
                                                    {row.child_count > 0 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleTableRowCollapse(row.id)}
                                                        >
                                                            {row.collapsed ? 'Expand' : 'Collapse'}
                                                        </button>
                                                    ) : null}
                                                    {row.child_count > 0 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => condenseChildrenToTable(row)}
                                                            title="Copy immediate children into detail rows and fold the branch"
                                                        >
                                                            Condense
                                                        </button>
                                                    ) : null}
                                                    {row.child_count > 0 && row.table_rows?.some((detailRow) => detailRow?.source_node_id) ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => expandCondensedChildren(row)}
                                                            title="Reveal child nodes that were copied into detail rows"
                                                        >
                                                            Reveal
                                                        </button>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        onClick={() => promoteTableRow(row)}
                                                        disabled={!row.parent_id}
                                                    >
                                                        Promote
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            demoteTableRow(row, rowIndex, displayedWorkBreakdownRows)
                                                        }
                                                        disabled={
                                                            !displayedWorkBreakdownRows
                                                                .slice(0, rowIndex)
                                                                .some((candidate) => candidate.depth === row.depth)
                                                        }
                                                    >
                                                        Demote
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => reorderTableRow(row, 'up')}
                                                        disabled={!canReorderTableRow(row, 'up')}
                                                    >
                                                        Up
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => reorderTableRow(row, 'down')}
                                                        disabled={!canReorderTableRow(row, 'down')}
                                                    >
                                                        Down
                                                    </button>
                                                </div>
                                            </td>
                                            <td>{row.parent_title || '-'}</td>
                                            {tableMode === 'breakdown' ? (
                                                <>
                                                    <td>{rowTypeLabel(row)}</td>
                                                    <td>
                                                        <select
                                                            className="canvas-structured-task-control"
                                                            value={row.status || 'needs_review'}
                                                            onChange={(event) =>
                                                                updateNodeField(row.id, 'status', event.target.value)
                                                            }
                                                            aria-label={`Status for ${row.title}`}
                                                        >
                                                            {TASK_STATUS_OPTIONS.map((status) => (
                                                                <option key={status} value={status}>
                                                                    {status}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <input
                                                            className="canvas-structured-task-control"
                                                            value={row.owner_id || ''}
                                                            placeholder="Owner"
                                                            onChange={(event) =>
                                                                updateNodeField(row.id, 'owner_id', event.target.value, {
                                                                    record: false
                                                                })
                                                            }
                                                            onBlur={(event) =>
                                                                updateNodeField(row.id, 'owner_id', event.target.value)
                                                            }
                                                            aria-label={`Owner for ${row.title}`}
                                                        />
                                                    </td>
                                                    <td>
                                                        <select
                                                            className="canvas-structured-task-control"
                                                            value={row.priority || ''}
                                                            onChange={(event) =>
                                                                updateNodeField(row.id, 'priority', event.target.value)
                                                            }
                                                            aria-label={`Priority for ${row.title}`}
                                                        >
                                                            {TASK_PRIORITY_OPTIONS.map((priority) => (
                                                                <option key={priority || 'none'} value={priority}>
                                                                    {priority || 'None'}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td>{summaryText(row) || '-'}</td>
                                                    <td>
                                                        <EvidenceCell row={row} onOpenSources={onOpenSources} />
                                                    </td>
                                                    <td>{confidenceLabel(row)}</td>
                                                    <td>{tableShapeLabel(row)}</td>
                                                </>
                                            ) : null}
                                            {tableMode === 'responsibility' ? (
                                                <>
                                                    <td>
                                                        <input
                                                            className="canvas-structured-task-control"
                                                            value={row.owner_id || ''}
                                                            placeholder="Responsible"
                                                            onChange={(event) =>
                                                                updateNodeField(row.id, 'owner_id', event.target.value, {
                                                                    record: false
                                                                })
                                                            }
                                                            onBlur={(event) =>
                                                                updateNodeField(row.id, 'owner_id', event.target.value)
                                                            }
                                                            aria-label={`Responsible owner for ${row.title}`}
                                                        />
                                                    </td>
                                                    <td>{row.status || '-'}</td>
                                                    <td>{row.priority || '-'}</td>
                                                    <td>
                                                        <input
                                                            className="canvas-structured-task-control"
                                                            value={row.due_date || ''}
                                                            placeholder="Due"
                                                            onChange={(event) =>
                                                                updateNodeField(row.id, 'due_date', event.target.value, {
                                                                    record: false
                                                                })
                                                            }
                                                            onBlur={(event) =>
                                                                updateNodeField(row.id, 'due_date', event.target.value)
                                                            }
                                                            aria-label={`Due date for ${row.title}`}
                                                        />
                                                    </td>
                                                    <td>{!row.source_refs?.length ? 'Source support' : summaryText(row) || '-'}</td>
                                                </>
                                            ) : null}
                                            {tableMode === 'evidence' ? (
                                                <>
                                                    <td>
                                                        <EvidenceCell row={row} onOpenSources={onOpenSources} />
                                                    </td>
                                                    <td>{confidenceLabel(row)}</td>
                                                    <td>{row.review_state || row.status || '-'}</td>
                                                    <td>{summaryText(row) || '-'}</td>
                                                </>
                                            ) : null}
                                            {tableMode === 'risks' ? (
                                                <>
                                                    <td>{row.status || '-'}</td>
                                                    <td>{row.priority || '-'}</td>
                                                    <td>{row.risk_severity || (row.priority === 'critical' ? 'critical' : '-')}</td>
                                                    <td>{row.owner_id || '-'}</td>
                                                    <td>{summaryText(row) || '-'}</td>
                                                </>
                                            ) : null}
                                            {tableMode === 'readiness' ? (
                                                <>
                                                    <td>
                                                        <div className="canvas-structured-readiness-cell">
                                                            <strong>{rowReadiness(row).score}%</strong>
                                                            <span>{rowReadiness(row).label}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {rowReadiness(row).missing.length
                                                            ? rowReadiness(row).missing.join(', ')
                                                            : 'Ready for handoff'}
                                                    </td>
                                                    <td>{row.owner_id || '-'}</td>
                                                    <td>
                                                        <EvidenceCell row={row} onOpenSources={onOpenSources} />
                                                    </td>
                                                    <td>{row.review_state || row.status || '-'}</td>
                                                </>
                                            ) : null}
                                            {tableMode === 'density' ? (
                                                <>
                                                    <td>
                                                        <div className="canvas-structured-density-cell">
                                                            <strong>{row.child_count || 0}</strong>
                                                            <span>visible child nodes</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="canvas-structured-density-cell">
                                                            <strong>{condensedDetailCount(row)}</strong>
                                                            <span>detail rows</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {
                                                            condensedDetailRows(row).filter(
                                                                (detailRow) =>
                                                                    detailRow.evidence === 'Missing evidence' ||
                                                                    detailRow.evidence === 'Low confidence'
                                                            ).length
                                                        }{' '}
                                                        details need review
                                                    </td>
                                                    <td>{densityRecommendation(row)}</td>
                                                    <td>{summaryText(row) || '-'}</td>
                                                </>
                                            ) : null}
                                            {tableMode === 'condensed' ? (
                                                <>
                                                    <td>
                                                        <div className="canvas-structured-condensed-cell">
                                                            <strong>{condensedDetailCount(row)}</strong>
                                                            <span>structured detail rows</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleCondensedPreview(row.id)}
                                                            >
                                                                {expandedCondensedRowIds.includes(row.id)
                                                                    ? 'Hide preview'
                                                                    : 'Preview'}
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td>{row.collapsed ? 'Folded' : 'Visible'}</td>
                                                    <td>
                                                        {
                                                            condensedDetailRows(row).filter(
                                                                (detailRow) =>
                                                                    detailRow.evidence === 'Missing evidence' ||
                                                                    detailRow.evidence === 'Low confidence'
                                                            ).length
                                                        }{' '}
                                                        need review
                                                    </td>
                                                    <td>{summaryText(row) || '-'}</td>
                                                    <td>{tableShapeLabel(row)}</td>
                                                </>
                                            ) : null}
                                        </tr>
                                        {tableMode === 'condensed' && expandedCondensedRowIds.includes(row.id) ? (
                                            <tr className="canvas-structured-condensed-preview-row">
                                                <td colSpan={9}>
                                                    <div className="canvas-structured-condensed-preview">
                                                        <div>
                                                            <strong>{row.title}</strong>
                                                            <span>
                                                                {condensedDetailCount(row)} structured detail
                                                                {condensedDetailCount(row) === 1 ? '' : 's'}
                                                            </span>
                                                        </div>
                                                        <table>
                                                            <thead>
                                                                <tr>
                                                                    <th>Detail</th>
                                                                    <th>Type</th>
                                                                    <th>Status</th>
                                                                    <th>Owner</th>
                                                                    <th>Evidence</th>
                                                                    <th>Confidence</th>
                                                                    <th>Summary</th>
                                                                    <th>Actions</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {condensedDetailRows(row).map((detailRow, detailIndex) => (
                                                                    <tr
                                                                        key={
                                                                            detailRow.source_node_id ||
                                                                            `${row.id}-detail-${detailIndex}`
                                                                        }
                                                                    >
                                                                        <td>{detailRow.title || '-'}</td>
                                                                        <td>{detailRow.type || '-'}</td>
                                                                        <td>{detailRow.status || '-'}</td>
                                                                        <td>{detailRow.owner || '-'}</td>
                                                                        <td>{detailRow.evidence || '-'}</td>
                                                                        <td>{detailRow.confidence || '-'}</td>
                                                                        <td>{detailRow.summary || '-'}</td>
                                                                        <td>
                                                                            <div className="canvas-structured-condensed-detail-actions">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        onOpenNode?.(
                                                                                            detailRow.source_node_id
                                                                                        )
                                                                                    }
                                                                                    disabled={!detailRow.source_node_id}
                                                                                >
                                                                                    Open
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        revealCondensedDetailSource(
                                                                                            row,
                                                                                            detailRow
                                                                                        )
                                                                                    }
                                                                                    disabled={!detailRow.source_node_id}
                                                                                >
                                                                                    Reveal
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        markCondensedDetailReviewed(
                                                                                            row,
                                                                                            detailRow
                                                                                        )
                                                                                    }
                                                                                    disabled={!detailRow.source_node_id}
                                                                                >
                                                                                    Reviewed
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : null}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <EmptyFilteredView label={label} />
                )
            ) : null}
        </section>
    );
};

export default CanvasStructuredView;
