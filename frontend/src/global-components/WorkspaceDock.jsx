import { useCallback, useEffect, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiMaximize2 } from 'react-icons/fi';
import WorkspaceSourcesTab from './workspaceDock/WorkspaceSourcesTab.jsx';
import WorkspaceHealthTab from './workspaceDock/WorkspaceHealthTab.jsx';
import WorkspaceGuidanceTab from './workspaceDock/WorkspaceGuidanceTab.jsx';
import WorkspaceBuildTab from './workspaceDock/WorkspaceBuildTab.jsx';

const WORKSPACE_DOCK_TABS = [
    ['sources', 'Sources'],
    ['health', 'Health'],
    ['guidance', 'Guide'],
    ['build', 'Build']
];
export const WORKSPACE_DOCK_TAB_IDS = new Set(WORKSPACE_DOCK_TABS.map(([id]) => id));

export const WORKSPACE_DOCK_OPEN_TAB_EVENT = 'docmap:workspace-dock-open-tab';

const WorkspaceDock = ({
    activeTab: controlledActiveTab,
    onActiveTabChange,
    open: controlledOpen,
    onOpenChange,
    collapsed: controlledCollapsed,
    onCollapsedChange,
    width: controlledWidth,
    onWidthChange,
    className = '',
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
    onOpenIssuesTray,
    hasWorkspaceNextSteps,
    workspaceNextSteps = [],
    onOpenNextSteps,
    hasWorkspaceContentNodes,
    suppressGuidanceNudges = false,
    dockControls,
    contentOnly = false
}) => {
    const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState('guidance');
    const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState(false);
    const [uncontrolledWidth, setUncontrolledWidth] = useState(17.65);
    const activeTab = WORKSPACE_DOCK_TAB_IDS.has(controlledActiveTab)
        ? controlledActiveTab
        : uncontrolledActiveTab;
    const isCollapsedControlled =
        typeof controlledCollapsed === 'boolean' || typeof controlledOpen === 'boolean';
    const collapsed = typeof controlledCollapsed === 'boolean'
        ? controlledCollapsed
        : typeof controlledOpen === 'boolean'
          ? !controlledOpen
          : uncontrolledCollapsed;
    const parsedControlledWidth = Number(controlledWidth);
    const isWidthControlled = Number.isFinite(parsedControlledWidth);
    const width = isWidthControlled ? parsedControlledWidth : uncontrolledWidth;

    const updateActiveTab = useCallback(
        (nextTab) => {
            if (!WORKSPACE_DOCK_TAB_IDS.has(nextTab)) {
                return;
            }
            if (controlledActiveTab === undefined) {
                setUncontrolledActiveTab(nextTab);
            }
            onActiveTabChange?.(nextTab);
        },
        [controlledActiveTab, onActiveTabChange]
    );

    const updateCollapsed = useCallback(
        (nextCollapsed) => {
            if (!isCollapsedControlled) {
                setUncontrolledCollapsed(nextCollapsed);
            }
            onCollapsedChange?.(nextCollapsed);
            onOpenChange?.(!nextCollapsed);
        },
        [isCollapsedControlled, onCollapsedChange, onOpenChange]
    );

    const updateWidth = useCallback(
        (nextWidth) => {
            const clampedWidth = Math.max(15.5, Math.min(nextWidth, 27));
            if (!isWidthControlled) {
                setUncontrolledWidth(clampedWidth);
            }
            onWidthChange?.(clampedWidth);
        },
        [isWidthControlled, onWidthChange]
    );

    useEffect(() => {
        if (activeTab === 'health') {
            onRefreshAiUsage?.();
        }
    }, [activeTab, onRefreshAiUsage]);

    useEffect(() => {
        const handleOpenTab = (event) => {
            const nextTab = String(event?.detail?.tab || '').trim();
            if (WORKSPACE_DOCK_TAB_IDS.has(nextTab)) {
                updateCollapsed(false);
                updateActiveTab(nextTab);
            }
        };
        window.addEventListener(WORKSPACE_DOCK_OPEN_TAB_EVENT, handleOpenTab);
        return () =>
            window.removeEventListener(WORKSPACE_DOCK_OPEN_TAB_EVENT, handleOpenTab);
    }, [updateActiveTab, updateCollapsed]);

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
                updateWidth(startWidth + widthDelta);
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
        [updateWidth, width]
    );

    return (
        <section
            className={[
                'workspace-dock',
                collapsed ? 'workspace-dock--collapsed' : '',
                contentOnly ? 'workspace-dock--content-only' : '',
                className
            ]
                .filter(Boolean)
                .join(' ')}
            aria-label="Workspace tools"
            style={{ '--workspace-dock-width': `${width}rem` }}
        >
            {!contentOnly ? (
                <nav className="workspace-dock-tabs workspace-dock-nav" aria-label="Workspace panel">
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
                            onClick={() => updateCollapsed(!collapsed)}
                        >
                            {collapsed ? <FiChevronRight /> : <FiChevronLeft />}
                        </button>
                    </div>
                    {WORKSPACE_DOCK_TABS.map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            className={activeTab === id ? 'active' : ''}
                            onClick={() => updateActiveTab(id)}
                        >
                            {label}
                        </button>
                    ))}
                </nav>
            ) : null}
            <div className="workspace-dock-content">
                {activeTab === 'sources' ? (
                    <WorkspaceSourcesTab onOpenSources={onOpenSources} />
                ) : null}
                {activeTab === 'health' ? (
                    <WorkspaceHealthTab
                        flowId={flowId}
                        nodes={nodes}
                        edges={edges}
                        onSelectNode={onSelectNode}
                        onValidationReportChange={onValidationReportChange}
                        onOpenIssuesTray={onOpenIssuesTray}
                        aiUsage={aiUsage}
                        aiUsageStatus={aiUsageStatus}
                        aiUsageReviewStatus={aiUsageReviewStatus}
                        onRefreshAiUsage={onRefreshAiUsage}
                        onOpenUsageDraftSession={onOpenUsageDraftSession}
                    />
                ) : null}
                {activeTab === 'guidance' ? (
                    <WorkspaceGuidanceTab
                        validationReport={validationReport}
                        onSelectNode={onSelectNode}
                        onOpenSources={onOpenSources}
                        onOpenAiHelpers={onOpenAiHelpers}
                        hasWorkspaceNextSteps={hasWorkspaceNextSteps}
                        workspaceNextSteps={workspaceNextSteps}
                        onOpenNextSteps={onOpenNextSteps}
                        hasWorkspaceContentNodes={hasWorkspaceContentNodes}
                        suppressGuidanceNudges={suppressGuidanceNudges}
                    />
                ) : null}
                {activeTab === 'build' ? (
                    <WorkspaceBuildTab />
                ) : null}
            </div>
            {!collapsed && !contentOnly ? (
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
