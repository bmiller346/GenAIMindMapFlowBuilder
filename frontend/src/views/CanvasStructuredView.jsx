import { useMemo } from 'react';
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
    const label = VIEW_LABELS[view] || 'Structured view';

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
                        {view === 'table' ? 'View graph as table' : 'Workspace projection'}
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
                                                <td>{row.status || '-'}</td>
                                                <td>{row.owner_id || '-'}</td>
                                                <td>{row.due_date || '-'}</td>
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
                                    <button
                                        key={row.id}
                                        type="button"
                                        onClick={() => onOpenNode?.(row.id)}
                                    >
                                        <strong>{row.title}</strong>
                                        <span>{rowTypeLabel(row)} · candidate</span>
                                    </button>
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
