/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import modalStore from '../stores/modalStore';
import DataSourceSelect from '../global-components/DataSourceSelect';
import PromptModal from '../modals/PromptModal';
import WorkspaceBriefModal from '../modals/WorkspaceBriefModal';
import {
    buildFilteredGraphProjection,
    getConnectionRows,
    getCrossLinkConnectionRows,
    getGraphConfidenceSummary,
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
    { id: 'mindmap', label: 'TraceSpace Map', detail: 'Map the workspace structure', group: 'Explore' },
    { id: 'knowledgeGraph', label: 'Connections', detail: 'Find relationships and overlaps', group: 'Explore' },
    { id: 'outline', label: 'Outline', detail: 'Review hierarchy as an outline', group: 'Review' },
    { id: 'table', label: 'Table', detail: 'View workspace data as table rows', group: 'Review' },
    { id: 'tasks', label: 'Tasks', detail: 'Act on confirmed and potential tasks', group: 'Act' }
];

const CANVAS_VIEW_IDS = new Set(CORE_VIEWS.map((view) => view.id));
const CORE_VIEW_GROUPS = ['Explore', 'Review', 'Act'].map((label) => ({
    label,
    views: CORE_VIEWS.filter((view) => view.group === label)
}));

const REVIEW_VIEWS = [
    { id: 'preview', label: 'Task preview' },
    { id: 'gaps', label: 'Missing info' },
    { id: 'sme', label: 'SME questions' },
    { id: 'sources', label: 'Source repair' }
];

const AI_OUTPUT_VIEWS = [
    { id: 'connections', label: 'Find connections', detail: 'AI can propose relationship edges' },
    { id: 'flowchart', label: 'Create flow chart', detail: 'AI can infer process structure' },
    { id: 'chartData', label: 'Create structured table', detail: 'AI can infer table columns and rows' },
    { id: 'preview', label: 'Generate task preview', detail: 'AI preview or current workspace tasks' },
    { id: 'checklist', label: 'Create checklist', detail: 'AI preview or current workspace checklist' }
];

