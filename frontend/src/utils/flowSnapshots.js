import {
    normalizeWorkspaceEdges,
    normalizeWorkspaceNodes
} from './manualNodes.js';
import { normalizeAIActionRuns } from './aiActionRuns.js';
import { DEFAULT_MAP_STYLE, normalizeMapStyle } from './mapStyles.js';

export const EMPTY_FLOW_SNAPSHOT = {
    nodes: [],
    edges: [],
    viewport: {},
    map_style: DEFAULT_MAP_STYLE,
    workspace_brief: {},
    source_library: [],
    activity_events: [],
    ai_action_runs: [],
    automations: []
};

const PERSIST_FULL_ACCEPTED_ARTIFACT_TYPES = new Set([
    'executive_summary',
    'executive_output',
    'news_article',
    'newsletter',
    'team_roadmap',
    'completeness_review'
]);

const summarizeAcceptedArtifactForPersistence = (artifact = {}) => {
    const artifactType = artifact.artifact_type || artifact.artifactType || '';
    if (PERSIST_FULL_ACCEPTED_ARTIFACT_TYPES.has(artifactType)) {
        return artifact;
    }

    return {
        id: artifact.id || '',
        artifact_type: artifactType,
        title: artifact.title || artifact.label || artifactType,
        status: artifact.status || artifact.review_state || '',
        review_state: artifact.review_state || artifact.status || '',
        source_refs: Array.isArray(artifact.source_refs) ? artifact.source_refs : [],
        assumptions: Array.isArray(artifact.assumptions) ? artifact.assumptions : [],
        metadata: {
            ...(artifact.metadata || {}),
            persisted_summary_only: true
        },
        provenance: artifact.provenance || undefined
    };
};

const sanitizeActivityEventForPersistence = (event = {}) => {
    const metadata = event.metadata && typeof event.metadata === 'object'
        ? { ...event.metadata }
        : event.metadata;

    if (metadata && Array.isArray(metadata.accepted_artifacts)) {
        metadata.accepted_artifacts = metadata.accepted_artifacts.map(
            summarizeAcceptedArtifactForPersistence
        );
    }

    return {
        ...event,
        metadata,
        undo: undefined
    };
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
            map_style: normalizeMapStyle(parsed.map_style),
            workspace_brief: parsed.workspace_brief || {},
            source_library: Array.isArray(parsed.source_library)
                ? parsed.source_library
                : [],
            activity_events: Array.isArray(parsed.activity_events)
                ? parsed.activity_events
                : [],
            ai_action_runs: normalizeAIActionRuns(parsed.ai_action_runs),
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
    mapStyle,
    workspaceBrief = {},
    sourceLibrary = [],
    activityEvents = [],
    aiActionRuns = [],
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
        map_style: normalizeMapStyle(mapStyle ?? flowObject.map_style),
        workspace_brief: workspaceBrief || {},
        source_library: Array.isArray(sourceLibrary) ? sourceLibrary : [],
        activity_events: Array.isArray(activityEvents) ? activityEvents : [],
        ai_action_runs: normalizeAIActionRuns(aiActionRuns),
        automations: Array.isArray(automations) ? automations : []
    };
};

export const stringifyFlowSnapshot = (snapshot) =>
    JSON.stringify(
        (() => {
            const activityEvents = Array.isArray(snapshot?.activity_events)
                ? snapshot.activity_events.map(sanitizeActivityEventForPersistence)
                : [];
            const aiActionRuns = normalizeAIActionRuns(snapshot?.ai_action_runs);
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
                    ai_action_runs: aiActionRuns,
                    automations
                },
                nodes: snapshot?.nodes || [],
                edges: snapshot?.edges || [],
                viewport: snapshot?.viewport || {},
                mapStyle: snapshot?.map_style || DEFAULT_MAP_STYLE,
                workspaceBrief: snapshot?.workspace_brief || {},
                sourceLibrary: snapshot?.source_library || [],
                activityEvents,
                aiActionRuns,
                automations
            });
        })()
    );
