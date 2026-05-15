/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import modalStore from '../stores/modalStore';
import DataSourceSelect from '../global-components/DataSourceSelect';
import PromptModal from '../modals/PromptModal';
import WorkspaceBriefModal from '../modals/WorkspaceBriefModal';
import {
    buildFilteredGraphProjection,
    getConnectionRows,
    getKnowledgeGraphRows,
    getTaskPreviewRows,
    getTaskRows
} from './graphProjection';
import { isNudgeCategoryEnabled } from '../config/localSettings';
import ChecklistPreview from './ChecklistPreview';
import MissingInfoPreview from './MissingInfoPreview';
import SmeQuestionsPreview from './SmeQuestionsPreview';
import SourceRepairPreview from './SourceRepairPreview';
import MondaySelectionInput from './MondaySelectionInput';
import MondayStatusBackPreview from './MondayStatusBackPreview';
import { withLocalPreviewAcceptance } from './localPreviewMetadata';
import {
    makePreviewDiffSummary,
    PreviewDiffSummary
} from './previewDiffSummary';
import useActivityStore from '../stores/activityStore';
import flowStore from '../stores/flowStore';
import { createWorkspaceNode, getRootPosition } from '../utils/manualNodes';

const CORE_VIEWS = [
    { id: 'mindmap', label: 'Mind Map', detail: 'Hierarchical canvas lens' },
    { id: 'knowledgeGraph', label: 'Knowledge Graph', detail: 'Entity and relationship lens' },
    { id: 'outline', label: 'Outline', detail: 'Hierarchy as rows' },
    { id: 'tasks', label: 'Tasks', detail: 'Accepted task fields' },
    { id: 'table', label: 'Table', detail: 'Accepted node fields' }
];

const REVIEW_VIEWS = [
    { id: 'preview', label: 'Task preview' },
    { id: 'gaps', label: 'Missing info' },
    { id: 'sme', label: 'SME questions' },
    { id: 'sources', label: 'Source repair' }
];

const AI_OUTPUT_VIEWS = [
    { id: 'connections', label: 'Find connections', detail: 'AI can propose relationship edges' },
    { id: 'flowchart', label: 'Create flow chart', detail: 'AI can infer process structure' },
    { id: 'chartData', label: 'Extract chart data', detail: 'AI can extract structured chart rows' },
    { id: 'preview', label: 'Generate task preview', detail: 'AI or local task projection' },
    { id: 'checklist', label: 'Create checklist', detail: 'AI or local checklist projection' }
];

const AI_ACTION_PRESETS = {
    knowledgeGraph: {
        role: 'gap-analyst',
        action: 'find_duplicate_overlapping_nodes',
        scope: 'workspace'
    },
    connections: {
        role: 'gap-analyst',
        action: 'find_duplicate_overlapping_nodes',
        scope: 'workspace'
    },
    flowchart: {
        role: 'workflow-mapper',
        action: 'custom_prompt',
        scope: 'branch'
    },
    chartData: {
        role: 'data-table-interpreter',
        action: 'interpret_table_data',
        scope: 'branch'
    },
    tasks: {
        role: 'task-planner',
        action: 'generate_tasks',
        scope: 'branch'
    },
    checklist: {
        role: 'training-guide-builder',
        action: 'generate_checklist',
        scope: 'branch'
    },
    gaps: {
        role: 'gap-analyst',
        action: 'find_gaps',
        scope: 'workspace'
    },
    sme: {
        role: 'sme-question-generator',
        action: 'create_sme_questions',
        scope: 'workspace'
    },
    sources: {
        role: 'source-ref-repair',
        action: 'find_missing_source_support',
        scope: 'workspace'
    }
};

const HANDOFF_VIEWS = [
    { id: 'mondayInput', label: 'Implementation package' },
    { id: 'mondayStatus', label: 'Status review' }
];

const GRAPH_FILTERS = [
    { id: 'source-backed', label: 'Source-backed' },
    { id: 'needs-review', label: 'Needs review' },
    { id: 'manual', label: 'Manual' },
    { id: 'ai-generated', label: 'AI-generated' },
    { id: 'tasks-only', label: 'Tasks only' },
    { id: 'unassigned', label: 'Unassigned' },
    { id: 'missing-due-date', label: 'Missing due' },
    { id: 'missing-source', label: 'Missing source' },
    { id: 'low-confidence', label: 'Low confidence' },
    { id: 'hidden-from-export', label: 'Hidden export' }
];

