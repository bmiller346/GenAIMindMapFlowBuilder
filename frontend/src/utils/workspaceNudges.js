import {
    applyGraphFilters,
    buildGraphProjection,
    buildSourceLibraryProjection
} from '../views/graphProjection.js';

export const NUDGE_CATEGORIES = {
    CANVAS_NAVIGATION: 'canvas_navigation',
    KNOWLEDGE_GRAPH_CONNECTIONS: 'knowledge_graph_connections',
    SOURCE_COVERAGE: 'source_coverage',
    REVIEW_QUALITY: 'review_quality',
    TASK_READINESS: 'task_readiness',
    AI_OUTPUT_OPPORTUNITIES: 'ai_output_opportunities',
    INTEGRATION_READINESS: 'integration_readiness'
};

const TASK_TYPES = new Set(['task', 'procedure', 'workflow', 'needs_review', 'requirement']);
const PROCESS_RELATIONSHIPS = new Set([
    'depends_on',
    'dependency',
    'decision',
    'handoff',
    'process',
    'sequence',
    'next',
    'precedes',
    'requires'
]);
const CONNECTION_RELATIONSHIPS = new Set([
    'references',
    'depends_on',
    'duplicates',
    'conflicts_with',
    'similar_to',
    'derived_from',
    'supports',
    'contradicts',
    'implements',
    'owned_by',
    'requires_review_by',
    'related_to'
]);

const normalizedId = (value) => String(value || '').trim();

const sortedIds = (values = []) =>
    values.map(normalizedId).filter(Boolean).sort((a, b) => a.localeCompare(b));

