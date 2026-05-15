import { useMemo } from 'react';
import { buildFilteredGraphProjection, getTaskRows } from './graphProjection.js';

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

const taskRowsForProjection = (projection) => {
    const typedRows = getTaskRows(projection);
    if (typedRows.length > 0) {
        return typedRows;
    }

    return projection.nodes.filter((node) => node.node_type !== 'reference');
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
    onOpenNode
}) => {
    const projection = useMemo(
        () =>
            buildFilteredGraphProjection(nodes, edges, {
                branchId: selectedBranchId,
                filters: activeGraphFilters
            }),
        [activeGraphFilters, edges, nodes, selectedBranchId]
    );
    const taskRows = useMemo(() => taskRowsForProjection(projection), [projection]);
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
                    <span>Workspace projection</span>
                    <strong>{label}</strong>
                </div>
                <p>
                    {projection.nodes.length} nodes, {projection.edges.length} links
                    {activeGraphFilters.length ? `, ${activeGraphFilters.length} filters` : ''}
                </p>
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
