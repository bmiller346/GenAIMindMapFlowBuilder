const TableHierarchyActions = ({
    row,
    rowIndex,
    rows,
    selectedBranchId,
    onSelectBranch,
    onFocusInMap,
    onToggleCollapse,
    onCondenseChildren,
    onExpandCondensedChildren,
    onPromote,
    onDemote,
    onReorder,
    canReorder
}) => (
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
                onClick={() => onToggleCollapse(row.id)}
            >
                {row.collapsed ? 'Expand' : 'Collapse'}
            </button>
        ) : null}
        {row.child_count > 0 ? (
            <button
                type="button"
                onClick={() => onCondenseChildren(row)}
                title="Copy immediate children into detail rows and fold the branch"
            >
                Condense
            </button>
        ) : null}
        {row.child_count > 0 && row.table_rows?.some((detailRow) => detailRow?.source_node_id) ? (
            <button
                type="button"
                onClick={() => onExpandCondensedChildren(row)}
                title="Reveal child nodes that were copied into detail rows"
            >
                Reveal
            </button>
        ) : null}
        <button
            type="button"
            onClick={() => onPromote(row)}
            disabled={!row.parent_id}
        >
            Promote
        </button>
        <button
            type="button"
            onClick={() => onDemote(row, rowIndex, rows)}
            disabled={
                !rows
                    .slice(0, rowIndex)
                    .some((candidate) => candidate.depth === row.depth)
            }
        >
            Demote
        </button>
        <button
            type="button"
            onClick={() => onReorder(row, 'up')}
            disabled={!canReorder(row, 'up')}
        >
            Up
        </button>
        <button
            type="button"
            onClick={() => onReorder(row, 'down')}
            disabled={!canReorder(row, 'down')}
        >
            Down
        </button>
    </div>
);

export default TableHierarchyActions;
