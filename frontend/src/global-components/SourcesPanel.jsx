/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import axios from 'axios';
import { useShallow } from 'zustand/shallow';
import useActivityStore from '../stores/activityStore';
import flowStore from '../stores/flowStore';
import modalStore from '../stores/modalStore';
import useStore from '../stores/store';
import PromptModal from '../modals/PromptModal';
import { sourceFirstActionPresets } from '../prompts/promptsModel';
import { buildSourceLibraryProjection } from '../views/graphProjection';
import { combineReconciliationPreviews } from '../utils/reconciliationPreviewCombine';
import { buildBoundedSelectedSourcesForAI } from '../utils/sourceSetUpload';

const STATUS_LABELS = {
    uploaded: 'Uploaded',
    parsed: 'Parsed',
    chunked: 'Sections ready',
    'used in graph': 'Used in graph',
    failed: 'Failed',
    'brief only': 'Brief only'
};

const formatBytes = (size) => {
    if (!size) {
        return '';
    }

    if (size < 1024) {
        return `${size} B`;
    }
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const sourceStatusLabel = (status) => STATUS_LABELS[status] || status || 'Unknown';

const sourceRepairText = (projection, source) => {
    if (!source) {
        return 'Select a source to inspect source sections and AI actions.';
    }
    if (projection.total_graph_nodes === 0) {
        return 'No map exists yet. Start from source sections by creating a mind map, table, tasks, summary, or entity review.';
    }
    if (source.coverage_count === 0) {
        return 'No graph nodes cite this source yet. Compare, supplement, or reconcile it with the current workspace.';
    }
    if (projection.incomplete_refs.length > 0) {
        return 'Some citations are missing page, section, quote, or confidence. Use the Source repair preview to apply suggested refs.';
    }
    if (projection.uncited_nodes.length > 0) {
        return 'There are uncited graph nodes. Filter the list below and attach source refs where evidence exists.';
    }

    return 'Coverage looks healthy for the current graph.';
};

const firstClassification = (projection, sourceId) =>
    projection.source_set_review?.document_classification?.find(
        (classification) => classification.source_id === sourceId
    );

const sourceActionPresetsForGraphState = (hasGraphNodes) =>
    sourceFirstActionPresets.filter((preset) =>
        hasGraphNodes
            ? preset.availability === 'graph' || preset.availability === 'always'
            : preset.availability === 'source_only' || preset.availability === 'always'
    );

const FailureList = ({ failures }) => {
    if (failures.length === 0) {
        return null;
    }

    return (
        <div className="sources-failure-list">
            <p>Failed intake</p>
            {failures.map((failure) => (
                <article key={failure.id}>
                    <strong>{failure.title}</strong>
                    <span>{failure.detail || failure.context}</span>
                </article>
            ))}
        </div>
    );
};

const SourcesPanel = ({ isOpen, onClose, onSelectNode }) => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        workspaceBrief: state.workspaceBrief,
        sourceLibrary: state.sourceLibrary,
        setActiveView: state.setActiveView,
        setGeneratedHelperPreview: state.setGeneratedHelperPreview
    });
    const { nodes, edges, workspaceBrief, sourceLibrary, setActiveView, setGeneratedHelperPreview } = useStore(
        useShallow(selector)
    );
    const flowId = flowStore((state) => state.flow_id);
    const pushNode = modalStore((state) => state.pushNode);
    const activities = useActivityStore((state) => state.activities);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const [selectedSourceId, setSelectedSourceId] = useState('');
    const [checkedSourceIds, setCheckedSourceIds] = useState([]);
    const [reconcileStatus, setReconcileStatus] = useState('');

    const projection = useMemo(
        () =>
            buildSourceLibraryProjection(
                nodes,
                edges,
                workspaceBrief,
                sourceLibrary
            ),
        [nodes, edges, workspaceBrief, sourceLibrary]
    );
    const failedSourceActivities = useMemo(
        () =>
            activities.filter(
                (activity) =>
                    activity.status === 'failed' &&
                    /source|pdf|docx|markdown|text|upload/i.test(
                        `${activity.title || ''} ${activity.detail || ''} ${activity.context || ''}`
                    )
            ),
        [activities]
    );

    const selectedSource =
        projection.sources.find((source) => source.id === selectedSourceId) ||
        projection.sources[0];
    const checkedSources = projection.sources.filter((source) =>
        checkedSourceIds.includes(source.id)
    );
    const aiSources = checkedSources.length > 0 ? checkedSources : selectedSource ? [selectedSource] : [];

    const openAskAIForSources = (sources, preset = {}) => {
        if (sources.length === 0) {
            return;
        }
        const boundedSources = buildBoundedSelectedSourcesForAI(sources);
        const sourceChunkCount = boundedSources.reduce(
            (total, source) => total + (Array.isArray(source.chunks) ? source.chunks.length : 0),
            0
        );
        pushNode(PromptModal, {
            scope: 'source',
            sourceId: boundedSources[0].id,
            source: boundedSources[0],
            sources: boundedSources,
            initialRoleId: preset.roleId || 'source-ref-repair',
            initialActionId: preset.actionId || 'find_missing_source_support',
            initialPrompt: preset.prompt || '',
            initialVisual: preset.visual || 'auto',
            initialChangeIntent: preset.changeIntent || ''
        });
        recordActivity({
            type: sources.length > 1 ? 'ai_multi_source_draft_requested' : 'ai_source_draft_requested',
            title:
                preset.label ||
                (sources.length > 1 ? 'Multi-source Ask AI opened' : 'Source Ask AI opened'),
            summary:
                sources.length > 1
                    ? `Opened Ask AI for ${sources.length} selected sources.`
                    : `Opened Ask AI for ${sources[0].title}.`,
            source_ids: boundedSources.map((source) => source.id),
            metadata: {
                scope: sources.length > 1 ? 'bounded_sources' : 'source',
                source_ids: boundedSources.map((source) => source.id),
                intent: preset.id || '',
                action: preset.actionId || '',
                change_intent: preset.changeIntent || '',
                requested_visual: preset.visual || '',
                bounded_source_count: boundedSources.length,
                bounded_source_chunk_count: sourceChunkCount
            }
        });
    };

    const openSourceReconciliation = async (sources) => {
        if (sources.length === 0) {
            return;
        }
        if (!flowId) {
            setReconcileStatus('Save or open a workspace before reconciling sources.');
            return;
        }
        setReconcileStatus('Reconciling source against workspace...');
        try {
            const previews = await Promise.all(
                sources.map((source) =>
                    axios.post(
                        `http://localhost:8000/api/workspaces/${flowId}/sources/${encodeURIComponent(source.id)}/reconcile/preview`,
                        { scope: { type: 'source', source_id: source.id } }
                    )
                )
            );
            const preview =
                previews.length === 1
                    ? previews[0].data
                    : combineReconciliationPreviews(
                          previews.map((response) => response.data),
                          sources
                      );
            if (!preview) {
                setReconcileStatus('No reconciliation work found for the selected sources.');
                return;
            }
            setGeneratedHelperPreview('sourceLibrarianSources', preview);
            setActiveView('sources');
            setReconcileStatus('');
            onClose();
            recordActivity({
                type: sources.length > 1 ? 'ai_multi_source_reconcile_previewed' : 'ai_source_reconcile_previewed',
                title: sources.length > 1 ? 'Multi-source reconciliation previewed' : 'Source reconciliation previewed',
                summary:
                    sources.length > 1
                        ? `Prepared reconciliation for ${sources.length} selected sources.`
                        : `Prepared reconciliation for ${sources[0].title}.`,
                source_ids: sources.map((source) => source.id),
                metadata: {
                    scope: sources.length > 1 ? 'bounded_sources' : 'source',
                    source_ids: sources.map((source) => source.id),
                    intent: 'reconcile_source_with_workspace',
                    preview_items: preview.preview_items?.length || 0
                }
            });
        } catch (error) {
            const detail =
                error.response?.data?.detail?.message ||
                error.response?.data?.detail ||
                error.message ||
                'Unable to reconcile source.';
            setReconcileStatus(String(detail));
            recordActivity({
                status: 'failed',
                type: 'ai_source_reconcile_failed',
                title: 'Source reconciliation failed',
                summary: String(detail),
                source_ids: sources.map((source) => source.id),
                metadata: {
                    intent: 'reconcile_source_with_workspace'
                }
            });
        }
    };

    if (!isOpen) {
        return null;
    }

    const citedPercent = projection.total_graph_nodes
        ? Math.round((projection.cited_node_count / projection.total_graph_nodes) * 100)
        : 0;
    const sourceSetReview = projection.source_set_review || {};
    const selectedClassification = firstClassification(projection, selectedSource?.id);
    const hasGraphNodes = projection.total_graph_nodes > 0;
    const sourceActionPresets = sourceActionPresetsForGraphState(hasGraphNodes);

    return (
        <aside className="sources-panel">
            <div className="sources-panel-header">
                <div>
                    <p>Source set / Media</p>
                    <span>
                        {projection.sources.length} loaded sources | {citedPercent}% cited
                    </span>
                </div>
                <button type="button" onClick={onClose}>
                    Close
                </button>
            </div>

            <div className="sources-panel-summary">
                <span>{projection.cited_node_count} cited nodes</span>
                <span>{projection.uncited_nodes.length} uncited</span>
                <span>{projection.incomplete_refs.length} citation gaps</span>
                <span>{sourceSetReview.review_flags?.length || 0} set flags</span>
            </div>

            <div className="sources-panel-body">
                <div className="sources-list">
                    {projection.sources.length === 0 ? (
                        <p className="sources-empty">No sources found in this workspace.</p>
                    ) : null}
                    {projection.sources.map((source) => (
                        <article
                            key={source.id}
                            className={
                                source.id === selectedSource?.id
                                    ? 'sources-list-item active'
                                    : 'sources-list-item'
                            }
                        >
                            <label className="sources-list-check">
                                <input
                                    type="checkbox"
                                    checked={checkedSourceIds.includes(source.id)}
                                    onChange={(event) => {
                                        setCheckedSourceIds((current) =>
                                            event.target.checked
                                                ? Array.from(new Set([...current, source.id]))
                                                : current.filter((id) => id !== source.id)
                                        );
                                    }}
                                />
                                Select source
                            </label>
                            <button type="button" onClick={() => setSelectedSourceId(source.id)}>
                                <span>{source.type_label}</span>
                                <strong>{source.title}</strong>
                                <small>
                                    {sourceStatusLabel(source.status)} | {source.coverage_count} nodes
                                </small>
                            </button>
                        </article>
                    ))}
                </div>

                <div className="sources-detail">
                    {selectedSource ? (
                        <>
                            <div className="sources-detail-title">
                                <div>
                                    <span>{selectedSource.type_label}</span>
                                    <h2>{selectedSource.title}</h2>
                                </div>
                                <strong>{sourceStatusLabel(selectedSource.status)}</strong>
                            </div>

                            <dl className="sources-metadata">
                                <div>
                                    <dt>Stable ID</dt>
                                    <dd>{selectedSource.id}</dd>
                                </div>
                                <div>
                                    <dt>Coverage</dt>
                                    <dd>{selectedSource.coverage_count} graph nodes</dd>
                                </div>
                                {selectedSource.size ? (
                                    <div>
                                        <dt>Size</dt>
                                        <dd>{formatBytes(selectedSource.size)}</dd>
                                    </div>
                                ) : null}
                                {selectedSource.chunk_count || selectedSource.segment_count ? (
                                    <div>
                                        <dt>Extraction</dt>
                                        <dd>
                                            {selectedSource.chunk_count} sections,{' '}
                                            {selectedSource.segment_count} segments
                                        </dd>
                                    </div>
                                ) : null}
                                {selectedClassification ? (
                                    <div>
                                        <dt>Classification</dt>
                                        <dd>{selectedClassification.label}</dd>
                                    </div>
                                ) : null}
                                {selectedSource.path ? (
                                    <div>
                                        <dt>Path</dt>
                                        <dd>{selectedSource.path}</dd>
                                    </div>
                                ) : null}
                            </dl>

                            <section className="sources-repair-note">
                                <p>{sourceRepairText(projection, selectedSource)}</p>
                                {reconcileStatus ? <span>{reconcileStatus}</span> : null}
                                <button
                                    type="button"
                                    onClick={() => openAskAIForSources(aiSources)}
                                >
                                    {aiSources.length > 1
                                        ? `Ask AI about ${aiSources.length} sources`
                                        : 'Ask AI about source'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveView('sources');
                                        onClose();
                                    }}
                                >
                                    Open repair preview
                                </button>
                            </section>

                            <section className="sources-detail-section">
                                <div className="sources-section-heading">
                                    <p>{hasGraphNodes ? 'Source + workspace actions' : 'Source-first actions'}</p>
                                    <span>
                                        {hasGraphNodes
                                            ? 'Compare, supplement, or repair the current map'
                                            : 'Create from loaded sources before graphing'}
                                    </span>
                                </div>
                                <div className="sources-citing-list">
                                    {sourceActionPresets.map((preset) => (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            onClick={() =>
                                                preset.reconciliation
                                                    ? openSourceReconciliation(aiSources)
                                                    : openAskAIForSources(aiSources, preset)
                                            }
                                        >
                                            <strong>{preset.label}</strong>
                                            <span>{preset.description}</span>
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <section className="sources-detail-section">
                                <div className="sources-section-heading">
                                    <p>Nodes citing this source</p>
                                    <span>{selectedSource.citing_nodes.length}</span>
                                </div>
                                {selectedSource.citing_nodes.length === 0 ? (
                                    <p className="sources-empty">No cited nodes yet.</p>
                                ) : (
                                    <div className="sources-citing-list">
                                        {selectedSource.citing_nodes.map((node) => (
                                            <button
                                                key={`${selectedSource.id}-${node.id}-${node.source_location}`}
                                                type="button"
                                                onClick={() => onSelectNode?.(node.id)}
                                            >
                                                <strong>{node.title}</strong>
                                                <span>{node.source_location || 'Document level'}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="sources-detail-section">
                                <div className="sources-section-heading">
                                    <p>Extracted snippets</p>
                                    <span>{selectedSource.snippets.length}</span>
                                </div>
                                {selectedSource.snippets.length === 0 ? (
                                    <p className="sources-empty">
                                        No quote snippets are attached to this source yet.
                                    </p>
                                ) : (
                                    <div className="sources-snippet-list">
                                        {selectedSource.snippets.slice(0, 6).map((snippet) => (
                                            <blockquote
                                                key={`${snippet.node_id}-${snippet.text.slice(0, 24)}`}
                                            >
                                                <p>{snippet.text}</p>
                                                <cite>
                                                    {[snippet.node_title, snippet.location]
                                                        .filter(Boolean)
                                                        .join(' | ')}
                                                </cite>
                                            </blockquote>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </>
                    ) : null}
                </div>
            </div>

            <div className="sources-gap-list">
                <div>
                    <p>Coverage gaps</p>
                    <span>
                        {projection.uncited_nodes.length} uncited nodes,{' '}
                        {projection.incomplete_refs.length} incomplete refs
                    </span>
                </div>
                {projection.uncited_nodes.slice(0, 5).map((node) => (
                    <button
                        key={node.id}
                        type="button"
                        onClick={() => onSelectNode?.(node.id)}
                    >
                        {node.title}
                    </button>
                ))}
            </div>

            <div className="sources-set-review">
                <div className="sources-section-heading">
                    <p>Source-set review</p>
                    <span>
                        {sourceSetReview.source_set?.native_folder_upload
                            ? 'Folder source'
                            : 'Loaded files only'}
                    </span>
                </div>
                <div className="sources-set-review-grid">
                    <span>{sourceSetReview.file_inventory?.length || 0} inventory rows</span>
                    <span>{sourceSetReview.topic_coverage?.length || 0} covered topics</span>
                    <span>{sourceSetReview.stale_sources?.length || 0} stale signals</span>
                    <span>{sourceSetReview.duplicate_sources?.length || 0} duplicate groups</span>
                    <span>
                        {sourceSetReview.missing_expected_artifacts?.length || 0} missing expected
                    </span>
                </div>
                {sourceSetReview.missing_expected_artifacts?.length ? (
                    <div className="sources-set-review-list">
                        {sourceSetReview.missing_expected_artifacts.slice(0, 4).map((artifact) => (
                            <span key={artifact.id}>{artifact.artifact}</span>
                        ))}
                    </div>
                ) : null}
            </div>

            <FailureList failures={failedSourceActivities} />
        </aside>
    );
};

export default SourcesPanel;
