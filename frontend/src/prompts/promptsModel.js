export const supportedOpenAIModels = ['gpt-5.4', 'gpt-5.5'];
export const defaultOpenAIModel = 'gpt-5.5';

export const AI_ACTION_SCOPES = {
    node: 'node',
    nodes: 'nodes',
    branch: 'branch',
    source: 'source',
    workspace: 'workspace'
};

export const nodeAiActions = [
    { id: 'expand_this_node', label: 'Expand this node' },
    { id: 'ask_follow_up', label: 'Ask follow-up' },
    { id: 'generate_child_nodes', label: 'Generate child nodes' },
    { id: 'convert_to_checklist', label: 'Convert to checklist' },
    { id: 'create_sme_questions', label: 'Create SME questions' },
    { id: 'find_missing_source_support', label: 'Find missing source support' },
    { id: 'assess_standards_completeness', label: 'Assess standards completeness' },
    { id: 'interpret_table_data', label: 'Interpret table/data' },
    { id: 'generate_tasks', label: 'Generate tasks' },
    { id: 'custom_prompt', label: 'Custom prompt' }
];

export const branchAiActions = [
    { id: 'summarize_branch', label: 'Summarize branch' },
    { id: 'reorganize_branch', label: 'Reorganize branch' },
    { id: 'split_branch_into_categories', label: 'Split branch into categories' },
    { id: 'assess_standards_completeness', label: 'Assess standards completeness' },
    { id: 'create_team_roadmap', label: 'Create team roadmap' },
    { id: 'find_process_bottlenecks', label: 'Find process bottlenecks' },
    { id: 'find_duplicate_tools', label: 'Find software overlap' },
    { id: 'find_ownership_gaps', label: 'Find ownership gaps' },
    {
        id: 'find_unsupported_business_critical_systems',
        label: 'Find unsupported business-critical systems'
    },
    { id: 'generate_tasks', label: 'Generate tasks' },
    { id: 'generate_checklist', label: 'Generate checklist' },
    { id: 'create_30_60_90_day_improvement_plan', label: 'Create 30/60/90 day plan' },
    { id: 'create_stakeholder_review_package', label: 'Create stakeholder review package' },
    { id: 'generate_training_outline', label: 'Generate training outline' },
    { id: 'export_branch_as_sop_draft', label: 'Export branch as SOP draft' },
    { id: 'find_gaps', label: 'Find gaps' },
    { id: 'create_sme_questions', label: 'Create SME questions' },
    { id: 'custom_prompt', label: 'Custom prompt' }
];

export const workspaceAiActions = [
    { id: 'suggest_follow_up_questions', label: 'Suggest follow-up questions' },
    { id: 'find_missing_source_support', label: 'Find missing source support' },
    { id: 'find_unsupported_assumptions', label: 'Find unsupported assumptions' },
    { id: 'find_duplicate_overlapping_nodes', label: 'Find duplicate or overlapping nodes' },
    { id: 'assess_standards_completeness', label: 'Assess standards completeness' },
    { id: 'create_team_roadmap', label: 'Create team roadmap' },
    { id: 'find_process_bottlenecks', label: 'Find process bottlenecks' },
    { id: 'find_duplicate_tools', label: 'Find software overlap' },
    { id: 'find_ownership_gaps', label: 'Find ownership gaps' },
    {
        id: 'find_unsupported_business_critical_systems',
        label: 'Find unsupported business-critical systems'
    },
    { id: 'create_30_60_90_day_improvement_plan', label: 'Create 30/60/90 day plan' },
    { id: 'create_stakeholder_review_package', label: 'Create stakeholder review package' },
    { id: 'create_sme_questions', label: 'Create SME questions' },
    { id: 'generate_tasks', label: 'Generate tasks' },
    { id: 'generate_checklist', label: 'Generate checklist' },
    { id: 'interpret_table_data', label: 'Interpret table/data' },
    { id: 'generate_training_outline', label: 'Generate training outline' },
    { id: 'export_branch_as_sop_draft', label: 'Export branch as SOP draft' },
    { id: 'custom_prompt', label: 'Custom prompt' }
];

export const sourceAiActions = [
    { id: 'generate_child_nodes', label: 'Create mind map' },
    { id: 'interpret_table_data', label: 'Create table' },
    { id: 'generate_tasks', label: 'Create tasks' },
    { id: 'summarize_branch', label: 'Summarize source' },
    { id: 'find_missing_source_support', label: 'Review source coverage' },
    { id: 'assess_standards_completeness', label: 'Assess standards completeness' },
    { id: 'create_team_roadmap', label: 'Create team roadmap' },
    { id: 'create_sme_questions', label: 'Create source review questions' },
    { id: 'custom_prompt', label: 'Custom prompt' }
];

