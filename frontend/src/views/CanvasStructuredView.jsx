import { useMemo } from 'react';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import {
    buildFilteredGraphProjection,
    getTaskCandidateRows,
    getTaskRows
} from './graphProjection.js';

const VIEW_LABELS = {
    outline: 'Outline',
    tasks: 'Tasks',
    table: 'Table'
};

const TASK_STATUS_OPTIONS = [
    'ai_generated',
    'needs_review',
    'reviewed',
    'approved',
    'rejected',
    'deprecated'
];

const TASK_PRIORITY_OPTIONS = ['', 'low', 'medium', 'high', 'critical'];

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

const EmptyStructuredView = ({ label }) => (
    <div className="canvas-structured-empty">
        <strong>No accepted graph nodes yet</strong>
        <span>{label} will populate after you accept or create nodes in the workspace.</span>
    </div>
);

const CanvasStructuredView = ({
    view,
    nodes = [],
    edges = [],
    activeGraphFilters = [],
    selectedBranchId,
    onOpenNode,
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

    if (nodes.length === 0) {
        return (
            <section className="canvas-structured-view" aria-label={label}>
                <EmptyStructuredView label={label} />
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

            {view === 'table' ? (
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
            ) : null}
        </section>
    );
};

export default CanvasStructuredView;
