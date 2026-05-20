/* eslint-disable react/prop-types */

const RibbonButton = ({ title, detail, disabled, onClick }) => (
    <button type="button" className="shell-ribbon-command" disabled={disabled} onClick={onClick}>
        <strong>{title}</strong>
        <span>{detail}</span>
    </button>
);

export const AiRibbonGroups = ({
    canUseWorkspace,
    onFindConnections,
    onFindSoftwareOverlap,
    onCreateStructuredTable,
    onGenerateTasks
}) => (
    <div className="shell-ribbon-command-stack" aria-label="AI ribbon commands">
        <section className="shell-ribbon-command-group" aria-label="Relationship discovery">
            <span>Discover</span>
            <RibbonButton
                title="Find connections"
                detail="Propose relationship edges for review"
                disabled={!canUseWorkspace}
                onClick={onFindConnections}
            />
            <RibbonButton
                title="Find software overlap"
                detail="Surface duplicate or overlapping tools"
                disabled={!canUseWorkspace}
                onClick={onFindSoftwareOverlap}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Generate outputs">
            <span>Generate</span>
            <RibbonButton
                title="Create table"
                detail="Draft structured rows and fields"
                disabled={!canUseWorkspace}
                onClick={onCreateStructuredTable}
            />
            <RibbonButton
                title="Generate tasks"
                detail="Draft task candidates first"
                disabled={!canUseWorkspace}
                onClick={onGenerateTasks}
            />
        </section>
    </div>
);

export const HomeRibbonGroups = ({
    canUseWorkspace,
    onOpenMap,
    onOpenOutline,
    onOpenTasks,
    onOpenWorkspace,
    onOpenActivity,
    onOpenHealth,
    onAddSource,
    onAskAi,
    onStartManual,
    onOpenNextSteps
}) => (
    <div className="shell-ribbon-command-stack" aria-label="Home ribbon commands">
        <section className="shell-ribbon-command-group" aria-label="Workspace home">
            <span>Home</span>
            <RibbonButton
                title="Map"
                detail="Return to the main canvas"
                onClick={onOpenMap}
            />
            <RibbonButton
                title="Outline"
                detail="Review hierarchy as a structured view"
                disabled={!canUseWorkspace}
                onClick={onOpenOutline}
            />
            <RibbonButton
                title="Tasks"
                detail="Open confirmed task work"
                disabled={!canUseWorkspace}
                onClick={onOpenTasks}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Workspace navigation">
            <span>Navigate</span>
            <RibbonButton
                title="Workspace"
                detail="Open workspace browser"
                onClick={onOpenWorkspace}
            />
            <RibbonButton
                title="Activity"
                detail="Open recent workspace activity"
                onClick={onOpenActivity}
            />
            <RibbonButton
                title="Health"
                detail="Open validation and readiness"
                disabled={!canUseWorkspace}
                onClick={onOpenHealth}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Workspace creation">
            <span>Create</span>
            <RibbonButton
                title="Add sources"
                detail="Open source intake"
                onClick={onAddSource}
            />
            <RibbonButton
                title="Ask AI"
                detail="Start a preview-first draft"
                disabled={!canUseWorkspace}
                onClick={onAskAi}
            />
            <RibbonButton
                title="Start node"
                detail="Create a manual root"
                disabled={!canUseWorkspace}
                onClick={onStartManual}
            />
            <RibbonButton
                title="Next steps"
                detail="Open guided workspace actions"
                disabled={!canUseWorkspace}
                onClick={onOpenNextSteps}
            />
        </section>
    </div>
);

export const SourcesRibbonGroups = ({
    canUseWorkspace,
    hasSources,
    onOpenLibrary,
    onAddSource,
    onReviewSources,
    onRepairSources,
    onOpenSourceHealth
}) => (
    <div className="shell-ribbon-command-stack" aria-label="Sources ribbon commands">
        <section className="shell-ribbon-command-group" aria-label="Source library">
            <span>Library</span>
            <RibbonButton
                title="Library"
                detail="Open embedded source browser"
                onClick={onOpenLibrary}
            />
            <RibbonButton
                title="Add sources"
                detail="Upload or connect source material"
                onClick={onAddSource}
            />
            <RibbonButton
                title="Source health"
                detail="Open source readiness"
                disabled={!canUseWorkspace}
                onClick={onOpenSourceHealth}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Source review">
            <span>Review</span>
            <RibbonButton
                title="Review support"
                detail="Open source support tray"
                disabled={!canUseWorkspace}
                onClick={onReviewSources}
            />
            <RibbonButton
                title="Repair sources"
                detail="Ask AI for missing support"
                disabled={!canUseWorkspace || !hasSources}
                onClick={onRepairSources}
            />
        </section>
    </div>
);

export const ReviewRibbonGroups = ({
    canReview,
    onOpenConnections,
    onOpenTaskPreview,
    onOpenIssues,
    onOpenSources
}) => (
    <div className="shell-ribbon-command-stack" aria-label="Review ribbon commands">
        <section className="shell-ribbon-command-group" aria-label="Review work">
            <span>Review</span>
            <RibbonButton
                title="Connections"
                detail="Review accepted/proposed relationship work"
                disabled={!canReview}
                onClick={onOpenConnections}
            />
            <RibbonButton
                title="Tasks"
                detail="Review task candidates"
                disabled={!canReview}
                onClick={onOpenTaskPreview}
            />
            <RibbonButton
                title="Issues"
                detail="Review gaps and weak areas"
                disabled={!canReview}
                onClick={onOpenIssues}
            />
            <RibbonButton
                title="Sources"
                detail="Review source support and repairs"
                disabled={!canReview}
                onClick={onOpenSources}
            />
        </section>
    </div>
);

export const OutputsRibbonGroups = ({
    canOpenOutputs,
    onOpenTable,
    onOpenExecutive,
    onOpenFlowchart,
    onOpenTasks,
    onOpenKanban,
    onOpenChecklist,
    onOpenImplementationPackage,
    onOpenStatusReview
}) => (
    <div className="shell-ribbon-command-stack" aria-label="Outputs ribbon commands">
        <section className="shell-ribbon-command-group" aria-label="Accepted output views">
            <span>Accepted</span>
            <RibbonButton
                title="Table"
                detail="View structured workspace rows"
                disabled={!canOpenOutputs}
                onClick={onOpenTable}
            />
            <RibbonButton
                title="Executive"
                detail="Package summary and evidence"
                disabled={!canOpenOutputs}
                onClick={onOpenExecutive}
            />
            <RibbonButton
                title="Flowchart"
                detail="View accepted process structure"
                disabled={!canOpenOutputs}
                onClick={onOpenFlowchart}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Execution output views">
            <span>Execute</span>
            <RibbonButton
                title="Tasks"
                detail="Open confirmed task rows"
                disabled={!canOpenOutputs}
                onClick={onOpenTasks}
            />
            <RibbonButton
                title="Kanban"
                detail="Project accepted tasks as a board"
                disabled={!canOpenOutputs}
                onClick={onOpenKanban}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Preview output views">
            <span>Preview</span>
            <RibbonButton
                title="Checklist Preview"
                detail="Review checklist candidates"
                disabled={!canOpenOutputs}
                onClick={onOpenChecklist}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Handoff output views">
            <span>Handoff</span>
            <RibbonButton
                title="Implementation"
                detail="Review handoff package"
                disabled={!canOpenOutputs}
                onClick={onOpenImplementationPackage}
            />
            <RibbonButton
                title="Status"
                detail="Review handoff status input"
                disabled={!canOpenOutputs}
                onClick={onOpenStatusReview}
            />
        </section>
    </div>
);
