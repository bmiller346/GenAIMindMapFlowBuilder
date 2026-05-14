import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import { updateWorkspaceNode } from '../utils/manualNodes';

const getColumns = (rows) =>
    Array.from(
        rows.reduce((columns, row) => {
            Object.keys(row || {}).forEach((key) => columns.add(key));
            return columns;
        }, new Set())
    );

const normalizeRows = (rows) => (Array.isArray(rows) && rows.length > 0 ? rows : [{}]);

const ManualTableEditor = ({ nodeId, rows }) => {
    const nodes = useStore((state) => state.nodes);
    const setNodes = useStore((state) => state.setNodes);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const tableRows = normalizeRows(rows);
    const columns = getColumns(tableRows);

    const updateRows = (nextRows) => {
        setNodes(
            nodes.map((node) => {
                if (node.id !== nodeId) {
                    return node;
                }

                return updateWorkspaceNode(node, {
                    data: {
                        ...node.data,
                        df: nextRows,
                        data: {
                            ...node.data?.data,
                            df: nextRows
                        }
                    }
                });
            })
        );
        setSaveStatus('dirty');
    };

    const updateCell = (rowIndex, column, value) => {
        updateRows(
            tableRows.map((row, index) =>
                index === rowIndex ? { ...row, [column]: value } : row
            )
        );
    };

    const addRow = () => {
        const emptyRow = columns.reduce(
            (row, column) => ({
                ...row,
                [column]: ''
            }),
            {}
        );
        updateRows([...tableRows, emptyRow]);
        recordActivity({
            type: 'manual_table_updated',
            title: 'Manual table row added',
            summary: 'Added a row to a manual table.',
            node_ids: [nodeId]
        });
    };

    const removeRow = (rowIndex) => {
        updateRows(tableRows.filter((_, index) => index !== rowIndex));
        recordActivity({
            type: 'manual_table_updated',
            title: 'Manual table row removed',
            summary: `Removed row ${rowIndex + 1} from a manual table.`,
            node_ids: [nodeId]
        });
    };

    const addColumn = () => {
        const columnName = window.prompt('Column name');
        if (!columnName?.trim() || columns.includes(columnName.trim())) {
            return;
        }

        updateRows(
            tableRows.map((row) => ({
                ...row,
                [columnName.trim()]: ''
            }))
        );
        recordActivity({
            type: 'manual_table_updated',
            title: 'Manual table column added',
            summary: `Added ${columnName.trim()} to a manual table.`,
            node_ids: [nodeId]
        });
    };

    const removeColumn = (column) => {
        updateRows(
            tableRows.map((row) => {
                const nextRow = { ...row };
                delete nextRow[column];
                return nextRow;
            })
        );
        recordActivity({
            type: 'manual_table_updated',
            title: 'Manual table column removed',
            summary: `Removed ${column} from a manual table.`,
            node_ids: [nodeId]
        });
    };

    return (
        <div className="manual-table-editor">
            <div className="manual-table-actions">
                <button type="button" onClick={addRow}>
                    Add row
                </button>
                <button type="button" onClick={addColumn}>
                    Add column
                </button>
            </div>
            <div className="manual-table-scroll">
                <table>
                    <thead>
                        <tr>
                            {columns.map((column) => (
                                <th key={column}>
                                    <span>{column}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeColumn(column)}
                                        aria-label={`Remove ${column}`}
                                    >
                                        x
                                    </button>
                                </th>
                            ))}
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {tableRows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {columns.map((column) => (
                                    <td key={column}>
                                        <input
                                            value={row[column] || ''}
                                            onChange={(event) =>
                                                updateCell(rowIndex, column, event.target.value)
                                            }
                                        />
                                    </td>
                                ))}
                                <td>
                                    <button
                                        type="button"
                                        onClick={() => removeRow(rowIndex)}
                                        aria-label={`Remove row ${rowIndex + 1}`}
                                    >
                                        x
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ManualTableEditor;