const AI_ACTION_PRESETS = {
    knowledgeGraph: {
        role: 'standards-extractor',
        action: 'custom_prompt',
        scope: 'workspace',
        initialVisual: 'knowledge_graph',
        initialPrompt:
            'Analyze the current workspace graph and propose a knowledge graph layer. Keep the existing hierarchy intact, then suggest cross-branch relationship edges such as depends_on, supports, conflicts_with, duplicates, overlaps, blocks, or related_to. Include confidence, rationale, source signals, and review state for every proposed relationship.'
    },
    connections: {
        role: 'gap-analyst',
        action: 'find_duplicate_overlapping_nodes',
        scope: 'workspace',
        initialVisual: 'knowledge_graph',
        initialPrompt:
            'Find cross-branch connection candidates in the current workspace. Do not rewrite the hierarchy. Propose relationship edges only when there is a clear signal, and include duplicates, overlaps, dependencies, supporting relationships, conflicts, blockers, rationale, confidence, and review state.'
    },
    mindmapFromConnections: {
        role: 'workflow-mapper',
        action: 'custom_prompt',
        scope: 'workspace',
        initialVisual: 'mind_map',
        initialPrompt:
            'Create a clean TraceSpace mind map from the current relationship graph. Use accepted relationship edges and existing node content to choose the best root, branches, and subtopics. Preserve source references and mark inferred or weak structure needs_review.'
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

const WORKSPACE_OUTPUT_GROUPS = [
    { label: 'Explore', views: AI_OUTPUT_VIEWS.filter((view) => ['connections', 'flowchart'].includes(view.id)) },
    {
        label: 'Review',
        views: [
            ...REVIEW_VIEWS.filter((view) => view.id !== 'preview'),
            ...AI_OUTPUT_VIEWS.filter((view) => view.id === 'chartData')
        ]
    },
    { label: 'Act', views: AI_OUTPUT_VIEWS.filter((view) => ['preview', 'checklist'].includes(view.id)) },
    { label: 'Share', views: HANDOFF_VIEWS }
];

const WORKSPACE_OUTPUT_OPTIONS = WORKSPACE_OUTPUT_GROUPS.flatMap((group) => group.views);

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

const OUTPUT_STATE_LABELS = {
    'Locally projected': 'Current workspace',
    'AI-generated': 'AI preview',
    Accepted: 'Accepted',
    'Applied/exported': 'Applied'
};

const OutputStatePill = ({ state }) => (
    <span className={`output-state-pill output-state-${state.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
        {OUTPUT_STATE_LABELS[state] || state}
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
    showCanvasNudges
}) => {
    const isReviewOutput = ['preview', 'checklist', 'gaps', 'sme', 'sources'].includes(activeView);
    const isAiOutput = ['connections', 'flowchart', 'chartData'].includes(activeView);
    const guidance = isReviewOutput || isAiOutput
        ? 'Add a source for grounded work, ask AI for a starting structure, or add a root manually.'
        : activeView === 'mindmap'
          ? 'Add a source for evidence-backed work, ask AI to draft a start, or sketch manually.'
          : 'This view will populate once the workspace has graph nodes.';

    return (
        <div className="local-view-empty">
            {showCanvasNudges ? (
                <span className="local-view-empty-kicker">
                    {isReviewOutput || isAiOutput ? 'Output needs graph context' : 'Start your Think Space'}
                </span>
            ) : null}
            <strong>No graph nodes yet</strong>
            {showCanvasNudges ? <span>{guidance}</span> : null}
            <div className="local-view-empty-actions">
                <button type="button" onClick={onAddSource}>
                    Add source
                </button>
                <button type="button" onClick={() => onAskAi()} disabled={!canUseWorkspace}>
                    Ask AI
                </button>
                <button type="button" onClick={onAddRoot} disabled={!canUseWorkspace}>
                    Add root
                </button>
                <button type="button" onClick={onOpenBrief}>
                    Set brief
                </button>
            </div>
            {!canUseWorkspace ? (
                <small>Open or create a workspace to add nodes or ask AI.</small>
            ) : null}
        </div>
    );
};

const LocalViewsPanel = ({ hidden, onSelectNode, onSelectEdge }) => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        setNodes: state.setNodes,
        activeView: state.activeView,
        activeCanvasView: state.activeCanvasView,
        setActiveView: state.setActiveView,
        setActiveCanvasView: state.setActiveCanvasView,
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
        activeCanvasView,
        setActiveView,
        setActiveCanvasView,
        selectedBranchId,
        setSelectedBranchId,
        generatedHelperPreviews,
        clearGeneratedHelperPreview,
        activeGraphFilters,
        setActiveGraphFilters,
        nudgePreferences
    } = useStore(useShallow(selector));
    const [acceptedPreviewIds, setAcceptedPreviewIds] = useState(new Set());
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [outputMenuOpen, setOutputMenuOpen] = useState(false);
    const panelRef = useRef(null);
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
    const crossLinkRows = useMemo(() => getCrossLinkConnectionRows(projection), [projection]);
    const graphConfidence = useMemo(() => getGraphConfidenceSummary(projection), [projection]);
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

    const selectedBranchNode = useMemo(
        () => nodes.find((node) => node.id === selectedBranchId),
        [nodes, selectedBranchId]
    );
    const selectedBranchTitle =
        selectedBranchNode?.data?.title ||
        selectedBranchNode?.data?.label ||
        selectedBranchNode?.data?.content ||
        projection.nodes.find((node) => node.id === selectedBranchId)?.title ||
        '';
    const selectedRoot = projection.nodes.find((node) => node.id === selectedBranchId);
    const activePreviewIds =
        acceptedPreviewIds.size > 0 ? acceptedPreviewIds : allPreviewIds;
    const outputModeValue = WORKSPACE_OUTPUT_OPTIONS.some((view) => view.id === activeView)
        ? activeView
        : '';
    const activeOutputOption = WORKSPACE_OUTPUT_OPTIONS.find((view) => view.id === outputModeValue);
    const isCanvasView = CANVAS_VIEW_IDS.has(activeView);
    const activeCanvasOption = CORE_VIEWS.find((view) => view.id === activeCanvasView);
    const showCanvasNudges = isNudgeCategoryEnabled(nudgePreferences, 'canvas');
    const showTaskNudges = isNudgeCategoryEnabled(nudgePreferences, 'tasks');
    useEffect(() => {
        if (!filtersOpen && !outputMenuOpen) {
            return undefined;
        }

        const handlePointerDown = (event) => {
            if (panelRef.current?.contains(event.target)) {
                return;
            }
            setFiltersOpen(false);
            setOutputMenuOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [filtersOpen, outputMenuOpen]);

    const toggleGraphFilter = (filterId) => {
        const nextFilters = activeFilterSet.has(filterId)
            ? activeGraphFilters.filter((id) => id !== filterId)
            : [...activeGraphFilters, filterId];
        setActiveGraphFilters(nextFilters);
    };
    const activeScopeItems = useMemo(() => {
        const items = [];
        if (selectedBranchId) {
            items.push({
                id: 'selected-branch',
                label: `Selected branch: ${selectedBranchTitle || selectedBranchId}`,
                onClear: () => setSelectedBranchId(undefined)
            });
        }
        activeGraphFilters.forEach((filterId) => {
            const filter = GRAPH_FILTERS.find((item) => item.id === filterId);
            items.push({
                id: filterId,
                label: filter?.label || filterId,
                onClear: () => toggleGraphFilter(filterId)
            });
        });
        return items;
    }, [activeGraphFilters, selectedBranchId, selectedBranchTitle, toggleGraphFilter]);

    const clearScopeAndFilters = () => {
        setSelectedBranchId(undefined);
        setActiveGraphFilters([]);
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
            initialActionId: preset.action,
            initialPrompt: preset.initialPrompt,
            initialVisual: preset.initialVisual || 'auto'
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
                const nextNodeType =
                    taskProjection.preview_type ||
                    mutation.node_type ||
                    row?.preview_type ||
                    'task';
                const nextStatus =
                    taskProjection.preview_status ||
                    mutation.status ||
                    row?.preview_status ||
                    'needs_review';
                const nextPriority =
                    taskProjection.priority ?? mutation.priority ?? row?.priority ?? node.data?.priority ?? '';
                const nextOwner =
                    taskProjection.owner_id ?? mutation.owner_id ?? row?.owner_id ?? node.data?.owner_id ?? '';
                const nextDue =
                    taskProjection.due_date ?? mutation.due_date ?? row?.due_date ?? node.data?.due_date ?? '';
                const data = withLocalPreviewAcceptance(node.data, {
                    flow: row?.generated_preview_item
                        ? 'generated_project_planner_task'
                        : 'branch_to_task',
                    accepted_at: acceptedAt,
                    node_id: node.id,
                    helper_id: row?.generated_preview_item ? 'project_planner' : undefined,
                    preview_id: generatedTaskPreview?.preview_id,
                    preview_item_id: row?.generated_preview_item?.id,
                    preview_type: nextNodeType,
                    preview_status: nextStatus
                });

                return {
                    ...node,
                    data: {
                        ...data,
                        node_type: nextNodeType,
                        status: nextStatus || data.status,
                        priority: nextPriority,
                        owner_id: nextOwner,
                        due_date: nextDue,
                        task_projection: {
                            accepted: true,
                            accepted_at: acceptedAt,
                            preview_type: nextNodeType,
                            preview_status: nextStatus,
                            priority: nextPriority,
                            owner_id: nextOwner,
                            due_date: nextDue,
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
        <section
            ref={panelRef}
            className={`local-views-panel ${
                isCanvasView
                    ? 'local-views-panel-compact'
                    : ''
            }`}
        >
            <div className="local-views-toolbar">
                <div className="local-view-taxonomy" role="navigation" aria-label="Workspace lenses and outputs">
                    <div className="local-view-primary-row">
                        <div className="local-view-section local-view-section-views">
                            <span>Make it useful</span>
                            <div className="local-view-tabs" role="tablist" aria-label="Canvas views">
                                {CORE_VIEW_GROUPS.map((group) => (
                                    <div key={group.label} className="local-intent-group">
                                        <small>{group.label}</small>
                                        {group.views.map((view) => (
                                            <button
                                                key={view.id}
                                                type="button"
                                                title={view.detail}
                                                className={activeCanvasView === view.id ? 'active' : ''}
                                                onClick={() => setActiveCanvasView(view.id)}
                                            >
                                                {view.label}
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="local-view-section local-view-section-scope">
                            <span>Scope</span>
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
                            <div className="local-scope-context">
                                <span>{selectedRoot ? selectedRoot.title : 'Whole graph'}</span>
                                {selectedBranchId ? (
                                    <button type="button" onClick={() => setSelectedBranchId(undefined)}>
                                        Clear
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    <div className="local-view-output-row">
                        <div className="local-view-section local-view-section-output">
                            <span>{outputModeValue ? 'Next action' : 'Improve workspace'}</span>
                            <button
                                type="button"
                                className={`local-output-menu-button ${outputMenuOpen || outputModeValue ? 'active' : ''}`}
                                onClick={() => setOutputMenuOpen((open) => !open)}
                                aria-expanded={outputMenuOpen}
                            >
                                <span>{activeOutputOption?.label || `Use ${activeCanvasOption?.label || 'workspace'}`}</span>
                                <span className="local-filter-menu-caret" aria-hidden="true">
                                    {outputMenuOpen ? '^' : 'v'}
                                </span>
                            </button>
                        </div>
                        <div className="local-view-section local-view-section-filters">
                            <span>Filters</span>
                            <button
                                type="button"
                                className={`local-filter-menu-button ${filtersOpen ? 'active' : ''}`}
                                onClick={() => setFiltersOpen((open) => !open)}
                                aria-expanded={filtersOpen}
                            >
                                <span>{filtersOpen ? 'Hide filters' : 'Node filters'}</span>
                                {activeGraphFilters.length > 0 ? (
                                    <small>{activeGraphFilters.length}</small>
                                ) : null}
                                <span className="local-filter-menu-caret" aria-hidden="true">
                                    {filtersOpen ? '^' : 'v'}
                                </span>
                            </button>
                        </div>
                        {!isCanvasView ? (
                            <button
                                type="button"
                                className="local-back-to-map"
                                onClick={() => setActiveCanvasView(activeCanvasView || 'mindmap')}
                            >
                                Back to canvas
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
            {filtersOpen ? (
                <div className="local-filter-popover" aria-label="Persisted graph filters">
                    <div className="local-filter-popover-header">
                        <span>Node filters</span>
                        <button type="button" onClick={() => setFiltersOpen(false)}>
                            Done
                        </button>
                        {activeGraphFilters.length > 0 ? (
                            <button type="button" onClick={() => setActiveGraphFilters([])}>
                                Reset
                            </button>
                        ) : null}
                    </div>
                    <div className="local-filter-popover-chips">
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
                    </div>
                </div>
            ) : null}

            {outputMenuOpen ? (
                <div className="local-output-popover" aria-label="Workspace actions">
                    <div className="local-output-popover-header">
                        <span>Choose what to do next</span>
                        <button type="button" onClick={() => setOutputMenuOpen(false)}>
                            Done
                        </button>
                    </div>
                    <div className="local-output-groups">
                        {WORKSPACE_OUTPUT_GROUPS.map((group) => (
                            <div key={group.label} className="local-output-group">
                                <strong>{group.label}</strong>
                                <div>
                                    {group.views.map((view) => (
                                        <button
                                            key={view.id}
                                            type="button"
                                            className={activeView === view.id ? 'active' : ''}
                                            onClick={() => {
                                                setActiveView(view.id);
                                                setOutputMenuOpen(false);
                                            }}
                                        >
                                            {view.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {!filtersOpen ? (
                <div className="local-active-filter-strip" aria-label="Current scope and filters">
                    <span>Showing:</span>
                    {activeScopeItems.length > 0 ? (
                        activeScopeItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={item.onClear}
                                title="Remove"
                            >
                                {item.label} x
                            </button>
                        ))
                    ) : (
                        <small>Whole workspace</small>
                    )}
                    {activeScopeItems.length > 0 ? (
                        <button
                            type="button"
                            className="local-clear-scope-filters"
                            onClick={clearScopeAndFilters}
                        >
                            Clear all
                        </button>
                    ) : null}
                </div>
            ) : null}

            {!isCanvasView ? (
                <div className="local-view-content-surface">
            {nodes.length === 0 ? (
                <EmptyState
                    activeView={activeView}
                    canUseWorkspace={Boolean(flowId)}
                    onAddRoot={addRootNode}
                    onAddSource={openSourcePicker}
                    onOpenBrief={openBrief}
                    onAskAi={openWorkspaceAskAi}
                    showCanvasNudges={showCanvasNudges}
                />
            ) : null}

            {activeView === 'knowledgeGraph' && nodes.length > 0 ? (
                <div className="local-table-wrap">
                    <div className="local-lens-summary local-lens-summary-stacked">
                        <div className="local-lens-summary-copy">
                            <OutputStatePill state="Locally projected" />
                            <div>
                                <strong>Knowledge Graph readiness</strong>
                                <span>
                                    Mind maps organize hierarchy. This lens becomes more useful after
                                    accepted cross-branch relationship edges are added.
                                </span>
                            </div>
                        </div>
                        <div className="local-graph-readiness">
                            <div className="local-graph-score">
                                <strong>{graphConfidence.score}</strong>
                                <span>{graphConfidence.label}</span>
                            </div>
                            <div className="local-graph-readiness-copy">
                                <span>
                                    {graphConfidence.cross_link_edges} accepted cross-link
                                    {graphConfidence.cross_link_edges === 1 ? '' : 's'} |{' '}
                                    {graphConfidence.hierarchy_edges} hierarchy edge
                                    {graphConfidence.hierarchy_edges === 1 ? '' : 's'}
                                </span>
                                {graphConfidence.reasons.length > 0 ? (
                                    <small>{graphConfidence.reasons.slice(0, 3).join(' | ')}</small>
                                ) : (
                                    <small>Structure, sources, review state, and connections look healthy.</small>
                                )}
                            </div>
                        </div>
                        <div className="local-transformation-path" aria-label="Graph transformation path">
                            <span>TraceSpace Map</span>
                            <span>Find cross-branch connections</span>
                            <span>Review candidates</span>
                            <span>Knowledge Graph</span>
                        </div>
                        <div className="local-lens-actions">
                            <button type="button" onClick={() => openAiPreset('connections')} disabled={!flowId}>
                                Find cross-branch connections
                            </button>
                            <button
                                type="button"
                                onClick={() => openAiPreset('mindmapFromConnections')}
                                disabled={!flowId || connectionRows.length === 0}
                            >
                                Create mind map from connections
                            </button>
                            <button type="button" onClick={() => setActiveView('gaps')}>
                                Review confidence gaps
                            </button>
                        </div>
                    </div>
                    <table className="local-projection-table">
                        <thead>
                            <tr>
                                <th>Entity</th>
                                <th>Type</th>
                                <th>Relationships</th>
                                <th>Status</th>
                                <th>Review state</th>
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
                    <div className="local-lens-summary local-lens-summary-stacked">
                        <div className="local-lens-summary-copy">
                            <OutputStatePill state="Locally projected" />
                            <div>
                                <strong>Current connections</strong>
                                <span>
                                    This list shows accepted hierarchy edges and accepted relationship
                                    edges. AI candidates open as a preview before they can supplement
                                    the graph.
                                </span>
                            </div>
                        </div>
                        <div className="local-lens-ai-callout">
                            <div>
                                <strong>Build on this structure</strong>
                                <span>
                                    Ask AI to propose cross-branch links from the current mind map, or
                                    use accepted connections to reorganize the workspace into a new
                                    mind map.
                                </span>
                            </div>
                            <div className="local-lens-callout-actions">
                                <button type="button" onClick={() => openAiPreset('connections')} disabled={!flowId}>
                                    Find cross-branch connections
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openAiPreset('mindmapFromConnections')}
                                    disabled={!flowId || connectionRows.length === 0}
                                >
                                    Create mind map from connections
                                </button>
                            </div>
                        </div>
                        <div className="local-connection-stats">
                            <span>{connectionRows.length} accepted connection rows</span>
                            <span>{crossLinkRows.length} cross-link candidates accepted</span>
                            <span>{graphConfidence.score}% graph confidence</span>
                        </div>
                    </div>
                    <table className="local-projection-table">
                        <thead>
                            <tr>
                                <th>From</th>
                                <th>Relationship</th>
                                <th>To</th>
                                <th>Kind</th>
                                <th>Confidence</th>
                                <th>Review state</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {connectionRows.map((row) => (
                                <tr key={row.id}>
                                    <td>{row.source.title}</td>
                                    <td>{row.relationship}</td>
                                    <td>{row.target.title}</td>
                                    <td>{row.connection_kind}</td>
                                    <td>{row.confidence || 'Not set'}</td>
                                    <td>
                                        <OutputStatePill state="Locally projected" />
                                    </td>
                                    <td>
                                        <button type="button" onClick={() => onSelectEdge?.(row.id)}>
                                            Open
                                        </button>
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
                                connections to show.
                            </span>
                            <button type="button" onClick={() => openAiPreset('connections')} disabled={!flowId}>
                                Ask AI for connection candidates
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
                            : 'Create structured table'}
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
                                : 'Ask AI to create table'}
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
                                <th>Review state</th>
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
                                <th>Review state</th>
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
                                {generatedTaskPreview ? 'AI-generated task preview' : 'Current workspace tasks'} |{' '}
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
                                    <th>Review state</th>
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
                </div>
            ) : null}
        </section>
    );
};

export default LocalViewsPanel;
