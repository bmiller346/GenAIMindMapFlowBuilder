import { useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import useShellStore from '../stores/shellStore.js';

const DEFAULT_WORKSPACE_DOCK_WIDTH = 17.65;
const COLLAPSED_WORKSPACE_DOCK_WIDTH = 4.8;
const MIN_WORKSPACE_DOCK_WIDTH = 15.5;
const MAX_WORKSPACE_DOCK_WIDTH = 27;

const clampWorkspaceDockWidth = (width) =>
    Math.max(MIN_WORKSPACE_DOCK_WIDTH, Math.min(width, MAX_WORKSPACE_DOCK_WIDTH));

export const deriveShellLayoutState = (shell) => {
    const workspaceDockActiveTab = shell.leftPanel?.tab || 'guidance';
    const leftPanelKind = shell.leftPanel?.kind || 'workspace';
    const workspaceDockCollapsed = Boolean(shell.leftPanel?.collapsed);
    const workspaceDockWidth = Number.isFinite(shell.leftPanel?.width)
        ? clampWorkspaceDockWidth(shell.leftPanel.width)
        : DEFAULT_WORKSPACE_DOCK_WIDTH;
    const workspaceShellLeftWidth = `${
        workspaceDockCollapsed ? COLLAPSED_WORKSPACE_DOCK_WIDTH : workspaceDockWidth
    }rem`;

    return {
        ...shell,
        leftPanelKind,
        workspaceDockActiveTab,
        workspaceDockCollapsed,
        workspaceDockWidth,
        workspaceShellLeftWidth
    };
};

const useShellLayoutState = () => {
    const shell = useShellStore(
        useShallow((state) => ({
            activeRibbonTab: state.ribbon.activeTab,
            leftPanel: state.leftPanel,
            bottomTray: state.bottomTray,
            rightPanel: state.rightPanel,
            overlay: state.overlay,
            openLeftPanel: state.openLeftPanel,
            openWorkspaceNavigation: state.openWorkspaceNavigation,
            openSourceLibrary: state.openSourceLibrary,
            setLeftPanelTab: state.setLeftPanelTab,
            setLeftPanelCollapsed: state.setLeftPanelCollapsed,
            setLeftPanelWidth: state.setLeftPanelWidth,
            openRightPanel: state.openRightPanel,
            closeRightPanel: state.closeRightPanel,
            openBranchMetadata: state.openBranchMetadata,
            openSourceMetadata: state.openSourceMetadata,
            openGuidePanel: state.openGuidePanel,
            openBottomTray: state.openBottomTray,
            closeBottomTray: state.closeBottomTray,
            openDraftReviewTray: state.openDraftReviewTray,
            openSourceDraftReviewTray: state.openSourceDraftReviewTray,
            openValidationIssuesTray: state.openValidationIssuesTray,
            openLocalOutputReviewTray: state.openLocalOutputReviewTray,
            setRibbonTab: state.setRibbonTab,
            setActiveScope: state.setActiveScope
        }))
    );

    return useMemo(() => deriveShellLayoutState(shell), [shell]);
};

export default useShellLayoutState;
