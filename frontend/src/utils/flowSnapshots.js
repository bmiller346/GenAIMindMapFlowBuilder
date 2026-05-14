import {
    normalizeWorkspaceEdges,
    normalizeWorkspaceNodes
} from './manualNodes.js';

export const EMPTY_FLOW_SNAPSHOT = {
    nodes: [],
    edges: [],
    viewport: {},
    workspace_brief: {},
    source_library: [],
    activity_events: [],
    automations: []
};

export const parseFlowSnapshot = (flowJson) => {
    if (!flowJson) {
        return EMPTY_FLOW_SNAPSHOT;
    }

    try {
        const parsed = JSON.parse(flowJson);
        const nodes = normalizeWorkspaceNodes(
            Array.isArray(parsed.nodes) ? parsed.nodes : []
        );
        return {
            nodes,
            edges: normalizeWorkspaceEdges(
                nodes,
                Array.isArray(parsed.edges) ? parsed.edges : []
            ),
            viewport: parsed.viewport || {},
            workspace_brief: parsed.workspace_brief || {},
            source_library: Array.isArray(parsed.source_library)
                ? parsed.source_library
                : [],
            activity_events: Array.isArray(parsed.activity_events)
                ? parsed.activity_events
                : [],
            automations: Array.isArray(parsed.automations) ? parsed.automations : []
        };
    } catch (error) {
        console.error('Could not parse saved flow JSON', error);
        return EMPTY_FLOW_SNAPSHOT;
    }
};

export const createFlowSnapshot = ({
    flowObject = {},
    nodes = [],
    edges = [],
    viewport,
    workspaceBrief = {},
    sourceLibrary = [],
    activityEvents = [],
    automations = []
}) => {
    const normalizedNodes = normalizeWorkspaceNodes(nodes);
    const nodeIds = new Set(normalizedNodes.map((node) => node.id));
    const connectedEdges = normalizeWorkspaceEdges(normalizedNodes, edges).filter(
        (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );

    return {
        ...flowObject,
        nodes: normalizedNodes,
        edges: connectedEdges,
        viewport: viewport || flowObject.viewport || {},
        workspace_brief: workspaceBrief || {},
        source_library: Array.isArray(sourceLibrary) ? sourceLibrary : [],
        activity_events: Array.isArray(activityEvents) ? activityEvents : [],
        automations: Array.isArray(automations) ? automations : []
    };
};

export const stringifyFlowSnapshot = (snapshot) =>
    JSON.stringify(
        (() => {
            const activityEvents = Array.isArray(snapshot?.activity_events)
                ? snapshot.activity_events.map((event) => ({
                      ...event,
                      undo: undefined
                  }))
                : [];
            const automations = Array.isArray(snapshot?.automations)
                ? snapshot.automations.map((automation) => ({
                      ...automation,
                      run_history: Array.isArray(automation.run_history)
                          ? automation.run_history
                          : []
                  }))
                : [];

            return createFlowSnapshot({
                flowObject: {
                    ...EMPTY_FLOW_SNAPSHOT,
                    ...(snapshot || {}),
                    activity_events: activityEvents,
                    automations
                },
                nodes: snapshot?.nodes || [],
                edges: snapshot?.edges || [],
                viewport: snapshot?.viewport || {},
                workspaceBrief: snapshot?.workspace_brief || {},
                sourceLibrary: snapshot?.source_library || [],
                activityEvents,
                automations
            });
        })()
    );