export const sourceFirstActionPresets = [
    {
        id: 'source_to_mind_map',
        label: 'Create mind map',
        description: 'Build reviewable branches from selected source sections.',
        prompt: 'Create a source-backed mind map from the selected source sections. Group the main ideas into clear branches, use only supplied source references, preserve those refs exactly, and mark unsupported inferences as needs_review.',
        visual: 'mind_map',
        roleId: 'workflow-mapper',
        actionId: 'generate_child_nodes',
        changeIntent: 'supplement',
        availability: 'source_only'
    },
    {
        id: 'source_to_table',
        label: 'Create table',
        description: 'Extract structured rows, fields, and caveats.',
        prompt: 'Create a table from the selected source sections. Normalize the key rows and columns, include source-backed values only, preserve supplied refs exactly, and list caveats or missing fields separately.',
        visual: 'table',
        roleId: 'data-table-interpreter',
        actionId: 'interpret_table_data',
        changeIntent: 'supplement',
        availability: 'source_only'
    },
    {
        id: 'source_entities_connections',
        label: 'Find entities/connections',
        description: 'Extract people, systems, requirements, relationships, and dependencies.',
        prompt: 'Find the important entities and connections in the selected source sections. Include relationship types, rationale, confidence, only supplied source references, and review flags for inferred links.',
        visual: 'knowledge_graph',
        roleId: 'standards-extractor',
        actionId: 'custom_prompt',
        changeIntent: 'supplement',
        availability: 'always'
    },
    {
        id: 'source_aec_sow_deliverables',
        label: 'AEC SOW plan',
        description: 'Extract disciplines, deliverables, dependencies, risks, decisions, and handoff tasks.',
        prompt: 'Extract an AEC SOW delivery plan from the selected source sections. Include disciplines, deliverables, phases or milestones, dependencies, timeline cues, risks, missing information, owner decisions, only supplied source references, assumptions, and Miro or monday.com handoff notes.',
        visual: 'knowledge_graph',
        roleId: 'aec-sow-deliverables',
        actionId: 'custom_prompt',
        changeIntent: 'supplement',
        availability: 'always'
    },
    {
        id: 'source_to_tasks',
        label: 'Create tasks',
        description: 'Turn requirements and decisions into reviewable work items.',
        prompt: 'Create tasks from the selected source sections. Include task title, acceptance criteria, owner to assign, dependencies, due-date cues when present, supplied source references, and needs_review flags for assumptions.',
        visual: 'tasks',
        roleId: 'task-planner',
        actionId: 'generate_tasks',
        changeIntent: 'supplement',
        availability: 'source_only'
    },
    {
        id: 'source_summary',
        label: 'Summarize source',
        description: 'Summarize the selected sections with evidence and open questions.',
        prompt: 'Summarize the selected source sections. Include the key points, decisions, risks, named entities, source-backed facts, supplied source references, and follow-up questions.',
        visual: 'outline',
        roleId: 'research-assistant',
        actionId: 'summarize_branch',
        changeIntent: 'compare',
        availability: 'always'
    },
    {
        id: 'source_compare_workspace',
        label: 'Compare to workspace',
        description: 'Compare selected source sections with the current workspace graph.',
        prompt: 'Compare the selected source sections to the current workspace. Identify matching content, source-only sections, contradictions, weak citations, and suggested updates or additions. Use only supplied refs.',
        visual: 'source_coverage',
        roleId: 'source-ref-repair',
        actionId: 'find_missing_source_support',
        changeIntent: 'compare',
        availability: 'graph'
    },
    {
        id: 'source_supplement_workspace',
        label: 'Supplement workspace',
        description: 'Add source-backed candidate branches without replacing current work.',
        prompt: 'Supplement the current workspace with source-backed additions from the selected source sections. Preserve existing graph structure, add only well-supported candidates with supplied refs, and mark assumptions as needs_review.',
        visual: 'mind_map',
        roleId: 'workflow-mapper',
        actionId: 'generate_child_nodes',
        changeIntent: 'supplement',
        availability: 'graph'
    },
    {
        id: 'source_reconcile_workspace',
        label: 'Reconcile source',
        description: 'Find citation repairs and source-only sections for review.',
        prompt: 'Reconcile the selected source sections with the current workspace graph. Match source-backed content to existing nodes, identify source-only sections, flag conflicts, and propose citation repairs using only supplied refs.',
        visual: 'source_coverage',
        roleId: 'source-ref-repair',
        actionId: 'find_missing_source_support',
        changeIntent: 'update',
        availability: 'graph',
        reconciliation: true
    }
];

