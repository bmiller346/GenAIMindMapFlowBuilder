import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import modalStore from '../stores/modalStore';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import useAutomationStore from '../stores/automationStore';

const summarizeNode = (node = {}) => ({
    id: node.id,
    type: node.type,
    title: node.data?.title || node.data?.content || node.data?.summ || '',
    node_type: node.data?.node_type || '',
    status: node.data?.status || '',
    selected: Boolean(node.selected),
    hidden: Boolean(node.hidden),
    source_refs: Array.isArray(node.data?.source_refs)
        ? node.data.source_refs.length
        : Array.isArray(node.data?.data?.source_refs)
          ? node.data.data.source_refs.length
          : 0,
    position: node.position
});

const summarizeEdge = (edge = {}) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    hidden: Boolean(edge.hidden)
});

const summarizeSource = (source = {}) => ({
    id: source.id,
    title: source.title,
    status: source.status,
    type: source.type || source.type_label,
    chunks: Array.isArray(source.chunks) ? source.chunks.length : 0,
    normalized_document_id: source.normalized_document_id
});

const summarizePendingSourceDraft = (draft = {}) => ({
    id: draft.id,
    sourceName: draft.sourceName,
    sourceType: draft.sourceType,
    componentId: draft.componentId,
    flowType: draft.flowType,
    initialCanvas: Boolean(draft.initialCanvas),
    graph_nodes: Array.isArray(draft.graph?.nodes) ? draft.graph.nodes.length : 0,
    graph_edges: Array.isArray(draft.graph?.edges) ? draft.graph.edges.length : 0,
    source_library_items: Array.isArray(draft.graph?.source_library)
        ? draft.graph.source_library.length
        : Array.isArray(draft.graph?.source_library?.documents)
          ? draft.graph.source_library.documents.length
          : 0
});

const DevDebugModal = () => {
    const popNode = modalStore((s) => s.popNode);
    const [copyState, setCopyState] = useState('Copy debug JSON');
    const [captureStartedAt, setCaptureStartedAt] = useState('');
    const workspaceState = useStore(
        useShallow((s) => ({
            nodes: s.nodes,
            edges: s.edges,
            activeView: s.activeView,
            activeCanvasView: s.activeCanvasView,
            activeGraphFilters: s.activeGraphFilters,
            selectedBranchId: s.selectedBranchId,
            inspectorNodeId: s.inspectorNodeId,
            workspaceBrief: s.workspaceBrief,
            sourceLibrary: s.sourceLibrary,
            pendingSourceDraft: s.pendingSourceDraft,
            generatedHelperPreviews: s.generatedHelperPreviews,
            activeAIDraftSession: s.activeAIDraftSession,
            aiActionRuns: s.aiActionRuns
        }))
    );
    const flowState = flowStore(
        useShallow((s) => ({
            flow_id: s.flow_id,
            flow_name: s.flow_name,
            flow_type: s.flow_type,
            saveStatus: s.saveStatus,
            lastSavedAt: s.lastSavedAt,
            lastSaveError: s.lastSaveError
        }))
    );
    const activities = useActivityStore((s) => s.activities);
    const automations = useAutomationStore((s) => s.automations);
    const visibleActivities = useMemo(() => {
        if (!captureStartedAt) {
            return activities;
        }
        const startedMs = Date.parse(captureStartedAt);
        if (!Number.isFinite(startedMs)) {
            return activities;
        }
        return activities.filter((activity) => {
            const activityMs = Date.parse(activity?.created_at || activity?.updated_at || '');
            return Number.isFinite(activityMs) && activityMs >= startedMs;
        });
    }, [activities, captureStartedAt]);

    const debugPayload = useMemo(
        () => ({
            captured_at: new Date().toISOString(),
            capture: {
                started_at: captureStartedAt || null,
                activity_events_since_capture: visibleActivities.length,
                full_activity_events_available: activities.length
            },
            url: window.location.href,
            flow: flowState,
            view_state: {
                activeView: workspaceState.activeView,
                activeCanvasView: workspaceState.activeCanvasView,
                activeGraphFilters: workspaceState.activeGraphFilters,
                selectedBranchId: workspaceState.selectedBranchId,
                inspectorNodeId: workspaceState.inspectorNodeId
            },
            counts: {
                nodes: workspaceState.nodes.length,
                edges: workspaceState.edges.length,
                sources: workspaceState.sourceLibrary.length,
                aiActionRuns: workspaceState.aiActionRuns.length,
                activityEvents: visibleActivities.length,
                totalActivityEvents: activities.length,
                automations: automations.length
            },
            nodes: workspaceState.nodes.map(summarizeNode),
            edges: workspaceState.edges.map(summarizeEdge),
            sources: workspaceState.sourceLibrary.map(summarizeSource),
            pendingSourceDraft: workspaceState.pendingSourceDraft
                ? summarizePendingSourceDraft(workspaceState.pendingSourceDraft)
                : null,
            workspaceBrief: workspaceState.workspaceBrief,
            generatedHelperPreviews: workspaceState.generatedHelperPreviews,
            activeAIDraftSession: workspaceState.activeAIDraftSession,
            recentActivity: visibleActivities.slice(0, 25),
            automations
        }),
        [activities, automations, captureStartedAt, flowState, visibleActivities, workspaceState]
    );

    const debugText = useMemo(
        () => JSON.stringify(debugPayload, null, 2),
        [debugPayload]
    );

    const copyDebugText = async () => {
        try {
            await navigator.clipboard.writeText(debugText);
            setCopyState('Copied');
            window.setTimeout(() => setCopyState('Copy debug JSON'), 1400);
        } catch (error) {
            setCopyState('Select all below');
        }
    };

    const clearCapture = () => {
        setCaptureStartedAt(new Date().toISOString());
        setCopyState('Copy debug JSON');
    };

    return (
        <div className="modal-container dev-debug-modal">
            <div className="dev-debug-header">
                <div>
                    <span>Developer Debug</span>
                    <strong>Copyable workspace state</strong>
                </div>
                <div>
                    <button type="button" onClick={clearCapture}>
                        Clear capture
                    </button>
                    <button type="button" onClick={copyDebugText}>
                        {copyState}
                    </button>
                    <button type="button" onClick={() => popNode()}>
                        Close
                    </button>
                </div>
            </div>
            <div className="dev-debug-summary">
                <span>Canvas: {workspaceState.activeCanvasView}</span>
                <span>Surface: {workspaceState.activeView}</span>
                <span>Filters: {workspaceState.activeGraphFilters.length || 0}</span>
                <span>Nodes: {workspaceState.nodes.length}</span>
                <span>Edges: {workspaceState.edges.length}</span>
                <span>
                    Activity: {visibleActivities.length}
                    {captureStartedAt ? ` / ${activities.length}` : ''}
                </span>
                {captureStartedAt ? <span>Fresh capture</span> : null}
            </div>
            <textarea
                readOnly
                className="dev-debug-output"
                value={debugText}
                spellCheck={false}
                aria-label="Debug JSON"
                onFocus={(event) => event.currentTarget.select()}
            />
        </div>
    );
};

export default DevDebugModal;
