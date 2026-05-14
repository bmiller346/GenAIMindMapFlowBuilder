/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { getMissingInfoPreviewRows } from './graphProjection';
import { withLocalPreviewAcceptance } from './localPreviewMetadata';
import useActivityStore from '../stores/activityStore';
import flowStore from '../stores/flowStore';

const sourceLabel = (node) => {
    const ref = node.source_ref || {};
    const parts = [ref.document_id, ref.page ? `p. ${ref.page}` : '', ref.section]
        .filter(Boolean)
        .join(' | ');

    return parts || 'No source';
};

const MissingInfoPreview = ({ nodes, projection, setNodes, setActiveView }) => {
    const previewRows = useMemo(
        () => getMissingInfoPreviewRows(projection),
        [projection]
    );
    const defaultIds = useMemo(
        () => new Set(previewRows.filter((row) => row.included).map((row) => row.id)),
        [previewRows]
    );
    const [selectedIds, setSelectedIds] = useState(new Set());
    const activeIds = selectedIds.size > 0 ? selectedIds : defaultIds;
    const addActivity = useActivityStore((s) => s.addActivity);
    const flowId = flowStore((s) => s.flow_id);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);

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

    const acceptMissingInfoReview = () => {
        if (activeIds.size === 0) {
            return;
        }

        const acceptedAt = new Date().toISOString();
        const rowsById = new Map(previewRows.map((row) => [row.id, row]));

        setNodes(
            nodes.map((node) => {
                if (!activeIds.has(node.id)) {
                    return node;
                }

                const row = rowsById.get(node.id);
                const data = withLocalPreviewAcceptance(node.data, {
                    flow: 'missing_information_review',
                    accepted_at: acceptedAt,
                    node_id: node.id,
                    severity: row?.severity || 'low',
                    reasons: row?.reasons || []
                });

                return {
                    ...node,
                    data: {
                        ...data,
                        missing_info_review: {
                            accepted: true,
                            accepted_at: acceptedAt,
                            severity: row?.severity || 'low',
                            reasons: row?.reasons || []
                        }
                    }
                };
            })
        );
        setSelectedIds(new Set());
        if (flowId) {
            setSaveStatus('dirty');
        }
        addActivity({
            status: 'completed',
            title: 'Accepted gap review',
            detail: `Accepted ${activeIds.size} missing-information finding${
                activeIds.size === 1 ? '' : 's'
            }.`,
            context: 'Helper: Reviewer'
        });
        setActiveView('table');
    };

    return (
        <div className="local-missing-info-preview">
            <div className="local-task-preview-header">
                <div>
                    <strong>Missing-information review</strong>
                    <span>{previewRows.length} nodes need reviewer input</span>
                </div>
                <button type="button" onClick={acceptMissingInfoReview}>
                    Accept selected
                </button>
            </div>
            <div className="local-table-wrap">
                <table className="local-projection-table">
                    <thead>
                        <tr>
                            <th>Use</th>
                            <th>Node</th>
                            <th>Severity</th>
                            <th>Missing information</th>
                            <th>Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        {previewRows.map((row) => (
                            <tr key={row.id}>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={activeIds.has(row.id)}
                                        onChange={() => toggleRow(row.id)}
                                        aria-label={`Include ${row.title}`}
                                    />
                                </td>
                                <td>{row.title}</td>
                                <td>{row.severity}</td>
                                <td>{row.reasons.join(', ')}</td>
                                <td>{sourceLabel(row)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {previewRows.length === 0 ? (
                <p className="local-table-empty">
                    No missing-information issues found in this branch.
                </p>
            ) : null}
        </div>
    );
};

export default MissingInfoPreview;