export const starterTransformations = [
    {
        id: 'sop_to_checklist',
        label: 'SOP to checklist',
        description: 'Convert procedure language into verification-ready checks.',
        prompt: 'Turn this SOP or procedure into a source-backed checklist with ordered checks, evidence requirements, exceptions, owners, and closeout criteria.',
        visual: 'checklist',
        roleId: 'training-guide-builder',
        actionId: 'generate_checklist',
        scopes: ['node', 'branch', 'workspace', 'source']
    },
    {
        id: 'pdf_to_training_outline',
        label: 'PDF to training outline',
        description: 'Build modules, objectives, practice, and assessment points.',
        prompt: 'Create a training outline from the selected PDF or source context with learning goals, module sequence, examples, practice activities, and checks for understanding.',
        visual: 'outline',
        roleId: 'training-guide-builder',
        actionId: 'generate_training_outline',
        scopes: ['branch', 'workspace', 'source']
    },
    {
        id: 'requirements_to_tasks',
        label: 'Requirements to tasks',
        description: 'Turn requirements into accountable implementation work.',
        prompt: 'Convert these requirements into task-ready work items with owners to assign, acceptance criteria, dependencies, due-date cues, and review flags for unsupported assumptions.',
        visual: 'tasks',
        roleId: 'task-planner',
        actionId: 'generate_tasks',
        scopes: ['node', 'branch', 'workspace']
    },
    {
        id: 'source_coverage_report',
        label: 'Source coverage',
        description: 'Find claims that need citations or stronger evidence.',
        prompt: 'Create a source coverage report that lists supported claims, unsupported claims, weak citations, missing source references, and recommended repair actions.',
        visual: 'source_coverage',
        roleId: 'source-ref-repair',
        actionId: 'find_missing_source_support',
        scopes: ['node', 'branch', 'workspace', 'source']
    },
    {
        id: 'sme_review_packet',
        label: 'SME packet',
        description: 'Package reviewer questions by evidence gap and decision.',
        prompt: 'Create an SME review packet with grouped questions, the reason each question matters, suggested reviewers, source gaps, decisions needed, and items that must remain needs_review.',
        visual: 'sme_questions',
        roleId: 'sme-question-generator',
        actionId: 'create_sme_questions',
        scopes: ['node', 'branch', 'workspace', 'source']
    },
    {
        id: 'implementation_handoff_package',
        label: 'Handoff package',
        description: 'Prepare accepted work for implementation or integration.',
        prompt: 'Create an implementation handoff package with scope summary, ready items, blocked items, owners, dependencies, source references, assumptions, and next actions for monday or Miro handoff.',
        visual: 'implementation_handoff_package',
        roleId: 'integration-readiness-reviewer',
        actionId: 'custom_prompt',
        scopes: ['branch', 'workspace']
    },
    {
        id: 'aec_sow_to_delivery_graph',
        label: 'AEC SOW plan',
        description: 'Map scope into disciplines, deliverables, dependencies, risks, and handoff tasks.',
        prompt: 'Create an AEC SOW delivery plan with disciplines, deliverables, phase or timeline cues, dependencies, risks, missing information, owner decisions, source references, assumptions, and Miro or monday.com handoff notes.',
        visual: 'knowledge_graph',
        roleId: 'aec-sow-deliverables',
        actionId: 'custom_prompt',
        scopes: ['branch', 'workspace', 'source']
    },
    {
        id: 'process_to_flowchart',
        label: 'Process to flowchart',
        description: 'Map steps, decisions, dependencies, and handoffs.',
        prompt: 'Turn this process into a flowchart with ordered steps, decision points, dependencies, handoffs, exception paths, and source-backed review notes.',
        visual: 'flow_chart',
        roleId: 'workflow-mapper',
        actionId: 'custom_prompt',
        scopes: ['node', 'branch', 'workspace', 'source']
    },
    {
        id: 'table_to_decision_matrix',
        label: 'Table to matrix',
        description: 'Convert structured source data into a usable table view.',
        prompt: 'Convert this table or structured source into a decision matrix with normalized columns, key rows, caveats, anomalies, and follow-up tasks.',
        visual: 'table',
        roleId: 'data-table-interpreter',
        actionId: 'interpret_table_data',
        scopes: ['node', 'branch', 'workspace']
    },
    {
        id: 'risk_gap_review',
        label: 'Risk gap review',
        description: 'Surface missing, contradictory, or risky content.',
        prompt: 'Review this context for risks, gaps, contradictions, unsupported assumptions, missing decisions, and source-backed next steps.',
        visual: 'review_annotations',
        roleId: 'gap-analyst',
        actionId: 'find_gaps',
        scopes: ['node', 'branch', 'workspace', 'source']
    },
    {
        id: 'meeting_notes_to_kanban',
        label: 'Notes to Kanban',
        description: 'Organize notes into a delivery board.',
        prompt: 'Turn these meeting notes into a Kanban-ready plan with backlog, in-progress candidates, blocked items, decisions, owners, and follow-up questions.',
        visual: 'kanban',
        roleId: 'task-planner',
        actionId: 'generate_tasks',
        scopes: ['branch', 'workspace']
    },
    {
        id: 'branch_to_sop_draft',
        label: 'Branch to SOP',
        description: 'Draft SOP purpose, scope, steps, controls, and exceptions.',
        prompt: 'Export this branch as an SOP draft with purpose, scope, prerequisites, ordered procedure steps, controls, evidence, exceptions, and review notes.',
        visual: 'outline',
        roleId: 'training-guide-builder',
        actionId: 'export_branch_as_sop_draft',
        scopes: ['branch', 'workspace']
    },
    {
        id: 'executive_summary',
        label: 'Executive summary',
        description: 'Package reviewed context into a leadership decision memo.',
        prompt: 'Create a leadership-ready executive business case from this context. Lead with the recommendation or decision requested, then cover why now, proposed pilot or scope, expected business value, governance and risk controls, planning-level investment or resource assumptions, success metrics, and the go/no-go decision gate. Distinguish existing capability from new investment, avoid hype, and keep unsupported costs, ROI, dates, or claims clearly marked for review.',
        visual: 'executive_summary',
        roleId: 'enterprise-readiness-planner',
        actionId: 'create_stakeholder_review_package',
        scopes: ['branch', 'workspace']
    },
    {
        id: 'news_article',
        label: 'News article',
        description: 'Draft an article-style update with evidence and attribution.',
        prompt: 'Draft a news article from this context with a headline, lede, concise body sections, attributed facts, source notes, and a clear separation between verified facts and assumptions.',
        visual: 'news_article',
        roleId: 'research-assistant',
        actionId: 'custom_prompt',
        scopes: ['branch', 'workspace', 'source']
    },
    {
        id: 'document_to_knowledge_graph',
        label: 'Document to graph',
        description: 'Extract entities, relationships, dependencies, and refs.',
        prompt: 'Create a knowledge graph from this document context with key entities, relationships, dependencies, conflicts, source references, and review flags.',
        visual: 'knowledge_graph',
        roleId: 'standards-extractor',
        actionId: 'custom_prompt',
        scopes: ['branch', 'workspace', 'source']
    },
    {
        id: 'standards_completeness_review',
        label: 'Standards completeness',
        description: 'Check a folder or source set for missing standards and weak coverage.',
        prompt: 'Review these standards files for completeness. Identify expected sections, documented items, missing or stale guidance, contradictions, weak source coverage, ownership gaps, and SME questions. For Revit or BIM standards, include templates, families, parameters, views, sheets, worksharing, naming, QA/QC, content ownership, and training/support coverage when relevant.',
        visual: 'missing_info_report',
        roleId: 'standards-completeness-reviewer',
        actionId: 'assess_standards_completeness',
        scopes: ['node', 'branch', 'workspace', 'source']
    },
    {
        id: 'complex_issue_team_roadmap',
        label: 'Issue to roadmap',
        description: 'Turn dense source context into a team-facing roadmap.',
        prompt: 'Turn this complex issue into a roadmap my team can understand. Include plain-language context, workstreams, decisions needed, dependencies, risks, milestones, owners to assign, source-backed facts, assumptions, and a 30/60/90 style next-step plan.',
        visual: 'outline',
        roleId: 'roadmap-planner',
        actionId: 'create_team_roadmap',
        scopes: ['branch', 'workspace', 'source']
    },
    {
        id: 'reconcile_source_with_workspace',
        label: 'Reconcile source',
        description: 'Compare uploaded source material against the current graph.',
        prompt: 'Reconcile the selected source material with the current workspace graph. Match source-backed content to existing nodes, identify source-only sections to add, flag generated assumptions that conflict with the source, suggest citation repairs, and separate recommendations into update matching nodes, supplement graph, replace branch, or keep both for comparison.',
        visual: 'source_coverage',
        roleId: 'source-ref-repair',
        actionId: 'find_missing_source_support',
        scopes: ['workspace', 'source']
    },
    {
        id: 'specialize_branch',
        label: 'Specialize branch',
        description: 'Make a node or branch specific to a domain or audience.',
        prompt: 'Specialize this selected node or branch for the requested domain. Preserve the useful existing structure, rewrite generic nodes into domain-specific claims, add missing domain-specific child nodes, keep source-backed content intact, and mark new assumptions as needs_review.',
        visual: 'mind_map',
        roleId: 'workflow-mapper',
        actionId: 'custom_prompt',
        scopes: ['node', 'branch']
    },
    {
        id: 'find_process_bottlenecks',
        label: 'Process bottlenecks',
        description: 'Surface delays, rework loops, queues, and handoff friction.',
        prompt: 'Find process bottlenecks in this enterprise workflow. Identify the impacted step or team, symptom, likely cause, owner or decision needed, source support, and priority for review.',
        visual: 'review_annotations',
        roleId: 'enterprise-process-analyst',
        actionId: 'find_process_bottlenecks',
        scopes: ['branch', 'workspace']
    },
    {
        id: 'find_duplicate_tools',
        label: 'Software overlap',
        description: 'Compare overlapping applications, systems, capabilities, licensing, and ownership.',
        prompt: 'Create a software overlap and rationalization report for this workspace. Compare applications by category, business function, supported workflows, user groups, owners, approval/security status, integrations, license type, usage or ServiceDesk signals, replacement/retired status, source support, confidence, assumptions, and recommended owner review. Use "potential overlap" language unless the evidence proves a duplicate.',
        visual: 'software_overlap_report',
        roleId: 'enterprise-tool-rationalization',
        actionId: 'find_duplicate_tools',
        scopes: ['branch', 'workspace']
    },
    {
        id: 'find_ownership_gaps',
        label: 'Ownership gaps',
        description: 'Find unowned systems, decisions, tasks, and review loops.',
        prompt: 'Find ownership gaps across this enterprise context. Flag systems, processes, decisions, and tasks with unclear accountable owners, missing backup owners, weak review cadence, or unresolved escalation path.',
        visual: 'review_annotations',
        roleId: 'enterprise-process-analyst',
        actionId: 'find_ownership_gaps',
        scopes: ['branch', 'workspace']
    },
    {
        id: 'find_unsupported_business_critical_systems',
        label: 'Unsupported critical systems',
        description: 'Find critical systems with weak evidence, ownership, or support.',
        prompt: 'Find unsupported business-critical systems. Identify criticality rationale, missing source evidence, owner gaps, support or recovery gaps, integration dependencies, user impact, and review priority.',
        visual: 'source_coverage',
        roleId: 'enterprise-tool-rationalization',
        actionId: 'find_unsupported_business_critical_systems',
        scopes: ['branch', 'workspace']
    },
    {
        id: 'create_30_60_90_day_improvement_plan',
        label: '30/60/90 plan',
        description: 'Turn findings into phased enterprise improvement work.',
        prompt: 'Create a 30/60/90 day improvement plan from this enterprise readiness context. Include phased outcomes, owners to assign, dependencies, evidence gaps, quick wins, governance checkpoints, and measurable success criteria.',
        visual: 'tasks',
        roleId: 'enterprise-readiness-planner',
        actionId: 'create_30_60_90_day_improvement_plan',
        scopes: ['branch', 'workspace']
    },
    {
        id: 'create_stakeholder_review_package',
        label: 'Stakeholder package',
        description: 'Package findings, decisions, risks, and review asks.',
        prompt: 'Create a stakeholder review package for enterprise readiness. Start with the recommendation or leadership decision requested, then include why now, key findings, expected business value, governance and risk controls, decisions needed, owner asks, evidence gaps, success metrics, proposed agenda, and follow-up actions.',
        visual: 'presentation_sections',
        roleId: 'enterprise-readiness-planner',
        actionId: 'create_stakeholder_review_package',
        scopes: ['branch', 'workspace']
    }
];

