import GraphValidationPanel from '../global-components/GraphValidationPanel.jsx';
import SourceDraftReviewPanel from '../global-components/SourceDraftReviewPanel.jsx';
import ConnectionsReviewSurface from '../review/ConnectionsReviewSurface.jsx';
import IssuesReviewSurface from '../review/IssuesReviewSurface.jsx';
import SourcesReviewSurface from '../review/SourcesReviewSurface.jsx';
import TasksReviewSurface from '../review/TasksReviewSurface.jsx';
import ReviewTray from '../review/ReviewTray.jsx';
import ChecklistPreview from '../views/ChecklistPreview.jsx';
import useConnectionsReviewController from '../review/useConnectionsReviewController.js';
import useIssuesReviewController from '../review/useIssuesReviewController.js';
import useSourcesReviewController from '../review/useSourcesReviewController.js';
import useTasksReviewController from '../review/useTasksReviewController.js';

const ShellReviewTrayHost = ({
    activeAIDraftSession,
    activeView,
    bottomTray,
    clearPendingSourceDraft,
    edges,
    flowId,
    nodes,
    onActiveViewChange,
    onCloseActiveDraftTray,
    onCloseTray,
    onDraftAccepted,
    onOpenBottomTray,
    onOpenLocalOutputReviewTray,
    onReportChange,
    onSelectNode,
    onSelectEdge,
    pendingSourceDraft
}) => {
    const connectionsReview = useConnectionsReviewController();
    const issuesReview = useIssuesReviewController();
    const sourcesReview = useSourcesReviewController();
    const tasksReview = useTasksReviewController({ onSelectNode });

    if (bottomTray?.context === 'aiDraftSession' && activeAIDraftSession) {
        return (
            <ReviewTray
                activeTab={bottomTray.kind}
                onTabChange={(tab) => onOpenBottomTray(tab, { context: 'aiDraftSession' })}
                onClose={onCloseActiveDraftTray}
                activeDraftSession={activeAIDraftSession}
                onDraftAccepted={onDraftAccepted}
            />
        );
    }

    if (bottomTray?.context === 'sourceDraftReview' && pendingSourceDraft?.graph) {
        return (
            <ReviewTray
                activeTab={bottomTray.kind}
                onTabChange={(tab) => onOpenBottomTray(tab, { context: 'sourceDraftReview' })}
                onClose={() => {
                    clearPendingSourceDraft();
                    onCloseTray();
                }}
            >
                {bottomTray.kind === 'sources' ? (
                    <SourceDraftReviewPanel variant="tray" />
                ) : null}
            </ReviewTray>
        );
    }

    if (bottomTray?.context?.workflow === 'localOutputReview' && bottomTray?.kind === 'connections') {
        return (
            <ReviewTray
                activeTab="connections"
                onTabChange={(tab) => {
                    const nextView =
                        tab === 'connections'
                            ? 'connections'
                            : tab === 'tasks'
                              ? activeView === 'checklist' ? 'checklist' : 'preview'
                              : tab === 'issues'
                                ? activeView === 'sme' ? 'sme' : 'gaps'
                                : tab === 'sources'
                                  ? 'sources'
                                  : null;
                    if (nextView) {
                        onOpenLocalOutputReviewTray?.(tab, { view: nextView });
                        onActiveViewChange?.(nextView);
                    }
                }}
                onClose={() => {
                    onCloseTray();
                    onActiveViewChange?.('mindmap');
                }}
            >
                <ConnectionsReviewSurface
                    connectionRows={connectionsReview.connectionRows}
                    crossLinkRows={connectionsReview.crossLinkRows}
                    relationshipReviewGroups={connectionsReview.relationshipReviewGroups}
                    relationshipReviewRows={connectionsReview.relationshipReviewRows}
                    graphConfidence={connectionsReview.graphConfidence}
                    relationshipExportStatus={connectionsReview.relationshipExportStatus}
                    flowId={connectionsReview.flowId}
                    onOpenAiPreset={connectionsReview.openConnectionsAiPreset}
                    onSelectEdge={onSelectEdge}
                    onCopyReview={connectionsReview.copyRelationshipReviewMarkdown}
                    onDownloadReview={connectionsReview.downloadRelationshipReviewMarkdown}
                />
            </ReviewTray>
        );
    }

    if (
        bottomTray?.context?.workflow === 'localOutputReview' &&
        bottomTray?.kind === 'tasks'
    ) {
        const view = bottomTray?.context?.view;
        return (
            <ReviewTray
                activeTab="tasks"
                onTabChange={(tab) => {
                    const nextView =
                        tab === 'connections'
                            ? 'connections'
                            : tab === 'tasks'
                              ? activeView === 'checklist' ? 'checklist' : 'preview'
                              : tab === 'issues'
                                ? activeView === 'sme' ? 'sme' : 'gaps'
                                : tab === 'sources'
                                  ? 'sources'
                                  : null;
                    if (nextView) {
                        onOpenLocalOutputReviewTray?.(tab, { view: nextView });
                        onActiveViewChange?.(nextView);
                    }
                }}
                onClose={() => {
                    onCloseTray();
                    onActiveViewChange?.('mindmap');
                }}
            >
                {view === 'checklist' ? (
                    <ChecklistPreview
                        nodes={tasksReview.nodes}
                        projection={tasksReview.projection}
                        setNodes={tasksReview.setNodes}
                        setActiveView={tasksReview.setActiveView}
                        generatedPreview={tasksReview.generatedChecklistPreview}
                        onRejectGeneratedPreview={tasksReview.clearGeneratedChecklistPreview}
                        onAskAi={tasksReview.openChecklistAiPreset}
                    />
                ) : (
                    <TasksReviewSurface
                        mode="preview"
                        taskRows={tasksReview.taskRows}
                        showTaskNudges={tasksReview.showTaskNudges}
                        generatedTaskPreview={tasksReview.generatedTaskPreview}
                        previewRows={tasksReview.previewRows}
                        activePreviewIds={tasksReview.activePreviewIds}
                        taskPreviewDiffSummary={tasksReview.taskPreviewDiffSummary}
                        flowId={tasksReview.flowId}
                        onAcceptTaskPreview={tasksReview.acceptTaskPreview}
                        onOpenNode={tasksReview.openNode}
                        onOpenAiPreset={tasksReview.openTasksAiPreset}
                        onRejectGenerated={tasksReview.clearGeneratedTaskPreview}
                        onSetActiveView={tasksReview.setActiveView}
                        onTogglePreviewRow={tasksReview.togglePreviewRow}
                    />
                )}
            </ReviewTray>
        );
    }

    if (bottomTray?.context?.workflow === 'localOutputReview' && bottomTray?.kind === 'sources') {
        return (
            <ReviewTray
                activeTab="sources"
                onTabChange={(tab) => {
                    const nextView =
                        tab === 'connections'
                            ? 'connections'
                            : tab === 'tasks'
                              ? 'preview'
                              : tab === 'issues'
                                ? activeView === 'sme' ? 'sme' : 'gaps'
                                : tab === 'sources'
                                  ? 'sources'
                                  : null;
                    if (nextView) {
                        onOpenLocalOutputReviewTray?.(tab, { view: nextView });
                        onActiveViewChange?.(nextView);
                    }
                }}
                onClose={() => {
                    onCloseTray();
                    onActiveViewChange?.('mindmap');
                }}
            >
                <SourcesReviewSurface
                    nodes={sourcesReview.nodes}
                    edges={sourcesReview.edges}
                    projection={sourcesReview.projection}
                    generatedPreview={sourcesReview.generatedSourceRepairPreview}
                    onRejectGeneratedPreview={sourcesReview.rejectGeneratedSourceRepairPreview}
                    selectedBranchId={sourcesReview.selectedBranchId}
                    setNodes={sourcesReview.setNodes}
                    setEdges={sourcesReview.setEdges}
                    setActiveView={sourcesReview.setActiveView}
                    sourceRepairPreset={sourcesReview.sourceRepairPreset}
                    onAskAi={sourcesReview.openWorkspaceAskAi}
                />
            </ReviewTray>
        );
    }

    if (bottomTray?.context?.workflow === 'localOutputReview' && bottomTray?.kind === 'issues') {
        const mode = bottomTray?.context?.view === 'sme' ? 'sme' : 'gaps';
        return (
            <ReviewTray
                activeTab="issues"
                onTabChange={(tab) => {
                    const nextView =
                        tab === 'connections'
                            ? 'connections'
                            : tab === 'tasks'
                              ? 'preview'
                              : tab === 'issues'
                                ? mode
                                : tab === 'sources'
                                  ? 'sources'
                                  : null;
                    if (nextView) {
                        onOpenLocalOutputReviewTray?.(tab, { view: nextView });
                        onActiveViewChange?.(nextView);
                    }
                }}
                onClose={() => {
                    onCloseTray();
                    onActiveViewChange?.('mindmap');
                }}
            >
                <IssuesReviewSurface
                    mode={mode}
                    nodes={issuesReview.nodes}
                    projection={issuesReview.projection}
                    generatedReviewerGapsPreview={issuesReview.generatedReviewerGapsPreview}
                    generatedReviewerSmePreview={issuesReview.generatedReviewerSmePreview}
                    onRejectGeneratedGapsPreview={issuesReview.rejectGeneratedGapsPreview}
                    onRejectGeneratedSmePreview={issuesReview.rejectGeneratedSmePreview}
                    setActiveView={issuesReview.setActiveView}
                    setNodes={issuesReview.setNodes}
                    onAskGapsAi={issuesReview.onAskGapsAi}
                    onAskSmeAi={issuesReview.onAskSmeAi}
                />
            </ReviewTray>
        );
    }

    if (bottomTray?.context === 'validationIssues' && bottomTray?.kind === 'issues') {
        return (
            <ReviewTray
                activeTab="issues"
                onTabChange={(tab) =>
                    onOpenBottomTray(tab, { context: tab === 'issues' ? 'validationIssues' : null })
                }
                onClose={onCloseTray}
            >
                <GraphValidationPanel
                    flowId={flowId}
                    nodes={nodes}
                    edges={edges}
                    onSelectNode={onSelectNode}
                    onReportChange={onReportChange}
                    defaultExpanded
                />
            </ReviewTray>
        );
    }

    return null;
};

export default ShellReviewTrayHost;
