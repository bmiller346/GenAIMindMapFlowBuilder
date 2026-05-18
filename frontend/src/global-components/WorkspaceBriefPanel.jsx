import { useRef, useState } from 'react';
import AnchoredPopover from './AnchoredPopover';
import modalStore from '../stores/modalStore';
import useStore from '../stores/store';
import WorkspaceBriefModal from '../modals/WorkspaceBriefModal';

const SOURCE_MODE_LABELS = {
    source_only: 'Source-backed only',
    source_plus_context: 'Source + context',
    context_only: 'Exploratory'
};

const OUTPUT_LABELS = {
    mind_map: 'TraceSpace map',
    knowledge_graph: 'Knowledge graph',
    connections: 'Connections',
    flow_chart: 'Flow chart',
    outline: 'Outline',
    table: 'Table',
    tasks: 'Tasks',
    checklist: 'Checklist',
    team_roadmap: 'Team roadmap',
    chart_data: 'Chart data',
    sme_questions: 'SME questions',
    missing_info_report: 'Missing info',
    completeness_review: 'Completeness review',
    source_set_review: 'Source-set review',
    source_coverage_report: 'Coverage report',
    miro_handoff: 'Miro',
    monday_handoff: 'monday',
    handoff: 'Handoff'
};

const PRESET_LABELS = {
    autodesk_standards: 'Autodesk Standards',
    revit_building_blocks: 'Revit Building Blocks',
    software_inventory: 'Software Inventory',
    source_set_review: 'Source Set Review',
    training_guide: 'Training Guide',
    sop_workflow: 'SOP / Workflow',
    custom: 'Custom'
};

const hasBriefContent = (brief = {}) =>
    Boolean(
        brief.configured ||
        brief.goal?.trim() ||
            brief.audience?.trim() ||
            brief.domain_context?.trim() ||
            brief.review_rules?.trim() ||
            brief.expected_artifacts?.length ||
            brief.desired_outputs?.some((output) => output !== 'mind_map')
    );

const WorkspaceBriefPanel = ({ embedded = false }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const toggleRef = useRef(null);
    const pushNode = modalStore((s) => s.pushNode);
    const workspaceBrief = useStore((s) => s.workspaceBrief) || {};
    const isBriefSet = hasBriefContent(workspaceBrief);
    const sourceMode =
        SOURCE_MODE_LABELS[workspaceBrief.source_mode] || 'Source + context';
    const outputs = (workspaceBrief.desired_outputs || [])
        .map((output) => OUTPUT_LABELS[output] || output)
        .slice(0, 1);
    const reviewNeedsSources = workspaceBrief.review_policy?.includes(
        'mark_uncited_needs_review'
    );

    const openBrief = () => {
        pushNode(WorkspaceBriefModal);
    };

    const panelBody = (
        <>
            <div className="workspace-brief-panel-header">
                <div>
                    <p>TraceSpace setup</p>
                    <span>
                        {isBriefSet
                            ? `${PRESET_LABELS[workspaceBrief.preset] || 'Custom'} | ${sourceMode}`
                            : 'No intent set'}
                    </span>
                </div>
                <button type="button" onClick={openBrief}>
                    {isBriefSet ? 'Edit' : 'Add'}
                </button>
            </div>
            {isBriefSet ? (
                <>
                    <p className="workspace-brief-panel-goal">
                        {workspaceBrief.goal || workspaceBrief.domain_context || 'Brief saved'}
                    </p>
                    <div className="workspace-brief-panel-tags">
                        {outputs.map((output) => (
                            <span key={output}>{output}</span>
                        ))}
                        <span>{reviewNeedsSources ? 'Uncited nodes need review' : sourceMode}</span>
                    </div>
                </>
            ) : (
                <p className="workspace-brief-panel-empty">
                    Pick a preset, outputs, and source strictness before generating.
                </p>
            )}
        </>
    );

    if (embedded) {
        return (
            <section className="workspace-brief-panel workspace-brief-panel-embedded">
                {panelBody}
            </section>
        );
    }

    return (
        <section className="workspace-brief-panel">
            <button
                ref={toggleRef}
                type="button"
                className="workspace-brief-panel-toggle"
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((current) => !current)}
            >
                <span>Setup</span>
                <strong>
                    {isBriefSet
                        ? PRESET_LABELS[workspaceBrief.preset] || 'Custom'
                        : 'Not set'}
                </strong>
            </button>
            <AnchoredPopover
                open={isExpanded}
                anchorRef={toggleRef}
                className="workspace-brief-panel-popover"
                ariaLabel="Workspace setup summary"
                placement="top-start"
                dataAttribute="workspace-brief-popover"
            >
                    {panelBody}
            </AnchoredPopover>
        </section>
    );
};

export default WorkspaceBriefPanel;
