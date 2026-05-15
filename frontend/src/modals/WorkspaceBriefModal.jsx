import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import CROSSSvg from '../assets/cross.svg';
import LoadingModal from './LoadingModal';
import modalStore from '../stores/modalStore';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import { briefDraftLoading } from '../config/loadingStates';
import { createBriefDraftGraph } from '../utils/briefDraftGraph';
import {
    createOperationSnapshot,
    restoreOperationSnapshot
} from '../utils/operationSnapshots';

const OUTPUT_GROUPS = [
    {
        label: 'Visual',
        options: [
            { id: 'mind_map', label: 'Mind map' },
            { id: 'knowledge_graph', label: 'Knowledge graph' },
            { id: 'connections', label: 'Connections' },
            { id: 'flow_chart', label: 'Flow chart' },
            { id: 'outline', label: 'Outline' },
            { id: 'table', label: 'Table' }
        ]
    },
    {
        label: 'Actionable',
        options: [
            { id: 'tasks', label: 'Tasks' },
            { id: 'checklist', label: 'Checklist' },
            { id: 'chart_data', label: 'Chart data' }
        ]
    },
    {
        label: 'Review',
        options: [
            { id: 'sme_questions', label: 'SME questions' },
            { id: 'missing_info_report', label: 'Missing info report' },
            { id: 'source_coverage_report', label: 'Source coverage report' }
        ]
    },
];

const STRICTNESS_OPTIONS = [
    {
        id: 'source_only',
        label: 'Source-backed only',
        detail: 'Only create nodes supported by uploaded documents.',
        assumptionsAllowed: false
    },
    {
        id: 'source_plus_context',
        label: 'Source + my context',
        detail: 'Use uploaded documents plus the goal and context you provide.',
        assumptionsAllowed: false
    },
    {
        id: 'context_only',
        label: 'Exploratory',
        detail: 'Allow AI to infer missing structure and mark assumptions Needs Review.',
        assumptionsAllowed: true
    }
];

const REVIEW_POLICIES = [
    {
        id: 'mark_uncited_needs_review',
        label: 'Mark uncited nodes Needs Review'
    },
    {
        id: 'mark_low_confidence_needs_review',
        label: 'Mark low-confidence nodes Needs Review'
    },
    {
        id: 'generate_sme_questions',
        label: 'Generate SME questions for unclear sections'
    },
    {
        id: 'hide_uncited_from_exports',
        label: 'Hide uncited nodes from exports'
    }
];

const AUDIENCE_CHIPS = [
    'Designers',
    'BIM Managers',
    'Project Managers',
    'IT/Admin',
    'New hires',
    'SMEs'
];

const OUTPUT_STYLES = [
    { id: 'technical_reference_map', label: 'Technical reference map' },
    { id: 'project_execution_map', label: 'Project execution map' },
    { id: 'training_onboarding_map', label: 'Training/onboarding map' },
    { id: 'sop_checklist_map', label: 'SOP/checklist map' },
    { id: 'review_approval_map', label: 'Review/approval map' }
];

const DEFAULT_NODE_TYPES = [
    'category',
    'standard',
    'workflow',
    'requirement',
    'task',
    'reference',
    'definition',
    'question',
    'needs_review'
];

