/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { getMissingInfoPreviewRows } from './graphProjection';
import { withLocalPreviewAcceptance } from './localPreviewMetadata';
import {
    makePreviewDiffSummary,
    PreviewDiffSummary
} from './previewDiffSummary';
import useActivityStore from '../stores/activityStore';
import flowStore from '../stores/flowStore';

const sourceLabel = (node) => {
    const ref = node.source_ref || {};
    const parts = [ref.document_id, ref.page ? `p. ${ref.page}` : '', ref.section]
        .filter(Boolean)
        .join(' | ');

    return parts || 'No source';
};

const missingInfoRowsFromGeneratedPreview = (generatedPreview) => {
    const items = Array.isArray(generatedPreview?.preview_items)
        ? generatedPreview.preview_items
        : [];

    return items.map((item) => {
        const mutation = item.proposed_mutation || {};
        const review =
            mutation.missing_info_review || mutation.contradiction_review || {};
        return {
            id: item.node_id,
            title: item.title,
            severity: review.severity || item.confidence || 'low',
            reasons: review.reasons || [item.rationale].filter(Boolean),
            source_ref: item.source_refs?.[0] || {},
            generated_preview_item: item,
            included: true
        };
    });
};

const MissingInfoPreview = ({
    nodes,
    projection,
    generatedPreview,
    onRejectGeneratedPreview,
    setNodes,
    setActiveView,
    onAskAi
}) => {
    const previewRows = useMemo(
        () => {
            const generatedRows = missingInfoRowsFromGeneratedPreview(generatedPreview);
            return generatedRows.length > 0
                ? generatedRows
                : getMissingInfoPreviewRows(projection);
        },
        [projection, generatedPreview]
    );
    const defaultIds = useMemo(
        () => new Set(previewRows.filter((row) => row.included).map((row) => row.id)),
        [previewRows]
    );
    const [selectedIds, setSelectedIds] = useState(new Set());
    const activeIds = selectedIds.size > 0 ? selectedIds : defaultIds;
    const diffSummary = useMemo(
        () =>
            makePreviewDiffSummary({
                rows: previewRows,
                activeIds,
                artifactLabel: 'review finding',
                updatedFields: ['missing-info review'],
                mode: generatedPreview ? 'generated' : 'local'
            }),
        [activeIds, generatedPreview, previewRows]
    );
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
                    flow: row?.generated_preview_item
                        ? 'generated_reviewer_gap'
                        : 'missing_information_review',
                    accepted_at: acceptedAt,
                    node_id: node.id,
                    helper_id: row?.generated_preview_item ? 'reviewer' : undefined,
                    preview_id: generatedPreview?.preview_id,
                    preview_item_id: row?.generated_preview_item?.id,
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
        onRejectGeneratedPreview?.();
        setActiveView('table');
    };

    const rejectGeneratedPreview = () => {
        onRejectGeneratedPreview?.();
        addActivity({
            status: 'completed',
            title: 'Rejected reviewer gap preview',
            detail: `Rejected ${previewRows.length} generated reviewer item${
                previewRows.length === 1 ? '' : 's'
            }.`,
            context: 'Helper: Reviewer'
        });
    };

    return (
        <div className="local-missing-info-preview">
            <div className="local-task-preview-header">
                <div>
                    <strong>Missing-information review</strong>
                    <span>
                        {generatedPreview ? 'AI-generated review output' : 'Local review projection'} |{' '}
                        {previewRows.length} nodes need reviewer input
                    </span>
                </div>
                <span className="output-state-pill">
                    {generatedPreview ? 'AI-generated' : 'Locally projected'}
                </span>
                <button type="button" onClick={acceptMissingInfoReview}>
                    Accept selected
                </button>
                {generatedPreview ? (
                    <button type="button" onClick={rejectGeneratedPreview}>
                        Reject generated
                    </button>
                ) : null}
            </div>
            <PreviewDiffSummary changes={diffSummary} />
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
                <div className="local-table-empty local-empty-actions">
                    <strong>No missing-information issues found in this branch.</strong>
                    <span>
                        Project now did not find obvious gaps. Ask AI for a reviewer pass
                        when you want deeper source, contradiction, or completeness checks.
                    </span>
                    <button type="button" onClick={onAskAi} disabled={!flowId}>
                        Ask AI to find gaps
                    </button>
                    <button type="button" onClick={() => setActiveView('sources')}>
                        Review source repair
                    </button>
                </div>
            ) : null}
        </div>
    );
};

export default MissingInfoPreview;
