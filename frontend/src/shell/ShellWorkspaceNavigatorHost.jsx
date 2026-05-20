import { useCallback, useEffect, useRef } from 'react';
import WorkspaceDock, { WORKSPACE_DOCK_TAB_IDS } from '../global-components/WorkspaceDock.jsx';
import { WORKSPACE_DOCK_OPEN_TAB_EVENT } from '../global-components/WorkspaceDock.jsx';
import ShellLeftNavigatorHost from './ShellLeftNavigatorHost.jsx';

const SHELL_NAVIGATOR_TAB_KINDS = new Set(['health', 'build']);
const SHELL_WORKSPACE_CONTENT_TABS = new Set(['guidance', 'health', 'build']);

const ShellWorkspaceNavigatorHost = ({
    activeTab,
    aiUsage,
    aiUsageReviewStatus,
    aiUsageStatus,
    collapsed,
    edges,
    enabled,
    flowId,
    hasWorkspaceContentNodes,
    hasWorkspaceNextSteps,
    isFocusPanelOpen,
    isStructuredCanvasView,
    leftPanelKind,
    nodes,
    onActiveTabChange,
    onCollapsedChange,
    onOpenAiHelpers,
    onOpenIssuesTray,
    onOpenNextSteps,
    onOpenSources,
    onOpenUsageDraftSession,
    onOpenWorkspaceNavigation,
    onRefreshAiUsage,
    onSelectBranch,
    onSelectNode,
    onValidationReportChange,
    onWidthChange,
    validationReport,
    width,
    workspaceNextSteps,
    sourceNavigator
}) => {
    const lastWorkspaceTabRef = useRef(
        SHELL_WORKSPACE_CONTENT_TABS.has(activeTab) ? activeTab : 'guidance'
    );

    useEffect(() => {
        if (SHELL_WORKSPACE_CONTENT_TABS.has(activeTab)) {
            lastWorkspaceTabRef.current = activeTab;
        }
    }, [activeTab]);

    const openWorkspaceNavigator = useCallback(
        (tab = 'workspace') => {
            if (tab === 'sources') {
                onOpenSources?.();
                return;
            }
            const nextTab = SHELL_WORKSPACE_CONTENT_TABS.has(tab)
                ? tab
                : tab === 'workspace'
                    ? 'guidance'
                    : lastWorkspaceTabRef.current;
            const nextKind = SHELL_NAVIGATOR_TAB_KINDS.has(nextTab) ? nextTab : 'workspace';
            onOpenWorkspaceNavigation(nextKind, {
                tab: nextTab,
                collapsed: false,
                width
            });
        },
        [onOpenSources, onOpenWorkspaceNavigation, width]
    );

    const openWorkspaceTab = useCallback(
        (nextTab) => {
            if (!enabled) {
                onActiveTabChange?.(nextTab);
                return;
            }
            openWorkspaceNavigator(nextTab);
        },
        [enabled, onActiveTabChange, openWorkspaceNavigator]
    );

    useEffect(() => {
        if (!enabled) {
            return undefined;
        }

        const handleOpenWorkspaceTab = (event) => {
            const nextTab = String(event?.detail?.tab || '').trim();
            if (!WORKSPACE_DOCK_TAB_IDS.has(nextTab)) {
                return;
            }
            lastWorkspaceTabRef.current = nextTab;
            openWorkspaceNavigator(nextTab);
        };

        window.addEventListener(WORKSPACE_DOCK_OPEN_TAB_EVENT, handleOpenWorkspaceTab);
        return () =>
            window.removeEventListener(WORKSPACE_DOCK_OPEN_TAB_EVENT, handleOpenWorkspaceTab);
    }, [enabled, openWorkspaceNavigator]);

    if (isFocusPanelOpen) {
        return null;
    }

    const workspaceNavigator = (
        <WorkspaceDock
            activeTab={activeTab}
            onActiveTabChange={openWorkspaceTab}
            open={!collapsed}
            collapsed={collapsed}
            onCollapsedChange={onCollapsedChange}
            width={width}
            onWidthChange={onWidthChange}
            className={enabled ? 'workspace-dock--shell-left' : ''}
            flowId={flowId}
            nodes={nodes}
            edges={edges}
            validationReport={validationReport}
            onValidationReportChange={onValidationReportChange}
            onSelectNode={onSelectNode}
            onOpenSources={onOpenSources}
            onOpenAiHelpers={onOpenAiHelpers}
            aiUsage={aiUsage}
            aiUsageStatus={aiUsageStatus}
            aiUsageReviewStatus={aiUsageReviewStatus}
            onRefreshAiUsage={onRefreshAiUsage}
            onOpenUsageDraftSession={onOpenUsageDraftSession}
            onOpenIssuesTray={enabled ? onOpenIssuesTray : undefined}
            hasWorkspaceNextSteps={hasWorkspaceNextSteps}
            workspaceNextSteps={workspaceNextSteps}
            onOpenNextSteps={onOpenNextSteps}
            hasWorkspaceContentNodes={hasWorkspaceContentNodes}
            suppressGuidanceNudges={isStructuredCanvasView || isFocusPanelOpen}
            contentOnly={enabled}
        />
    );

    if (!enabled) {
        return workspaceNavigator;
    }

    const openOutlineNavigator = () => {
        onOpenWorkspaceNavigation('outline', {
            tab: 'outline',
            collapsed: false,
            width
        });
    };

    const openActivityNavigator = () => {
        onOpenWorkspaceNavigation('activity', {
            tab: 'activity',
            collapsed: false,
            width
        });
    };

    const activeKind = ['outline', 'activity', 'sources', 'health', 'build'].includes(leftPanelKind)
        ? leftPanelKind
        : 'workspace';

    return (
        <ShellLeftNavigatorHost
            activeKind={activeKind}
            collapsed={collapsed}
            nodes={nodes}
            edges={edges}
            onCollapsedChange={onCollapsedChange}
            onOpenActivity={openActivityNavigator}
            onOpenNode={onSelectNode}
            onOpenOutline={openOutlineNavigator}
            onOpenSources={onOpenSources}
            onOpenWorkspace={openWorkspaceNavigator}
            onSelectBranch={onSelectBranch}
            onWidthChange={onWidthChange}
            sourceNavigator={sourceNavigator}
            width={width}
            workspaceNavigator={workspaceNavigator}
        />
    );
};

export default ShellWorkspaceNavigatorHost;
