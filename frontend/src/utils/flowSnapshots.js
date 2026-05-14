export const EMPTY_FLOW_SNAPSHOT = {
    nodes: [],
    edges: [],
    viewport: {},
    workspace_brief: {},
    activity_events: []
};

export const parseFlowSnapshot = (flowJson) => {
    if (!flowJson) {
        return EMPTY_FLOW_SNAPSHOT;
    }

    try {
        const parsed = JSON.parse(flowJson);
        return {
            nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
            edges: Array.isArray(parsed.edges) ? parsed.edges : [],
            viewport: parsed.viewport || {},
            workspace_brief: parsed.workspace_brief || {},
            activity_events: Array.isArray(parsed.activity_events)
                ? parsed.activity_events
                : []
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
    activityEvents = []
}) => ({
    ...flowObject,
    nodes,
    edges,
    viewport: viewport || flowObject.viewport || {},
    workspace_brief: workspaceBrief || {},
    activity_events: Array.isArray(activityEvents) ? activityEvents : []
});

export const stringifyFlowSnapshot = (snapshot) =>
    JSON.stringify({
        ...EMPTY_FLOW_SNAPSHOT,
        ...(snapshot || {}),
        nodes: snapshot?.nodes || [],
        edges: snapshot?.edges || [],
        viewport: snapshot?.viewport || {},
        workspace_brief: snapshot?.workspace_brief || {},
        activity_events: Array.isArray(snapshot?.activity_events)
            ? snapshot.activity_events.map((event) => ({
                  ...event,
                  undo: undefined
              }))
            : []
    });