const sourceLabel = (node) => {
    const ref = node.source_ref || {};
    const parts = [ref.document_id, ref.page ? `p. ${ref.page}` : '', ref.section]
        .filter(Boolean)
        .join(' | ');

    return parts || 'No source';
};

const rowTypeLabel = (node) => {
    if (node.table_rows?.length) {
        return `${node.node_type} table`;
    }

    return node.node_type;
};

const tableShapeLabel = (node) => {
    if (!node.table_rows?.length) {
        return '-';
    }

    const columnCount = node.table_columns?.length || 0;
    return `${node.table_rows.length} x ${columnCount || '-'} table`;
};

const outputState = (row) => {
    if (row.monday_selection_input || row.monday_status_back_input) {
        return 'Applied/exported';
    }
    if (row.local_preview_acceptances?.some((acceptance) => acceptance.accepted)) {
        return 'Accepted';
    }
    if (row.generated_preview_item) {
        return 'AI-generated';
    }
    return 'Locally projected';
};

const OutputStatePill = ({ state }) => (
    <span className={`output-state-pill output-state-${state.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
        {state}
    </span>
);

const mergeGeneratedTaskPreviewRows = (rows, generatedPreview) => {
    const items = Array.isArray(generatedPreview?.preview_items)
        ? generatedPreview.preview_items
        : [];
    if (items.length === 0) {
        return rows;
    }

    const itemByNodeId = new Map(items.map((item) => [item.node_id, item]));
    return rows.map((row) => {
        const item = itemByNodeId.get(row.id);
        const mutation = item?.proposed_mutation || {};
        const taskProjection = mutation.task_projection || {};
        if (!item) {
            return row;
        }

        return {
            ...row,
            generated_preview_item: item,
            preview_type: taskProjection.preview_type || mutation.node_type || row.preview_type,
            preview_status: taskProjection.preview_status || mutation.status || row.preview_status,
            priority: taskProjection.priority ?? mutation.priority ?? row.priority,
            owner_id: taskProjection.owner_id ?? mutation.owner_id ?? row.owner_id,
            due_date: taskProjection.due_date ?? mutation.due_date ?? row.due_date,
            included: true
        };
    });
};

const OutlineNode = ({ node, childrenByParent, nodeLookup, depth, onSelectBranch, onOpenNode }) => {
    const children = (childrenByParent.get(node.id) || [])
        .map((childId) => nodeLookup.get(childId))
        .filter(Boolean);

    return (
        <li>
            <div className="local-outline-row" style={{ paddingLeft: depth * 14 }}>
                <div className="local-outline-actions">
                    <button type="button" onClick={() => onSelectBranch(node.id)}>
                        Branch
                    </button>
                    <button type="button" onClick={() => onOpenNode(node.id)}>
                        Inspect
                    </button>
                </div>
                <span>{node.title}</span>
                <small>{rowTypeLabel(node)}</small>
            </div>
            {children.length > 0 ? (
                <ol>
                    {children.map((child) => (
                        <OutlineNode
                            key={child.id}
                            node={child}
                            childrenByParent={childrenByParent}
                            nodeLookup={nodeLookup}
                            depth={depth + 1}
                            onSelectBranch={onSelectBranch}
                            onOpenNode={onOpenNode}
                        />
                    ))}
                </ol>
            ) : null}
        </li>
    );
};

const EmptyState = ({
    activeView,
    canUseWorkspace,
    onAddRoot,
    onAddSource,
    onOpenBrief,
    onAskAi,
    onSetView,
    showCanvasNudges
}) => {
    const isReviewOutput = ['preview', 'checklist', 'gaps', 'sme', 'sources'].includes(activeView);
    const isAiOutput = ['connections', 'flowchart', 'chartData'].includes(activeView);
    const primaryLabel =
        activeView === 'sources'
            ? 'Add source'
            : isReviewOutput || isAiOutput
              ? 'Start with AI'
              : 'Create root node';

    return (
        <div className="local-view-empty">
            {showCanvasNudges ? (
                <span className="local-view-empty-kicker">
                    {isReviewOutput || isAiOutput ? 'Output needs graph context' : 'Start your Think Space'}
                </span>
            ) : null}
            <strong>No graph nodes yet</strong>
            {showCanvasNudges ? (
                <span>
                    {isReviewOutput || isAiOutput
                        ? 'Add a source or root node first, then generate a preview-first output from the same panel.'
                        : activeView === 'mindmap'
                          ? 'Add sources, sketch a root node, or define the brief that AI should use.'
                          : 'This view will populate once the workspace has graph nodes.'}
                </span>
            ) : null}
            <div className="local-view-empty-actions">
                <button
                    type="button"
                    onClick={
                        primaryLabel === 'Add source'
                            ? onAddSource
                            : primaryLabel === 'Start with AI'
                              ? () => onAskAi()
                              : onAddRoot
                    }
                    disabled={primaryLabel !== 'Add source' && !canUseWorkspace}
                >
                    {primaryLabel}
                </button>
                <button type="button" onClick={onAddSource}>
                    Add source
                </button>
                <button type="button" onClick={onAddRoot} disabled={!canUseWorkspace}>
                    Create root node
                </button>
                <button type="button" onClick={onOpenBrief}>
                    Set brief
                </button>
                {isReviewOutput ? (
                    <button type="button" onClick={() => onSetView('gaps')} disabled={!canUseWorkspace}>
                        Review gaps
                    </button>
                ) : null}
            </div>
            {!canUseWorkspace ? (
                <small>Open or create a workspace to add nodes or ask AI.</small>
            ) : null}
        </div>
    );
};

const LocalViewsPanel = ({ hidden, onSelectNode }) => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        setNodes: state.setNodes,
        activeView: state.activeView,
        setActiveView: state.setActiveView,
        selectedBranchId: state.selectedBranchId,
        setSelectedBranchId: state.setSelectedBranchId,
        generatedHelperPreviews: state.generatedHelperPreviews,
        clearGeneratedHelperPreview: state.clearGeneratedHelperPreview,
        activeGraphFilters: state.activeGraphFilters,
        setActiveGraphFilters: state.setActiveGraphFilters,
        nudgePreferences: state.nudgePreferences
    });
    const {
        nodes,
        edges,
        setNodes,
        activeView,
        setActiveView,
        selectedBranchId,
        setSelectedBranchId,
        generatedHelperPreviews,
        clearGeneratedHelperPreview,
        activeGraphFilters,
        setActiveGraphFilters,
        nudgePreferences
    } = useStore(useShallow(selector));
    const [acceptedPreviewIds, setAcceptedPreviewIds] = useState(new Set());
    const addActivity = useActivityStore((s) => s.addActivity);
    const recordActivity = useActivityStore((s) => s.recordActivity);
    const flowId = flowStore((s) => s.flow_id);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const pushNode = modalStore((s) => s.pushNode);

    const projection = useMemo(
        () =>
            buildFilteredGraphProjection(nodes, edges, {
                branchId: selectedBranchId,
                filters: activeGraphFilters
            }),
        [activeGraphFilters, nodes, edges, selectedBranchId]
    );
    const activeFilterSet = useMemo(
        () => new Set(activeGraphFilters),
        [activeGraphFilters]
    );
    const taskRows = useMemo(() => getTaskRows(projection), [projection]);
    const knowledgeGraphRows = useMemo(() => getKnowledgeGraphRows(projection), [projection]);
    const connectionRows = useMemo(() => getConnectionRows(projection), [projection]);
    const generatedTaskPreview = generatedHelperPreviews.projectPlannerTasks;
    const generatedChecklistPreview = generatedHelperPreviews.projectPlannerChecklist;
    const generatedSourceRepairPreview = generatedHelperPreviews.sourceLibrarianSources;
    const generatedReviewerGapsPreview = generatedHelperPreviews.reviewerGaps;
    const generatedReviewerSmePreview = generatedHelperPreviews.reviewerSmeQuestions;
    const generatedIntegrationHandoffPreview = generatedHelperPreviews.integrationOperatorHandoff;
    const generatedIntegrationSyncPreview = generatedHelperPreviews.integrationOperatorSync;
    const previewRows = useMemo(
        () => mergeGeneratedTaskPreviewRows(getTaskPreviewRows(projection), generatedTaskPreview),
        [projection, generatedTaskPreview]
    );
    const allPreviewIds = useMemo(
        () => new Set(previewRows.filter((row) => row.included).map((row) => row.id)),
        [previewRows]
    );
    const taskPreviewDiffSummary = useMemo(
        () =>
            makePreviewDiffSummary({
                rows: previewRows,
                activeIds:
                    acceptedPreviewIds.size > 0 ? acceptedPreviewIds : allPreviewIds,
                artifactLabel: 'task preview item',
                updatedFields: ['type', 'status', 'owner/status fields'],
                relationshipEdges: projection.edges.length,
                mode: generatedTaskPreview ? 'generated' : 'local'
            }),
        [acceptedPreviewIds, allPreviewIds, generatedTaskPreview, previewRows, projection.edges.length]
    );

    const selectedRoot = projection.nodes.find((node) => node.id === selectedBranchId);
    const activePreviewIds =
        acceptedPreviewIds.size > 0 ? acceptedPreviewIds : allPreviewIds;
    const activeReviewView = REVIEW_VIEWS.some((view) => view.id === activeView)
        ? activeView
        : '';
    const activeHandoffView = HANDOFF_VIEWS.some((view) => view.id === activeView)
        ? activeView
        : '';
    const showCanvasNudges = isNudgeCategoryEnabled(nudgePreferences, 'canvas');
    const showTaskNudges = isNudgeCategoryEnabled(nudgePreferences, 'tasks');

    const toggleGraphFilter = (filterId) => {
        const nextFilters = activeFilterSet.has(filterId)
            ? activeGraphFilters.filter((id) => id !== filterId)
            : [...activeGraphFilters, filterId];
        setActiveGraphFilters(nextFilters);
    };

    const togglePreviewRow = (nodeId) => {
        setAcceptedPreviewIds(() => {
            const next = new Set(activePreviewIds);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    };

    const selectBranch = (nodeId) => {
        setSelectedBranchId(nodeId);
        onSelectNode?.(nodeId);
    };

    const openNode = (nodeId) => {
        onSelectNode?.(nodeId);
    };

    const addRootNode = () => {
        if (!flowId) {
            return;
        }

        const manualNode = createWorkspaceNode({
            title: 'New workspace root',
            nodeType: 'concept',
            position: getRootPosition(nodes)
        });
        setNodes([...nodes, manualNode]);
        setSaveStatus('dirty');
        recordActivity({
            type: 'manual_node_created',
            title: 'Manual node added',
            summary: 'Added New workspace root from the empty workspace state.',
            node_ids: [manualNode.id],
            metadata: {
                node_type: 'concept'
            }
        });
    };

    const openSourcePicker = () => {
        pushNode(DataSourceSelect);
    };

    const openBrief = () => {
        pushNode(WorkspaceBriefModal);
    };

    const openWorkspaceAskAi = (preset = {}) => {
        if (!flowId) {
            return;
        }
        const preferredScope =
            preset.scope === 'branch' && selectedBranchId ? 'branch' : 'workspace';
        pushNode(PromptModal, {
            scope: preferredScope,
            nodeId: preferredScope === 'branch' ? selectedBranchId : undefined,
            initialRoleId: preset.role,
            initialActionId: preset.action
        });
        recordActivity({
            type: 'ai_action_picker_opened',
            title: 'Workspace Ask AI opened',
            summary: preset.action
                ? `Opened preview-first AI action: ${preset.action}.`
                : 'Opened preview-first AI actions from the workspace.',
            metadata: {
                scope: preferredScope,
                action: preset.action || ''
            }
        });
    };

    const openAiPreset = (presetKey) => {
        openWorkspaceAskAi(AI_ACTION_PRESETS[presetKey]);
    };

    const acceptTaskPreview = () => {
        if (activePreviewIds.size === 0) {
            return;
        }

        const acceptedAt = new Date().toISOString();
        const rowsById = new Map(previewRows.map((row) => [row.id, row]));

        setNodes(
            nodes.map((node) => {
                if (!activePreviewIds.has(node.id)) {
                    return node;
                }

                const row = rowsById.get(node.id);
                const mutation = row?.generated_preview_item?.proposed_mutation || {};
                const taskProjection = mutation.task_projection || {};
                const data = withLocalPreviewAcceptance(node.data, {
                    flow: row?.generated_preview_item
                        ? 'generated_project_planner_task'
                        : 'branch_to_task',
                    accepted_at: acceptedAt,
                    node_id: node.id,
                    helper_id: row?.generated_preview_item ? 'project_planner' : undefined,
                    preview_id: generatedTaskPreview?.preview_id,
                    preview_item_id: row?.generated_preview_item?.id,
                    preview_type: row?.preview_type || 'task',
                    preview_status: row?.preview_status || 'needs_review'
                });

                return {
                    ...node,
                    data: {
                        ...data,
                        node_type: mutation.node_type || node.data?.node_type || 'task',
                        status: mutation.status || data.status,
                        priority: mutation.priority ?? node.data?.priority,
                        owner_id: mutation.owner_id ?? node.data?.owner_id,
                        due_date: mutation.due_date ?? node.data?.due_date,
                        task_projection: {
                            accepted: true,
                            accepted_at: acceptedAt,
                            preview_type:
                                taskProjection.preview_type || row?.preview_type || 'task',
                            preview_status:
                                taskProjection.preview_status ||
                                row?.preview_status ||
                                'needs_review',
                            priority: taskProjection.priority ?? mutation.priority ?? '',
                            owner_id: taskProjection.owner_id ?? mutation.owner_id ?? '',
                            due_date: taskProjection.due_date ?? mutation.due_date ?? '',
                            generated_preview_id: generatedTaskPreview?.preview_id || '',
                            generated_preview_item_id: row?.generated_preview_item?.id || ''
                        }
                    }
                };
            })
        );
        setAcceptedPreviewIds(new Set());
        if (flowId) {
            setSaveStatus('dirty');
        }
        addActivity({
            status: 'completed',
            title: 'Accepted task preview',
            detail: `Accepted ${activePreviewIds.size} branch-to-task candidate${
                activePreviewIds.size === 1 ? '' : 's'
            }.`,
            context: selectedRoot ? `Scope: ${selectedRoot.title}` : 'Scope: whole graph'
        });
        setActiveView('tasks');
    };

    if (hidden) {
        return null;
    }

    return (
        <section className="local-views-panel">
            <div className="local-views-toolbar">
                <div className="local-view-taxonomy" role="navigation" aria-label="Workspace lenses and outputs">
                    <div className="local-view-section">
                        <span>Views</span>
                        <div className="local-view-tabs" role="tablist" aria-label="Accepted workspace views">
                            {CORE_VIEWS.map((view) => (
                                <button
                                    key={view.id}
                                    type="button"
                                    title={view.detail}
                                    className={activeView === view.id ? 'active' : ''}
                                    onClick={() => setActiveView(view.id)}
                                >
                                    {view.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="local-view-section">
                        <span>Filters</span>
                        <div className="local-filter-chips">
                            <button
                                type="button"
                                className={!selectedBranchId ? 'active' : ''}
                                onClick={() => setSelectedBranchId(undefined)}
                            >
                                Whole workspace
                            </button>
                            <button
                                type="button"
                                className={selectedBranchId ? 'active' : ''}
                                disabled={!selectedRoot}
                                onClick={() => selectedRoot && setSelectedBranchId(selectedRoot.id)}
                            >
                                Selected branch
                            </button>
                        </div>
                    </div>
                    <div className="local-view-section">
                        <span>AI Outputs</span>
                        <select
                            value={AI_OUTPUT_VIEWS.some((view) => view.id === activeView) ? activeView : ''}
                            onChange={(event) => {
                                if (event.target.value) {
                                    setActiveView(event.target.value);
                                }
                            }}
                            aria-label="AI output previews"
                        >
                            <option value="">Choose output</option>
                            {AI_OUTPUT_VIEWS.map((view) => (
                                <option key={view.id} value={view.id}>
                                    {view.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="local-view-section">
                        <span>Review</span>
                        <select
                            className={activeReviewView ? 'active' : ''}
                            value={activeReviewView}
                            onChange={(event) => {
                                if (event.target.value) {
                                    setActiveView(event.target.value);
                                }
                            }}
                            aria-label="Review outputs"
                        >
                            <option value="">Choose review</option>
                            {REVIEW_VIEWS.map((view) => (
                                <option key={view.id} value={view.id}>
                                    {view.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="local-view-section">
                        <span>Handoff</span>
                        <select
                            className={activeHandoffView ? 'active' : ''}
                            value={activeHandoffView}
                            onChange={(event) => {
                                if (event.target.value) {
                                    setActiveView(event.target.value);
                                }
                            }}
                            aria-label="Handoff outputs"
                        >
                            <option value="">Choose handoff</option>
                            {HANDOFF_VIEWS.map((view) => (
                                <option key={view.id} value={view.id}>
                                    {view.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="local-branch-control">
                    <span>{selectedRoot ? selectedRoot.title : 'Whole graph'}</span>
                    {selectedBranchId ? (
                        <button type="button" onClick={() => setSelectedBranchId(undefined)}>
                            Clear branch
                        </button>
                    ) : null}
                </div>
            </div>
            <div className="local-filter-bar" aria-label="Persisted graph filters">
                {GRAPH_FILTERS.map((filter) => (
                    <button
                        key={filter.id}
                        type="button"
                        className={activeFilterSet.has(filter.id) ? 'active' : ''}
                        onClick={() => toggleGraphFilter(filter.id)}
                    >
                        {filter.label}
                    </button>
                ))}
                {activeGraphFilters.length > 0 ? (
                    <button
                        type="button"
                        className="local-filter-reset"
                        onClick={() => setActiveGraphFilters([])}
                    >
                        Reset
                    </button>
                ) : null}
            </div>

            {nodes.length === 0 ? (
                <EmptyState
                    activeView={activeView}
                    canUseWorkspace={Boolean(flowId)}
                    onAddRoot={addRootNode}
                    onAddSource={openSourcePicker}
                    onOpenBrief={openBrief}
                    onAskAi={openWorkspaceAskAi}
                    onSetView={setActiveView}
                    showCanvasNudges={showCanvasNudges}
                />
            ) : null}

            {activeView === 'mindmap' && nodes.length > 0 ? (
                <div className="local-lens-summary">
                    <OutputStatePill state="Locally projected" />
                    <div>
                        <strong>Mind Map</strong>
                        <span>
                            Hierarchical lens on accepted workspace nodes. Changing this view does
                            not ask AI to create a new artifact.
                        </span>
                    </div>
                    <button type="button" onClick={() => openAiPreset('knowledgeGraph')} disabled={!flowId}>
                        Ask AI to enrich graph links
                    </button>
                </div>
            ) : null}

            {activeView === 'knowledgeGraph' && nodes.length > 0 ? (
                <div className="local-table-wrap">
                    <div className="local-lens-summary">
                        <OutputStatePill state="Locally projected" />
                        <div>
                            <strong>Knowledge Graph</strong>
                            <span>
                                Locally projected relationship lens on accepted nodes. Use AI
                                enrichment when you want inferred links reviewed before acceptance.
                            </span>
                        </div>
                        <button type="button" onClick={() => openAiPreset('knowledgeGraph')} disabled={!flowId}>
                            Ask AI to enrich links
                        </button>
                    </div>
                    <table className="local-projection-table">
                        <thead>
                            <tr>
                                <th>Entity</th>
                                <th>Type</th>
                                <th>Relationships</th>
                                <th>Status</th>
                                <th>Output state</th>
                                <th>Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {knowledgeGraphRows.map((row) => (
                                <tr key={row.id}>
                                    <td>
                                        <button
                                            type="button"
                                            className="local-row-link"
                                            onClick={() => openNode(row.id)}
                                        >
                                            {row.title}
                                        </button>
                                    </td>
                                    <td>{rowTypeLabel(row)}</td>
                                    <td>{row.relationship_count}</td>
                                    <td>{row.status}</td>
                                    <td>
                                        <OutputStatePill state={outputState(row)} />
                                    </td>
                                    <td>{sourceLabel(row)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}

            {activeView === 'connections' && nodes.length > 0 ? (
                <div className="local-table-wrap">
                    <div className="local-lens-summary">
                        <OutputStatePill state="Locally projected" />
                        <div>
                            <strong>Find connections</strong>
                            <span>
                                Project now shows accepted edges. Ask AI to find candidate
                                duplicates, overlaps, or relationship edges as a review preview.
                            </span>
                        </div>
                        <button type="button" onClick={() => openAiPreset('connections')} disabled={!flowId}>
                            Ask AI to find connections
                        </button>
                    </div>
                    <table className="local-projection-table">
                        <thead>
                            <tr>
                                <th>From</th>
                                <th>Relationship</th>
                                <th>To</th>
                                <th>Output state</th>
                            </tr>
                        </thead>
                        <tbody>
                            {connectionRows.map((row) => (
                                <tr key={row.id}>
                                    <td>{row.source.title}</td>
                                    <td>{row.relationship}</td>
                                    <td>{row.target.title}</td>
                                    <td>
                                        <OutputStatePill state="Locally projected" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {connectionRows.length === 0 ? (
                        <div className="local-table-empty local-empty-actions">
                            <strong>No relationship edges in this scope.</strong>
                            <span>
                                This is not broken: the current filter has nodes but no accepted
                                connections to project.
                            </span>
                            <button type="button" onClick={() => openAiPreset('connections')} disabled={!flowId}>
                                Ask AI to find connections
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {(activeView === 'flowchart' || activeView === 'chartData') && nodes.length > 0 ? (
                <div className="local-view-empty">
                    <span className="local-view-empty-kicker">AI output target</span>
                    <strong>
                        {activeView === 'flowchart'
                            ? 'Create flow chart'
                            : 'Extract chart data'}
                    </strong>
                    <span>
                        This output needs AI enrichment. Generate a preview first, then review
                        the proposed structure before accepting anything into the graph.
                    </span>
                    <div className="local-view-empty-actions">
                        <button
                            type="button"
                            onClick={() => openAiPreset(activeView)}
                            disabled={!flowId}
                        >
                            {activeView === 'flowchart'
                                ? 'Ask AI to draft flow chart'
                                : 'Ask AI to extract chart data'}
                        </button>
                        <button type="button" onClick={() => setActiveView('gaps')}>
                            Review missing fields
                        </button>
                        <button type="button" onClick={() => setActiveView('knowledgeGraph')}>
                            Project now
                        </button>
                    </div>
                </div>
            ) : null}

            {activeView === 'outline' && nodes.length > 0 ? (
                <ol className="local-outline">
                    {projection.roots.map((root) => (
                        <OutlineNode
                            key={root.id}
                            node={root}
                            childrenByParent={projection.childrenByParent}
                            nodeLookup={projection.nodeLookup}
                            depth={0}
                            onSelectBranch={selectBranch}
                            onOpenNode={openNode}
                        />
                    ))}
                </ol>
            ) : null}

            {activeView === 'tasks' && nodes.length > 0 ? (
                <div className="local-table-wrap">
                    <table className="local-projection-table">
                        <thead>
                            <tr>
                                <th>Task</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Priority</th>
                                <th>Owner</th>
                                <th>Due</th>
                                <th>Table</th>
                                <th>Output state</th>
                                <th>Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {taskRows.map((row) => (
                                <tr key={row.id}>
                                    <td>
                                        <button
                                            type="button"
                                            className="local-row-link"
                                            onClick={() => openNode(row.id)}
                                        >
                                            {row.title}
                                        </button>
                                    </td>
                                    <td>{rowTypeLabel(row)}</td>
                                    <td>{row.status}</td>
                                    <td>{row.priority || '-'}</td>
                                    <td>{row.owner_id || '-'}</td>
                                    <td>{row.due_date || '-'}</td>
                                    <td>{tableShapeLabel(row)}</td>
                                    <td>
                                        <OutputStatePill state={outputState(row)} />
                                    </td>
                                    <td>{sourceLabel(row)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {taskRows.length === 0 && showTaskNudges ? (
                        <div className="local-table-empty local-empty-actions">
                            <strong>No accepted task fields in this scope.</strong>
                            <span>
                                The workspace data exists, but this view needs task metadata.
                            </span>
                            <button type="button" onClick={() => setActiveView('preview')}>
                                Generate task preview
                            </button>
                            <button type="button" onClick={() => setActiveView('gaps')}>
                                Review missing fields
                            </button>
                            <button type="button" onClick={() => openAiPreset('tasks')} disabled={!flowId}>
                                Ask AI to generate tasks
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {activeView === 'table' && nodes.length > 0 ? (
                <div className="local-table-wrap">
                    <table className="local-projection-table">
                        <thead>
                            <tr>
                                <th>Title</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Confidence</th>
                                <th>Table</th>
                                <th>Output state</th>
                                <th>Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projection.nodes.map((row) => (
                                <tr key={row.id}>
                                    <td>
                                        <button
                                            type="button"
                                            className="local-row-link"
                                            onClick={() => openNode(row.id)}
                                        >
                                            {row.title}
                                        </button>
                                    </td>
                                    <td>{rowTypeLabel(row)}</td>
                                    <td>{row.status}</td>
                                    <td>{row.confidence || '-'}</td>
                                    <td>{tableShapeLabel(row)}</td>
                                    <td>
                                        <OutputStatePill state={outputState(row)} />
                                    </td>
                                    <td>{sourceLabel(row)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}

            {activeView === 'preview' && nodes.length > 0 ? (
                <div className="local-task-preview">
                    <div className="local-task-preview-header">
                        <div>
                            <strong>Generate task preview</strong>
                            <span>
                                {generatedTaskPreview ? 'AI-generated output' : 'Locally projected output'} |{' '}
                                {previewRows.length} candidate nodes
                            </span>
                        </div>
                        <OutputStatePill
                            state={generatedTaskPreview ? 'AI-generated' : 'Locally projected'}
                        />
                        <button type="button" onClick={acceptTaskPreview}>
                            Accept selected
                        </button>
                        {!generatedTaskPreview ? (
                            <button type="button" onClick={() => openAiPreset('tasks')} disabled={!flowId}>
                                Ask AI to generate tasks
                            </button>
                        ) : null}
                        {generatedTaskPreview ? (
                            <button
                                type="button"
                                onClick={() =>
                                    clearGeneratedHelperPreview('projectPlannerTasks')
                                }
                            >
                                Reject generated
                            </button>
                        ) : null}
                    </div>
                    <PreviewDiffSummary changes={taskPreviewDiffSummary} />
                    <div className="local-table-wrap">
                        <table className="local-projection-table">
                            <thead>
                                <tr>
                                    <th>Use</th>
                                    <th>Task</th>
                                    <th>Current type</th>
                                    <th>Preview status</th>
                                    <th>Priority</th>
                                    <th>Owner</th>
                                    <th>Due</th>
                                    <th>Output state</th>
                                    <th>Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previewRows.map((row) => (
                                    <tr key={row.id}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={activePreviewIds.has(row.id)}
                                                onChange={() => togglePreviewRow(row.id)}
                                                aria-label={`Include ${row.title}`}
                                            />
                                        </td>
                                        <td>{row.title}</td>
                                        <td>{row.node_type}</td>
                                        <td>{row.preview_status}</td>
                                        <td>{row.priority || '-'}</td>
                                        <td>{row.owner_id || '-'}</td>
                                        <td>{row.due_date || '-'}</td>
                                        <td>
                                            <OutputStatePill state={outputState(row)} />
                                        </td>
                                        <td>{sourceLabel(row)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {previewRows.length === 0 ? (
                        <div className="local-table-empty local-empty-actions">
                            <strong>No task preview candidates in this scope.</strong>
                            <span>
                                Project now found no task-like rows. Ask AI to infer task
                                candidates, or add a non-reference node first.
                            </span>
                            <button type="button" onClick={() => openAiPreset('tasks')} disabled={!flowId}>
                                Ask AI to generate tasks
                            </button>
                            <button type="button" onClick={() => setActiveView('gaps')}>
                                Review missing fields
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {activeView === 'checklist' && nodes.length > 0 ? (
                <ChecklistPreview
                    nodes={nodes}
                    projection={projection}
                    setNodes={setNodes}
                    setActiveView={setActiveView}
                    generatedPreview={generatedChecklistPreview}
                    onRejectGeneratedPreview={() =>
                        clearGeneratedHelperPreview('projectPlannerChecklist')
                    }
                    onAskAi={() => openAiPreset('checklist')}
                />
            ) : null}

            {activeView === 'gaps' && nodes.length > 0 ? (
                <MissingInfoPreview
                    nodes={nodes}
                    projection={projection}
                    generatedPreview={generatedReviewerGapsPreview}
                    onRejectGeneratedPreview={() =>
                        clearGeneratedHelperPreview('reviewerGaps')
                    }
                    setNodes={setNodes}
                    setActiveView={setActiveView}
                    onAskAi={() => openAiPreset('gaps')}
                />
            ) : null}

            {activeView === 'sme' && nodes.length > 0 ? (
                <SmeQuestionsPreview
                    nodes={nodes}
                    projection={projection}
                    generatedPreview={generatedReviewerSmePreview}
                    onRejectGeneratedPreview={() =>
                        clearGeneratedHelperPreview('reviewerSmeQuestions')
                    }
                    setNodes={setNodes}
                    setActiveView={setActiveView}
                    onAskAi={() => openAiPreset('sme')}
                />
            ) : null}

            {activeView === 'sources' && nodes.length > 0 ? (
                <SourceRepairPreview
                    nodes={nodes}
                    projection={projection}
                    generatedPreview={generatedSourceRepairPreview}
                    onRejectGeneratedPreview={() =>
                        clearGeneratedHelperPreview('sourceLibrarianSources')
                    }
                    setNodes={setNodes}
                    setActiveView={setActiveView}
                    onAskAi={() => openAiPreset('sources')}
                />
            ) : null}

            {activeView === 'mondayInput' && nodes.length > 0 ? (
                <MondaySelectionInput
                    nodes={nodes}
                    projection={projection}
                    selectedBranchId={selectedBranchId}
                    setNodes={setNodes}
                    setActiveView={setActiveView}
                    generatedPreview={generatedIntegrationHandoffPreview}
                    onRejectGeneratedPreview={() =>
                        clearGeneratedHelperPreview('integrationOperatorHandoff')
                    }
                />
            ) : null}

            {activeView === 'mondayStatus' && nodes.length > 0 ? (
                <MondayStatusBackPreview
                    nodes={nodes}
                    projection={projection}
                    setNodes={setNodes}
                    setActiveView={setActiveView}
                    generatedPreview={generatedIntegrationSyncPreview}
                    onRejectGeneratedPreview={() =>
                        clearGeneratedHelperPreview('integrationOperatorSync')
                    }
                />
            ) : null}
        </section>
    );
};

export default LocalViewsPanel;