const PRESETS = [
    {
        id: 'autodesk_standards',
        label: 'Autodesk Standards',
        description: 'Source-cited standards, requirements, and SME review map.',
        goal: 'Generate a source-cited mind map of Autodesk building block documentation for electrical BIM users.',
        audience: 'Electrical BIM users, BIM managers, and design technology reviewers',
        desired_outputs: ['mind_map', 'outline', 'sme_questions', 'source_coverage_report'],
        source_mode: 'source_only',
        assumptions_allowed: false,
        output_style: 'technical_reference_map',
        node_types: ['category', 'standard', 'workflow', 'requirement', 'reference', 'question', 'needs_review'],
        review_policy: ['mark_uncited_needs_review', 'mark_low_confidence_needs_review', 'generate_sme_questions']
    },
    {
        id: 'revit_building_blocks',
        label: 'Revit Building Blocks',
        description: 'Templates, families, parameters, schedules, and QA/QC workflows.',
        goal: 'Create a practical Revit building-block reference map with source-backed concepts and reviewable implementation notes.',
        audience: 'Revit users, BIM managers, content authors, and QA/QC reviewers',
        desired_outputs: ['mind_map', 'checklist', 'missing_info_report'],
        source_mode: 'source_plus_context',
        assumptions_allowed: false,
        output_style: 'technical_reference_map',
        node_types: ['template', 'family', 'parameter', 'schedule', 'workflow', 'QA/QC', 'standard', 'exception'],
        review_policy: ['mark_uncited_needs_review', 'mark_low_confidence_needs_review']
    },
    {
        id: 'software_inventory',
        label: 'Software Inventory',
        description: 'Applications, owners, status, approvals, and task-ready structure.',
        goal: 'Convert source material into a software inventory map with ownership, status, and follow-up tasks.',
        audience: 'IT reviewers, BIM managers, application owners, and project teams',
        desired_outputs: ['table', 'tasks', 'source_coverage_report'],
        source_mode: 'source_plus_context',
        assumptions_allowed: false,
        output_style: 'project_execution_map',
        node_types: ['application', 'category', 'owner', 'license', 'approval_status', 'retired', 'task', 'needs_review'],
        review_policy: ['mark_uncited_needs_review', 'hide_uncited_from_exports']
    },
    {
        id: 'training_guide',
        label: 'Training Guide',
        description: 'A learning path with concepts, examples, checklist items, and questions.',
        goal: 'Turn source documents into a training and onboarding guide with concepts, procedures, examples, and review questions.',
        audience: 'New hires, trainers, BIM users, and team leads',
        desired_outputs: ['outline', 'checklist', 'sme_questions'],
        source_mode: 'source_plus_context',
        assumptions_allowed: false,
        output_style: 'training_onboarding_map',
        node_types: ['concept', 'procedure', 'example', 'question', 'task', 'definition', 'needs_review'],
        review_policy: ['mark_uncited_needs_review', 'generate_sme_questions']
    },
    {
        id: 'sop_workflow',
        label: 'SOP / Workflow',
        description: 'Steps, decisions, dependencies, roles, and checklist outputs.',
        goal: 'Generate a source-backed SOP and workflow map with decisions, dependencies, roles, and task-ready checklist items.',
        audience: 'Project teams, managers, reviewers, and process owners',
        desired_outputs: ['mind_map', 'tasks', 'checklist'],
        source_mode: 'source_plus_context',
        assumptions_allowed: false,
        output_style: 'sop_checklist_map',
        node_types: ['step', 'decision', 'dependency', 'role', 'requirement', 'task', 'needs_review'],
        review_policy: ['mark_uncited_needs_review', 'mark_low_confidence_needs_review']
    },
    {
        id: 'custom',
        label: 'Custom',
        description: 'Start light and let TraceSpace suggest the rest.',
        goal: '',
        audience: '',
        desired_outputs: ['mind_map'],
        source_mode: 'source_plus_context',
        assumptions_allowed: false,
        output_style: 'technical_reference_map',
        node_types: DEFAULT_NODE_TYPES,
        review_policy: ['mark_uncited_needs_review']
    }
];

const DEFAULT_BRIEF = {
    configured: false,
    preset: 'custom',
    goal: '',
    audience: '',
    domain_context: '',
    desired_outputs: ['mind_map'],
    source_mode: 'source_plus_context',
    assumptions_allowed: false,
    output_style: 'technical_reference_map',
    node_types: DEFAULT_NODE_TYPES,
    review_policy: ['mark_uncited_needs_review'],
    review_rules: ''
};

const allOutputOptions = OUTPUT_GROUPS.flatMap((group) => group.options);

const uniqueValues = (values) => Array.from(new Set(values.filter(Boolean)));

const findPreset = (presetId) =>
    PRESETS.find((preset) => preset.id === presetId) || PRESETS[PRESETS.length - 1];

