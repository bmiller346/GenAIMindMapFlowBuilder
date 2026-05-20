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
    onOpenChecklist
}) => (
    <div className="shell-ribbon-command-stack" aria-label="Outputs ribbon commands">
        <section className="shell-ribbon-command-group" aria-label="Output views">
            <span>Outputs</span>
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
                title="Checklist"
                detail="Review checklist candidates"
                disabled={!canOpenOutputs}
                onClick={onOpenChecklist}
            />
        </section>
    </div>
);
