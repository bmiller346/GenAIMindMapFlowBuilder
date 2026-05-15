/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react';
import { getSourceRepairPreviewRows } from './graphProjection';
import { withLocalPreviewAcceptance } from './localPreviewMetadata';
import {
    makePreviewDiffSummary,
    PreviewDiffSummary
} from './previewDiffSummary';
import useActivityStore from '../stores/activityStore';
import flowStore from '../stores/flowStore';
import {
    createWorkspaceEdge,
    createWorkspaceNode,
    getChildPosition,
    getRootPosition
} from '../utils/manualNodes';

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
    chunk_id: currentRef?.chunk_id || suggestedRef?.chunk_id || '',
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

const SOURCE_RECONCILIATION_MODES = [
    {
        id: 'update_matches',
        label: 'Update matching nodes',
        detail: 'Apply selected source refs to existing graph nodes.'
    },
    {
        id: 'supplement_graph',
        label: 'Supplement graph',
        detail: 'Create review nodes from uncited source sections.'
    },
    {
        id: 'keep_both_for_comparison',
        label: 'Keep both as comparison',
        detail: 'Create a comparison branch for uncited source sections.'
    },
    {
        id: 'replace_branch',
        label: 'Replace selected branch',
        detail: 'Replace children of the selected branch with uncited source sections.'
    }
];

const sourceOnlyChunksFromPreview = (generatedPreview) =>
    Array.isArray(generatedPreview?.metadata?.source_only_chunks)
        ? generatedPreview.metadata.source_only_chunks.filter(Boolean)
        : [];

const sourceOnlyChunkKey = (chunk, index) =>
    chunk.chunk_id || `${chunk.source_id || 'source'}-${chunk.section || 'section'}-${index}`;

const titleFromSourceChunk = (chunk, index) =>
    chunk.section || `Source section ${index + 1}`;

const bodyFromSourceChunk = (chunk) =>
    chunk.snippet || 'This source section needs review before it becomes accepted graph structure.';

const refFromSourceChunk = (generatedPreview, chunk) => ({
    document_id: chunk.source_id || generatedPreview?.metadata?.source_id || '',
    chunk_id: chunk.chunk_id || '',
    page: chunk.page || '',
    section: chunk.section || '',
    quote_snippet: chunk.snippet || '',
    confidence: 'medium'
});

