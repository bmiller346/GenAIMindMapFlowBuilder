import { Fragment, lazy, Suspense } from 'react';

const Graph = lazy(() => import('../../global-components/Graph'));

const SankeyFlowPanel = ({
    sankeyFlow,
    sankeySpec,
    onOpenNode,
    onSelectPath,
    selectedPathId = '',
    selectedPath,
    onClearPath,
    onCopyMarkdown,
    onDownloadMarkdown,
    onDownloadJson,
    exportStatus = ''
}) => {
    if (!sankeyFlow?.eligible || !sankeySpec) {
        return null;
    }
    const topRows = sankeyFlow.rows.slice(0, 5);

    return (
        <section className="canvas-structured-sankey-panel" aria-label="Flow lens">
            <div className="canvas-structured-sankey-summary">
                <div>
                    <strong>Flow lens</strong>
                    <span>
                        {[
                            `${sankeyFlow.path_count} paths`,
                            `${sankeyFlow.node_count} evidence node${sankeyFlow.node_count === 1 ? '' : 's'}`,
                            sankeyFlow.metric_labels.join(', ')
                        ]
                            .filter(Boolean)
                            .join(' | ')}
                    </span>
                </div>
                <small>
                    Source, target, and value rows from accepted structured evidence. Width shows the selected metric.
                </small>
                <div className="canvas-structured-sankey-actions">
                    <button type="button" onClick={onCopyMarkdown}>
                        Copy Markdown
                    </button>
                    <button type="button" onClick={onDownloadMarkdown}>
                        Download MD
                    </button>
                    <button type="button" onClick={onDownloadJson}>
                        Download JSON
                    </button>
                </div>
                {exportStatus ? <em>{exportStatus}</em> : null}
            </div>
            <div className="canvas-structured-sankey-body">
                <div className="canvas-structured-sankey-plot">
                    <Suspense fallback={<div className="lazy-block">Loading flow...</div>}>
                        <Graph data={sankeySpec} />
                    </Suspense>
                </div>
                <div className="canvas-structured-sankey-paths">
                    {topRows.map((row) => (
                        <button
                            type="button"
                            key={row.id}
                            className={selectedPathId === row.id ? 'active' : ''}
                            onClick={() => onSelectPath?.(row)}
                        >
                            <span>{row.source}</span>
                            <span>{row.target}</span>
                            <strong>
                                {row.metric_label}: {row.value.toLocaleString()}
                            </strong>
                        </button>
                    ))}
                </div>
            </div>
            {selectedPath ? (
                <div className="canvas-structured-sankey-detail">
                    <div className="canvas-structured-sankey-detail-header">
                        <div>
                            <strong>{`${selectedPath.source} -> ${selectedPath.target}`}</strong>
                            <span>
                                {`${selectedPath.metric_label}: ${Number(selectedPath.value || 0).toLocaleString()} - ${selectedPath.review_state || 'needs_review'}`}
                            </span>
                        </div>
                        <div>
                            <button type="button" onClick={() => onOpenNode?.(selectedPath.evidence_node_id)}>
                                Open evidence node
                            </button>
                            <button type="button" onClick={onClearPath}>
                                Clear
                            </button>
                        </div>
                    </div>
                    <div className="canvas-structured-sankey-detail-grid">
                        <section>
                            <strong>Represented rows</strong>
                            {(selectedPath.represented_rows || []).slice(0, 6).map((row, index) => (
                                <dl key={`${selectedPath.id}-represented-${index}`}>
                                    {Object.entries(row || {})
                                        .filter(([, value]) => value !== undefined && value !== null && value !== '')
                                        .slice(0, 6)
                                        .map(([key, value]) => (
                                            <Fragment key={key}>
                                                <dt>{key.replaceAll('_', ' ')}</dt>
                                                <dd>{Array.isArray(value) ? `${value.length} item${value.length === 1 ? '' : 's'}` : String(value)}</dd>
                                            </Fragment>
                                        ))}
                                </dl>
                            ))}
                        </section>
                        <section>
                            <strong>Sources</strong>
                            {(selectedPath.source_refs || []).length ? (
                                <ul>
                                    {selectedPath.source_refs.slice(0, 5).map((sourceRef, index) => (
                                        <li key={`${selectedPath.id}-source-${index}`}>
                                            {sourceRef.title || sourceRef.document_title || sourceRef.document_id || sourceRef.source_id || `Source ${index + 1}`}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>Needs source support before this path should be treated as evidence.</p>
                            )}
                            {selectedPath.evidence_repair_prompt || selectedPath.source_repair_prompt ? (
                                <small>{selectedPath.evidence_repair_prompt || selectedPath.source_repair_prompt}</small>
                            ) : null}
                        </section>
                    </div>
                </div>
            ) : null}
        </section>
    );
};

export default SankeyFlowPanel;
