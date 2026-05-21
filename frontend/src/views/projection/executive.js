import {
    DECISION_TYPES,
    DEPENDENCY_NODE_TYPES,
    DEPENDENCY_RELATIONSHIP_TYPES,
    EXECUTIVE_OUTPUT_CONTRACT_VERSION,
    MILESTONE_TYPES,
    RISK_TYPES,
    TEAM_ROADMAP_CONTRACT_VERSION,
    WORKSTREAM_TYPES,
    businessImpactScore,
    enterpriseReasons,
    hasSourceEvidence,
    hasSourceSupport,
    implementationReadinessScore,
    numericConfidence,
    ownerClarityScore,
    readinessBand,
    riskSeverityScore,
    sourceCoverageScore
} from './packageReady.js';
import { getTaskRows } from './tasks.js';

const nodeText = (node = {}) => `${node.title || ''} ${node.summary || ''}`.toLowerCase();

const needsExecutiveReview = (node = {}) =>
    node.status === 'needs_review' || node.node_type === 'needs_review' || !hasSourceSupport(node);

const isLowConfidence = (node = {}) => {
    const confidence = numericConfidence(node.confidence);
    return confidence !== null && confidence < 0.6;
};

const executiveItem = (node = {}, itemType = 'finding') => ({
    id: `${itemType}-${node.id || 'item'}`,
    title: node.title || 'Untitled',
    description: node.summary || node.query || '',
    status: node.status || '',
    priority: node.priority || '',
    owner_id: node.owner_id || '',
    due_date: node.due_date || '',
    source_refs: node.source_refs || [],
    source_backed: hasSourceSupport(node),
    needs_review: needsExecutiveReview(node),
    metadata: {
        source: 'workspace_graph_projection',
        scope: 'workspace',
        artifact_type: 'executive_output',
        layout_hint: itemType,
        rationale: `Projected from ${node.node_type || 'node'} as ${itemType}.`,
        review_reason: needsExecutiveReview(node) ? 'Confirm source support before executive use.' : '',
        source_signal: hasSourceSupport(node) ? 'explicit_source_ref' : 'graph_projection'
    }
});

const sortExecutiveNodes = (nodes = []) =>
    [...nodes].sort(
        (a, b) =>
            Number(!hasSourceSupport(a)) - Number(!hasSourceSupport(b)) ||
            Number(needsExecutiveReview(a)) - Number(needsExecutiveReview(b)) ||
            (a.title || '').localeCompare(b.title || '')
    );

export const getExecutiveOutputProjection = (projection, { title = 'Executive Output' } = {}) => {
    const contentNodes = projection.nodes.filter((node) => node.react_flow_type !== 'dataSource');
    const sourceBackedNodes = contentNodes.filter(hasSourceSupport);
    const reviewNodes = contentNodes.filter(needsExecutiveReview);
    const taskRows = getTaskRows(projection);
    const keyFindings = sortExecutiveNodes(sourceBackedNodes.length ? sourceBackedNodes : contentNodes)
        .slice(0, 8)
        .map((node) => executiveItem(node, 'finding'));
    const recommendedActions = taskRows
        .slice(0, 8)
        .map((node) => executiveItem(node, 'recommended_action'));
    const risks = contentNodes
        .filter(
            (node) =>
                RISK_TYPES.has(node.node_type) ||
                node.status === 'needs_review' ||
                isLowConfidence(node)
        )
        .slice(0, 8)
        .map((node) => executiveItem(node, 'risk'));
    const requiredDecisions = contentNodes
        .filter(
            (node) =>
                DECISION_TYPES.has(node.node_type) ||
                nodeText(node).includes('decision') ||
                nodeText(node).includes('approve')
        )
        .slice(0, 8)
        .map((node) => executiveItem(node, 'required_decision'));
    const sourceBackedAppendix = sourceBackedNodes.map((node) =>
        executiveItem(node, 'source_appendix')
    );
    const summary = `${contentNodes.length} content node${contentNodes.length === 1 ? '' : 's'}, ${sourceBackedNodes.length} source-backed, ${taskRows.length} action candidate${taskRows.length === 1 ? '' : 's'}, and ${reviewNodes.length} review item${reviewNodes.length === 1 ? '' : 's'}.`;

    return {
        contract_version: EXECUTIVE_OUTPUT_CONTRACT_VERSION,
        title,
        summary,
        key_findings: keyFindings,
        recommended_actions: recommendedActions,
        risks,
        required_decisions: requiredDecisions,
        source_backed_appendix: sourceBackedAppendix,
        assumptions: [
            ...(contentNodes.length && sourceBackedNodes.length === 0
                ? ['No source-backed graph nodes are available; executive sections require review.']
                : []),
            ...(reviewNodes.length ? [`${reviewNodes.length} graph node(s) require review.`] : [])
        ],
        metadata: {
            node_count: contentNodes.length,
            source_backed_node_count: sourceBackedNodes.length,
            needs_review_count: reviewNodes.length,
            task_count: taskRows.length
        }
    };
};

