import GraphValidationPanel from '../GraphValidationPanel.jsx';

const formatUsageNumber = (value) => {
    const count = Number(value || 0);
    if (!Number.isFinite(count) || count <= 0) {
        return '0';
    }
    return count.toLocaleString();
};

const WorkspaceHealthTab = ({
    flowId,
    nodes = [],
    edges = [],
    onSelectNode,
    onValidationReportChange,
    onOpenIssuesTray,
    aiUsage,
    aiUsageStatus = '',
    aiUsageReviewStatus = '',
    onRefreshAiUsage,
    onOpenUsageDraftSession
}) => (
    <div className="workspace-dock-section">
        <GraphValidationPanel
            flowId={flowId}
            nodes={nodes}
            edges={edges}
            onSelectNode={onSelectNode}
            onReportChange={onValidationReportChange}
            defaultExpanded
        />
        {onOpenIssuesTray ? (
            <button
                type="button"
                className="workspace-dock-review-button"
                onClick={onOpenIssuesTray}
            >
                Review issues in tray
            </button>
        ) : null}
        <section className="workspace-ai-usage" aria-label="Workspace AI usage">
            <div>
                <strong>AI usage</strong>
                <button type="button" onClick={onRefreshAiUsage}>
                    Refresh
                </button>
            </div>
            <p>
                {formatUsageNumber(aiUsage?.total_tokens)} tokens
                {aiUsage?.estimated_cost_usd
                    ? ` · ${aiUsage.estimated_cost_usd} est.`
                    : ''}
            </p>
            <span>
                {aiUsageStatus ||
                    `${formatUsageNumber(aiUsage?.session_count)} draft sessions tracked`}
            </span>
            {aiUsageReviewStatus ? <small>{aiUsageReviewStatus}</small> : null}
            {Array.isArray(aiUsage?.sessions) && aiUsage.sessions.length ? (
                <details>
                    <summary>Details</summary>
                    <div className="workspace-ai-usage-sessions">
                        {aiUsage.sessions.slice(0, 5).map((session) => (
                            <article key={session.session_id || session.created_at}>
                                <div>
                                    <strong>{session.selected_model || 'auto'}</strong>
                                    <button
                                        type="button"
                                        onClick={() => onOpenUsageDraftSession?.(session)}
                                        disabled={!session.session_id}
                                    >
                                        Review
                                    </button>
                                </div>
                                <span>
                                    {formatUsageNumber(session.total_tokens)} tokens
                                    {session.estimated_cost_usd
                                        ? ` · ${session.estimated_cost_usd} est.`
                                        : ''}
                                </span>
                                <small>
                                    {session.status || 'draft'} ·{' '}
                                    {formatUsageNumber(session.revisions?.length)} revisions
                                </small>
                            </article>
                        ))}
                    </div>
                </details>
            ) : null}
        </section>
    </div>
);

export default WorkspaceHealthTab;
