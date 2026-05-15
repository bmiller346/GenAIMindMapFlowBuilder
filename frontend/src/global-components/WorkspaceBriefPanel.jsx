import modalStore from '../stores/modalStore';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import WorkspaceBriefModal from '../modals/WorkspaceBriefModal';

const SOURCE_MODE_LABELS = {
    source_only: 'Source-backed only',
    source_plus_context: 'Source + context',
    context_only: 'Exploratory'
};

const OUTPUT_LABELS = {
    mind_map: 'Mind map',
    knowledge_graph: 'Knowledge graph',
    connections: 'Connections',
    flow_chart: 'Flow chart',
    outline: 'Outline',
    table: 'Table',
    tasks: 'Tasks',
    checklist: 'Checklist',
    chart_data: 'Chart data',
    sme_questions: 'SME questions',
    missing_info_report: 'Missing info',
    source_coverage_report: 'Coverage report',
    miro_handoff: 'Miro',
    monday_handoff: 'monday',
    handoff: 'Handoff'
};

const PRESET_LABELS = {
    autodesk_standards: 'Autodesk Standards',
    revit_building_blocks: 'Revit Building Blocks',
    software_inventory: 'Software Inventory',
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
            brief.desired_outputs?.some((output) => output !== 'mind_map')
    );

const comparableBrief = (brief = {}) =>
    JSON.stringify({
        configured: Boolean(brief.configured),
        preset: brief.preset || 'custom',
        goal: brief.goal || '',
        audience: brief.audience || '',
        domain_context: brief.domain_context || '',
        desired_outputs: brief.desired_outputs || [],
        source_mode: brief.source_mode || 'source_plus_context',
        assumptions_allowed: Boolean(brief.assumptions_allowed),
        output_style: brief.output_style || 'technical_reference_map',
        node_types: brief.node_types || [],
        review_policy: brief.review_policy || [],
        review_rules: brief.review_rules || ''
    });

const WorkspaceBriefPanel = () => {
    const pushNode = modalStore((s) => s.pushNode);
    const workspaceBrief = useStore((s) => s.workspaceBrief) || {};
    const flowId = flowStore((s) => s.flow_id);
    const saveStatus = flowStore((s) => s.saveStatus);
    const lastSavedSnapshot = flowStore((s) => s.lastSavedSnapshot);
    const isBriefSet = hasBriefContent(workspaceBrief);
    const savedBrief = lastSavedSnapshot?.workspace_brief || {};
    const isBriefPersisted =
        Boolean(flowId) &&
        isBriefSet &&
        saveStatus === 'saved' &&
        comparableBrief(workspaceBrief) === comparableBrief(savedBrief);
    const sourceMode =
        SOURCE_MODE_LABELS[workspaceBrief.source_mode] || 'Source + context';
    const outputs = (workspaceBrief.desired_outputs || [])
        .map((output) => OUTPUT_LABELS[output] || output)
        .slice(0, 3);

    const openBrief = () => {
        pushNode(WorkspaceBriefModal);
    };

    return (
        <section className="workspace-brief-panel">
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
                        <span
                            className={
                                isBriefPersisted
                                    ? 'workspace-brief-panel-tag-persisted'
                                    : 'workspace-brief-panel-tag-local'
                            }
                        >
                            {isBriefPersisted ? 'Brief persisted' : 'Brief has local changes'}
                        </span>
                        {outputs.map((output) => (
                            <span key={output}>{output}</span>
                        ))}
                        {workspaceBrief.assumptions_allowed ? (
                            <span>Assumptions allowed</span>
                        ) : (
                            <span>Needs source backing</span>
                        )}
                        {workspaceBrief.review_policy?.includes(
                            'mark_uncited_needs_review'
                        ) ? (
                            <span>Uncited = Needs Review</span>
                        ) : null}
                    </div>
                </>
            ) : (
                <p className="workspace-brief-panel-empty">
                    Pick a preset, outputs, and source strictness before generating.
                </p>
            )}
        </section>
    );
};

export default WorkspaceBriefPanel;