const roadmapMetadata = (node = {}, itemType = 'workstream') => ({
    source: 'workspace_graph_projection',
    scope: 'workspace',
    artifact_type: 'team_roadmap',
    layout_hint: itemType,
    rationale: [
        `Projected from ${node.node_type || 'node'} as ${itemType}.`,
        hasSourceSupport(node) ? 'Source-backed.' : 'No source reference available.',
        needsExecutiveReview(node) ? 'Requires review before team handoff.' : ''
    ]
        .filter(Boolean)
        .join(' '),
    review_reason: needsExecutiveReview(node)
        ? 'Confirm source support before roadmap use.'
        : '',
    source_signal: hasSourceSupport(node) ? 'explicit_source_ref' : 'graph_projection'
});

const roadmapNodeItem = (node = {}, itemType = 'workstream') => ({
    id: `${itemType}-${node.id || 'item'}`,
    node_id: node.id || '',
    title: node.title || 'Untitled',
    description: node.summary || node.query || '',
    status: node.status || '',
    priority: node.priority || '',
    owner_id: node.owner_id || '',
    due_date: node.due_date || '',
    source_refs: node.source_refs || [],
    source_backed: hasSourceSupport(node),
    needs_review: needsExecutiveReview(node),
    metadata: roadmapMetadata(node, itemType)
});

