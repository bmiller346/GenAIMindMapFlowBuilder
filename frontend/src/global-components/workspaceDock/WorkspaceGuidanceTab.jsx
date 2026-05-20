import WorkspaceNudgeSurface from '../WorkspaceNudgeSurface.jsx';

const WorkspaceGuidanceTab = ({
    validationReport,
    onSelectNode,
    onOpenSources,
    onOpenAiHelpers,
    hasWorkspaceNextSteps,
    workspaceNextSteps = [],
    onOpenNextSteps,
    hasWorkspaceContentNodes,
    suppressGuidanceNudges = false
}) => (
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
);

export default WorkspaceGuidanceTab;
