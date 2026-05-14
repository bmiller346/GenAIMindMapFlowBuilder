/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import {
    buildMondaySelectionInput,
    buildMondaySelectionManifest
} from './mondaySelectionProjection';

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

const MondaySelectionInput = ({
    nodes,
    projection,
    selectedBranchId,
    setNodes,
    setActiveView
}) => {
    const selectionRows = useMemo(
        () => buildMondaySelectionInput(nodes, projection),
        [nodes, projection]
    );
    const defaultIds = useMemo(
        () => new Set(selectionRows.filter((row) => row.included).map((row) => row.id)),
        [selectionRows]
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
        setActiveView('table');
    };

    const selectedCount = selectionRows.filter((row) => activeIds.has(row.id)).length;

    return (
        <div className="local-monday-selection-preview">
            <div className="local-task-preview-header">
                <div>
                    <strong>monday selection input</strong>
                    <span>
                        {selectedCount} selected from {selectionRows.length} accepted
                        preview candidates
                    </span>
                </div>
                <button type="button" onClick={stageMondaySelection}>
                    Stage selected
                </button>
            </div>
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