const SourceRepairPreview = ({
    nodes,
    projection,
    generatedPreview,
    onRejectGeneratedPreview,
    edges,
    selectedBranchId,
    setNodes,
    setEdges,
    setActiveView,
    onAskAi
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
    const [selectedSourceOnlyIds, setSelectedSourceOnlyIds] = useState(new Set());
    const [applyMode, setApplyMode] = useState('update_matches');
    const [modeMessage, setModeMessage] = useState('');
    const activeIds = selectedIds.size > 0 ? selectedIds : defaultIds;
    const sourceOnlyChunks = useMemo(
        () => sourceOnlyChunksFromPreview(generatedPreview),
        [generatedPreview]
    );
    const sourceOnlyChunkIds = useMemo(
        () => sourceOnlyChunks.map((chunk, index) => sourceOnlyChunkKey(chunk, index)),
        [sourceOnlyChunks]
    );
    const selectedSourceOnlyChunks = useMemo(
        () =>
            sourceOnlyChunks.filter((chunk, index) =>
                selectedSourceOnlyIds.has(sourceOnlyChunkKey(chunk, index))
            ),
        [selectedSourceOnlyIds, sourceOnlyChunks]
    );
    const diffSummary = useMemo(
        () =>
            makePreviewDiffSummary({
                rows: previewRows,
                activeIds,
                idKey: 'repair_id',
                artifactLabel: 'source repair',
                updatedFields: ['source refs', 'review state'],
                mode: generatedPreview ? 'generated' : 'local'
            }),
        [activeIds, generatedPreview, previewRows]
    );
    const addActivity = useActivityStore((s) => s.addActivity);
    const flowId = flowStore((s) => s.flow_id);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const isSourceOnlyMode = applyMode !== 'update_matches';
    const sourceOnlyModeBlocked = isSourceOnlyMode && selectedSourceOnlyChunks.length === 0;
    const sourceOnlyModeMessage =
        modeMessage ||
        (sourceOnlyModeBlocked
            ? 'Select at least one source-only section before applying this mode.'
            : '');

    useEffect(() => {
        setSelectedSourceOnlyIds(new Set(sourceOnlyChunkIds));
    }, [sourceOnlyChunkIds]);

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

    const toggleSourceOnlyChunk = (chunkId) => {
        setSelectedSourceOnlyIds((current) => {
            const next = new Set(current);
            if (next.has(chunkId)) {
                next.delete(chunkId);
            } else {
                next.add(chunkId);
            }
            return next;
        });
        setModeMessage('');
    };

    const appendSourceOnlyNodes = ({ mode, acceptedAt }) => {
        if (!sourceOnlyChunks.length) {
            setModeMessage('No uncited source sections are available for this mode.');
            return false;
        }
        if (!selectedSourceOnlyChunks.length) {
            setModeMessage('Select at least one source-only section before applying this mode.');
            return false;
        }

        const sourceTitle = generatedPreview?.metadata?.source_title || 'Uploaded source';
        const baseNodes = [...nodes];
        const baseEdges = [...(edges || [])];
        const createdNodes = [];
        const createdEdges = [];

        if (mode === 'replace_branch') {
            if (!selectedBranchId) {
                setModeMessage('Select a branch before replacing from source.');
                return false;
            }
            const childIds = new Set();
            const collect = (parentId) => {
                baseEdges
                    .filter((edge) => edge.source === parentId)
                    .forEach((edge) => {
                        if (!childIds.has(edge.target)) {
                            childIds.add(edge.target);
                            collect(edge.target);
                        }
                    });
            };
            collect(selectedBranchId);
            if (
                childIds.size > 0 &&
                !window.confirm(
                    `Replace ${childIds.size} child node${childIds.size === 1 ? '' : 's'} under this branch with source-only sections?`
                )
            ) {
                return false;
            }
            const keptNodes = baseNodes.filter((node) => !childIds.has(node.id));
            const keptEdges = baseEdges.filter(
                (edge) => !childIds.has(edge.source) && !childIds.has(edge.target)
            );
            selectedSourceOnlyChunks.forEach((chunk, index) => {
                const node = createWorkspaceNode({
                    title: titleFromSourceChunk(chunk, index),
                    nodeType: 'needs_review',
                    body: bodyFromSourceChunk(chunk),
                    sourceRefs: [refFromSourceChunk(generatedPreview, chunk)],
                    position: getChildPosition([...keptNodes, ...createdNodes], keptEdges, selectedBranchId),
                    status: 'needs_review'
                });
                node.data.reconciliation = {
                    accepted_at: acceptedAt,
                    mode,
                    source_id: generatedPreview?.metadata?.source_id || '',
                    source_only_chunk_id: chunk.chunk_id || ''
                };
                createdNodes.push(node);
                createdEdges.push(createWorkspaceEdge(selectedBranchId, node.id));
            });
            setNodes([...keptNodes, ...createdNodes]);
            setEdges([...keptEdges, ...createdEdges]);
            return true;
        }

        let parentId = '';
        if (mode === 'keep_both_for_comparison') {
            const parent = createWorkspaceNode({
                title: `Source comparison: ${sourceTitle}`,
                nodeType: 'needs_review',
                body: 'Source-only content staged for comparison against the accepted graph.',
                position: getRootPosition(baseNodes),
                status: 'needs_review'
            });
            parent.data.reconciliation = {
                accepted_at: acceptedAt,
                mode,
                source_id: generatedPreview?.metadata?.source_id || ''
            };
            createdNodes.push(parent);
            parentId = parent.id;
        }

        selectedSourceOnlyChunks.forEach((chunk, index) => {
            const node = createWorkspaceNode({
                title: titleFromSourceChunk(chunk, index),
                nodeType: 'needs_review',
                body: bodyFromSourceChunk(chunk),
                sourceRefs: [refFromSourceChunk(generatedPreview, chunk)],
                position: parentId
                    ? getChildPosition([...baseNodes, ...createdNodes], baseEdges, parentId)
                    : {
                          x: getRootPosition([...baseNodes, ...createdNodes]).x,
                          y: getRootPosition([...baseNodes, ...createdNodes]).y + index * 118
                      },
                status: 'needs_review'
            });
            node.data.reconciliation = {
                accepted_at: acceptedAt,
                mode,
                source_id: generatedPreview?.metadata?.source_id || '',
                source_only_chunk_id: chunk.chunk_id || ''
            };
            createdNodes.push(node);
            if (parentId) {
                createdEdges.push(createWorkspaceEdge(parentId, node.id));
            }
        });
        setNodes([...baseNodes, ...createdNodes]);
        if (createdEdges.length) {
            setEdges([...baseEdges, ...createdEdges]);
        }
        return true;
    };

    const acceptRepairs = () => {
        if (applyMode === 'update_matches' && activeIds.size === 0) {
            return;
        }

        const acceptedAt = new Date().toISOString();
        if (applyMode !== 'update_matches') {
            const applied = appendSourceOnlyNodes({ mode: applyMode, acceptedAt });
            if (!applied) {
                return;
            }
            if (flowId) {
                setSaveStatus('dirty');
            }
            addActivity({
                status: 'completed',
                title: 'Applied source reconciliation',
                detail: `Applied ${selectedSourceOnlyChunks.length} source-only section${
                    selectedSourceOnlyChunks.length === 1 ? '' : 's'
                } with ${SOURCE_RECONCILIATION_MODES.find((mode) => mode.id === applyMode)?.label}.`,
                context: 'Helper: Source Librarian'
            });
            onRejectGeneratedPreview?.();
            setActiveView('mindmap');
            return;
        }

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
                    <span>
                    {generatedPreview ? 'AI-generated source artifact' : 'Accepted source coverage'} |{' '}
                        {previewRows.length} nodes need source repair
                    </span>
                </div>
                <span className="output-state-pill">
                    {generatedPreview ? 'AI-generated' : 'Accepted workspace'}
                </span>
                <button type="button" onClick={acceptRepairs} disabled={sourceOnlyModeBlocked}>
                    {applyMode === 'update_matches' ? 'Accept selected' : 'Apply mode'}
                </button>
                {generatedPreview ? (
                    <button type="button" onClick={rejectGeneratedPreview}>
                        Reject generated
                    </button>
                ) : null}
            </div>
            <PreviewDiffSummary changes={diffSummary} />
            {generatedPreview?.warnings?.length ? (
                <div className="local-preview-warning">
                    {generatedPreview.warnings.map((warning) => (
                        <span key={warning}>{warning}</span>
                    ))}
                </div>
            ) : null}
            {generatedPreview?.metadata?.recommended_modes?.length ? (
                <div className="source-reconcile-modes">
                    <div>
                        <strong>Apply mode</strong>
                        <span>
                            {selectedSourceOnlyChunks.length} of {sourceOnlyChunks.length} source-only section
                            {sourceOnlyChunks.length === 1 ? '' : 's'} selected for supplement or comparison.
                        </span>
                    </div>
                    <div className="source-reconcile-mode-grid">
                        {SOURCE_RECONCILIATION_MODES.map((mode) => (
                            <button
                                key={mode.id}
                                type="button"
                                className={applyMode === mode.id ? 'active' : ''}
                                disabled={
                                    mode.id !== 'update_matches' &&
                                    sourceOnlyChunks.length === 0
                                }
                                onClick={() => {
                                    setApplyMode(mode.id);
                                    setModeMessage('');
                                }}
                            >
                                <strong>{mode.label}</strong>
                                <span>{mode.detail}</span>
                            </button>
                        ))}
                    </div>
                    {sourceOnlyModeMessage ? <small>{sourceOnlyModeMessage}</small> : null}
                </div>
            ) : null}
            {sourceOnlyChunks.length ? (
                <section className="source-only-sections" aria-label="Source-only sections">
                    <div>
                        <strong>Source-only sections</strong>
                        <span>
                            These document sections did not match accepted graph nodes. Keep them as reviewable
                            additions, comparison material, or replacement candidates.
                        </span>
                    </div>
                    <div className="source-only-section-actions">
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedSourceOnlyIds(new Set(sourceOnlyChunkIds));
                                setModeMessage('');
                            }}
                        >
                            Select all
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedSourceOnlyIds(new Set());
                                setModeMessage('');
                            }}
                        >
                            Clear
                        </button>
                    </div>
                    <div className="source-only-section-list">
                        {sourceOnlyChunks.map((chunk, index) => {
                            const chunkId = sourceOnlyChunkKey(chunk, index);
                            const title = titleFromSourceChunk(chunk, index);
                            return (
                                <article key={chunkId}>
                                    <label className="source-only-section-row">
                                        <input
                                            type="checkbox"
                                            checked={selectedSourceOnlyIds.has(chunkId)}
                                            onChange={() => toggleSourceOnlyChunk(chunkId)}
                                            aria-label={`Include source-only section ${title}`}
                                        />
                                        <span>
                                            <span>{chunk.page ? `p. ${chunk.page}` : `Section ${index + 1}`}</span>
                                            <strong>{title}</strong>
                                            <p>{bodyFromSourceChunk(chunk)}</p>
                                        </span>
                                    </label>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ) : generatedPreview ? (
                <section className="source-only-sections compact" aria-label="Source-only sections">
                    <div>
                        <strong>No source-only sections</strong>
                        <span>Every uncited source section matched an existing graph node or was already cited.</span>
                    </div>
                </section>
            ) : null}
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
                <div className="local-table-empty local-empty-actions">
                    <strong>No source-reference repairs are needed for this branch.</strong>
                    <span>
                        Project now found no local citation repairs. Ask AI to review source
                        coverage when you want a deeper evidence-support pass.
                    </span>
                    <button type="button" onClick={onAskAi} disabled={!flowId}>
                        Ask AI to review source coverage
                    </button>
                    <button type="button" onClick={() => setActiveView('gaps')}>
                        Review missing fields
                    </button>
                </div>
            ) : null}
        </div>
    );
};

export default SourceRepairPreview;
