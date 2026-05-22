import { getActionsForProfileAndScope } from '../prompts/promptsModel.js';

export const SUMMARY_COMPANION_OUTPUTS = [
    {
        shape: 'executive_summary',
        pattern: /\b(executive summary|exec summary|leadership summary|board summary|briefing memo|decision brief)\b/
    },
    {
        shape: 'news_article',
        pattern: /\b(news article|article draft|press release|current news|latest news)\b/
    },
    {
        shape: 'newsletter',
        pattern: /\b(newsletter|monthly update|weekly update|quarterly update|update brief|intranet update|intranet article|announcement|internal comms?|internal communications?|release notes?|stakeholder updates?)\b/
    }
];

export const OUTPUT_SHAPE_VIEW = {
    mind_map: 'mindmap',
    graph_draft: 'mindmap',
    knowledge_graph: 'knowledgeGraph',
    outline: 'outline',
    tasks: 'tasks',
    table: 'table',
    checklist: 'checklist',
    flow_chart: 'flowchart',
    chart: 'chartData',
    kanban: 'kanban',
    executive_summary: 'executive',
    executive_output: 'executive',
    news_article: 'outline',
    newsletter: 'outline',
    review_annotations: 'gaps',
    sme_questions: 'sme',
    source_coverage: 'sources',
    software_overlap_report: 'gaps',
    connected_picture_package: 'preview',
    implementation_handoff_package: 'preview',
    no_visual: 'mindmap'
};

export const OUTPUT_SHAPE_ROUTE = {
    tasks: { roleId: 'task-planner', actionId: 'generate_tasks' },
    checklist: { roleId: 'training-guide-builder', actionId: 'generate_checklist' },
    table: { roleId: 'data-table-interpreter', actionId: 'interpret_table_data' },
    chart: { roleId: 'data-table-interpreter', actionId: 'interpret_table_data' },
    flow_chart: { roleId: 'workflow-mapper', actionId: 'custom_prompt' },
    knowledge_graph: { roleId: 'standards-extractor', actionId: 'custom_prompt' },
    outline: { roleId: 'training-guide-builder', actionId: 'generate_training_outline' },
    kanban: { roleId: 'task-planner', actionId: 'generate_tasks' },
    executive_summary: { roleId: 'enterprise-readiness-planner', actionId: 'create_stakeholder_review_package' },
    executive_output: { roleId: 'enterprise-readiness-planner', actionId: 'create_stakeholder_review_package' },
    news_article: { roleId: 'research-assistant', actionId: 'custom_prompt' },
    newsletter: { roleId: 'research-assistant', actionId: 'custom_prompt' },
    sme_questions: { roleId: 'sme-question-generator', actionId: 'create_sme_questions' },
    source_coverage: { roleId: 'source-ref-repair', actionId: 'find_missing_source_support' },
    software_overlap_report: { roleId: 'enterprise-tool-rationalization', actionId: 'find_duplicate_tools' },
    connected_picture_package: { roleId: 'workflow-mapper', actionId: 'custom_prompt' },
    implementation_handoff_package: { roleId: 'integration-readiness-reviewer', actionId: 'custom_prompt' },
    review_annotations: { roleId: 'gap-analyst', actionId: 'find_gaps' },
    no_visual: { roleId: 'custom', actionId: 'custom_prompt' },
    mind_map: { roleId: 'workflow-mapper', actionId: 'custom_prompt' },
    graph_draft: { roleId: 'workflow-mapper', actionId: 'custom_prompt' }
};

const MULTI_VIEW_INTENT_PATTERN =
    /\b(messy context|context dump|dumped context|pasted context|best (view|shape|output)|most useful|multi[- ]?view|multiple views|several views|choose the best|tracespace output|workspace output|something i can review and build from|turn this into something|connected picture|full picture)\b/;

const CODE_DEPENDENCY_INTENT_PATTERN =
    /\b(code|codes|standard|standards|regulation|regulations|nfpa|nec|njac|ibc|ahj|fire alarm|life safety|permit|permitting|submittal|acceptance testing|closeout)\b.*\b(connect|depends?|dependencies|requirements?|design|review|build from|map|matrix|workflow|process|triggers?|lifecycle|phase|phases|sd|dd|cd|construction administration|ca|closeout)\b|\b(connect|depends?|dependencies|requirements?|design|review|build from|map|matrix|workflow|process|triggers?|lifecycle|phase|phases|sd|dd|cd|construction administration|ca|closeout)\b.*\b(code|codes|standard|standards|regulation|regulations|nfpa|nec|njac|ibc|ahj|fire alarm|life safety|permit|permitting|submittal|acceptance testing|closeout)\b/;

