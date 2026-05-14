/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { getChecklistPreviewRows } from './graphProjection';
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

const ChecklistPreview = ({ nodes, projection, setNodes, setActiveView }) => {
    const previewRows = useMemo(
        () => getChecklistPreviewRows(projection),
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

    const acceptChecklistPreview = () => {
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
                    flow: 'branch_to_checklist',
                    accepted_at: acceptedAt,
                    node_id: node.id,
                    order: row?.checklist_order || 0,
                    review_required: Boolean(row?.review_required)
                });

                return {
                    ...node,
                    data: {
                        ...data,
                        checklist_projection: {
                            accepted: true,
                            accepted_at: acceptedAt,
                            order: row?.checklist_order || 0,
                            label: row?.checklist_label || node.data?.title || node.id,
                            review_required: Boolean(row?.review_required)
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
            title: 'Accepted checklist preview',
            detail: `Accepted ${activeIds.size} checklist candidate${
                activeIds.size === 1 ? '' : 's'
            }.`,
            context: 'Helper: Project Planner'
        });
        setActiveView('table');
    };

    return (
        <div className="local-checklist-preview">
            <div className="local-task-preview-header">
                <div>
                    <strong>Branch-to-checklist preview</strong>
                    <span>{previewRows.length} candidate checklist items</span>
                </div>
                <button type="button" onClick={acceptChecklistPreview}>
                    Accept selected
                </button>
            </div>
            <div className="local-table-wrap">
                <table className="local-projection-table">
                    <thead>
                        <tr>
                            <th>Use</th>
                            <th>Item</th>
                            <th>Note</th>
                            <th>Review</th>
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
                                <td>{row.checklist_label}</td>
                                <td>{row.checklist_note}</td>
                                <td>
                                    {row.review_required
                                        ? 'Needs review'
                                        : 'Ready'}
                                </td>
                                <td>{sourceLabel(row)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {previewRows.length === 0 ? (
                <p className="local-table-empty">
                    No checklist candidates in this branch.
                </p>
            ) : null}
        </div>
    );
};

export default ChecklistPreview;
