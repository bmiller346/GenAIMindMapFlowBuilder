/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { getSourceRepairPreviewRows } from './graphProjection';
import { withLocalPreviewAcceptance } from './localPreviewMetadata';
import useActivityStore from '../stores/activityStore';
import flowStore from '../stores/flowStore';

const getNestedData = (data) => {
    if (data?.data && typeof data.data === 'object') {
        return data.data;
    }

    return {};
};

const getSourceRefs = (data) => {
    const nestedData = getNestedData(data);
    const refs = data?.source_refs ?? nestedData?.source_refs;

    return Array.isArray(refs) ? refs.filter(Boolean) : [];
};

const sourceLabel = (sourceRef) => {
    const parts = [
        sourceRef?.document_id,
        sourceRef?.page ? `p. ${sourceRef.page}` : '',
        sourceRef?.section
    ]
        .filter(Boolean)
        .join(' | ');

    return parts || 'No source candidate';
};

const mergeSourceRef = (currentRef, suggestedRef) => ({
    document_id: currentRef?.document_id || suggestedRef?.document_id || '',
    page: currentRef?.page || suggestedRef?.page || '',
    section: currentRef?.section || suggestedRef?.section || '',
    quote_snippet:
        currentRef?.quote_snippet || suggestedRef?.quote_snippet || '',
    confidence: currentRef?.confidence || suggestedRef?.confidence || ''
});

const sourceRepairRowsFromGeneratedPreview = (generatedPreview) => {
    const items = Array.isArray(generatedPreview?.preview_items)
        ? generatedPreview.preview_items
        : [];

    return items.map((item) => {
        const mutation = item.proposed_mutation || {};
        const repair = mutation.source_ref_repair || mutation.source_coverage || {};
        return {
            id: item.node_id,
            title: item.title,
            repair_id: item.id,
            issues: repair.issues || [item.rationale].filter(Boolean),
            repair_type: repair.repair_type || repair.coverage_status || item.preview_type,
            suggested_source_ref: item.source_refs?.[0],
            suggested_from_node_id: repair.suggested_from_node_id || '',
            suggested_from_title: repair.suggested_from_title || '',
            suggestion_relationship: repair.suggestion_relationship || '',
            repair_confidence: item.confidence,
            generated_preview_item: item,
            included: true
        };
    });
};

const SourceRepairPreview = ({
    nodes,
    projection,
    generatedPreview,
    onRejectGeneratedPreview,
    setNodes,
    setActiveView
}) => {
    const previewRows = useMemo(
        () => {
            const generatedRows = sourceRepairRowsFromGeneratedPreview(generatedPreview);
            return generatedRows.length > 0
                ? generatedRows
                : getSourceRepairPreviewRows(projection);
        },
        [projection, generatedPreview]
    );
    const defaultIds = useMemo(
        () => new Set(previewRows.map((row) => row.repair_id)),
        [previewRows]
    );
    const [selectedIds, setSelectedIds] = useState(new Set());
    const activeIds = selectedIds.size > 0 ? selectedIds : defaultIds;
    const addActivity = useActivityStore((s) => s.addActivity);
    const flowId = flowStore((s) => s.flow_id);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);

    const toggleRow = (repairId) => {
        setSelectedIds(() => {
            const next = new Set(activeIds);
            if (next.has(repairId)) {
                next.delete(repairId);
            } else {
                next.add(repairId);
            }
            return next;
        });
    };

    const acceptRepairs = () => {
        if (activeIds.size === 0) {
            return;
        }

        const acceptedAt = new Date().toISOString();
        const rowsById = new Map(previewRows.map((row) => [row.id, row]));

        setNodes(
            nodes.map((node) => {
                const row = rowsById.get(node.id);
                if (!row || !activeIds.has(row.repair_id)) {
                    return node;
                }

                const existingRefs = getSourceRefs(node.data || {});
                const repairedRef = row.suggested_source_ref
                    ? mergeSourceRef(existingRefs[0], row.suggested_source_ref)
                    : undefined;
                const sourceRefs = repairedRef
                    ? [repairedRef, ...existingRefs.slice(1)]
                    : existingRefs;
                const data = withLocalPreviewAcceptance(node.data, {
                    flow: row?.generated_preview_item
                        ? 'generated_source_librarian_preview'
                        : 'source_reference_repair',
                    accepted_at: acceptedAt,
                    node_id: node.id,
                    helper_id: row?.generated_preview_item ? 'source_librarian' : undefined,
                    preview_id: generatedPreview?.preview_id,
                    preview_item_id: row?.generated_preview_item?.id,
                    repair_type: row.repair_type,
                    issues: row.issues,
                    suggested_from_node_id: row.suggested_from_node_id,
                    applied_source_ref: repairedRef || null
                });

                return {
                    ...node,
                    data: {
                        ...data,
                        source_refs: sourceRefs,
                        source_ref_repair: {
                            accepted: true,
                            accepted_at: acceptedAt,
                            repair_type: row.repair_type,
                            issues: row.issues,
                            suggested_from_node_id: row.suggested_from_node_id,
                            suggested_from_title: row.suggested_from_title,
                            suggestion_relationship: row.suggestion_relationship,
                            applied_source_ref: repairedRef || null
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
            title: 'Accepted source repairs',
            detail: `Accepted ${activeIds.size} source repair${
                activeIds.size === 1 ? '' : 's'
            }.`,
            context: 'Helper: Source Librarian'
        });
        onRejectGeneratedPreview?.();
        setActiveView('table');
    };

    const rejectGeneratedPreview = () => {
        onRejectGeneratedPreview?.();
        addActivity({
            status: 'completed',
            title: 'Rejected source helper preview',
            detail: `Rejected ${previewRows.length} generated source preview item${
                previewRows.length === 1 ? '' : 's'
            }.`,
            context: 'Helper: Source Librarian'
        });
    };

    return (
        <div className="local-source-repair-preview">
            <div className="local-task-preview-header">
                <div>
                    <strong>Source-reference repair</strong>
                    <span>{previewRows.length} nodes need source repair</span>
                </div>
                <button type="button" onClick={acceptRepairs}>
                    Accept selected
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
                            <th>Issue</th>
                            <th>Suggestion</th>
                            <th>Source basis</th>
                        </tr>
                    </thead>
                    <tbody>
                        {previewRows.map((row) => (
                            <tr key={row.repair_id}>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={activeIds.has(row.repair_id)}
                                        onChange={() => toggleRow(row.repair_id)}
                                        aria-label={`Include ${row.title}`}
                                    />
                                </td>
                                <td>{row.title}</td>
                                <td>{row.issues.join(', ')}</td>
                                <td>{sourceLabel(row.suggested_source_ref)}</td>
                                <td>
                                    {row.suggested_from_title
                                        ? `${row.suggestion_relationship}: ${row.suggested_from_title}`
                                        : 'Needs reviewer source lookup'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {previewRows.length === 0 ? (
                <p className="local-table-empty">
                    No source-reference repairs are needed for this branch.
                </p>
            ) : null}
        </div>
    );
};

export default SourceRepairPreview;
