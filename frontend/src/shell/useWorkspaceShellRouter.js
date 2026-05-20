import { useEffect } from 'react';
import { SHELL_LOCAL_OUTPUT_TRAY_BY_VIEW } from '../stores/shellStore.js';

const sourceDraftTrayId = (pendingSourceDraft) =>
    String(pendingSourceDraft?.sourceName || pendingSourceDraft?.flowId || '');

const useWorkspaceShellRouter = ({
    activeAIDraftSession,
    activeView,
    bottomTray,
    enabled,
    inspectorEdgeId,
    inspectorNodeId,
    openDraftReviewTray,
    openLocalOutputReviewTray,
    openRightPanel,
    openSourceDraftReviewTray,
    closeBottomTray,
    closeRightPanel,
    pendingSourceDraft,
    rightPanel,
    setInspectorEdgeId,
    setInspectorNodeId
}) => {
    useEffect(() => {
        if (!enabled) {
            return;
        }

        if (activeAIDraftSession) {
            setInspectorNodeId(undefined);
            setInspectorEdgeId(undefined);
            if (
                bottomTray?.context === 'aiDraftSession' &&
                bottomTray?.id === activeAIDraftSession.session_id
            ) {
                return;
            }
            openDraftReviewTray(activeAIDraftSession.session_id);
            return;
        }

        if (inspectorEdgeId) {
            openRightPanel({ kind: 'edge', id: inspectorEdgeId });
            setInspectorEdgeId(undefined);
            return;
        }

        if (inspectorNodeId) {
            openRightPanel({ kind: 'node', id: inspectorNodeId });
            setInspectorNodeId(undefined);
            return;
        }

        if (rightPanel?.kind && rightPanel?.id) {
            return;
        }

        closeRightPanel();
    }, [
        activeAIDraftSession,
        bottomTray?.context,
        bottomTray?.id,
        closeRightPanel,
        enabled,
        inspectorEdgeId,
        inspectorNodeId,
        openDraftReviewTray,
        openRightPanel,
        rightPanel?.id,
        rightPanel?.kind,
        setInspectorEdgeId,
        setInspectorNodeId
    ]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        if (pendingSourceDraft?.graph) {
            const trayId = sourceDraftTrayId(pendingSourceDraft);
            if (
                bottomTray?.context === 'sourceDraftReview' &&
                bottomTray?.kind === 'sources' &&
                bottomTray?.id === trayId
            ) {
                return;
            }
            openSourceDraftReviewTray(trayId);
            return;
        }

        if (bottomTray?.context === 'sourceDraftReview') {
            closeBottomTray();
        }
    }, [
        bottomTray?.context,
        bottomTray?.id,
        bottomTray?.kind,
        closeBottomTray,
        enabled,
        openSourceDraftReviewTray,
        pendingSourceDraft
    ]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        if (activeAIDraftSession || pendingSourceDraft?.graph) {
            return;
        }

        const tray = SHELL_LOCAL_OUTPUT_TRAY_BY_VIEW[activeView];
        if (tray) {
            if (
                bottomTray?.context?.workflow === 'localOutputReview' &&
                bottomTray?.kind === tray &&
                bottomTray?.context?.view === activeView
            ) {
                return;
            }
            openLocalOutputReviewTray(tray, { view: activeView });
            return;
        }

        if (bottomTray?.context?.workflow === 'localOutputReview') {
            closeBottomTray();
        }
    }, [
        activeView,
        activeAIDraftSession,
        bottomTray?.context,
        bottomTray?.kind,
        closeBottomTray,
        enabled,
        openLocalOutputReviewTray,
        pendingSourceDraft
    ]);
};

export default useWorkspaceShellRouter;