export const TraceSpacePromptProfiles = [
    {
        id: 'standards-extractor',
        label: 'Standards Extractor',
        group: 'TraceSpace',
        description: 'Extract requirements, definitions, controls, and cited standard language.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: [
            'expand_this_node',
            'generate_child_nodes',
            'find_missing_source_support',
            'assess_standards_completeness',
            'summarize_branch',
            'find_gaps',
            'find_unsupported_assumptions',
            'custom_prompt'
        ],
        preferredActions: ['assess_standards_completeness', 'expand_this_node', 'find_missing_source_support']
    },
    {
        id: 'standards-completeness-reviewer',
        label: 'Standards Completeness Reviewer',
        group: 'TraceSpace',
        description: 'Check grouped standards or technical files for missing, weak, stale, or contradictory guidance.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: [
            'assess_standards_completeness',
            'find_missing_source_support',
            'find_gaps',
            'create_sme_questions',
            'custom_prompt'
        ],
        preferredActions: ['assess_standards_completeness', 'find_missing_source_support']
    },
    {
        id: 'roadmap-planner',
        label: 'Roadmap Planner',
        group: 'TraceSpace',
        description: 'Turn complex source material into a team-facing roadmap, milestones, and decision path.',
        scopes: ['branch', 'workspace', 'source'],
        supportedActions: [
            'create_team_roadmap',
            'generate_tasks',
            'generate_checklist',
            'create_sme_questions',
            'custom_prompt'
        ],
        preferredActions: ['create_team_roadmap', 'generate_tasks']
    },
    {
        id: 'aec-sow-deliverables',
        label: 'AEC SOW Deliverables Planner',
        group: 'TraceSpace AEC',
        description: 'Turn AEC scopes, proposals, standards, and meeting context into delivery maps, risks, decisions, and handoff-ready work.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: [
            'expand_this_node',
            'generate_child_nodes',
            'create_team_roadmap',
            'generate_tasks',
            'generate_checklist',
            'find_gaps',
            'create_sme_questions',
            'custom_prompt'
        ],
        preferredActions: ['custom_prompt', 'generate_tasks', 'find_gaps', 'create_team_roadmap']
    },
    {
        id: 'workflow-mapper',
        label: 'Workflow Mapper',
        group: 'TraceSpace',
        description: 'Turn procedures and branches into workflow steps and dependencies.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: [
            'expand_this_node',
            'generate_child_nodes',
            'reorganize_branch',
            'split_branch_into_categories',
            'find_gaps',
            'custom_prompt'
        ],
        preferredActions: ['generate_child_nodes', 'reorganize_branch', 'split_branch_into_categories']
    },
    {
        id: 'training-guide-builder',
        label: 'Training Guide Builder',
        group: 'TraceSpace',
        description: 'Draft learning outlines, checklists, and training-friendly branch structure.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: [
            'convert_to_checklist',
            'generate_checklist',
            'generate_training_outline',
            'export_branch_as_sop_draft',
            'custom_prompt'
        ],
        preferredActions: ['convert_to_checklist', 'generate_checklist', 'generate_training_outline']
    },
    {
        id: 'sme-question-generator',
        label: 'SME Question Generator',
        group: 'TraceSpace',
        description: 'Create review questions where source support or expert judgment is needed.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: [
            'ask_follow_up',
            'create_sme_questions',
            'find_gaps',
            'suggest_follow_up_questions',
            'custom_prompt'
        ],
        preferredActions: ['create_sme_questions', 'ask_follow_up', 'suggest_follow_up_questions']
    },
    {
        id: 'task-planner',
        label: 'Task Planner',
        group: 'TraceSpace',
        description: 'Convert map structure into accountable tasks and checklists.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: [
            'generate_tasks',
            'convert_to_checklist',
            'generate_checklist',
            'custom_prompt'
        ],
        preferredActions: ['generate_tasks', 'convert_to_checklist', 'generate_checklist']
    },
    {
        id: 'data-table-interpreter',
        label: 'Data/Table Interpreter',
        group: 'TraceSpace',
        description: 'Explain table-like node data and surface useful rows, fields, or anomalies.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: ['interpret_table_data', 'generate_tasks', 'custom_prompt'],
        preferredActions: ['interpret_table_data', 'generate_child_nodes']
    },
    {
        id: 'gap-analyst',
        label: 'Gap Analyst',
        group: 'TraceSpace',
        description: 'Find missing, duplicate, unsupported, or contradictory graph content.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: [
            'find_missing_source_support',
            'find_gaps',
            'find_unsupported_assumptions',
            'find_duplicate_overlapping_nodes',
            'custom_prompt'
        ],
        preferredActions: ['find_gaps', 'find_unsupported_assumptions', 'find_duplicate_overlapping_nodes']
    },
    {
        id: 'source-ref-repair',
        label: 'Source Ref Repair',
        group: 'TraceSpace',
        description: 'Suggest source-reference fixes while keeping node claims intact.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: [
            'find_missing_source_support',
            'find_unsupported_assumptions',
            'generate_child_nodes',
            'custom_prompt'
        ],
        preferredActions: ['find_missing_source_support', 'find_unsupported_assumptions']
    },
    {
        id: 'enterprise-process-analyst',
        label: 'Enterprise Process Analyst',
        group: 'TraceSpace Enterprise',
        description: 'Find process bottlenecks, handoff friction, and ownership gaps.',
        scopes: ['branch', 'workspace'],
        supportedActions: [
            'find_process_bottlenecks',
            'find_ownership_gaps',
            'find_gaps',
            'create_sme_questions',
            'custom_prompt'
        ],
        preferredActions: ['find_process_bottlenecks', 'find_ownership_gaps']
    },
    {
        id: 'enterprise-tool-rationalization',
        label: 'Enterprise Tool Rationalization',
        group: 'TraceSpace Enterprise',
        description: 'Find software overlap, rationalization candidates, and unsupported business-critical systems.',
        scopes: ['branch', 'workspace'],
        supportedActions: [
            'find_duplicate_tools',
            'find_unsupported_business_critical_systems',
            'find_missing_source_support',
            'find_gaps',
            'custom_prompt'
        ],
        preferredActions: [
            'find_duplicate_tools',
            'find_unsupported_business_critical_systems'
        ]
    },
    {
        id: 'enterprise-readiness-planner',
        label: 'Enterprise Readiness Planner',
        group: 'TraceSpace Enterprise',
        description: 'Create phased improvement plans and stakeholder review packages.',
        scopes: ['branch', 'workspace'],
        supportedActions: [
            'create_30_60_90_day_improvement_plan',
            'create_stakeholder_review_package',
            'generate_tasks',
            'generate_checklist',
            'custom_prompt'
        ],
        preferredActions: [
            'create_30_60_90_day_improvement_plan',
            'create_stakeholder_review_package'
        ]
    },
    {
        id: 'integration-readiness-reviewer',
        label: 'Integration Readiness Reviewer',
        group: 'TraceSpace',
        description: 'Review whether branch nodes are ready for downstream handoff.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: [
            'generate_tasks',
            'find_gaps',
            'find_unsupported_assumptions',
            'custom_prompt'
        ],
        preferredActions: ['generate_tasks', 'find_gaps', 'find_unsupported_assumptions']
    },
    {
        id: 'custom',
        label: 'Custom',
        group: 'TraceSpace',
        description: 'Use your own instruction while preserving preview-first graph changes.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: ['custom_prompt'],
        preferredActions: ['custom_prompt']
    }
];

