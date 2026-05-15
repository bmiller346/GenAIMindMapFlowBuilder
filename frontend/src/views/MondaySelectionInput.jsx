/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import {
    buildMondaySelectionInput,
    buildMondaySelectionManifest
} from './mondaySelectionProjection';
import {
    makePreviewDiffSummary,
    PreviewDiffSummary
} from './previewDiffSummary';
import useActivityStore from '../stores/activityStore';
import flowStore from '../stores/flowStore';

const sourceLabel = (row) => {
    const ref = row.source_refs?.[0] || {};
    const parts = [ref.document_id, ref.page ? `p. ${ref.page}` : '', ref.section]
        .filter(Boolean)
        .join(' | ');

    return parts || 'No source';
};

const flowLabel = (flow) =>
    flow
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());

const generatedItems = (preview) =>
    Array.isArray(preview?.preview_items) ? preview.preview_items : [];

const generatedMutation = (item) =>
    item?.proposed_mutation?.integration_operator_preview || {};

const MondaySelectionInput = ({
    nodes,
    projection,
    selectedBranchId,
    setNodes,
    setActiveView,
    generatedPreview,
    onRejectGeneratedPreview
}) => {
    const addActivity = useActivityStore((s) => s.addActivity);
    const flowId = flowStore((s) => s.flow_id);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const selectionRows = useMemo(
        () => {
            const baseRows = buildMondaySelectionInput(nodes, projection);
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
                    handoff_readiness: mutation,
                    included: row.included || mutation.readiness === 'staged_not_pushed',
                    selection_reason: [
                        ...row.selection_reason,
                        mutation.explanation || item.rationale
                    ].filter(Boolean)
                };
            });
            const generatedRows = items
                .filter((item) => !baseIds.has(item.node_id))
                .map((item) => {
                    const node = nodeById.get(item.node_id) || {};
                    const mutation = generatedMutation(item);
                    const title =
                        node.data?.title ||
                        node.data?.question ||
                        node.data?.content ||
                        item.title;

                    return {
                        id: item.node_id,
                        title,
                        status: node.data?.status || 'needs_review',
                        priority: node.data?.priority || '',
                        owner_id: node.data?.owner_id || '',
                        due_date: node.data?.due_date || '',
                        confidence: item.confidence,
                        node_type: node.data?.node_type || node.type || 'task',
                        source_refs: item.source_refs || [],
                        local_preview_acceptances: [],
                        accepted_flows: ['generated_integration_operator_handoff'],
                        group_key: item.node_id,
                        group_title: title,
                        template_hints: {
                            board_template: 'autodesk_building_block_review',
                            item_kind: 'task',
                            group_strategy: 'generated_handoff_review',
                            requires_review: true,
                            source_status: item.source_refs?.length
                                ? 'source_attached'
                                : 'source_missing',
                            selection_reasons: [mutation.explanation || item.rationale]
                        },
                        selection_reason: [mutation.explanation || item.rationale],
                        generated_preview_item: item,
                        handoff_readiness: mutation,
                        included: mutation.readiness === 'staged_not_pushed',
                        monday_item_input: {
                            name: title,
                            node_id: item.node_id,
                            status: node.data?.status || 'needs_review',
                            review_state: node.data?.status || 'needs_review',
                            priority: node.data?.priority || '',
                            owner: node.data?.owner_id || '',
                            due_date: node.data?.due_date || '',
                            confidence: item.confidence,
                            node_type: node.data?.node_type || node.type || 'task',
                            template_hints: {}
                        }
                    };
                });

            return [...mergedRows, ...generatedRows];
        },
        [nodes, projection, generatedPreview]
    );
    const defaultIds = useMemo(
        () => new Set(selectionRows.filter((row) => row.included).map((row) => row.id)),
        [selectionRows]
    );
    const [selectedIds, setSelectedIds] = useState(new Set());
    const activeIds = selectedIds.size > 0 ? selectedIds : defaultIds;
    const diffSummary = useMemo(
        () =>
            makePreviewDiffSummary({
                rows: selectionRows,
                activeIds,
                artifactLabel: 'handoff package item',
                updatedFields: ['handoff staging'],
                mode: generatedPreview ? 'generated' : 'local'
            }),
        [activeIds, generatedPreview, selectionRows]
    );

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

    const stageMondaySelection = () => {
        if (activeIds.size === 0) {
            return;
        }

        const selectedAt = new Date().toISOString();
        const rowsById = new Map(selectionRows.map((row) => [row.id, row]));
        const manifest = buildMondaySelectionManifest({
            projection,
            rows: selectionRows,
            selectedIds: activeIds,
            selectedAt,
            selectedBranchId
        });
        const manifestOwnerId = manifest.root_node_id || manifest.selected_node_ids[0];

        setNodes(
            nodes.map((node) => {
                const row = rowsById.get(node.id);
                const isSelected = row && activeIds.has(node.id);
                const isManifestOwner = node.id === manifestOwnerId;
                if (!isSelected && !isManifestOwner) {
                    return node;
                }

                return {
                    ...node,
                    data: {
                        ...node.data,
                        ...(isSelected
                            ? {
                        monday_selection_input: {
                                      selected: true,
                                      selected_at: selectedAt,
                                      selection_id: manifest.selection_id,
                                      source: 'accepted_local_preview_metadata',
                                      accepted_flows: row.accepted_flows,
                                      selection_reason: row.selection_reason,
                                      group_key: row.group_key,
                                      group_title: row.group_title,
                                      template_hints: row.template_hints,
                                      item: row.monday_item_input
                                  }
                              }
                            : {}),
                        ...(row?.generated_preview_item
                            ? {
                                  integration_operator_preview: {
                                      ...row.handoff_readiness,
                                      preview_id: generatedPreview?.preview_id || '',
                                      preview_item_id: row.generated_preview_item.id || '',
                                      accepted_at: selectedAt
                                  }
                              }
                            : {}),
                        ...(isManifestOwner
                            ? {
                                  monday_selection_manifest: manifest
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
            title: 'Accepted integration handoff preview',
            detail: `Staged ${activeIds.size} monday handoff candidate${
                activeIds.size === 1 ? '' : 's'
            }.`,
            context: generatedPreview
                ? 'Source: generated Integration Operator preview'
                : 'Source: accepted TraceSpace workspace'
        });
        setActiveView('table');
    };

    const rejectGeneratedPreview = () => {
        onRejectGeneratedPreview?.();
        addActivity({
            status: 'canceled',
            title: 'Rejected integration handoff preview',
            detail: `Rejected ${generatedItems(generatedPreview).length} generated handoff item${
                generatedItems(generatedPreview).length === 1 ? '' : 's'
            }.`
        });
    };

    const selectedCount = selectionRows.filter((row) => activeIds.has(row.id)).length;

    return (
        <div className="local-monday-selection-preview">
            <div className="local-task-preview-header">
                <div>
                    <strong>Create implementation handoff package</strong>
                    <span>
                        {generatedPreview ? 'AI-generated handoff package' : 'Accepted TraceSpace workspace'} |{' '}
                        {selectedCount} selected from {selectionRows.length} candidates
                    </span>
                </div>
                <span className="output-state-pill">
                    {generatedPreview ? 'AI-generated' : 'Accepted workspace'} {'->'} Applied/exported next
                </span>
                <button type="button" onClick={stageMondaySelection}>
                    Stage selected
                </button>
                {generatedPreview ? (
                    <button type="button" onClick={rejectGeneratedPreview}>
                        Reject generated
                    </button>
                ) : null}
            </div>
            <PreviewDiffSummary title="Before staging" changes={diffSummary} />
            <div className="local-table-wrap">
                <table className="local-projection-table">
                    <thead>
                        <tr>
                            <th>Use</th>
                            <th>Item</th>
                            <th>Type</th>
                            <th>Group</th>
                            <th>Accepted flows</th>
                            <th>Source</th>
                            <th>Readiness</th>
                            <th>Reason</th>
                        </tr>
                    </thead>
                    <tbody>
                        {selectionRows.map((row) => (
                            <tr key={row.id}>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={activeIds.has(row.id)}
                                        onChange={() => toggleRow(row.id)}
                                        aria-label={`Stage ${row.title} for monday input`}
                                    />
                                </td>
                                <td>{row.title}</td>
                                <td>{row.node_type}</td>
                                <td>{row.group_title}</td>
                                <td>
                                    {row.accepted_flows.length > 0
                                        ? row.accepted_flows.map(flowLabel).join(', ')
                                        : '-'}
                                </td>
                                <td>{sourceLabel(row)}</td>
                                <td>{row.handoff_readiness?.readiness || '-'}</td>
                                <td>{row.selection_reason.join(', ') || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {selectionRows.length === 0 ? (
                <p className="local-table-empty">
                    Accept a local task preview before staging monday input.
                </p>
            ) : null}
        </div>
    );
};

export default MondaySelectionInput;