export const inferOutputShape = (prompt, actionId = '') => {
    const text = `${prompt || ''} ${actionId || ''}`.toLowerCase();
    if (MULTI_VIEW_INTENT_PATTERN.test(text)) {
        return 'graph_draft';
    }
    if (CODE_DEPENDENCY_INTENT_PATTERN.test(text)) {
        return 'graph_draft';
    }
    if (
        actionId === 'find_duplicate_tools' ||
        /\b(software|tool|application|app|system)s?\b.*\b(overlap|duplicate|rationali[sz]ation|redundant)\b/.test(text) ||
        /\b(overlap|duplicate|rationali[sz]ation|redundant)\b.*\b(software|tool|application|app|system)s?\b/.test(text)
    ) {
        return 'software_overlap_report';
    }
    if (/\b(knowledge graph|relationship|relationships|connections|dependencies)\b/.test(text)) {
        return 'knowledge_graph';
    }
    if (/\b(mind map|brainstorm|cluster|map out)\b/.test(text)) {
        return 'mind_map';
    }
    if (/\b(executive summary|exec summary|leadership summary|board summary|briefing memo|decision brief)\b/.test(text)) {
        return 'executive_summary';
    }
    if (/\b(newsletter|monthly update|weekly update|quarterly update|update brief|intranet update|intranet article|announcement|internal comms?|internal communications?|release notes?|stakeholder updates?)\b/.test(text)) {
        return 'newsletter';
    }
    if (/\b(news article|article draft|press release|current news|latest news)\b/.test(text)) {
        return 'news_article';
    }
    if (/\b(kanban|board|columns)\b/.test(text)) {
        return 'kanban';
    }
    if (/\b(sankey|source[- ]?target[- ]?value|source to target|source-to-target)\b/.test(text)) {
        return 'chart';
    }
    if (/\b(table|matrix|spreadsheet|rows|columns|compare)\b/.test(text)) {
        return 'table';
    }
    if (/\b(chart|graph this|visualize data|plot)\b/.test(text)) {
        return 'chart';
    }
    if (/\b(flowchart|flow chart|process map|swimlane|decision tree)\b/.test(text)) {
        return 'flow_chart';
    }
    if (/\b(handoff package|implementation package|implementation handoff|handoff readiness)\b/.test(text)) {
        return 'implementation_handoff_package';
    }
    if (/\b(sme|subject matter expert|review packet|review questions?)\b/.test(text)) {
        return 'sme_questions';
    }
    if (
        /\b(checklist|check list|steps|step[- ]by[- ]step|recipe|instructions?|walkthrough)\b/.test(text) ||
        /\bhow\s+(to|do\s+i|can\s+i|should\s+i|would\s+i)\b/.test(text) ||
        /\b(cook|bake|prepare|make)\b.*\b(grilled cheese|sandwich|meal|dish|recipe)\b/.test(text)
    ) {
        return 'checklist';
    }
    if (/\b(task|todo|to-do|owner|due date|assign)\b/.test(text)) {
        return 'tasks';
    }
    if (/\b(outline|agenda|sections|training outline)\b/.test(text)) {
        return 'outline';
    }
    if (/\b(source|citation|cite|unsupported|coverage)\b/.test(text)) {
        return 'source_coverage';
    }
    if (/\b(gap|missing|risk|question|review)\b/.test(text)) {
        return 'review_annotations';
    }
    return 'graph_draft';
};

export const desiredOutputsForPrompt = ({ inferredShape, prompt }) => {
    const text = String(prompt || '').toLowerCase();
    if (inferredShape === 'connected_picture_package') {
        return ['connected_picture_package'];
    }
    if (['graph_draft', 'no_visual'].includes(inferredShape)) {
        if (MULTI_VIEW_INTENT_PATTERN.test(text) || CODE_DEPENDENCY_INTENT_PATTERN.test(text)) {
            return ['connected_picture_package'];
        }
        return [];
    }
    const outputs = [inferredShape];
    if (['knowledge_graph', 'mind_map'].includes(inferredShape)) {
        SUMMARY_COMPANION_OUTPUTS.forEach(({ shape, pattern }) => {
            if (shape !== inferredShape && pattern.test(text)) {
                outputs.push(shape);
            }
        });
    }
    return [...new Set(outputs)];
};

export const viewForOutputShape = (shape, actionId, viewForAction) =>
    OUTPUT_SHAPE_VIEW[shape] || viewForAction(actionId || 'custom_prompt');

export const routeForOutputShape = ({ outputShape, profiles, promptScope, fallbackRole, fallbackAction }) => {
    const route = OUTPUT_SHAPE_ROUTE[outputShape] || OUTPUT_SHAPE_ROUTE.graph_draft;
    const nextRole =
        profiles.find((profile) => profile.id === route.roleId) ||
        fallbackRole ||
        profiles[0];
    const roleActions = getActionsForProfileAndScope(nextRole, promptScope);
    const fallbackActionForRole = roleActions.find((action) => action.id === fallbackAction?.id);
    const shouldKeepSopAction =
        outputShape === 'outline' && fallbackActionForRole?.id === 'export_branch_as_sop_draft';
    const nextAction = shouldKeepSopAction
        ? fallbackActionForRole
        : roleActions.find((action) => action.id === route.actionId) ||
          roleActions.find((action) => action.id === 'custom_prompt') ||
          fallbackActionForRole ||
          roleActions[0];
    return { role: nextRole, action: nextAction };
};