export const legacyPromptProfiles = [
    {
        id: 'strategic-advisor',
        label: 'Strategic Advisor',
        group: 'General',
        description: 'Legacy general-purpose planning and strategy persona.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: ['ask_follow_up', 'summarize_branch', 'suggest_follow_up_questions', 'custom_prompt'],
        legacy: true
    },
    {
        id: 'research-assistant',
        label: 'Research Assistant',
        group: 'General',
        description: 'Legacy research, learning, writing, and organization persona.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: ['ask_follow_up', 'summarize_branch', 'suggest_follow_up_questions', 'custom_prompt'],
        legacy: true
    },
    {
        id: 'productivity-coach',
        label: 'Productivity Coach',
        group: 'General',
        description: 'Legacy productivity, focus, and prioritization persona.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: ['generate_tasks', 'convert_to_checklist', 'generate_checklist', 'custom_prompt'],
        legacy: true
    },
    {
        id: 'data-interpreter',
        label: 'Data Interpreter',
        group: 'General',
        description: 'Legacy general data interpretation persona.',
        scopes: ['node', 'branch', 'workspace', 'source'],
        supportedActions: ['interpret_table_data', 'find_gaps', 'custom_prompt'],
        legacy: true
    },
    {
        id: 'custom-prompts',
        label: 'Custom Prompts',
        group: 'General',
        description: 'Legacy free-form prompt entry.',
        scopes: ['node', 'branch', 'workspace'],
        supportedActions: ['custom_prompt'],
        legacy: true
    }
];

