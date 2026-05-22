import {
    DECISION_TYPES,
    DEPENDENCY_NODE_TYPES,
    FLOW_NODE_TYPES,
    FLOW_RELATIONSHIP_TYPES,
    flowBranchKind,
    flowBranchLabel,
    hasSourceSupport,
    normalizeSignal,
    relationshipTypeForEdge
} from './packageReady.js';

const flowchartNodeKind = (node = {}) => {
    if (DECISION_TYPES.has(node.node_type)) {
        return 'decision';
    }
    if (DEPENDENCY_NODE_TYPES.has(node.node_type) || node.status === 'blocked') {
        return 'dependency';
    }
    if (['handoff', 'milestone', 'phase', 'checkpoint'].includes(node.node_type)) {
        return node.node_type;
    }
    return 'step';
};

const flowchartNodeShape = (step = {}, incoming = [], outgoing = []) => {
    if (step.flow_kind === 'decision') {
        return 'decision';
    }
    if (!incoming.length) {
        return 'terminator';
    }
    if (!outgoing.length || step.flow_kind === 'milestone' || step.flow_kind === 'checkpoint') {
        return 'terminator';
    }
    if (step.flow_kind === 'dependency') {
        return 'document';
    }
    return 'process';
};

const orderFlowchartNodes = (projection, candidateIds) => {
    const ordered = [];
    const seen = new Set();
    const visit = (nodeId) => {
        if (seen.has(nodeId) || !candidateIds.has(nodeId)) {
            return;
        }
        seen.add(nodeId);
        const node = projection.nodeLookup.get(nodeId);
        if (node) {
            ordered.push(node);
        }
        (projection.childrenByParent.get(nodeId) || []).forEach(visit);
    };

    projection.roots.forEach((node) => visit(node.id));
    projection.nodes.forEach((node) => visit(node.id));
    return ordered;
};

export const getFlowchartProjection = (projection) => {
    const contentNodes = projection.nodes.filter((node) => node.react_flow_type !== 'dataSource');
    const flowEdges = projection.edges.filter((edge) =>
        FLOW_RELATIONSHIP_TYPES.has(normalizeSignal(relationshipTypeForEdge(edge)))
    );
    const connectedFlowIds = new Set(
        flowEdges.flatMap((edge) => [edge.source, edge.target]).filter(Boolean)
    );
    const typedFlowIds = new Set(
        contentNodes
            .filter((node) => FLOW_NODE_TYPES.has(normalizeSignal(node.node_type)))
            .map((node) => node.id)
    );
    const candidateIds = new Set([...connectedFlowIds, ...typedFlowIds]);

    if (!candidateIds.size && contentNodes.length) {
        contentNodes.slice(0, 12).forEach((node) => candidateIds.add(node.id));
    }

    const baseSteps = orderFlowchartNodes(projection, candidateIds).map((node, index) => ({
        ...node,
        order: index + 1,
        flow_kind: flowchartNodeKind(node),
        source_backed: hasSourceSupport(node),
        needs_review:
            node.status === 'needs_review' ||
            node.node_type === 'needs_review' ||
            !hasSourceSupport(node)
    }));
    const baseStepLookup = new Map(baseSteps.map((step) => [step.id, step]));
    const stepIds = new Set(baseSteps.map((step) => step.id));
    const connectors = flowEdges
        .filter((edge) => stepIds.has(edge.source) && stepIds.has(edge.target))
        .map((edge) => {
            const sourceStep = baseStepLookup.get(edge.source);
            const branchKind = sourceStep?.flow_kind === 'decision' ? flowBranchKind(edge) : 'default';
            const relationshipType = relationshipTypeForEdge(edge) || 'next';

            return {
                id: edge.id || `${edge.source}-${edge.target}`,
                source: edge.source,
                target: edge.target,
                source_title: projection.nodeLookup.get(edge.source)?.title || edge.source,
                target_title: projection.nodeLookup.get(edge.target)?.title || edge.target,
                source_flow_kind: sourceStep?.flow_kind || '',
                target_flow_kind: baseStepLookup.get(edge.target)?.flow_kind || '',
                relationship_type: relationshipType,
                label: flowBranchLabel(edge, sourceStep),
                branch_kind: branchKind,
                condition:
                    edge.condition ||
                    edge.data?.condition ||
                    edge.metadata?.condition ||
                    '',
                exception_path:
                    normalizeSignal(relationshipType) === 'exception' ||
                    edge.exception_path === true ||
                    edge.data?.exception_path === true ||
                    edge.metadata?.exception_path === true
            };
        });
    const steps = baseSteps.map((step) => {
        const incoming = connectors.filter((connector) => connector.target === step.id);
        const outgoing = connectors.filter((connector) => connector.source === step.id);

        return {
            ...step,
            shape: flowchartNodeShape(step, incoming, outgoing),
            incoming_count: incoming.length,
            outgoing_count: outgoing.length
        };
    });

    return {
        steps,
        connectors,
        decisions: steps.filter((step) => step.flow_kind === 'decision'),
        blockers: steps.filter((step) => step.flow_kind === 'dependency'),
        metadata: {
            step_count: steps.length,
            connector_count: connectors.length,
            decision_count: steps.filter((step) => step.flow_kind === 'decision').length,
            source_backed_count: steps.filter((step) => step.source_backed).length
        }
    };
};

