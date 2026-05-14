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

const mergeGeneratedChecklistPreviewRows = (rows, generatedPreview) => {
    const items = Array.isArray(generatedPreview?.preview_items)
        ? generatedPreview.preview_items
        : [];
    if (items.length === 0) {
        return rows;
    }

    const itemByNodeId = new Map(items.map((item) => [item.node_id, item]));
    return rows.map((row) => {
        const item = itemByNodeId.get(row.id);
        const mutation = item?.proposed_mutation || {};
        const checklistProjection = mutation.checklist_projection || {};
        if (!item) {
            return row;
        }

        return {
            ...row,
            generated_preview_item: item,
            checklist_order: checklistProjection.order || row.checklist_order,
            checklist_label: checklistProjection.label || row.checklist_label,
            checklist_note: checklistProjection.note || row.checklist_note,
            review_required:
                checklistProjection.review_required ?? row.review_required,
            priority: checklistProjection.priority ?? row.priority,
            owner_id: checklistProjection.owner_id ?? row.owner_id,
            due_date: checklistProjection.due_date ?? row.due_date,
            included: true
        };
    });
};

const ChecklistPreview = ({
    nodes,
    projection,
    setNodes,
    setActiveView,
    generatedPreview,
    onRejectGeneratedPreview
}) => {
    const previewRows = useMemo(
        () => mergeGeneratedChecklistPreviewRows(
            getChecklistPreviewRows(projection),
            generatedPreview
        ),
        [projection, generatedPreview]
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
                const mutation = row?.generated_preview_item?.proposed_mutation || {};
                const checklistProjection = mutation.checklist_projection || {};
                const data = withLocalPreviewAcceptance(node.data, {
                    flow: row?.generated_preview_item
                        ? 'generated_project_planner_checklist'
                        : 'branch_to_checklist',
                    accepted_at: acceptedAt,
                    node_id: node.id,
                    helper_id: row?.generated_preview_item ? 'project_planner' : undefined,
                    preview_id: generatedPreview?.preview_id,
                    preview_item_id: row?.generated_preview_item?.id,
                    order: row?.checklist_order || 0,
                    review_required: Boolean(row?.review_required)
                });

                return {
                    ...node,
                    data: {
                        ...data,
                        status: mutation.status || data.status,
                        checklist_projection: {
                            accepted: true,
                            accepted_at: acceptedAt,
                            order:
                                checklistProjection.order ||
                                row?.checklist_order ||
                                0,
                            label:
                                checklistProjection.label ||
                                row?.checklist_label ||
                                node.data?.title ||
                                node.id,
                            note:
                                checklistProjection.note ||
                                row?.checklist_note ||
                                '',
                            review_required: Boolean(
                                checklistProjection.review_required ??
                                    row?.review_required
                            ),
                            priority:
                                checklistProjection.priority ??
                                row?.priority ??
                                '',
                            owner_id:
                                checklistProjection.owner_id ??
                                row?.owner_id ??
                                '',
                            due_date:
                                checklistProjection.due_date ??
                                row?.due_date ??
                                '',
                            generated_preview_id: generatedPreview?.preview_id || '',
                            generated_preview_item_id: row?.generated_preview_item?.id || ''
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
                {generatedPreview ? (
                    <button type="button" onClick={onRejectGeneratedPreview}>
                        Reject generated
                    </button>
                ) : null}
            </div>
            <div className="local-table-wrap">
                <table className="local-projection-table">
                    <thead>
                        <tr>
                            <th>Use</th>
                            <th>Item</th>
                            <th>Note</th>
                            <th>Review</th>
                            <th>Priority</th>
                            <th>Owner</th>
                            <th>Due</th>
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
                                <td>{row.priority || '-'}</td>
                                <td>{row.owner_id || '-'}</td>
                                <td>{row.due_date || '-'}</td>
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
