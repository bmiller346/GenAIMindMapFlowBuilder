import { useCallback, useEffect, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiMaximize2 } from 'react-icons/fi';
import AddDataSource from './AddDataSource.jsx';
import GraphValidationPanel from './GraphValidationPanel.jsx';
import WorkspaceBriefPanel from './WorkspaceBriefPanel.jsx';
import MapStylePanel from './MapStylePanel.jsx';
import ManualNodeControls from './ManualNodeControls.jsx';
import WorkspaceNudgeSurface from './WorkspaceNudgeSurface.jsx';

const WORKSPACE_DOCK_TABS = [
    ['sources', 'Sources'],
    ['health', 'Health'],
    ['guidance', 'Guide'],
    ['build', 'Build']
];
const WORKSPACE_DOCK_TAB_IDS = new Set(WORKSPACE_DOCK_TABS.map(([id]) => id));

export const WORKSPACE_DOCK_OPEN_TAB_EVENT = 'docmap:workspace-dock-open-tab';

const formatUsageNumber = (value) => {
    const count = Number(value || 0);
    if (!Number.isFinite(count) || count <= 0) {
        return '0';
    }
    return count.toLocaleString();
};

const WorkspaceDock = ({
    flowId,
    nodes = [],
    edges = [],
    validationReport,
    onValidationReportChange,
    onSelectNode,
    onOpenSources,
    onOpenAiHelpers,
    aiUsage,
    aiUsageStatus = '',
    aiUsageReviewStatus = '',
    onRefreshAiUsage,
    onOpenUsageDraftSession,
    hasWorkspaceNextSteps,
    workspaceNextSteps = [],
    onOpenNextSteps,
    hasWorkspaceContentNodes,
    suppressGuidanceNudges = false,
    dockControls
}) => {
    const [activeTab, setActiveTab] = useState('guidance');
    const [collapsed, setCollapsed] = useState(false);
    const [width, setWidth] = useState(17.65);

    useEffect(() => {
        if (activeTab === 'health') {
            onRefreshAiUsage?.();
        }
    }, [activeTab, onRefreshAiUsage]);

    useEffect(() => {
        const handleOpenTab = (event) => {
            const nextTab = String(event?.detail?.tab || '').trim();
            if (WORKSPACE_DOCK_TAB_IDS.has(nextTab)) {
                setCollapsed(false);
                setActiveTab(nextTab);
            }
        };
        window.addEventListener(WORKSPACE_DOCK_OPEN_TAB_EVENT, handleOpenTab);
        return () =>
            window.removeEventListener(WORKSPACE_DOCK_OPEN_TAB_EVENT, handleOpenTab);
    }, []);

    const startResize = useCallback(
        (event) => {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const startX = event.clientX;
            const startWidth = width;

            const handlePointerMove = (moveEvent) => {
                const widthDelta = (moveEvent.clientX - startX) / 16;
                setWidth(Math.max(15.5, Math.min(startWidth + widthDelta, 27)));
            };

            const stopResize = () => {
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', stopResize);
                window.removeEventListener('pointercancel', stopResize);
            };

            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', stopResize);
            window.addEventListener('pointercancel', stopResize);
        },
        [width]
    );

    return (
        <section
            className={`workspace-dock ${collapsed ? 'workspace-dock--collapsed' : ''}`}
            aria-label="Workspace tools"
            style={{ '--workspace-dock-width': `${width}rem` }}
        >
            <nav className="workspace-dock-tabs" aria-label="Workspace panel">
                <div className="workspace-dock-panel-actions">
                    {dockControls ? (
                        <div className="workspace-dock-controls-slot">
                            {dockControls}
                        </div>
                    ) : null}
                    <button
                        type="button"
                        className="workspace-dock-icon-button"
                        title={collapsed ? 'Expand panel' : 'Collapse panel'}
                        aria-label={collapsed ? 'Expand workspace panel' : 'Collapse workspace panel'}
                        onClick={() => setCollapsed((current) => !current)}
                    >
                        {collapsed ? <FiChevronRight /> : <FiChevronLeft />}
                    </button>
                </div>
                {WORKSPACE_DOCK_TABS.map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        className={activeTab === id ? 'active' : ''}
                        onClick={() => setActiveTab(id)}
                    >
                        {label}
                    </button>
                ))}
            </nav>
            <div className="workspace-dock-content">
                {activeTab === 'sources' ? (
                    <div className="workspace-dock-section">
                        <div className="workspace-dock-header">
                            <strong>Sources</strong>
                            <button type="button" onClick={onOpenSources}>
                                Library
                            </button>
                        </div>
                        <AddDataSource />
                    </div>
                ) : null}
                {activeTab === 'health' ? (
                    <div className="workspace-dock-section">
                        <GraphValidationPanel
                            flowId={flowId}
                            nodes={nodes}
                            edges={edges}
                            onSelectNode={onSelectNode}
                            onReportChange={onValidationReportChange}
                            defaultExpanded
                        />
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
                ) : null}
                {activeTab === 'guidance' ? (
                    <div className="workspace-dock-section workspace-guide-panel">
                        {hasWorkspaceNextSteps ? (
                            <div className="workspace-next-steps-launcher">
                                <div className="workspace-dock-header">
                                    <strong>Next steps</strong>
                                    <span>{workspaceNextSteps.length}</span>
                                </div>
                                <p>Reopen recommended AI actions for the current workspace.</p>
                                <button type="button" onClick={onOpenNextSteps}>
                                    Open next steps
                                </button>
                            </div>
                        ) : null}
                        {!suppressGuidanceNudges ? (
                            <WorkspaceNudgeSurface
                                validationIssues={validationReport?.issues || []}
                                onFocusNode={onSelectNode}
                                onOpenSources={onOpenSources}
                                onOpenAiHelpers={onOpenAiHelpers}
                            />
                        ) : null}
                        {!hasWorkspaceNextSteps ? (
                            <div className="workspace-guide-empty">
                                <strong>Guide</strong>
                                <p>
                                    {hasWorkspaceContentNodes
                                        ? 'No recommended AI actions right now.'
                                        : 'Create the first workspace node before guidance starts making recommendations.'}
                                </p>
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {activeTab === 'build' ? (
                    <div className="workspace-flow-controls">
                        <WorkspaceBriefPanel embedded />
                        <MapStylePanel />
                        <ManualNodeControls />
                    </div>
                ) : null}
            </div>
            {!collapsed ? (
                <button
                    type="button"
                    className="workspace-dock-resize-handle"
                    title="Resize panel"
                    aria-label="Resize workspace panel"
                    onPointerDown={startResize}
                >
                    <FiMaximize2 />
                </button>
            ) : null}
        </section>
    );
};

export default WorkspaceDock;