const stableKey = (...parts) =>
    parts
        .flat()
        .map((part) => String(part || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'))
        .filter(Boolean)
        .join('-');

const plural = (count, singular, multiple = `${singular}s`) =>
    `${count} ${count === 1 ? singular : multiple}`;

const needsVerb = (count) => (count === 1 ? 'needs' : 'need');

const hasSource = (node) => node.source_refs?.some((ref) => ref?.document_id);

const sourceIdsForNode = (node) => sortedIds((node.source_refs || []).map((ref) => ref.document_id));

const hasStructuredRows = (projection) =>
    projection.nodes.some((node) => Array.isArray(node.table_rows) && node.table_rows.length > 0);

const hasRenderableChart = (projection) =>
    projection.nodes.some((node) => {
        const graph = node.graph;
        if (!graph || typeof graph !== 'object') {
            return false;
        }
        return Array.isArray(graph.data) && graph.data.length > 0;
    });

const relationshipType = (edge = {}) =>
    edge.relationship_type || edge.data?.relationship_type || edge.data?.type || edge.type || '';

const hasProcessRelationship = (projection) =>
    projection.edges.some((edge) => PROCESS_RELATIONSHIPS.has(relationshipType(edge)));

const hasConnectionRelationship = (projection) =>
    projection.edges.some((edge) => CONNECTION_RELATIONSHIPS.has(relationshipType(edge)));

const hasProcessNode = (projection) =>
    projection.nodes.some((node) =>
        ['procedure', 'workflow', 'process', 'decision'].includes(node.node_type)
    );

const taskNodes = (projection) => projection.nodes.filter((node) => TASK_TYPES.has(node.node_type));

const taskMetadataLookup = (taskMetadata = {}) => {
    if (Array.isArray(taskMetadata)) {
        return new Map(
            taskMetadata
                .filter((item) => item?.node_id || item?.id)
                .map((item) => [item.node_id || item.id, item])
        );
    }
    if (taskMetadata && typeof taskMetadata === 'object') {
        return new Map(Object.entries(taskMetadata));
    }
    return new Map();
};

const taskFieldValue = (node, metadata = {}, field) => metadata[field] || node[field];

const missingTaskFields = (node, metadata = {}) =>
    [
        ['owner_id', 'owner'],
        ['due_date', 'due date'],
        ['priority', 'priority']
    ]
        .filter(([field]) => !taskFieldValue(node, metadata, field))
        .map(([, label]) => label);

const readiness = ({
    view,
    ready,
    partiallyReady = false,
    missing = [],
    enrichmentLabel = '',
    generationLabel = ''
}) => ({
    view,
    ready,
    partially_ready: partiallyReady,
    status: ready ? 'ready' : partiallyReady ? 'partially_ready' : 'not_ready',
    missing_required_fields: missing,
    suggested_enrichment_action: enrichmentLabel
        ? {
              type: 'ai_enrichment',
              label: enrichmentLabel,
              output_type: view
          }
        : null,
    suggested_generation_action: generationLabel
        ? {
              type: 'generate_output',
              label: generationLabel,
              output_type: view
          }
        : null
});

export const getProjectionReadiness = (projection, workspaceBrief = {}, taskMetadata = {}) => {
    const nodeCount = projection.nodes.length;
    const tasks = taskNodes(projection);
    const metadataByNodeId = taskMetadataLookup(taskMetadata);
    const missingTaskMetadata = tasks.flatMap((node) =>
        missingTaskFields(node, metadataByNodeId.get(node.id)).map((field) => ({
            node_id: node.id,
            field
        }))
    );
    const desiredOutputs = new Set(workspaceBrief?.desired_outputs || []);

    return {
        mind_map: readiness({
            view: 'mind_map',
            ready: nodeCount > 0,
            generationLabel: 'Create mind map'
        }),
        outline: readiness({
            view: 'outline',
            ready: nodeCount > 0,
            generationLabel: 'Create outline'
        }),
        table: readiness({
            view: 'table',
            ready: nodeCount > 0,
            partiallyReady: nodeCount > 0 && projection.nodes.some((node) => !node.summary),
            missing: projection.nodes
                .filter((node) => !node.summary)
                .map((node) => ({ node_id: node.id, field: 'summary' })),
            enrichmentLabel: 'Fill table metadata',
            generationLabel: 'Create table'
        }),
        tasks: readiness({
            view: 'tasks',
            ready: tasks.length > 0 && missingTaskMetadata.length === 0,
            partiallyReady: tasks.length > 0 && missingTaskMetadata.length > 0,
            missing: missingTaskMetadata,
            enrichmentLabel: 'Fill task fields',
            generationLabel: 'Generate task preview'
        }),
        checklist: readiness({
            view: 'checklist',
            ready: nodeCount > 0,
            partiallyReady: nodeCount > 0 && projection.nodes.some((node) => node.status === 'needs_review'),
            missing: projection.nodes
                .filter((node) => node.status === 'needs_review')
                .map((node) => ({ node_id: node.id, field: 'review_state' })),
            enrichmentLabel: 'Review checklist items',
            generationLabel: 'Create checklist'
        }),
        knowledge_graph: readiness({
            view: 'knowledge_graph',
            ready: hasConnectionRelationship(projection),
            partiallyReady:
                !hasConnectionRelationship(projection) &&
                findConnectionOpportunities(projection).length > 0,
            missing: hasConnectionRelationship(projection)
                ? []
                : [{ field: 'typed_relationship_edges' }],
            enrichmentLabel: 'Find connections',
            generationLabel: 'Create knowledge graph'
        }),
        flow_chart: readiness({
            view: 'flow_chart',
            ready: hasProcessRelationship(projection),
            partiallyReady: !hasProcessRelationship(projection) && hasProcessNode(projection),
            missing: hasProcessRelationship(projection)
                ? []
                : [{ field: 'process_or_dependency_relationships' }],
            enrichmentLabel: 'Add process relationships',
            generationLabel: 'Create flow chart'
        }),
        chart: readiness({
            view: 'chart',
            ready: hasRenderableChart(projection) || hasStructuredRows(projection),
            partiallyReady:
                !hasRenderableChart(projection) &&
                !hasStructuredRows(projection) &&
                nodeCount > 0 &&
                (desiredOutputs.has('chart') || desiredOutputs.has('rendered_chart')),
            missing:
                hasRenderableChart(projection) || hasStructuredRows(projection)
                    ? []
                    : [{ field: 'structured_or_extracted_data' }],
            enrichmentLabel: 'Extract chart data',
            generationLabel: 'Create chart'
        })
    };
};

export const getReadinessForView = (projection, view, workspaceBrief = {}, taskMetadata = {}) =>
    getProjectionReadiness(projection, workspaceBrief, taskMetadata)[view];

export const findMissingFields = (projection, view, workspaceBrief = {}, taskMetadata = {}) =>
    getReadinessForView(projection, view, workspaceBrief, taskMetadata)?.missing_required_fields || [];

export const findConnectionOpportunities = (projection) => {
    const opportunities = [];
    const connectedPairs = new Set(
        projection.edges.flatMap((edge) => [
            `${edge.source}->${edge.target}`,
            `${edge.target}->${edge.source}`
        ])
    );

    for (let index = 0; index < projection.nodes.length; index += 1) {
        for (let nextIndex = index + 1; nextIndex < projection.nodes.length; nextIndex += 1) {
            const left = projection.nodes[index];
            const right = projection.nodes[nextIndex];
            if (connectedPairs.has(`${left.id}->${right.id}`)) {
                continue;
            }

            const rightSourceIds = sourceIdsForNode(right);
            const sharedSources = sourceIdsForNode(left).filter((documentId) =>
                rightSourceIds.includes(documentId)
            );
            const sharedTags = sortedIds(left.tags).filter((tag) => right.tags?.includes(tag));
            const sharedEntities = sortedIds(left.entities).filter((entity) =>
                right.entities?.includes(entity)
            );

            if (sharedSources.length || sharedTags.length || sharedEntities.length) {
                opportunities.push({
                    node_ids: sortedIds([left.id, right.id]),
                    source_ids: sortedIds(sharedSources),
                    tags: sortedIds(sharedTags),
                    entities: sortedIds(sharedEntities)
                });
            }
        }
    }

    return opportunities;
};

const createNudge = ({
    id,
    category,
    severity,
    title,
    detail,
    actionLabel,
    action,
    targetNodeIds = [],
    targetSourceIds = [],
    targetBranchIds = []
}) => ({
    id,
    category,
    severity,
    title,
    detail,
    action_label: actionLabel,
    action,
    target_node_ids: sortedIds(targetNodeIds),
    target_source_ids: sortedIds(targetSourceIds),
    target_branch_ids: sortedIds(targetBranchIds),
    dismiss_key: id
});

const sourceCoverageNudges = ({ projection, sourceProjection, validationIssues = [] }) => {
    const validationMissingSourceNodeIds = new Set(
        validationIssues
            .filter((issue) =>
                [issue.label, issue.code, issue.detail]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase()
                    .includes('missing source')
            )
            .map((issue) => issue.nodeId || issue.node_id)
            .filter(Boolean)
    );
    const missingSourceNodes = projection.nodes.filter(
        (node) =>
            node.react_flow_type !== 'dataSource' &&
            !hasSource(node) &&
            !validationMissingSourceNodeIds.has(node.id)
    );
    const uncitedSources = sourceProjection.sources.filter(
        (source) => source.coverage_count === 0 && source.id !== 'brief-only'
    );
    const nudges = [];

    if (missingSourceNodes.length > 0) {
        const nodeIds = sortedIds(missingSourceNodes.map((node) => node.id));
        nudges.push(
            createNudge({
                id: `source-coverage-missing-source-${stableKey(nodeIds)}`,
                category: NUDGE_CATEGORIES.SOURCE_COVERAGE,
                severity: missingSourceNodes.length > 3 ? 'high' : 'medium',
                title: `${plural(missingSourceNodes.length, 'node')} ${needsVerb(
                    missingSourceNodes.length
                )} source support`,
                detail: 'These claims can be reviewed more safely after a source reference is attached.',
                actionLabel: 'Open source repair',
                action: {
                    type: 'open_view',
                    view: 'sources',
                    flow: 'source_reference_repair',
                    node_ids: nodeIds
                },
                targetNodeIds: nodeIds
            })
        );
    }

    uncitedSources.forEach((source) => {
        nudges.push(
            createNudge({
                id: `source-coverage-uncited-source-${stableKey(source.id)}`,
                category: NUDGE_CATEGORIES.SOURCE_COVERAGE,
                severity: 'low',
                title: 'Source is not cited yet',
                detail: `${source.title} is available but not connected to any graph node.`,
                actionLabel: 'Review source coverage',
                action: {
                    type: 'open_view',
                    view: 'sources',
                    source_id: source.id
                },
                targetSourceIds: [source.id]
            })
        );
    });

    return nudges;
};

const taskReadinessNudges = (projection, taskMetadata = {}) => {
    const metadataByNodeId = taskMetadataLookup(taskMetadata);
    const rows = taskNodes(projection)
        .map((node) => ({
            node,
            fields: missingTaskFields(node, metadataByNodeId.get(node.id))
        }))
        .filter((row) => row.fields.length > 0);

    if (rows.length === 0) {
        return [];
    }

    const nodeIds = sortedIds(rows.map((row) => row.node.id));

    return [
        createNudge({
            id: `task-readiness-missing-fields-${stableKey(nodeIds)}`,
            category: NUDGE_CATEGORIES.TASK_READINESS,
            severity: rows.length > 2 ? 'medium' : 'low',
            title: `${plural(rows.length, 'task')} ${needsVerb(rows.length)} execution fields`,
            detail: 'Owners, due dates, and priorities make task outputs ready for handoff.',
            actionLabel: 'Open task preview',
            action: {
                type: 'open_view',
                view: 'tasks',
                node_ids: nodeIds,
                missing_fields: [...new Set(rows.flatMap((row) => row.fields))].sort()
            },
            targetNodeIds: nodeIds
        })
    ];
};

const connectionNudges = (projection) => {
    if (hasConnectionRelationship(projection)) {
        return [];
    }

    const opportunities = findConnectionOpportunities(projection);
    if (opportunities.length === 0) {
        return [];
    }

    const nodeIds = sortedIds(opportunities.flatMap((opportunity) => opportunity.node_ids));

    return [
        createNudge({
            id: `knowledge-graph-opportunities-${stableKey(nodeIds)}`,
            category: NUDGE_CATEGORIES.KNOWLEDGE_GRAPH_CONNECTIONS,
            severity: 'low',
            title: `${plural(opportunities.length, 'connection')} can be reviewed`,
            detail: 'Shared sources, tags, or entities suggest useful relationship edges.',
            actionLabel: 'Find connections',
            action: {
                type: 'ai_enrichment',
                output_type: 'knowledge_graph',
                node_ids: nodeIds
            },
            targetNodeIds: nodeIds
        })
    ];
};

const readinessKeyForOutput = (output) =>
    ({
        map: 'mind_map',
        rendered_chart: 'chart',
        knowledge_connections: 'knowledge_graph'
    })[output] || output;

const readinessNudges = (readinessByView, workspaceBrief = {}) =>
    (workspaceBrief.desired_outputs || [])
        .map((output) => readinessByView[readinessKeyForOutput(output)])
        .filter((result) => result && !result.ready)
        .map((result) =>
            createNudge({
                id: `ai-output-readiness-${stableKey(result.view)}`,
                category: NUDGE_CATEGORIES.AI_OUTPUT_OPPORTUNITIES,
                severity: result.partially_ready ? 'low' : 'medium',
                title: `${result.view.replace(/_/g, ' ')} needs enrichment`,
                detail: result.partially_ready
                    ? 'The current graph can show a partial projection, but enrichment would make it useful.'
                    : 'The current graph is missing the required structure for this output.',
                actionLabel:
                    result.suggested_enrichment_action?.label ||
                    result.suggested_generation_action?.label ||
                    'Generate output',
                action:
                    result.suggested_enrichment_action ||
                    result.suggested_generation_action || {
                        type: 'generate_output',
                        output_type: result.view
                    }
            })
        );

const reviewQualityNudges = (projection) => {
    const reviewNodes = projection.nodes.filter(
        (node) => node.status === 'needs_review' || node.node_type === 'needs_review'
    );
    if (reviewNodes.length === 0) {
        return [];
    }

    const nodeIds = sortedIds(reviewNodes.map((node) => node.id));

    return [
        createNudge({
            id: `review-quality-needs-review-${stableKey(nodeIds)}`,
            category: NUDGE_CATEGORIES.REVIEW_QUALITY,
            severity: reviewNodes.length > 3 ? 'medium' : 'low',
            title: `${plural(reviewNodes.length, 'node')} marked for review`,
            detail: 'Resolve review items before treating this branch as final.',
            actionLabel: 'Open gaps review',
            action: {
                type: 'open_view',
                view: 'gaps',
                node_ids: nodeIds
            },
            targetNodeIds: nodeIds
        })
    ];
};

const integrationNudges = ({ integrationMetadata = {}, projection }) => {
    const providers = Object.entries(integrationMetadata || {}).filter(
        ([, metadata]) => metadata && typeof metadata === 'object'
    );

    return providers.flatMap(([provider, metadata]) => {
        if (metadata.ready || metadata.hasCredential || metadata.enabled === false) {
            return [];
        }

        return [
            createNudge({
                id: `integration-readiness-${stableKey(provider)}`,
                category: NUDGE_CATEGORIES.INTEGRATION_READINESS,
                severity: 'low',
                title: `${provider} is not ready`,
                detail: metadata.reason || 'Connect credentials or complete integration setup before export.',
                actionLabel: 'Open integrations',
                action: {
                    type: 'open_panel',
                    panel: 'integrations',
                    provider
                },
                targetNodeIds: projection.nodes.map((node) => node.id)
            })
        ];
    });
};

const canvasNudges = ({ projection, selectedBranchId }) => {
    if (!selectedBranchId || projection.nodes.some((node) => node.id === selectedBranchId)) {
        return [];
    }

    return [
        createNudge({
            id: `canvas-navigation-missing-branch-${stableKey(selectedBranchId)}`,
            category: NUDGE_CATEGORIES.CANVAS_NAVIGATION,
            severity: 'low',
            title: 'Selected branch is unavailable',
            detail: 'The current branch selection no longer exists in the graph.',
            actionLabel: 'Reset branch',
            action: {
                type: 'reset_branch',
                branch_id: selectedBranchId
            },
            targetBranchIds: [selectedBranchId]
        })
    ];
};

export const buildWorkspaceNudgeProjection = ({
    nodes = [],
    edges = [],
    sourceLibrary = [],
    workspaceBrief = {},
    taskMetadata = {},
    integrationMetadata = {},
    selectedBranchId,
    filters = [],
    validationIssues = []
} = {}) => {
    const baseProjection = buildGraphProjection(nodes, edges, selectedBranchId);
    const projection = applyGraphFilters(baseProjection, filters);
    const sourceProjection = buildSourceLibraryProjection(nodes, edges, workspaceBrief, sourceLibrary);
    const readinessByView = getProjectionReadiness(projection, workspaceBrief, taskMetadata);
    const nudges = [
        ...canvasNudges({ projection, selectedBranchId }),
        ...sourceCoverageNudges({ projection, sourceProjection, validationIssues }),
        ...taskReadinessNudges(projection, taskMetadata),
        ...connectionNudges(projection),
        ...reviewQualityNudges(projection),
        ...readinessNudges(readinessByView, workspaceBrief),
        ...integrationNudges({ integrationMetadata, projection })
    ];

    return {
        nudges,
        readiness: readinessByView,
        projection,
        source_projection: sourceProjection
    };
};