const mergeRoadmapSourceRefs = (...refLists) => {
    const seen = new Set();
    return refLists.flatMap((refs) => (Array.isArray(refs) ? refs : [])).filter((ref) => {
        if (!hasSourceEvidence(ref)) {
            return false;
        }
        const key = [
            ref.document_id,
            ref.source_type,
            ref.query_id,
            ref.table_name,
            ref.page,
            ref.section,
            ref.quote_snippet,
            ref.result_hash
        ].join('|');
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const roadmapEdgeItem = (edge = {}, source = {}, target = {}) => {
    const sourceRefs = mergeRoadmapSourceRefs(source.source_refs, target.source_refs);
    const sourceBacked = sourceRefs.some(hasSourceEvidence);
    return {
        id: `dependency-${edge.id || `${source.id || 'source'}-${target.id || 'target'}`}`,
        source_node_id: source.id || '',
        target_node_id: target.id || '',
        title: `${source.title || 'Source'} -> ${target.title || 'Target'}`,
        description: `${target.title || 'Target'} is linked by ${edge.relationship_type || 'dependency'}.`,
        relationship_type: edge.relationship_type || 'dependency',
        status: target.status || '',
        priority: target.priority || '',
        owner_id: target.owner_id || '',
        due_date: target.due_date || '',
        source_refs: sourceRefs,
        source_backed: sourceBacked,
        needs_review: !sourceBacked,
        metadata: {
            ...roadmapMetadata(target, 'dependency'),
            review_reason: sourceBacked ? '' : 'Confirm source support before roadmap use.',
            source_signal: sourceBacked ? 'explicit_source_ref' : 'graph_projection'
        }
    };
};

const dedupeRoadmapItems = (items = []) => {
    const seen = new Set();
    return items.filter((item) => {
        if (!item?.id || seen.has(item.id)) {
            return false;
        }
        seen.add(item.id);
        return true;
    });
};

const derivedRoadmapAction = (item = {}, title = '') => ({
    ...item,
    id: `recommended_next_action-${item.id || 'item'}`,
    title,
    metadata: {
        ...(item.metadata || {}),
        layout_hint: 'recommended_next_action',
        rationale: 'Projected as a recommended roadmap action from the accepted graph.'
    }
});

export const getTeamRoadmapProjection = (projection, { title = 'Team Roadmap' } = {}) => {
    const contentNodes = projection.nodes.filter((node) => node.react_flow_type !== 'dataSource');
    const sourceBackedNodes = contentNodes.filter(hasSourceSupport);
    const taskRows = getTaskRows(projection);
    const typedWorkstreams = contentNodes.filter((node) => WORKSTREAM_TYPES.has(node.node_type));
    const directWorkstreamNodes = dedupeRoadmapItems([
        ...projection.roots.filter((node) => WORKSTREAM_TYPES.has(node.node_type)),
        ...typedWorkstreams
    ].map((node) => roadmapNodeItem(node, 'workstream')));
    const workstreamNodes = directWorkstreamNodes.length
        ? directWorkstreamNodes
        : sortExecutiveNodes(contentNodes)
              .slice(0, 6)
              .map((node) => roadmapNodeItem(node, 'workstream'));
    const workstreams = workstreamNodes.slice(0, 8).map((item) => {
        const childNodeIds = projection.childrenByParent.get(item.node_id) || [];
        const taskNodeIds = childNodeIds.filter((nodeId) =>
            taskRows.some((task) => task.id === nodeId)
        );
        return {
            ...item,
            child_node_ids: childNodeIds,
            task_node_ids: taskNodeIds
        };
    });
    const milestoneItems = [
        ...contentNodes
            .filter((node) => MILESTONE_TYPES.has(node.node_type))
            .map((node) => roadmapNodeItem(node, 'milestone')),
        ...taskRows
            .filter((task) => task.due_date)
            .map((task) => roadmapNodeItem(task, 'milestone'))
    ];
    const milestones = dedupeRoadmapItems(milestoneItems)
        .sort((a, b) => {
            if (a.due_date && b.due_date) {
                return String(a.due_date).localeCompare(String(b.due_date));
            }
            return Number(!a.due_date) - Number(!b.due_date) || a.title.localeCompare(b.title);
        })
        .slice(0, 8);
    const dependencies = dedupeRoadmapItems([
        ...projection.edges
            .filter((edge) =>
                DEPENDENCY_RELATIONSHIP_TYPES.has(String(edge.relationship_type || '').toLowerCase())
            )
            .map((edge) =>
                roadmapEdgeItem(
                    edge,
                    projection.nodeLookup.get(edge.source),
                    projection.nodeLookup.get(edge.target)
                )
            ),
        ...contentNodes
            .filter((node) => DEPENDENCY_NODE_TYPES.has(node.node_type))
            .map((node) => roadmapNodeItem(node, 'dependency'))
    ]).slice(0, 8);
    const risks = contentNodes
        .filter(
            (node) =>
                RISK_TYPES.has(node.node_type) ||
                node.status === 'needs_review' ||
                isLowConfidence(node)
        )
        .slice(0, 8)
        .map((node) => roadmapNodeItem(node, 'risk'));
    const requiredDecisions = contentNodes
        .filter(
            (node) =>
                DECISION_TYPES.has(node.node_type) ||
                nodeText(node).includes('decision') ||
                nodeText(node).includes('approve')
        )
        .slice(0, 8)
        .map((node) => roadmapNodeItem(node, 'required_decision'));
    const recommendedNextActions = dedupeRoadmapItems([
        ...taskRows.map((task) => roadmapNodeItem(task, 'recommended_next_action')),
        ...requiredDecisions
            .slice(0, 3)
            .map((item) => derivedRoadmapAction(item, `Resolve decision: ${item.title}`)),
        ...risks
            .slice(0, 3)
            .map((item) => derivedRoadmapAction(item, `Mitigate risk: ${item.title}`))
    ]).slice(0, 10);
    const context = `${contentNodes.length} content node${contentNodes.length === 1 ? '' : 's'}, ${sourceBackedNodes.length} source-backed, ${workstreams.length} workstream${workstreams.length === 1 ? '' : 's'}, ${dependencies.length} dependenc${dependencies.length === 1 ? 'y' : 'ies'}, ${risks.length} risk item${risks.length === 1 ? '' : 's'}, ${requiredDecisions.length} required decision${requiredDecisions.length === 1 ? '' : 's'}, and ${milestones.length} milestone${milestones.length === 1 ? '' : 's'}.`;

    return {
        contract_version: TEAM_ROADMAP_CONTRACT_VERSION,
        title,
        context,
        workstreams,
        dependencies,
        risks,
        required_decisions: requiredDecisions,
        milestones,
        recommended_next_actions: recommendedNextActions,
        source_backed_appendix: sourceBackedNodes.map((node) =>
            roadmapNodeItem(node, 'source_appendix')
        ),
        assumptions: [
            ...(contentNodes.length && sourceBackedNodes.length === 0
                ? ['No source-backed graph nodes are available; roadmap sections require review.']
                : []),
            ...(dependencies.some((item) => !item.source_backed)
                ? ['Some dependencies are inferred from graph relationships and need confirmation.']
                : [])
        ],
        metadata: {
            node_count: contentNodes.length,
            source_backed_node_count: sourceBackedNodes.length,
            workstream_count: workstreams.length,
            dependency_count: dependencies.length,
            risk_count: risks.length,
            required_decision_count: requiredDecisions.length,
            milestone_count: milestones.length,
            recommended_next_action_count: recommendedNextActions.length
        }
    };
};

export const getEnterpriseScoreRows = (projection) =>
    projection.nodes
        .filter((node) => node.react_flow_type !== 'dataSource')
        .map((node) => {
            const scores = {
                business_impact: businessImpactScore(node),
                implementation_effort: implementationReadinessScore(node),
                risk_severity: riskSeverityScore(node),
                source_coverage: sourceCoverageScore(node),
                owner_clarity: ownerClarityScore(node)
            };
            const readinessScore = Math.round(
                scores.business_impact * 0.22 +
                    scores.implementation_effort * 0.18 +
                    (100 - scores.risk_severity) * 0.22 +
                    scores.source_coverage * 0.22 +
                    scores.owner_clarity * 0.16
            );

            return {
                ...node,
                enterprise_score: Math.max(0, Math.min(100, readinessScore)),
                enterprise_readiness: readinessBand(readinessScore),
                enterprise_scores: scores,
                enterprise_reasons: enterpriseReasons(node, scores)
            };
        });

export const getEnterpriseReadinessSummary = (projection) => {
    const rows = getEnterpriseScoreRows(projection);
    const nodeCount = rows.length;
    const averageScore =
        nodeCount === 0
            ? 0
            : Math.round(
                  rows.reduce((total, row) => total + row.enterprise_score, 0) / nodeCount
              );
    const dimensionAverages = [
        'business_impact',
        'implementation_effort',
        'risk_severity',
        'source_coverage',
        'owner_clarity'
    ].reduce((averages, key) => {
        averages[key] =
            nodeCount === 0
                ? 0
                : Math.round(
                      rows.reduce((total, row) => total + row.enterprise_scores[key], 0) /
                          nodeCount
                  );
        return averages;
    }, {});
    const blockers = rows.filter(
        (row) =>
            row.enterprise_readiness === 'not_ready' ||
            row.enterprise_scores.risk_severity >= 75 ||
            row.enterprise_scores.source_coverage < 60 ||
            row.enterprise_scores.owner_clarity < 60
    );

    return {
        score: averageScore,
        label: averageScore >= 80 ? 'Enterprise ready' : averageScore >= 60 ? 'Watchlist' : 'Not ready',
        node_count: nodeCount,
        ready_count: rows.filter((row) => row.enterprise_readiness === 'enterprise_ready').length,
        watchlist_count: rows.filter((row) => row.enterprise_readiness === 'watchlist').length,
        not_ready_count: rows.filter((row) => row.enterprise_readiness === 'not_ready').length,
        dimension_averages: dimensionAverages,
        blockers: blockers.map((row) => ({
            id: row.id,
            title: row.title,
            enterprise_score: row.enterprise_score,
            reasons: row.enterprise_reasons
        }))
    };
};