export const legacyPersonaNames = legacyPromptProfiles.map((profile) => profile.label);

export const aiActionProfiles = [...TraceSpacePromptProfiles, ...legacyPromptProfiles];

export const getPromptProfilesForScope = (scope) =>
    aiActionProfiles.filter((profile) =>
        scope === AI_ACTION_SCOPES.nodes
            ? profile.scopes.includes(AI_ACTION_SCOPES.branch) ||
              profile.scopes.includes(AI_ACTION_SCOPES.node)
            : profile.scopes.includes(scope)
    );

export const getActionsForScope = (scope) => {
    if (scope === AI_ACTION_SCOPES.nodes) {
        return branchAiActions;
    }
    if (scope === AI_ACTION_SCOPES.branch) {
        return branchAiActions;
    }
    if (scope === AI_ACTION_SCOPES.workspace) {
        return workspaceAiActions;
    }
    if (scope === AI_ACTION_SCOPES.source) {
        return sourceAiActions;
    }
    return nodeAiActions;
};

export const getActionsForProfileAndScope = (profile, scope) => {
    const scopeActions = getActionsForScope(scope);
    if (!profile?.supportedActions?.length) {
        return scopeActions;
    }
    return scopeActions.filter((action) => profile.supportedActions.includes(action.id));
};

