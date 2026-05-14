/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import useActivityStore from '../stores/activityStore';
import useStore from '../stores/store';
import { buildSourceLibraryProjection } from '../views/graphProjection';

const STATUS_LABELS = {
    uploaded: 'Uploaded',
    parsed: 'Parsed',
    chunked: 'Chunked',
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
        return 'Select a source to inspect coverage and repair options.';
    }
    if (source.coverage_count === 0) {
        return 'No graph nodes cite this source yet. Review uncited nodes or attach source refs in node metadata.';
    }
    if (projection.incomplete_refs.length > 0) {
        return 'Some citations are missing page, section, quote, or confidence. Use the Source repair preview to apply suggested refs.';
    }
    if (projection.uncited_nodes.length > 0) {
        return 'There are uncited graph nodes. Filter the list below and attach source refs where evidence exists.';
    }

    return 'Coverage looks healthy for the current graph.';
};

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
        setActiveView: state.setActiveView
    });
    const { nodes, edges, workspaceBrief, sourceLibrary, setActiveView } = useStore(
        useShallow(selector)
    );
    const activities = useActivityStore((state) => state.activities);
    const [selectedSourceId, setSelectedSourceId] = useState('');

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

    if (!isOpen) {
        return null;
    }

    const citedPercent = projection.total_graph_nodes
        ? Math.round((projection.cited_node_count / projection.total_graph_nodes) * 100)
        : 0;

    return (
        <aside className="sources-panel">
            <div className="sources-panel-header">
                <div>
                    <p>Sources / Media</p>
                    <span>
                        {projection.sources.length} sources | {citedPercent}% cited
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
            </div>

            <div className="sources-panel-body">
                <div className="sources-list">
                    {projection.sources.length === 0 ? (
                        <p className="sources-empty">No sources found in this workspace.</p>
                    ) : null}
                    {projection.sources.map((source) => (
                        <button
                            key={source.id}
                            type="button"
                            className={
                                source.id === selectedSource?.id
                                    ? 'sources-list-item active'
                                    : 'sources-list-item'
                            }
                            onClick={() => setSelectedSourceId(source.id)}
                        >
                            <span>{source.type_label}</span>
                            <strong>{source.title}</strong>
                            <small>
                                {sourceStatusLabel(source.status)} | {source.coverage_count} nodes
                            </small>
                        </button>
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
                                            {selectedSource.chunk_count} chunks,{' '}
                                            {selectedSource.segment_count} segments
                                        </dd>
                                    </div>
                                ) : null}
                            </dl>

                            <section className="sources-repair-note">
                                <p>{sourceRepairText(projection, selectedSource)}</p>
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

            <FailureList failures={failedSourceActivities} />
        </aside>
    );
};

export default SourcesPanel;
