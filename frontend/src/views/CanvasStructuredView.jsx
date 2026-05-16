import { useMemo } from 'react';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import KanbanBoardView from './KanbanBoardView.jsx';
import {
    buildFilteredGraphProjection,
    getExecutiveOutputProjection,
    getKanbanColumns,
    getTaskCandidateRows,
    getTaskRows
} from './graphProjection.js';

const VIEW_LABELS = {
    executive: 'Executive',
    outline: 'Outline',
    tasks: 'Tasks',
    kanban: 'Kanban',
    table: 'Table'
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

const sourceLabel = (node) => {
    const ref = node.source_ref || {};
    return [ref.document_id, ref.page ? `p. ${ref.page}` : '', ref.section]
        .filter(Boolean)
        .join(' | ') || 'No source';
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

const summaryText = (node) => {
    const value = node.summary || node.query || '';
    return typeof value === 'string' ? value : '';
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
        <strong>{view === 'kanban' ? 'Start a Kanban board' : 'No accepted graph nodes yet'}</strong>
        <span>
            {view === 'kanban'
                ? 'Ask AI to shape work into board columns, add sources, or create the first task node.'
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

const CanvasStructuredView = ({
    view,
    nodes = [],
    edges = [],
    activeGraphFilters = [],
    selectedBranchId,
    onOpenNode,
    onOpenSources,
    onAskAi,
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
    const kanbanColumns = useMemo(() => getKanbanColumns(projection), [projection]);
    const executiveOutput = useMemo(
        () => getExecutiveOutputProjection(projection, { title: 'Executive Output' }),
        [projection]
    );
    const potentialTaskRows = useMemo(
        () => getTaskCandidateRows(projection).slice(0, 24),
        [projection]
    );
    const setNodes = useStore((state) => state.setNodes);
    const flowId = flowStore((state) => state.flow_id);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const label = VIEW_LABELS[view] || 'Structured view';

    const markDirty = () => {
        if (flowId) {
            setSaveStatus('dirty');
        }
    };

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
            <section className="canvas-structured-view" aria-label={label}>
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
        <section className="canvas-structured-view" aria-label={label}>
            <header className="canvas-structured-header">
                <div>
                    <span>
                        {view === 'table' ? 'View workspace as table' : 'Workspace view'}
                    </span>
                    <strong>{label}</strong>
                </div>
                <p>
                    {projection.nodes.length} nodes, {projection.edges.length} links
                    {activeGraphFilters.length ? `, ${activeGraphFilters.length} filters` : ''}
                </p>
                <ActiveFilterChips filters={activeGraphFilters} />
                {view === 'table' ? (
                    <button
                        type="button"
                        className="canvas-structured-header-action"
                        onClick={onCreateStructuredTable}
                    >
                        Create structured table
                    </button>
                ) : null}
            </header>

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
                    <div className="canvas-structured-table-wrap">
                        <table className="canvas-structured-table">
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                    <th>Summary</th>
                                    <th>Table</th>
                                    <th>Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projection.nodes.map((row) => (
                                    <tr key={row.id}>
                                        <td>
                                            <button type="button" onClick={() => onOpenNode?.(row.id)}>
                                                {row.title}
                                            </button>
                                        </td>
                                        <td>{rowTypeLabel(row)}</td>
                                        <td>{row.status || '-'}</td>
                                        <td>{summaryText(row) || '-'}</td>
                                        <td>{tableShapeLabel(row)}</td>
                                        <td>{sourceLabel(row)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <EmptyFilteredView label={label} />
                )
            ) : null}
        </section>
    );
};

export default CanvasStructuredView;