export const getDefaultActionForProfile = (profile, scope) => {
    const actions = getActionsForProfileAndScope(profile, scope);
    const preferred = profile?.preferredActions?.find((actionId) =>
        actions.some((action) => action.id === actionId)
    );
    return preferred || actions[0]?.id || '';
};

export const getFollowUpSuggestions = (profile, action, contextLabel, scope) => {
    const target = contextLabel || (scope === 'workspace' ? 'this workspace' : `this ${scope}`);
    const label = action?.label?.toLowerCase() || 'review';

    if (profile?.id === 'custom') {
        return [
            `Focus only on ${target} and list assumptions separately.`,
            `Create a concise preview with source-backed items first.`,
            `Flag anything that should become needs_review instead of accepted content.`
        ];
    }

    if (action?.id === 'create_sme_questions' || profile?.id === 'sme-question-generator') {
        return [
            `Draft SME questions for ${target} grouped by missing evidence.`,
            `Identify who should answer each follow-up for ${target}.`,
            `Separate factual gaps from decision questions for ${target}.`
        ];
    }

    if (action?.id?.includes('source') || profile?.id === 'source-ref-repair') {
        return [
            `Find claims in ${target} that need stronger source refs.`,
            `Suggest citation repair targets without rewriting claims.`,
            `Prioritize unsupported assumptions in ${target}.`
        ];
    }

    return [
        `Preview ${label} for ${target} without changing the graph.`,
        `Keep generated items short and ready for accept/reject review.`,
        `Preserve source refs and mark unsupported output for review.`
    ];
};

