import { useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useShallow } from 'zustand/shallow';
import flowStore from '../stores/flowStore';
import useStore from '../stores/store';
import useActivityStore from '../stores/activityStore';
import {
    normalizeAcceptedSourceDraftGraph,
    previewSourceDraftNodes,
    sourceBackedDraftGraph,
    summarizeSourceDraft
} from '../utils/sourceDraftReview';

const SourceDraftReviewPanel = () => {
    const selector = (state) => ({
        pendingSourceDraft: state.pendingSourceDraft,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        setViewPort: state.setViewPort,
        setSourceLibrary: state.setSourceLibrary,
        clearPendingSourceDraft: state.clearPendingSourceDraft
    });
    const {
        pendingSourceDraft,
        setNodes,
        setEdges,
        setViewPort,
        setSourceLibrary,
        clearPendingSourceDraft
    } = useStore(useShallow(selector));
    const setFlow = flowStore((s) => s.setFlow);
    const setFlowName = flowStore((s) => s.setFlowName);
    const setFlowType = flowStore((s) => s.setFlowType);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const addActivity = useActivityStore((s) => s.addActivity);
    const { fitView } = useReactFlow();

    const graph = pendingSourceDraft?.graph;
    const summary = useMemo(() => summarizeSourceDraft(graph), [graph]);
    const previewRows = useMemo(() => previewSourceDraftNodes(graph), [graph]);

    if (!pendingSourceDraft || !graph) {
        return null;
    }

    const commitDraft = (draftGraph, mode) => {
        const viewport = draftGraph.viewport || {};
        setFlow(pendingSourceDraft.flowId);
        setFlowName(pendingSourceDraft.flowName || 'Untitled workspace');
        setFlowType(pendingSourceDraft.flowType || 'automatic');
        setNodes(draftGraph.nodes || []);
        setEdges(draftGraph.edges || []);
        setViewPort(viewport.x || 0, viewport.y || 0, viewport.zoom || 1.25);
        if (Array.isArray(draftGraph.source_library)) {
            setSourceLibrary(draftGraph.source_library);
        }
        setSaveStatus('dirty');
        addActivity({
            type: 'source_draft_accepted',
            title: 'Accepted source draft',
            detail: pendingSourceDraft.sourceName,
            context:
                mode === 'source_backed'
                    ? 'Accepted only source-backed draft nodes.'
                    : 'Accepted generated source draft into the workspace.',
            source_ids: [pendingSourceDraft.sourceName].filter(Boolean)
        });
        clearPendingSourceDraft();
        window.setTimeout(() => fitView({ maxZoom: 1 }), 50);
    };

    const rejectDraft = () => {
        addActivity({
            type: 'source_draft_rejected',
            title: 'Rejected source draft',
            detail: pendingSourceDraft.sourceName,
            context: 'Generated source draft was dismissed before changing the workspace.',
            source_ids: [pendingSourceDraft.sourceName].filter(Boolean)
        });
        clearPendingSourceDraft();
    };

    const acceptSourceBacked = () => {
        commitDraft(sourceBackedDraftGraph(graph), 'source_backed');
    };

    return (
        <aside className="source-draft-review-panel" aria-label="Source draft review">
            <div className="source-draft-review-panel__header">
                <div>
                    <p className="source-draft-review-panel__eyebrow">
                        Source draft review
                    </p>
                    <h2>{pendingSourceDraft.sourceName || 'Imported source'}</h2>
                </div>
                <button
                    type="button"
                    className="source-draft-review-panel__icon"
                    onClick={rejectDraft}
                    aria-label="Close source draft review"
                >
                    x
                </button>
            </div>
            <div className="source-draft-review-panel__summary">
                <div>
                    <strong>{summary.totalNodes}</strong>
                    <span>nodes</span>
                </div>
                <div>
                    <strong>{summary.sourceBackedNodes}</strong>
                    <span>cited</span>
                </div>
                <div>
                    <strong>{summary.needsReviewNodes}</strong>
                    <span>review</span>
                </div>
                <div>
                    <strong>{summary.unsourcedNodes}</strong>
                    <span>unsourced</span>
                </div>
            </div>
            <div className="source-draft-review-panel__meta">
                <span>{pendingSourceDraft.intakeRoleLabel || 'No intake role'}</span>
                <span>{pendingSourceDraft.intakeModel || 'auto model'}</span>
            </div>
            <div className="source-draft-review-panel__list">
                {previewRows.length ? (
                    previewRows.map((row) => (
                        <div key={row.id} className="source-draft-review-panel__row">
                            <span>{row.label}</span>
                            <em
                                className={
                                    row.sourceBacked
                                        ? 'source-draft-review-panel__badge source-draft-review-panel__badge--cited'
                                        : 'source-draft-review-panel__badge'
                                }
                            >
                                {row.sourceBacked
                                    ? 'cited'
                                    : row.needsReview
                                      ? 'needs review'
                                      : 'unsourced'}
                            </em>
                        </div>
                    ))
                ) : (
                    <p className="source-draft-review-panel__empty">
                        No draft nodes were returned.
                    </p>
                )}
            </div>
            <div className="source-draft-review-panel__actions">
                <button
                    type="button"
                    onClick={() => commitDraft(normalizeAcceptedSourceDraftGraph(graph), 'all')}
                >
                    Accept draft
                </button>
                <button
                    type="button"
                    className="secondary"
                    onClick={acceptSourceBacked}
                    disabled={summary.sourceBackedNodes === 0}
                >
                    Accept cited only
                </button>
                <button type="button" className="ghost" onClick={rejectDraft}>
                    Cancel
                </button>
            </div>
        </aside>
    );
};

export default SourceDraftReviewPanel;
