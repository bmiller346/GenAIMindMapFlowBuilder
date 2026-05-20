import { useEffect, useMemo, useState } from 'react';
import { buildSourceLibraryProjection } from '../views/graphProjection.js';
import ShellRightPanel from './ShellRightPanel.jsx';

const SOURCE_STATUS_OPTIONS = [
    'uploaded',
    'parsed',
    'chunked',
    'used in graph',
    'reviewed',
    'needs_review',
    'failed',
    'brief only'
];

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

const sourceStatusLabel = (status) =>
    ({
        uploaded: 'Uploaded',
        parsed: 'Parsed',
        chunked: 'Sections ready',
        'used in graph': 'Used in graph',
        failed: 'Failed',
        'brief only': 'Brief only'
    }[status] || status || 'Unknown');

const SourcePropertiesPanel = ({
    edges = [],
    nodes = [],
    onApplySource,
    onClose,
    onSelectNode,
    sourceId,
    sourceLibrary = [],
    workspaceBrief = {}
}) => {
    const projection = useMemo(
        () => buildSourceLibraryProjection(nodes, edges, workspaceBrief, sourceLibrary),
        [edges, nodes, sourceLibrary, workspaceBrief]
    );
    const source = projection.sources.find((item) => item.id === sourceId);
    const [draft, setDraft] = useState({
        title: '',
        status: '',
        classification: '',
        version: '',
        path: ''
    });
    const updateDraft = (field, value) => {
        setDraft((current) => ({
            ...current,
            [field]: value
        }));
    };

    useEffect(() => {
        setDraft({
            title: source?.title || '',
            status: source?.status || 'uploaded',
            classification: source?.classification || '',
            version: source?.version || '',
            path: source?.path || ''
        });
    }, [
        source?.classification,
        source?.id,
        source?.path,
        source?.status,
        source?.title,
        source?.version
    ]);

    const applySource = () => {
        onApplySource?.(sourceId, draft);
    };

    return (
        <ShellRightPanel title="Source properties">
            <section className="source-properties-panel" aria-label="Source properties">
                {source ? (
                    <>
                        <div className="source-properties-panel__header">
                            <span>{source.type_label || 'Source'}</span>
                            <h2>{source.title}</h2>
                            <p>{source.id}</p>
                        </div>

                        <div className="source-properties-panel__form">
                            <label>
                                <span>Title</span>
                                <input
                                    value={draft.title}
                                    onChange={(event) => updateDraft('title', event.target.value)}
                                    aria-label="Source title"
                                />
                            </label>
                            <label>
                                <span>Status</span>
                                <select
                                    value={draft.status}
                                    onChange={(event) => updateDraft('status', event.target.value)}
                                    aria-label="Source status"
                                >
                                    {SOURCE_STATUS_OPTIONS.map((status) => (
                                        <option key={status} value={status}>
                                            {sourceStatusLabel(status)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span>Classification</span>
                                <input
                                    value={draft.classification}
                                    onChange={(event) => updateDraft('classification', event.target.value)}
                                    aria-label="Source classification"
                                />
                            </label>
                            <label>
                                <span>Version</span>
                                <input
                                    value={draft.version}
                                    onChange={(event) => updateDraft('version', event.target.value)}
                                    aria-label="Source version"
                                />
                            </label>
                            <label className="source-properties-panel__wide-field">
                                <span>Path</span>
                                <input
                                    value={draft.path}
                                    onChange={(event) => updateDraft('path', event.target.value)}
                                    aria-label="Source path"
                                />
                            </label>
                        </div>

                        <dl className="source-properties-panel__stats">
                            <div>
                                <dt>Status</dt>
                                <dd>{sourceStatusLabel(source.status)}</dd>
                            </div>
                            <div>
                                <dt>Coverage</dt>
                                <dd>{source.coverage_count || 0} nodes</dd>
                            </div>
                            <div>
                                <dt>Extraction</dt>
                                <dd>
                                    {source.chunk_count || 0} sections, {source.segment_count || 0} segments
                                </dd>
                            </div>
                            {source.size ? (
                                <div>
                                    <dt>Size</dt>
                                    <dd>{formatBytes(source.size)}</dd>
                                </div>
                            ) : null}
                            {source.path ? (
                                <div>
                                    <dt>Path</dt>
                                    <dd>{source.path}</dd>
                                </div>
                            ) : null}
                        </dl>

                        <section className="source-properties-panel__section">
                            <div className="source-properties-panel__section-heading">
                                <p>Citing nodes</p>
                                <span>{source.citing_nodes.length}</span>
                            </div>
                            {source.citing_nodes.length ? (
                                <div className="source-properties-panel__list">
                                    {source.citing_nodes.slice(0, 5).map((node) => (
                                        <button
                                            key={`${source.id}-${node.id}-${node.source_location || 'source'}`}
                                            type="button"
                                            onClick={() => onSelectNode?.(node.id)}
                                        >
                                            <strong>{node.title}</strong>
                                            <span>{node.source_location || 'Document level'}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="source-properties-panel__empty">No cited nodes yet.</p>
                            )}
                        </section>

                        <section className="source-properties-panel__section">
                            <div className="source-properties-panel__section-heading">
                                <p>Snippets</p>
                                <span>{source.snippets.length}</span>
                            </div>
                            {source.snippets.length ? (
                                <div className="source-properties-panel__snippets">
                                    {source.snippets.slice(0, 3).map((snippet) => (
                                        <blockquote key={`${snippet.node_id}-${snippet.text.slice(0, 24)}`}>
                                            <p>{snippet.text}</p>
                                            <cite>
                                                {[snippet.node_title, snippet.location].filter(Boolean).join(' | ')}
                                            </cite>
                                        </blockquote>
                                    ))}
                                </div>
                            ) : (
                                <p className="source-properties-panel__empty">No quote snippets attached.</p>
                            )}
                        </section>
                    </>
                ) : (
                    <p className="source-properties-panel__empty">Select a source from the library.</p>
                )}
                <div className="source-properties-panel__actions">
                    <button type="button" onClick={applySource} disabled={!source}>
                        Apply source
                    </button>
                    <button type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
            </section>
        </ShellRightPanel>
    );
};

export default SourcePropertiesPanel;