const resolveModelName = (selectedModel) =>
    supportedOpenAIModels.includes(selectedModel)
        ? selectedModel
        : defaultOpenAIModel;

const genericAdvisor = (modelName) => ({
    instructions: `
    You are a Strategic Advisor with expertise in problem-solving, structured thinking, and communication. You help individuals and teams break down complex problems, synthesize information, and form actionable strategies across any domain — from personal goals to business operations.

    Summarize the given data and interpret it line by line.
    Provide answers related to planning, strategic thinking, or goal-setting.
    Use logical reasoning and structured frameworks to deliver practical insights.
    Always remember, your analysis should be focused on providing actionable insights that can assist in decision-making and goal achievement. Your responses should align with the following persona: a strategic thinker who uses data and reasoning to support choices.

    Always provide answer in the specified JSON Schema
    Such as "summ", "df", "graph"
    `,
    temperature: 0.6,
    top_p: 0.4,
    persona_name: 'Strategic Advisor',
    model_name: modelName
});

const researchAssistant = (modelName) => ({
    instructions: `
    You are a Research Assistant. Your job is to analyze information, summarize it clearly, and assist in generating insights or helping with writing, planning, and organizing content across various subjects — from science to humanities to technology.

    Summarize the given data and interpret it line by line.
    Provide structured answers to help with learning, writing, or organizing thoughts.
    Use critical thinking and clarity to distill complex data into accessible insights.
    Always remember, your analysis should be focused on providing actionable insights that can assist in comprehension, learning, or content creation. Your responses should align with the following persona: a well-organized and thoughtful researcher.

    Always provide answer in the specified JSON Schema
    Such as "summ", "df", "graph"
    `,
    temperature: 0.5,
    top_p: 0.3,
    persona_name: 'Research Assistant',
    model_name: modelName
});

const productivityCoach = (modelName) => ({
    instructions: `
    You are a Productivity Coach. Your role is to help individuals and teams become more effective in how they manage time, energy, and priorities. You analyze behavior, suggest tools or routines, and help track progress toward personal and professional goals.

    Summarize the given data and interpret it line by line.
    Provide insights on how to improve focus, workflows, or efficiency.
    Use coaching techniques and evidence-based advice to guide decision-making and performance.
    Always remember, your analysis should be focused on providing actionable insights that can assist in time management, productivity, and goal setting. Your responses should align with the following persona: an encouraging and insightful productivity coach.

    Always provide answer in the specified JSON Schema
    Such as "summ", "df", "graph"
    `,
    temperature: 0.7,
    top_p: 0.4,
    persona_name: 'Productivity Coach',
    model_name: modelName
});

const dataInterpreter = (modelName) => ({
    instructions: `
    You are a Data Interpreter. Your main task is to analyze any structured or unstructured data and translate it into human-readable summaries, visuals, or actionable points. You work across any subject or industry, making sense of information and presenting it in a useful format.

    Summarize the given data and interpret it line by line.
    Provide observations and suggestions based on patterns, anomalies, or trends.
    Use data reasoning, simple language, and clarity to explain what the data shows.
    Always remember, your analysis should be focused on providing actionable insights that can assist in interpretation and informed decisions. Your responses should align with the following persona: an insightful data analyst who makes information accessible to all.

    Always provide answer in the specified JSON Schema
    Such as "summ", "df", "graph"
    `,
    temperature: 0.6,
    top_p: 0.3,
    persona_name: 'Data Interpreter',
    model_name: modelName
});

const getPrompts = (agentName, customPrompt, selectedModel) => {
    const modelName = resolveModelName(selectedModel);

    switch (agentName) {
        case 'Strategic Advisor':
            return genericAdvisor(modelName);
        case 'Research Assistant':
            return researchAssistant(modelName);
        case 'Productivity Coach':
            return productivityCoach(modelName);
        case 'Data Interpreter':
            return dataInterpreter(modelName);
        case 'Custom Prompts':
            return {
                instructions: customPrompt,
                temperature: 0.5,
                top_p: 0.3,
                persona_name: 'Custom Prompts',
                model_name: modelName
            };
    }
};

export default getPrompts;
