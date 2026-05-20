/* eslint-disable react/prop-types */
const OUTPUT_STATE_LABELS = {
    'Locally projected': 'Current workspace',
    'AI-generated': 'AI preview',
    Accepted: 'Accepted',
    'Applied/exported': 'Applied'
};

export const sourceLabel = (node) => {
    const ref = node.source_ref || {};
    const parts = [ref.document_id, ref.page ? `p. ${ref.page}` : '', ref.section]
        .filter(Boolean)
        .join(' | ');

    return parts || 'No source';
};

export const rowTypeLabel = (node) => {
    if (node.table_rows?.length) {
        return `${node.node_type} table`;
    }

    return node.node_type;
};

export const tableShapeLabel = (node) => {
    if (!node.table_rows?.length) {
        return '-';
    }

    const columnCount = node.table_columns?.length || 0;
    return `${node.table_rows.length} x ${columnCount || '-'} table`;
};

export const outputState = (row) => {
    if (row.monday_selection_input || row.monday_status_back_input) {
        return 'Applied/exported';
    }
    if (row.local_preview_acceptances?.some((acceptance) => acceptance.accepted)) {
        return 'Accepted';
    }
    if (row.generated_preview_item) {
        return 'AI-generated';
    }
    return 'Locally projected';
};

export const OutputStatePill = ({ state }) => (
    <span className={`output-state-pill output-state-${state.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
        {OUTPUT_STATE_LABELS[state] || state}
    </span>
);

export const ExecutiveOutputSection = ({ title, items = [] }) => (
    <section className="local-executive-section">
        <div className="local-executive-section-header">
            <strong>{title}</strong>
            <span>{items.length}</span>
        </div>
        {items.length > 0 ? (
            <div className="local-executive-list">
                {items.map((item) => (
                    <article key={item.id} className="local-executive-item">
                        <strong>{item.title}</strong>
                        {item.description ? <p>{item.description}</p> : null}
                        <small>
                            {[
                                item.status,
                                item.priority ? `priority: ${item.priority}` : '',
                                item.owner_id ? `owner: ${item.owner_id}` : '',
                                item.due_date ? `due: ${item.due_date}` : '',
                                item.source_backed ? 'source-backed' : 'needs review'
                            ]
                                .filter(Boolean)
                                .join(' | ')}
                        </small>
                    </article>
                ))}
            </div>
        ) : (
            <div className="local-table-empty">No items projected.</div>
        )}
    </section>
);

export const OutlineNode = ({ node, childrenByParent, nodeLookup, depth, onSelectBranch, onOpenNode }) => {
    const children = (childrenByParent.get(node.id) || [])
        .map((childId) => nodeLookup.get(childId))
        .filter(Boolean);

    return (
        <li>
            <div className="local-outline-row" style={{ paddingLeft: depth * 14 }}>
                <div className="local-outline-actions">
                    <button type="button" onClick={() => onSelectBranch(node.id)}>
                        Branch
                    </button>
                    <button type="button" onClick={() => onOpenNode(node.id)}>
                        Inspect
                    </button>
                </div>
                <span>{node.title}</span>
                <small>{rowTypeLabel(node)}</small>
            </div>
            {children.length > 0 ? (
                <ol>
                    {children.map((child) => (
                        <OutlineNode
                            key={child.id}
                            node={child}
                            childrenByParent={childrenByParent}
                            nodeLookup={nodeLookup}
                            depth={depth + 1}
                            onSelectBranch={onSelectBranch}
                            onOpenNode={onOpenNode}
                        />
                    ))}
                </ol>
            ) : null}
        </li>
    );
};

export const EmptyState = ({
    activeView,
    canUseWorkspace,
    onAddRoot,
    onAddSource,
    onOpenBrief,
    onAskAi,
    showCanvasNudges
}) => {
    const isReviewOutput = ['preview', 'checklist', 'gaps', 'sme', 'sources'].includes(activeView);
    const isAiOutput = ['connections', 'flowchart', 'chartData'].includes(activeView);
    const guidance = isReviewOutput || isAiOutput
        ? 'Add a source for grounded work, ask AI for a starting structure, or add a root manually.'
        : activeView === 'mindmap'
          ? 'Add a source for evidence-backed work, ask AI to draft a start, or sketch manually.'
          : 'This view will populate once the workspace has graph nodes.';

    return (
        <div className="local-view-empty">
            {showCanvasNudges ? (
                <span className="local-view-empty-kicker">
                    {isReviewOutput || isAiOutput ? 'Output needs graph context' : 'Start your Think Space'}
                </span>
            ) : null}
            <strong>No graph nodes yet</strong>
            {showCanvasNudges ? <span>{guidance}</span> : null}
            <div className="local-view-empty-actions">
                <button type="button" onClick={onAddSource}>
                    Add source
                </button>
                <button type="button" onClick={() => onAskAi()} disabled={!canUseWorkspace}>
                    Ask AI
                </button>
                <button type="button" onClick={onAddRoot} disabled={!canUseWorkspace}>
                    Add root
                </button>
                <button type="button" onClick={onOpenBrief}>
                    Set brief
                </button>
            </div>
            {!canUseWorkspace ? (
                <small>Open or create a workspace to add nodes or ask AI.</small>
            ) : null}
        </div>
    );
};

export const WorkspaceHealthSummary = ({ nodes, graphConfidence, onAction }) => {
    if (nodes.length === 0) {
        return null;
    }

    return (
        <div className="local-workspace-health">
            <div>
                <span>Workspace health</span>
                <strong>{graphConfidence.score}% {graphConfidence.label}</strong>
            </div>
            <div className="local-workspace-health-stats">
                <span>{graphConfidence.sourced_nodes}/{graphConfidence.node_count} sourced</span>
                <span>{graphConfidence.nodes_needing_review} needs review</span>
                <span>{graphConfidence.cross_link_edges} cross-links</span>
            </div>
            <div className="local-workspace-health-actions">
                {graphConfidence.supplement_actions.slice(0, 3).map((action) => (
                    <button key={action} type="button" onClick={() => onAction(action)}>
                        {action}
                    </button>
                ))}
            </div>
        </div>
    );
};

export const ConnectionsReadinessSummary = ({
    graphConfidence,
    connectionRows,
    OutputStatePill,
    flowId,
    onOpenAiPreset,
    onSetActiveView
}) => (
    <div className="local-lens-summary local-lens-summary-stacked">
        <div className="local-lens-summary-copy">
            <OutputStatePill state="Locally projected" />
            <div>
                <strong>Connections readiness</strong>
                <span>
                    The map shows hierarchy. The Connections lens becomes useful after
                    accepted cross-branch relationship edges exist.
                </span>
            </div>
        </div>
        <div className="local-graph-readiness">
            <div className="local-graph-score">
                <strong>{graphConfidence.score}</strong>
                <span>{graphConfidence.label}</span>
            </div>
            <div className="local-graph-readiness-copy">
                <span>
                    {graphConfidence.cross_link_edges} accepted cross-link
                    {graphConfidence.cross_link_edges === 1 ? '' : 's'} |{' '}
                    {graphConfidence.hierarchy_edges} hierarchy edge
                    {graphConfidence.hierarchy_edges === 1 ? '' : 's'}
                </span>
                {graphConfidence.reasons.length > 0 ? (
                    <small>{graphConfidence.reasons.slice(0, 3).join(' | ')}</small>
                ) : (
                    <small>Structure, sources, review state, and connections look healthy.</small>
                )}
            </div>
        </div>
        <div className="local-transformation-path" aria-label="Graph transformation path">
            <span>TraceSpace Map</span>
            <span>Find cross-branch connections</span>
            <span>Review candidates</span>
            <span>Connections lens</span>
        </div>
        <div className="local-lens-actions">
            <button type="button" onClick={() => onOpenAiPreset('connections')} disabled={!flowId}>
                Find cross-branch connections
            </button>
            <button
                type="button"
                onClick={() => onOpenAiPreset('mindmapFromConnections')}
                disabled={!flowId || connectionRows.length === 0}
            >
                Create mind map from connections
            </button>
            <button type="button" onClick={() => onSetActiveView('gaps')}>
                Review confidence gaps
            </button>
        </div>
    </div>
);

export const AcceptedConnectionsSummary = ({
    connectionRows,
    crossLinkRows,
    relationshipReviewRows,
    graphConfidence,
    relationshipExportStatus,
    OutputStatePill,
    flowId,
    onOpenAiPreset,
    onCopyReview,
    onDownloadReview
}) => (
    <div className="local-lens-summary local-lens-summary-stacked">
        <div className="local-lens-summary-copy">
            <OutputStatePill state="Locally projected" />
            <div>
                <strong>Accepted connections</strong>
                <span>
                    This list shows relationship edges already accepted into the
                    workspace. Find connections proposes candidates first; you review
                    confidence and rationale before accepting anything.
                </span>
            </div>
        </div>
        <div className="local-lens-ai-callout">
            <div>
                <strong>Find connections</strong>
                <span>
                    AI looks for cross-branch links such as dependencies,
                    potential software overlap, conflicts, blockers, and
                    supporting relationships. It does not rewrite the map hierarchy.
                </span>
            </div>
            <div className="local-lens-callout-actions">
                <button type="button" onClick={() => onOpenAiPreset('connections')} disabled={!flowId}>
                    Find connections
                </button>
                <button type="button" onClick={() => onOpenAiPreset('softwareOverlap')} disabled={!flowId}>
                    Find software overlap
                </button>
                <button
                    type="button"
                    onClick={() => onOpenAiPreset('mindmapFromConnections')}
                    disabled={!flowId || connectionRows.length === 0}
                >
                    Create mind map from connections
                </button>
                <button type="button" onClick={onCopyReview} disabled={relationshipReviewRows.length === 0}>
                    Copy review
                </button>
                <button type="button" onClick={onDownloadReview} disabled={relationshipReviewRows.length === 0}>
                    Download review
                </button>
                {relationshipExportStatus ? (
                    <small className="local-export-status">{relationshipExportStatus}</small>
                ) : null}
            </div>
        </div>
        <div className="local-connection-stats">
            <span>{connectionRows.length} accepted link{connectionRows.length === 1 ? '' : 's'}</span>
            <span>{crossLinkRows.length} cross-branch link{crossLinkRows.length === 1 ? '' : 's'}</span>
            <span>{relationshipReviewRows.length} reviewable relationship{relationshipReviewRows.length === 1 ? '' : 's'}</span>
            <span>{graphConfidence.score}% confidence</span>
        </div>
    </div>
);