const getSourceNames = (nodes) =>
    nodes
        .filter((node) => node.type === 'dataSource')
        .map((node) => {
            const data = node.data || {};
            return (
                data.file?.name ||
                data.filename ||
                data.title ||
                data.content ||
                data.data?.title ||
                data.data?.content
            );
        })
        .filter(Boolean);

const WorkspaceBriefModal = () => {
    const { setViewport } = useReactFlow();
    const popNode = modalStore((s) => s.popNode);
    const pushNode = modalStore((s) => s.pushNode);
    const nodes = useStore((s) => s.nodes);
    const edges = useStore((s) => s.edges);
    const setNodes = useStore((s) => s.setNodes);
    const setEdges = useStore((s) => s.setEdges);
    const trigger = useStore((s) => s.trigger);
    const setTrigger = useStore((s) => s.setTrigger);
    const workspaceBrief = useStore((s) => s.workspaceBrief);
    const setWorkspaceBrief = useStore((s) => s.setWorkspaceBrief);
    const viewport = useStore((s) => s.viewport);
    const setViewPort = useStore((s) => s.setViewPort);
    const flowId = flowStore((s) => s.flow_id);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const addActivity = useActivityStore((s) => s.addActivity);
    const updateActivity = useActivityStore((s) => s.updateActivity);
    const recordActivity = useActivityStore((s) => s.recordActivity);
    const [draft, setDraft] = useState({
        ...DEFAULT_BRIEF,
        ...(workspaceBrief || {}),
        desired_outputs: workspaceBrief?.desired_outputs?.length
            ? workspaceBrief.desired_outputs
            : DEFAULT_BRIEF.desired_outputs,
        node_types: workspaceBrief?.node_types?.length
            ? workspaceBrief.node_types
            : DEFAULT_BRIEF.node_types,
        review_policy: workspaceBrief?.review_policy?.length
            ? workspaceBrief.review_policy
            : DEFAULT_BRIEF.review_policy
    });
    const [saved, setSaved] = useState(false);
    const sourceNames = getSourceNames(nodes);

    const updateDraft = (key, value) => {
        setDraft((current) => ({ ...current, [key]: value }));
    };

    const applyPreset = (presetId) => {
        const preset = findPreset(presetId);
        setDraft((current) => ({
            ...current,
            ...preset,
            preset: preset.id,
            domain_context: current.domain_context,
            review_rules: current.review_rules
        }));
        setSaved(false);
    };

    const applyStrictness = (option) => {
        setDraft((current) => ({
            ...current,
            source_mode: option.id,
            assumptions_allowed: option.assumptionsAllowed
        }));
        setSaved(false);
    };

    const toggleListValue = (key, value) => {
        setDraft((current) => {
            const values = new Set(current[key] || []);
            if (values.has(value)) {
                values.delete(value);
            } else {
                values.add(value);
            }

            return {
                ...current,
                [key]: Array.from(values)
            };
        });
        setSaved(false);
    };

    const addAudienceChip = (audience) => {
        setDraft((current) => ({
            ...current,
            audience: uniqueValues([
                ...(current.audience || '')
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                audience
            ]).join(', ')
        }));
    };

    const suggestGoal = () => {
        const preset = findPreset(draft.preset);
        const sourceSummary = sourceNames.length
            ? ` using ${sourceNames.slice(0, 3).join(', ')}`
            : '';
        updateDraft(
            'goal',
            preset.goal ||
                `Generate a source-cited TraceSpace workspace${sourceSummary} that identifies key topics, decisions, review items, and next actions.`
        );
    };

    const suggestAudience = () => {
        const preset = findPreset(draft.preset);
        updateDraft(
            'audience',
            preset.audience || 'Project teams, reviewers, subject matter experts, and new contributors'
        );
    };

    const suggestContext = () => {
        const sourceSummary = sourceNames.length
            ? `Primary workspace sources: ${sourceNames.join(', ')}. `
            : '';
        updateDraft(
            'domain_context',
            `${sourceSummary}Prioritize source-cited structure, preserve uncertainties as review items, and avoid treating inferred content as verified evidence.`
        );
    };

    const recommendOutputs = () => {
        const preset = findPreset(draft.preset);
        setDraft((current) => ({
            ...current,
            desired_outputs: uniqueValues(preset.desired_outputs || ['mind_map'])
        }));
    };

    const suggestNodeTypes = () => {
        const preset = findPreset(draft.preset);
        setDraft((current) => ({
            ...current,
            node_types: uniqueValues(preset.node_types || DEFAULT_NODE_TYPES)
        }));
    };

    const normalizeBrief = () => ({
        ...draft,
        configured: true,
        goal: draft.goal.trim(),
        audience: draft.audience.trim(),
        domain_context: draft.domain_context.trim(),
        review_rules: draft.review_rules.trim(),
        desired_outputs: uniqueValues(draft.desired_outputs || []),
        node_types: uniqueValues(draft.node_types || []),
        review_policy: uniqueValues(draft.review_policy || [])
    });

    const saveBrief = () => {
        setWorkspaceBrief(normalizeBrief());
        if (flowId) {
            setSaveStatus('dirty');
        }
        recordActivity({
            type: 'brief_saved',
            title: 'Saved workspace brief',
            summary: normalizeBrief().goal || 'Updated TraceSpace setup.',
            metadata: {
                preset: normalizeBrief().preset,
                source_mode: normalizeBrief().source_mode
            }
        });
        setSaved(true);
    };

    const deriveFromBrief = () => {
        const normalizedBrief = normalizeBrief();
        const nextBrief = sourceNames.length
            ? normalizedBrief
            : {
                  ...normalizedBrief,
                  source_mode: 'context_only',
                  assumptions_allowed: true
              };
        const undoSnapshot = createOperationSnapshot({
            nodes,
            edges,
            viewport,
            workspaceBrief
        });
        const activityId = addActivity({
            type: 'brief_derive_started',
            title: 'Deriving from brief',
            detail: nextBrief.goal || nextBrief.preset,
            context: 'Creating reviewable starter nodes from the workspace brief.'
        });
        let canceled = false;
        let timeoutId;

        const restoreFromActivity = () => {
            restoreOperationSnapshot({
                snapshot: undoSnapshot,
                setNodes,
                setEdges,
                setWorkspaceBrief,
                setViewPort,
                setViewport
            });
            updateActivity(activityId, {
                status: 'completed',
                context: 'Brief draft was undone.',
                undo: undefined
            });
        };

        pushNode(LoadingModal, {
            ...briefDraftLoading(nextBrief),
            cancelLabel: 'Cancel draft',
            onCancel: () => {
                canceled = true;
                window.clearTimeout(timeoutId);
            updateActivity(activityId, {
                type: 'brief_derive_canceled',
                status: 'canceled',
                context: 'Brief derivation was canceled before applying.'
            });
                popNode();
            }
        });

        timeoutId = window.setTimeout(() => {
            if (canceled) {
                return;
            }

            const origin = {
                x: nodes.length ? Math.max(...nodes.map((node) => node.position?.x || 0)) + 560 : 80,
                y: nodes.length ? Math.min(...nodes.map((node) => node.position?.y || 0)) : 80
            };
            const draftGraph = createBriefDraftGraph({
                brief: nextBrief,
                flowId,
                origin
            });
            setWorkspaceBrief(nextBrief);
            setNodes([...nodes, ...draftGraph.nodes]);
            setEdges([...edges, ...draftGraph.edges]);
            setTrigger(!trigger);
            if (!nodes.length) {
                const nextViewport = { x: 70, y: 130, zoom: 0.55 };
                setViewPort(nextViewport);
                setViewport(nextViewport, { duration: 250 });
            }
            if (flowId) {
                setSaveStatus('dirty');
            }
            updateActivity(activityId, {
                type: 'brief_derive_completed',
                status: 'completed',
                context: 'Brief-derived nodes were added and marked for review.',
                node_ids: draftGraph.nodes.map((node) => node.id),
                undo: restoreFromActivity
            });
            popNode();
        }, 700);
    };

    const canGenerateDraft =
        draft.goal.trim().length > 0 ||
        draft.domain_context.trim().length > 0 ||
        draft.audience.trim().length > 0;

    return (
        <div className="modal-container workspace-brief-modal">
            <div className="title">
                <div>
                    <p>Build TraceSpace</p>
                </div>
                <img
                    src={CROSSSvg}
                    alt="Close TraceSpace setup"
                    onClick={() => popNode()}
                />
            </div>
            <p className="workspace-brief-note">
                Upload documents and tell TraceSpace what kind of workspace to generate.
                Uploaded sources remain the source of truth. Any generated node without
                a source reference will be marked Needs Review unless assumptions are
                explicitly allowed.
            </p>

            <section className="workspace-brief-section">
                <div className="workspace-brief-section-title">
                    <span>1</span>
                    <div>
                        <h3>Choose a starting point</h3>
                        <p>Presets give the AI a useful shape without making you write a prompt.</p>
                    </div>
                </div>
                <div className="workspace-brief-preset-grid">
                    {PRESETS.map((preset) => (
                        <button
                            key={preset.id}
                            type="button"
                            className={`workspace-brief-preset ${
                                draft.preset === preset.id ? 'workspace-brief-preset-active' : ''
                            }`}
                            onClick={() => applyPreset(preset.id)}
                        >
                            <strong>{preset.label}</strong>
                            <span>{preset.description}</span>
                        </button>
                    ))}
                </div>
            </section>

            <section className="workspace-brief-section">
                <div className="workspace-brief-section-title">
                    <span>2</span>
                    <div>
                        <h3>What should AI create?</h3>
                        <p>Choose generated outputs. Views are just lenses on accepted data after review.</p>
                    </div>
                </div>
                <div className="workspace-brief-output-groups">
                    {OUTPUT_GROUPS.map((group) => (
                        <fieldset key={group.label} className="workspace-brief-output-set">
                            <legend>{group.label}</legend>
                            {group.options.map((output) => (
                                <label key={output.id}>
                                    <input
                                        type="checkbox"
                                        checked={(draft.desired_outputs || []).includes(output.id)}
                                        onChange={() =>
                                            toggleListValue('desired_outputs', output.id)
                                        }
                                    />
                                    {output.label}
                                </label>
                            ))}
                        </fieldset>
                    ))}
                </div>
                <p className="workspace-brief-handoff-note">
                    Miro and monday are post-generation handoff actions: review the graph,
                    choose a branch or task set, preview the payload, then export.
                </p>
            </section>

            <section className="workspace-brief-section">
                <div className="workspace-brief-section-title">
                    <span>3</span>
                    <div>
                        <h3>How strict should source grounding be?</h3>
                        <p>Source mode is a policy, not a source. Citations still live on nodes.</p>
                    </div>
                </div>
                <div className="workspace-brief-strictness">
                    {STRICTNESS_OPTIONS.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className={`workspace-brief-strictness-card ${
                                draft.source_mode === option.id
                                    ? 'workspace-brief-strictness-card-active'
                                    : ''
                            }`}
                            onClick={() => applyStrictness(option)}
                        >
                            <strong>{option.label}</strong>
                            <span>{option.detail}</span>
                        </button>
                    ))}
                </div>
            </section>

            <section className="workspace-brief-section">
                <div className="workspace-brief-section-title">
                    <span>4</span>
                    <div>
                        <h3>Intent</h3>
                        <p>Use the buttons as preview suggestions, then edit anything.</p>
                    </div>
                </div>
                <div className="input-bar workspace-brief-field-with-action">
                    <div className="workspace-brief-label-row">
                        <label htmlFor="workspace-brief-goal">Goal</label>
                        <button type="button" onClick={suggestGoal}>
                            Suggest from setup
                        </button>
                    </div>
                    <textarea
                        id="workspace-brief-goal"
                        rows={3}
                        placeholder="Example: Generate a source-cited mind map of Autodesk building block documentation for electrical BIM users."
                        value={draft.goal}
                        onChange={(event) => updateDraft('goal', event.target.value)}
                    />
                </div>
                <div className="input-bar workspace-brief-field-with-action">
                    <div className="workspace-brief-label-row">
                        <label htmlFor="workspace-brief-audience">Audience</label>
                        <button type="button" onClick={suggestAudience}>
                            Infer likely audience
                        </button>
                    </div>
                    <input
                        id="workspace-brief-audience"
                        value={draft.audience}
                        onChange={(event) => updateDraft('audience', event.target.value)}
                    />
                    <div className="workspace-brief-chip-row">
                        {AUDIENCE_CHIPS.map((audience) => (
                            <button
                                key={audience}
                                type="button"
                                onClick={() => addAudienceChip(audience)}
                            >
                                {audience}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <details className="workspace-brief-advanced" open>
                <summary>Advanced context and review controls</summary>
                <div className="workspace-brief-grid">
                    <div className="input-bar">
                        <label htmlFor="workspace-brief-style">Output style</label>
                        <select
                            id="workspace-brief-style"
                            value={draft.output_style}
                            onChange={(event) => updateDraft('output_style', event.target.value)}
                        >
                            {OUTPUT_STYLES.map((style) => (
                                <option key={style.id} value={style.id}>
                                    {style.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="input-bar workspace-brief-field-with-action">
                        <div className="workspace-brief-label-row">
                            <label htmlFor="workspace-brief-domain">Domain context</label>
                            <button type="button" onClick={suggestContext}>
                                Generate context
                            </button>
                        </div>
                        <textarea
                            id="workspace-brief-domain"
                            rows={4}
                            value={draft.domain_context}
                            onChange={(event) =>
                                updateDraft('domain_context', event.target.value)
                            }
                        />
                    </div>
                </div>

                <div className="workspace-brief-subsection">
                    <div className="workspace-brief-label-row">
                        <h4>Node types to use</h4>
                        <button type="button" onClick={suggestNodeTypes}>
                            Suggest node types
                        </button>
                    </div>
                    <div className="workspace-brief-chip-row workspace-brief-chip-grid">
                        {uniqueValues([...DEFAULT_NODE_TYPES, ...(draft.node_types || [])]).map(
                            (nodeType) => (
                                <button
                                    key={nodeType}
                                    type="button"
                                    className={
                                        (draft.node_types || []).includes(nodeType)
                                            ? 'workspace-brief-chip-active'
                                            : ''
                                    }
                                    onClick={() => toggleListValue('node_types', nodeType)}
                                >
                                    {nodeType}
                                </button>
                            )
                        )}
                    </div>
                </div>

                <div className="workspace-brief-subsection">
                    <div className="workspace-brief-label-row">
                        <h4>Review policy</h4>
                        <button type="button" onClick={recommendOutputs}>
                            Recommend outputs
                        </button>
                    </div>
                    <div className="workspace-brief-review-grid">
                        {REVIEW_POLICIES.map((policy) => (
                            <label key={policy.id} className="workspace-brief-toggle">
                                <input
                                    type="checkbox"
                                    checked={(draft.review_policy || []).includes(policy.id)}
                                    onChange={() => toggleListValue('review_policy', policy.id)}
                                />
                                {policy.label}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="input-bar">
                    <label htmlFor="workspace-brief-review">Extra review rules</label>
                    <textarea
                        id="workspace-brief-review"
                        rows={3}
                        placeholder="Example: Flag uncited implementation claims, ask SMEs to review ambiguous requirements, and keep assumptions out of exports."
                        value={draft.review_rules}
                        onChange={(event) => updateDraft('review_rules', event.target.value)}
                    />
                </div>
            </details>

            {saved ? (
                <p className="workspace-brief-saved">
                    TraceSpace setup saved. Autosave will persist it with this workspace.
                </p>
            ) : null}
            <div className="buttons">
                <button id="cancel" type="button" onClick={() => popNode()}>
                    Close
                </button>
                <button
                    className="workspace-brief-draft-button"
                    type="button"
                    onClick={deriveFromBrief}
                    disabled={!canGenerateDraft}
                >
                    Derive from brief
                </button>
                <button id="add" type="button" onClick={saveBrief}>
                    Save setup
                </button>
            </div>
        </div>
    );
};

export { allOutputOptions };
export default WorkspaceBriefModal;
