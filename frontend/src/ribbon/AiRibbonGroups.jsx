/* eslint-disable react/prop-types */
import {
    FiActivity,
    FiAlertTriangle,
    FiBookOpen,
    FiCheckSquare,
    FiClipboard,
    FiColumns,
    FiCompass,
    FiFileText,
    FiFolder,
    FiGitMerge,
    FiGrid,
    FiLink,
    FiList,
    FiMap,
    FiMessageSquare,
    FiPlusCircle,
    FiSearch,
    FiShield,
    FiTool,
    FiUploadCloud
} from 'react-icons/fi';

const RibbonButton = ({ title, detail, disabled, icon: Icon, onClick }) => (
    <button type="button" className="shell-ribbon-command" disabled={disabled} onClick={onClick}>
        {Icon ? <Icon aria-hidden="true" /> : null}
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
                icon={FiLink}
                disabled={!canUseWorkspace}
                onClick={onFindConnections}
            />
            <RibbonButton
                title="Find software overlap"
                detail="Surface duplicate or overlapping tools"
                icon={FiGitMerge}
                disabled={!canUseWorkspace}
                onClick={onFindSoftwareOverlap}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Generate outputs">
            <span>Generate</span>
            <RibbonButton
                title="Create table"
                detail="Draft structured rows and fields"
                icon={FiGrid}
                disabled={!canUseWorkspace}
                onClick={onCreateStructuredTable}
            />
            <RibbonButton
                title="Generate tasks"
                detail="Draft task candidates first"
                icon={FiClipboard}
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
        <section className="shell-ribbon-command-group" aria-label="Home view commands">
            <span>Home</span>
            <RibbonButton
                title="Map"
                detail="Return to the main canvas"
                icon={FiMap}
                onClick={onOpenMap}
            />
            <RibbonButton
                title="Outline"
                detail="Open structured hierarchy"
                icon={FiList}
                disabled={!canUseWorkspace}
                onClick={onOpenOutline}
            />
            <RibbonButton
                title="Tasks"
                detail="Open accepted task work"
                icon={FiCheckSquare}
                disabled={!canUseWorkspace}
                onClick={onOpenTasks}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Workspace browser commands">
            <span>Browser</span>
            <RibbonButton
                title="Workspace"
                detail="Show project browser"
                icon={FiFolder}
                onClick={onOpenWorkspace}
            />
            <RibbonButton
                title="Activity"
                detail="Show activity browser"
                icon={FiActivity}
                onClick={onOpenActivity}
            />
            <RibbonButton
                title="Health"
                detail="Show validation browser"
                icon={FiShield}
                disabled={!canUseWorkspace}
                onClick={onOpenHealth}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Start workspace actions">
            <span>Start</span>
            <RibbonButton
                title="Add sources"
                detail="Open source intake"
                icon={FiUploadCloud}
                onClick={onAddSource}
            />
            <RibbonButton
                title="Ask AI"
                detail="Start a preview-first draft"
                icon={FiMessageSquare}
                disabled={!canUseWorkspace}
                onClick={onAskAi}
            />
            <RibbonButton
                title="Start node"
                detail="Create a manual root"
                icon={FiPlusCircle}
                disabled={!canUseWorkspace}
                onClick={onStartManual}
            />
            <RibbonButton
                title="Next steps"
                detail="Open guided workspace actions"
                icon={FiCompass}
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
                icon={FiBookOpen}
                onClick={onOpenLibrary}
            />
            <RibbonButton
                title="Add sources"
                detail="Upload or connect source material"
                icon={FiUploadCloud}
                onClick={onAddSource}
            />
            <RibbonButton
                title="Source health"
                detail="Open source readiness"
                icon={FiShield}
                disabled={!canUseWorkspace}
                onClick={onOpenSourceHealth}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Source review">
            <span>Review</span>
            <RibbonButton
                title="Review support"
                detail="Open source support tray"
                icon={FiSearch}
                disabled={!canUseWorkspace}
                onClick={onReviewSources}
            />
            <RibbonButton
                title="Repair sources"
                detail="Ask AI for missing support"
                icon={FiTool}
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
                icon={FiLink}
                disabled={!canReview}
                onClick={onOpenConnections}
            />
            <RibbonButton
                title="Tasks"
                detail="Review task candidates"
                icon={FiClipboard}
                disabled={!canReview}
                onClick={onOpenTaskPreview}
            />
            <RibbonButton
                title="Issues"
                detail="Review gaps and weak areas"
                icon={FiAlertTriangle}
                disabled={!canReview}
                onClick={onOpenIssues}
            />
            <RibbonButton
                title="Sources"
                detail="Review source support and repairs"
                icon={FiBookOpen}
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
                icon={FiGrid}
                disabled={!canOpenOutputs}
                onClick={onOpenTable}
            />
            <RibbonButton
                title="Executive"
                detail="Package summary and evidence"
                icon={FiFileText}
                disabled={!canOpenOutputs}
                onClick={onOpenExecutive}
            />
            <RibbonButton
                title="Flowchart"
                detail="View accepted process structure"
                icon={FiGitMerge}
                disabled={!canOpenOutputs}
                onClick={onOpenFlowchart}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Execution output views">
            <span>Execute</span>
            <RibbonButton
                title="Tasks"
                detail="Open confirmed task rows"
                icon={FiClipboard}
                disabled={!canOpenOutputs}
                onClick={onOpenTasks}
            />
            <RibbonButton
                title="Kanban"
                detail="Project accepted tasks as a board"
                icon={FiColumns}
                disabled={!canOpenOutputs}
                onClick={onOpenKanban}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Preview output views">
            <span>Preview</span>
            <RibbonButton
                title="Checklist Preview"
                detail="Review checklist candidates"
                icon={FiCheckSquare}
                disabled={!canOpenOutputs}
                onClick={onOpenChecklist}
            />
        </section>
        <section className="shell-ribbon-command-group" aria-label="Handoff output views">
            <span>Handoff</span>
            <RibbonButton
                title="Implementation"
                detail="Review handoff package"
                icon={FiTool}
                disabled={!canOpenOutputs}
                onClick={onOpenImplementationPackage}
            />
            <RibbonButton
                title="Status"
                detail="Review handoff status input"
                icon={FiActivity}
                disabled={!canOpenOutputs}
                onClick={onOpenStatusReview}
            />
        </section>
    </div>
);
