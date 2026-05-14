/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { buildMondayStatusBackRows } from './mondayStatusProjection';

const statusLabel = (readiness) => {
    if (readiness === 'ready') {
        return 'Ready';
    }
    if (readiness === 'staged_not_pushed') {
        return 'Staged only';
    }

    return 'Not ready';
};

const MondayStatusBackPreview = ({ nodes, projection, setNodes, setActiveView }) => {
    const statusRows = useMemo(
        () => buildMondayStatusBackRows(nodes, projection),
        [nodes, projection]
    );
    const defaultIds = useMemo(
        () => new Set(statusRows.filter((row) => row.included).map((row) => row.id)),
        [statusRows]
    );
    const [selectedIds, setSelectedIds] = useState(new Set());
    const activeIds = selectedIds.size > 0 ? selectedIds : defaultIds;

    const toggleRow = (nodeId) => {
        setSelectedIds(() => {
            const next = new Set(activeIds);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    };

    const stageStatusBack = () => {
        if (activeIds.size === 0) {
            return;
        }

        const stagedAt = new Date().toISOString();
        const rowsById = new Map(statusRows.map((row) => [row.id, row]));

        setNodes(
            nodes.map((node) => {
                const row = rowsById.get(node.id);
                if (!row || !activeIds.has(node.id)) {
                    return node;
                }

                return {
                    ...node,
                    data: {
                        ...node.data,
                        monday_status_back_input: {
                            staged: true,
                            staged_at: stagedAt,
                            source: 'monday_external_ref_readiness',
                            ...row.status_back_input
                        }
                    }
                };
            })
        );
        setSelectedIds(new Set());
        setActiveView('table');
    };

    const selectedCount = statusRows.filter((row) => activeIds.has(row.id)).length;

    return (
        <div className="local-monday-status-preview">
            <div className="local-task-preview-header">
                <div>
                    <strong>monday status input</strong>
                    <span>
                        {selectedCount} ready from {statusRows.length} monday-linked
                        candidates
                    </span>
                </div>
                <button type="button" onClick={stageStatusBack}>
                    Stage selected
                </button>
            </div>
            <div className="local-table-wrap">
                <table className="local-projection-table">
                    <thead>
                        <tr>
                            <th>Use</th>
                            <th>Node</th>
                            <th>Current status</th>
                            <th>monday item</th>
                            <th>Readiness</th>
                            <th>Gaps</th>
                        </tr>
                    </thead>
                    <tbody>
                        {statusRows.map((row) => (
                            <tr key={row.id}>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={activeIds.has(row.id)}
                                        disabled={!row.included}
                                        onChange={() => toggleRow(row.id)}
                                        aria-label={`Stage ${row.title} for monday status input`}
                                    />
                                </td>
                                <td>{row.title}</td>
                                <td>{row.current_status}</td>
                                <td>{row.monday_ref.item_id || '-'}</td>
                                <td>{statusLabel(row.readiness)}</td>
                                <td>{row.issues.join(', ') || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {statusRows.length === 0 ? (
                <p className="local-table-empty">
                    No monday-linked nodes are available for status-back staging.
                </p>
            ) : null}
        </div>
    );
};

export default MondayStatusBackPreview;
