import { nanoid } from 'nanoid';

const labelFromId = (value = '') =>
    value
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

const compactText = (text, fallback) => {
    const value = (text || '').trim();
    return value.length > 0 ? value : fallback;
};

const createResponseNode = ({
    title,
    summary,
    nodeType,
    position,
    brief,
    flowId,
    priority = ''
}) => {
    const sourceMode = brief.source_mode || 'context_only';
    const assumption =
        sourceMode === 'context_only' || Boolean(brief.assumptions_allowed);

    return {
        id: nanoid(),
        type: 'response',
        position,
        data: {
            title,
            node_type: nodeType,
            status: assumption ? 'needs_review' : 'ai_generated',
            priority,
            assumption,
            source_mode: sourceMode,
            derivation_context_id: `brief:${flowId || 'local'}`,
            workspace_brief: brief,
            data: {
                summ: summary,
                query: '',
                df: [],
                graph: {},
                source_refs: []
            }
        },
        deletable: true
    };
};

export const createBriefDraftGraph = ({
    brief,
    flowId,
    origin = { x: 80, y: 80 }
}) => {
    const outputs = brief.desired_outputs?.length
        ? brief.desired_outputs
        : ['mind_map'];
    const nodeTypes = brief.node_types?.length
        ? brief.node_types
        : ['concept', 'task', 'question', 'needs_review'];
    const reviewPolicies = brief.review_policy?.length
        ? brief.review_policy
        : ['mark_uncited_needs_review'];

    const root = createResponseNode({
        title: 'Workspace Goal',
        summary: compactText(
            brief.goal,
            'Draft a TraceSpace workspace from the workspace brief. Add source documents or refine the brief to strengthen grounding.'
        ),
        nodeType: 'workspace_goal',
        position: origin,
        brief,
        flowId,
        priority: 'high'
    });

    const branchSpecs = [
        {
            title: 'Audience and Use Case',
            summary: compactText(
                brief.audience,
                'Define who will use this workspace and what decisions it should support.'
            ),
            nodeType: 'audience'
        },
        {
            title: 'Domain Context',
            summary: compactText(
                brief.domain_context,
                'Capture relevant project, discipline, workflow, and terminology context.'
            ),
            nodeType: 'context'
        },
        {
            title: 'Requested Outputs',
            summary: `Prepare: ${outputs.map(labelFromId).join(', ')}.`,
            nodeType: 'output_plan'
        },
        {
            title: 'Review Rules',
            summary: compactText(
                brief.review_rules,
                `Apply review policies: ${reviewPolicies.map(labelFromId).join(', ')}.`
            ),
            nodeType: 'review_policy'
        },
        {
            title: 'Node Types',
            summary: `Use these node types as the first draft vocabulary: ${nodeTypes.join(', ')}.`,
            nodeType: 'taxonomy'
        }
    ];

    const branches = branchSpecs.map((spec, index) =>
        createResponseNode({
            ...spec,
            position: {
                x: origin.x + 460,
                y: origin.y + index * 170 - 170
            },
            brief,
            flowId
        })
    );

    const outputNodes = outputs.slice(0, 5).map((output, index) =>
        createResponseNode({
            title: labelFromId(output),
            summary: `${labelFromId(output)} should be generated from source-backed content when sources exist, and kept as a reviewable assumption when the brief is the only input.`,
            nodeType: output,
            position: {
                x: origin.x + 920,
                y: origin.y + index * 150 - 140
            },
            brief,
            flowId
        })
    );

    const nodes = [root, ...branches, ...outputNodes];
    const outputPlan = branches.find((node) => node.data.node_type === 'output_plan');
    const edges = [
        ...branches.map((branch) => ({
            id: nanoid(),
            source: root.id,
            target: branch.id,
            animated: true
        })),
        ...outputNodes.map((node) => ({
            id: nanoid(),
            source: outputPlan?.id || root.id,
            target: node.id,
            animated: true
        }))
    ];

    return { nodes, edges };
};
