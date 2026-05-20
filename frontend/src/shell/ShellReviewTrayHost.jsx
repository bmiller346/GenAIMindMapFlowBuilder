import GraphValidationPanel from '../global-components/GraphValidationPanel.jsx';
import DataSourceSelect from '../global-components/DataSourceSelect.jsx';
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

const LOCAL_REVIEW_TABS = ['connections', 'tasks', 'issues', 'sources'];

const localReviewViewForTab = (tab, activeView = 'mindmap') => {
    if (tab === 'connections') {
        return 'connections';
    }
    if (tab === 'tasks') {
        return activeView === 'checklist' ? 'checklist' : 'preview';
    }
    if (tab === 'issues') {
        return activeView === 'sme' ? 'sme' : 'gaps';
    }
    if (tab === 'sources') {
        return 'sources';
    }
    return null;
};

const localReviewTrayLabels = (activeView = 'mindmap') => ({
    tasks: activeView === 'checklist' ? 'Checklist Preview' : 'Task Preview',
    issues: activeView === 'sme' ? 'SME Questions' : 'Issues',
    sources: 'Source Review'
});

const reviewTrayTitleForView = (view = 'mindmap') => {
    if (view === 'checklist') {
        return 'Checklist Preview';
    }
    if (view === 'preview') {
        return 'Task Preview';
    }
    if (view === 'connections') {
        return 'Connections Review';
    }
    if (view === 'sources') {
        return 'Source Review';
    }
    if (view === 'sme') {
        return 'SME Questions';
    }
    return 'Issues Review';
};

const localReviewDescriptionForView = (view = 'mindmap') => {
    if (view === 'checklist') {
        return 'Preview-first checklist candidates. Accepting applies selected changes to the workspace.';
    }
    if (view === 'preview') {
        return 'Preview-first task candidates. Accepted tasks stay in the structured canvas view.';
    }
    if (view === 'connections') {
        return 'Review relationship candidates and source signals before treating them as canonical.';
    }
    if (view === 'sources') {
        return 'Review source coverage and repair suggestions before updating workspace evidence.';
    }
    if (view === 'sme') {
        return 'Review SME questions before adding them back to the map.';
    }
    return 'Review missing information and workspace issues before updating the map.';
};

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
    onOpenSourceAskAi,
    onReportChange,
    onSelectNode,
    onSelectEdge,
    pendingSourceDraft
}) => {
    const connectionsReview = useConnectionsReviewController();
    const issuesReview = useIssuesReviewController();
    const sourcesReview = useSourcesReviewController({
        onOpenWorkspaceAskAi: onOpenSourceAskAi
    });
    const tasksReview = useTasksReviewController({ onSelectNode });
    const openLocalReviewTab = (tab) => {
        const nextView = localReviewViewForTab(tab, activeView);
        if (nextView) {
            onOpenLocalOutputReviewTray?.(tab, { view: nextView });
            onActiveViewChange?.(nextView);
        }
    };
    const closeLocalReviewTray = () => {
        onCloseTray();
        onActiveViewChange?.('mindmap');
    };

    if (bottomTray?.context === 'aiDraftSession' && activeAIDraftSession) {
        return (
            <ReviewTray
                activeTab={bottomTray.kind}
                availableTabs={['drafts']}
                title="Draft Review"
                description="Preview AI draft changes here before accepting anything into the canvas."
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
                availableTabs={['sources']}
                title="Source Draft Review"
                description="Review the generated source map before applying it to the workspace."
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

    if (bottomTray?.context === 'sourceIntake' && bottomTray?.kind === 'sources') {
        return (
            <ReviewTray
                activeTab="sources"
                availableTabs={['sources']}
                title="Source Intake"
                description="Add source material without leaving the shell. Generated source maps still return here for review before they update the workspace."
                onTabChange={() => onOpenBottomTray('sources', { context: 'sourceIntake' })}
                onClose={onCloseTray}
            >
                <DataSourceSelect variant="tray" onClose={onCloseTray} />
            </ReviewTray>
        );
    }

    if (bottomTray?.context?.workflow === 'localOutputReview' && bottomTray?.kind === 'connections') {
        return (
            <ReviewTray
                activeTab="connections"
                availableTabs={LOCAL_REVIEW_TABS}
                title="Connections Review"
                description={localReviewDescriptionForView('connections')}
                tabLabels={localReviewTrayLabels(activeView)}
                onTabChange={openLocalReviewTab}
                onClose={closeLocalReviewTray}
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
                availableTabs={LOCAL_REVIEW_TABS}
                title={reviewTrayTitleForView(view)}
                description={localReviewDescriptionForView(view)}
                tabLabels={localReviewTrayLabels(view)}
                onTabChange={openLocalReviewTab}
                onClose={closeLocalReviewTray}
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
                availableTabs={LOCAL_REVIEW_TABS}
                title="Source Review"
                description={localReviewDescriptionForView('sources')}
                tabLabels={localReviewTrayLabels(activeView)}
                onTabChange={openLocalReviewTab}
                onClose={closeLocalReviewTray}
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
                availableTabs={LOCAL_REVIEW_TABS}
                title={reviewTrayTitleForView(mode)}
                description={localReviewDescriptionForView(mode)}
                tabLabels={localReviewTrayLabels(mode)}
                onTabChange={openLocalReviewTab}
                onClose={closeLocalReviewTray}
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
                availableTabs={['issues']}
                title="Workspace Health Review"
                description="Review validation issues from the current workspace health report."
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
