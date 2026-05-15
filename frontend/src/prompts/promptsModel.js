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
    { id: 'interpret_table_data', label: 'Interpret table/data' },
    { id: 'generate_tasks', label: 'Generate tasks' },
    { id: 'custom_prompt', label: 'Custom prompt' }
];

export const branchAiActions = [
    { id: 'summarize_branch', label: 'Summarize branch' },
    { id: 'reorganize_branch', label: 'Reorganize branch' },
    { id: 'split_branch_into_categories', label: 'Split branch into categories' },
    { id: 'generate_tasks', label: 'Generate tasks' },
    { id: 'generate_checklist', label: 'Generate checklist' },
    { id: 'find_gaps', label: 'Find gaps' },
    { id: 'create_sme_questions', label: 'Create SME questions' },
    { id: 'custom_prompt', label: 'Custom prompt' }
];

export const workspaceAiActions = [
    { id: 'suggest_follow_up_questions', label: 'Suggest follow-up questions' },
    { id: 'find_missing_source_support', label: 'Find missing source support' },
    { id: 'find_unsupported_assumptions', label: 'Find unsupported assumptions' },
    { id: 'find_duplicate_overlapping_nodes', label: 'Find duplicate or overlapping nodes' },
    { id: 'generate_tasks', label: 'Generate tasks' },
    { id: 'generate_checklist', label: 'Generate checklist' },
    { id: 'interpret_table_data', label: 'Interpret table/data' },
    { id: 'generate_training_outline', label: 'Generate training outline' },
    { id: 'export_branch_as_sop_draft', label: 'Export branch as SOP draft' },
    { id: 'custom_prompt', label: 'Custom prompt' }
];

export const sourceAiActions = [
    { id: 'find_missing_source_support', label: 'Review source coverage' },
    { id: 'generate_child_nodes', label: 'Draft cited branches' },
    { id: 'create_sme_questions', label: 'Create source review questions' },
    { id: 'custom_prompt', label: 'Custom prompt' }
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
            'summarize_branch',
            'find_gaps',
            'find_unsupported_assumptions',
            'custom_prompt'
        ],
        preferredActions: ['expand_this_node', 'generate_child_nodes', 'find_missing_source_support']
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
        scopes: ['node', 'branch', 'workspace'],
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
        scopes: ['node', 'branch', 'workspace'],
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
            'custom_prompt'
        ],
        preferredActions: ['find_missing_source_support', 'find_unsupported_assumptions']
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
