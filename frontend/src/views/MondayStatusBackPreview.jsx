/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { buildMondayStatusBackRows } from './mondayStatusProjection';
import useActivityStore from '../stores/activityStore';
import flowStore from '../stores/flowStore';

const statusLabel = (readiness) => {
    if (readiness === 'ready') {
        return 'Ready';
    }
    if (readiness === 'staged_not_pushed') {
        return 'Staged only';
    }

    return 'Not ready';
};

const generatedItems = (preview) =>
    Array.isArray(preview?.preview_items) ? preview.preview_items : [];

const generatedMutation = (item) =>
    item?.proposed_mutation?.integration_operator_preview || {};

const MondayStatusBackPreview = ({
    nodes,
    projection,
    setNodes,
    setActiveView,
    generatedPreview,
    onRejectGeneratedPreview
}) => {
    const addActivity = useActivityStore((s) => s.addActivity);
    const flowId = flowStore((s) => s.flow_id);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const statusRows = useMemo(
        () => {
            const baseRows = buildMondayStatusBackRows(nodes, projection);
            const baseIds = new Set(baseRows.map((row) => row.id));
            const nodeById = new Map(nodes.map((node) => [node.id, node]));
            const items = generatedItems(generatedPreview);
            const itemByNodeId = new Map(items.map((item) => [item.node_id, item]));
            const mergedRows = baseRows.map((row) => {
                const item = itemByNodeId.get(row.id);
                const mutation = generatedMutation(item);
                if (!item) {
                    return row;
                }

                return {
                    ...row,
                    generated_preview_item: item,
                    sync_issue_review: mutation,
                    issues: mutation.issues?.length ? mutation.issues : row.issues
                };
            });
            const generatedRows = items
                .filter((item) => !baseIds.has(item.node_id))
                .map((item) => {
                    const node = nodeById.get(item.node_id) || {};
                    const mutation = generatedMutation(item);

                    return {
                        id: item.node_id,
                        title:
                            node.data?.title ||
                            node.data?.question ||
                            node.data?.content ||
                            item.title,
                        node_type: node.data?.node_type || node.type || 'task',
                        current_status: node.data?.status || 'needs_review',
                        monday_ref: node.data?.external_refs?.monday || {},
                        staged_selection: node.data?.monday_selection_input || null,
                        readiness: mutation.readiness || 'not_ready',
                        issues: mutation.issues || [],
                        included: mutation.readiness === 'ready',
                        generated_preview_item: item,
                        sync_issue_review: mutation,
                        status_back_input: {
                            node_id: item.node_id,
                            current_status: node.data?.status || 'needs_review',
                            can_pull_status: mutation.readiness === 'ready',
                            readiness: mutation.readiness || 'not_ready',
                            issues: mutation.issues || []
                        }
                    };
                });

            return [...mergedRows, ...generatedRows];
        },
        [nodes, projection, generatedPreview]
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
                        },
                        ...(row?.generated_preview_item
                            ? {
                                  integration_operator_preview: {
                                      ...row.sync_issue_review,
                                      preview_id: generatedPreview?.preview_id || '',
                                      preview_item_id: row.generated_preview_item.id || '',
                                      accepted_at: stagedAt
                                  }
                              }
                            : {})
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
            title: 'Accepted integration sync preview',
            detail: `Staged ${activeIds.size} monday status candidate${
                activeIds.size === 1 ? '' : 's'
            }.`,
            context: generatedPreview
                ? 'Source: generated Integration Operator preview'
                : 'Source: local status projection'
        });
        setActiveView('table');
    };

    const rejectGeneratedPreview = () => {
        onRejectGeneratedPreview?.();
        addActivity({
            status: 'canceled',
            title: 'Rejected integration sync preview',
            detail: `Rejected ${generatedItems(generatedPreview).length} generated sync item${
                generatedItems(generatedPreview).length === 1 ? '' : 's'
            }.`
        });
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
                {generatedPreview ? (
                    <button type="button" onClick={rejectGeneratedPreview}>
                        Reject generated
                    </button>
                ) : null}
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
