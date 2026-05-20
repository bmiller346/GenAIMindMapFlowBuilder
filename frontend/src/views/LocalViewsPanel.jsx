/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import modalStore from '../stores/modalStore';
import DataSourceSelect from '../global-components/DataSourceSelect';
import PromptModal from '../modals/PromptModal';
import WorkspaceBriefModal from '../modals/WorkspaceBriefModal';
import FilterPopover, { ActiveScopeStrip } from './localViews/FilterControls';
import FollowUpActionsBar from './localViews/FollowUpActionsBar';
import { CompactMapControls, ExpandedMapControls } from './localViews/MapControls';
import { OutputWorkflowPopover } from './localViews/OutputWorkflowControls';
import OutputPanel from './OutputPanel';
import {
    buildRelationshipReviewMarkdown,
    buildFilteredGraphProjection,
    getConnectionRows,
    getCrossLinkConnectionRows,
    getExecutiveOutputProjection,
    getGraphConfidenceSummary,
    getKnowledgeGraphRows,
    getRelationshipFamilyReviewGroups,
    getTaskPreviewRows,
    getTaskRows
} from './graphProjection';
import { isNudgeCategoryEnabled } from '../config/localSettings';
import { withLocalPreviewAcceptance } from './localPreviewMetadata';
import { makePreviewDiffSummary } from './previewDiffSummary';
import useActivityStore from '../stores/activityStore';
import flowStore from '../stores/flowStore';
import { createWorkspaceNode, getRootPosition } from '../utils/manualNodes';
import {
    CANVAS_VIEW_IDS,
    CORE_VIEW_GROUPS,
    CORE_VIEWS,
    GRAPH_FILTERS,
    NEXT_ACTION_DETAILS,
    NODE_DENSITY_OPTIONS,
    WORKSPACE_OUTPUT_GROUPS,
    WORKSPACE_OUTPUT_OPTIONS
} from './localViews/localViewConfig';

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
    softwareOverlap: {
        role: 'enterprise-tool-rationalization',
        action: 'find_duplicate_tools',
        scope: 'workspace',
        initialVisual: 'software_overlap_report',
        initialPrompt:
            'Create a software overlap and rationalization report for this workspace. Compare applications, systems, capabilities, supported workflows, user groups, owners, approval/security status, integrations, license or usage signals, replacement or retired status, source support, confidence, scoring factors, evidence, and recommended owner review. Label findings as potential overlap unless the evidence proves a duplicate.'
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
        scope: 'branch',
        initialVisual: 'flow_chart',
        initialPrompt:
            'Create a flowchart from this workspace with ordered steps, decision points, dependencies, handoffs, exception paths, and source-backed review notes.'
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

const safeDownloadSlug = (value = 'workspace') =>
    String(value || 'workspace')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'workspace';

const FOLLOW_UP_ACTIONS = [
    {
        id: 'update-this',
        label: 'Update this',
        intent: 'Updates',
        role: 'workflow-mapper',
        action: 'custom_prompt',
        initialVisual: 'mind_map',
        prompt:
            'Update the current scope with focused, reviewable improvements. Preserve useful structure, tighten vague wording, add missing details where needed, and mark new assumptions for review.',
        description:
            'AI proposes focused edits for the current scope; you review before applying.'
    },
    {
        id: 'supplement-source',
        label: 'Supplement with source',
        intent: 'Supplements',
        role: 'source-ref-repair',
        action: 'find_missing_source_support',
        requiresSource: true,
        initialVisual: 'auto',
        prompt:
            'Use the loaded source material to supplement the current scope. Add missing support, stronger details, and source-backed child items without replacing existing useful content.',
        description:
            'Uses loaded sources to add missing support or details.'
    },
    {
        id: 'compare-source',
        label: 'Compare against source',
        intent: 'Compares',
        role: 'source-ref-repair',
        action: 'find_missing_source_support',
        requiresSource: true,
        initialVisual: 'auto',
        prompt:
            'Compare the current scope against the loaded source material. Flag missing claims, mismatches, unsupported assumptions, and source-only ideas that should be reviewed.',
        description:
            'Checks the current scope against source material and flags differences.'
    },
    {
        id: 'find-gaps',
        label: 'Find gaps',
        intent: 'Reviews',
        role: 'gap-analyst',
        action: 'find_gaps',
        initialVisual: 'review_annotations',
        prompt:
            'Find missing decisions, risks, weak assumptions, duplicate ideas, or unclear handoffs in the current scope. Return reviewable findings with suggested next steps.',
        description:
            'Looks for missing decisions, risks, or weak areas.'
    },
    {
        id: 'create-tasks',
        label: 'Create tasks',
        intent: 'Generates tasks',
        role: 'task-planner',
        action: 'generate_tasks',
        initialVisual: 'tasks',
        prompt:
            'Create task candidates from the current scope. Include action-oriented titles, owner cues, due-date cues where implied, and review state before anything is applied.',
        description:
            'Generates task candidates from the current scope.'
    }
];

const VIEW_CONVERSION_ACTIONS = [
    {
        id: 'convert-to-map',
        label: 'Create map',
        intent: 'Convert',
        role: 'workflow-mapper',
        action: 'custom_prompt',
        initialVisual: 'mind_map',
        targetViews: ['knowledgeGraph', 'flowchart'],
        prompt:
            'Convert the current exploratory view into a clean TraceSpace mind map. Preserve useful relationships as hierarchy where appropriate, keep evidence and source refs, add missing bridge nodes when needed, and mark inferred structure needs_review.',
        description: 'Supplements the current view into a reviewable map.'
    },
    {
        id: 'convert-to-knowledge-graph',
        label: 'Create knowledge graph',
        intent: 'Convert',
        role: 'standards-extractor',
        action: 'custom_prompt',
        initialVisual: 'knowledge_graph',
        targetViews: ['mindmap', 'flowchart'],
        prompt:
            'Convert the current exploratory view into a knowledge graph layer. Preserve the existing content, then supplement it with cross-branch relationship edges, dependencies, overlaps, conflicts, confidence, rationale, and source signals so the Connections view becomes useful.',
        description: 'Adds relationship metadata for the Connections view.'
    },
    {
        id: 'convert-to-flowchart',
        label: 'Create flowchart',
        intent: 'Convert',
        role: 'workflow-mapper',
        action: 'custom_prompt',
        initialVisual: 'flow_chart',
        targetViews: ['mindmap', 'knowledgeGraph'],
        prompt:
            'Convert the current exploratory view into a flowchart. Supplement the graph with ordered process steps, decisions, branch labels, conditions, handoffs, dependencies, exception paths, and review notes without deleting existing useful content.',
        description: 'Adds process metadata for Flowchart.'
    },
    {
        id: 'convert-to-kanban',
        label: 'Prepare Kanban',
        intent: 'Convert',
        role: 'task-planner',
        action: 'generate_tasks',
        initialVisual: 'kanban',
        targetViews: ['mindmap', 'knowledgeGraph', 'flowchart'],
        prompt:
            'Convert the current exploratory view into a Kanban-ready task board. Supplement the graph with action-oriented task nodes or task metadata, board status, priority, owner cues, due-date cues, dependencies, blockers, and review state so the Kanban columns are populated after review.',
        description: 'Adds task metadata needed for Kanban.'
    },
    {
        id: 'convert-to-table',
        label: 'Create table',
        intent: 'Convert',
        role: 'data-table-interpreter',
        action: 'interpret_table_data',
        initialVisual: 'table',
        targetViews: ['mindmap', 'knowledgeGraph', 'flowchart'],
        prompt:
            'Convert the current exploratory view into a structured table. Supplement the graph with stable columns, row candidates, source-backed evidence, review flags, and enough metadata for table and executive outputs.',
        description: 'Adds structured fields for table review.'
    },
    {
        id: 'convert-to-executive',
        label: 'Create executive view',
        intent: 'Convert',
        role: 'enterprise-readiness-planner',
        action: 'create_stakeholder_review_package',
        initialVisual: 'executive_summary',
        targetViews: ['mindmap', 'knowledgeGraph', 'flowchart'],
        prompt:
            'Convert the current exploratory view into an executive-ready output. Supplement missing findings, recommended actions, risks, required decisions, evidence appendix items, confidence, and review state while preserving the existing graph.',
        description: 'Adds summary metadata for Executive output.'
    }
];

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

const LocalViewsPanel = ({ hidden, onSelectNode, onSelectEdge }) => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
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
        canvasNodeDensity: state.canvasNodeDensity,
        setCanvasNodeDensity: state.setCanvasNodeDensity,
        nudgePreferences: state.nudgePreferences,
        sourceLibrary: state.sourceLibrary
    });
    const {
        nodes,
        edges,
        setNodes,
        setEdges,
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
        canvasNodeDensity,
        setCanvasNodeDensity,
        nudgePreferences,
        sourceLibrary
    } = useStore(useShallow(selector));
    const [acceptedPreviewIds, setAcceptedPreviewIds] = useState(new Set());
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [outputMenuOpen, setOutputMenuOpen] = useState(false);
    const [viewMenuOpen, setViewMenuOpen] = useState(false);
    const [nodeViewMenuOpen, setNodeViewMenuOpen] = useState(false);
    const [followUpActionsOpen, setFollowUpActionsOpen] = useState(false);
    const [relationshipExportStatus, setRelationshipExportStatus] = useState('');
    const panelRef = useRef(null);
    const viewMenuButtonRef = useRef(null);
    const nodeViewMenuButtonRef = useRef(null);
    const outputMenuButtonRef = useRef(null);
    const filtersMenuButtonRef = useRef(null);
    const addActivity = useActivityStore((s) => s.addActivity);
    const recordActivity = useActivityStore((s) => s.recordActivity);
    const flowId = flowStore((s) => s.flow_id);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const pushNode = modalStore((s) => s.pushNode);
    const selectedSourceId = modalStore((s) => s.sourceId);

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
    const relationshipReviewGroups = useMemo(
        () => getRelationshipFamilyReviewGroups(projection),
        [projection]
    );
    const relationshipReviewRows = useMemo(
        () => relationshipReviewGroups.flatMap((group) => group.rows),
        [relationshipReviewGroups]
    );
    const graphConfidence = useMemo(() => getGraphConfidenceSummary(projection), [projection]);
    const executiveOutput = useMemo(
        () => getExecutiveOutputProjection(projection, { title: 'Executive Output' }),
        [projection]
    );
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
    const selectedCanvasNode = useMemo(
        () => nodes.find((node) => node.selected && node.type === 'response'),
        [nodes]
    );
    const selectedCanvasNodeTitle =
        selectedCanvasNode?.data?.title ||
        selectedCanvasNode?.data?.label ||
        selectedCanvasNode?.data?.content ||
        selectedCanvasNode?.id ||
        '';
    const branchLensCandidate = selectedRoot || selectedCanvasNode;
    const branchLensCandidateTitle =
        branchLensCandidate?.title ||
        branchLensCandidate?.data?.title ||
        branchLensCandidate?.data?.label ||
        branchLensCandidate?.data?.content ||
        branchLensCandidate?.id ||
        '';
    const selectedSource = useMemo(
        () =>
            (sourceLibrary || []).find(
                (source) =>
                    source.id === selectedSourceId ||
                    source.source_document_id === selectedSourceId ||
                    source.document_id === selectedSourceId
            ),
        [selectedSourceId, sourceLibrary]
    );
    const activeSourceIds = useMemo(() => {
        if (selectedSource?.id) {
            return [selectedSource.id];
        }
        return (sourceLibrary || [])
            .map((source) => source.id || source.source_document_id || source.document_id)
            .filter(Boolean);
    }, [selectedSource, sourceLibrary]);
    const followUpContext = useMemo(() => {
        if (selectedCanvasNode?.id) {
            return {
                scope: 'node',
                nodeId: selectedCanvasNode.id,
                label: selectedCanvasNodeTitle || selectedCanvasNode.id,
                summary: `Selected node: ${selectedCanvasNodeTitle || selectedCanvasNode.id}`
            };
        }
        if (selectedBranchId) {
            return {
                scope: 'branch',
                nodeId: selectedBranchId,
                label: selectedBranchTitle || selectedBranchId,
                summary: `Selected branch: ${selectedBranchTitle || selectedBranchId}`
            };
        }
        return {
            scope: 'workspace',
            nodeId: undefined,
            label: 'Whole workspace',
            summary: 'Whole workspace'
        };
    }, [
        selectedBranchId,
        selectedBranchTitle,
        selectedCanvasNode?.id,
        selectedCanvasNodeTitle
    ]);
    const activePreviewIds =
        acceptedPreviewIds.size > 0 ? acceptedPreviewIds : allPreviewIds;
    const outputModeValue = WORKSPACE_OUTPUT_OPTIONS.some((view) => view.id === activeView)
        ? activeView
        : '';
    const activeOutputOption = WORKSPACE_OUTPUT_OPTIONS.find((view) => view.id === outputModeValue);
    const activeNextActionDetail = NEXT_ACTION_DETAILS[outputModeValue];
    const isCanvasView = CANVAS_VIEW_IDS.has(activeView);
    const activeCanvasOption = CORE_VIEWS.find((view) => view.id === activeCanvasView);
    const canReflowCanvas = activeCanvasView === 'mindmap' || activeCanvasView === 'knowledgeGraph';
    const followUpActions = useMemo(
        () => [
            ...FOLLOW_UP_ACTIONS,
            ...VIEW_CONVERSION_ACTIONS.filter((action) =>
                action.targetViews.includes(activeCanvasView)
            )
        ],
        [activeCanvasView]
    );
    const showCanvasNudges = isNudgeCategoryEnabled(nudgePreferences, 'canvas');
    const showTaskNudges = isNudgeCategoryEnabled(nudgePreferences, 'tasks');
    useEffect(() => {
        if (!filtersOpen && !outputMenuOpen && !viewMenuOpen && !nodeViewMenuOpen) {
            return undefined;
        }

        const handlePointerDown = (event) => {
            if (
                panelRef.current?.contains(event.target) ||
                event.target?.closest?.('[data-overlay-root="local-views-popover"]')
            ) {
                return;
            }
            setFiltersOpen(false);
            setOutputMenuOpen(false);
            setViewMenuOpen(false);
            setNodeViewMenuOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [filtersOpen, nodeViewMenuOpen, outputMenuOpen, viewMenuOpen]);

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

    const applySelectedBranchScope = () => {
        if (branchLensCandidate?.id) {
            setSelectedBranchId(branchLensCandidate.id);
        }
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
        const normalizedPreset = {
            role: preset.role || preset.roleId,
            action: preset.action || preset.actionId,
            scope: preset.scope,
            initialPrompt: preset.initialPrompt || preset.prompt,
            initialVisual: preset.initialVisual || preset.visual
        };
        const preferredScope =
            normalizedPreset.scope === 'branch' && selectedBranchId ? 'branch' : 'workspace';
        pushNode(PromptModal, {
            scope: preferredScope,
            nodeId: preferredScope === 'branch' ? selectedBranchId : undefined,
            initialRoleId: normalizedPreset.role,
            initialActionId: normalizedPreset.action,
            initialPrompt: normalizedPreset.initialPrompt,
            initialVisual: normalizedPreset.initialVisual || 'auto'
        });
        recordActivity({
            type: 'ai_action_picker_opened',
            title: 'Workspace Ask AI opened',
            summary: normalizedPreset.action
                ? `Opened preview-first AI action: ${normalizedPreset.action}.`
                : 'Opened preview-first AI actions from the workspace.',
            metadata: {
                scope: preferredScope,
                action: normalizedPreset.action || ''
            }
        });
    };

    const openAiPreset = (presetKey) => {
        openWorkspaceAskAi(AI_ACTION_PRESETS[presetKey]);
    };

    const buildCurrentRelationshipReviewMarkdown = () =>
        buildRelationshipReviewMarkdown({
            projection,
            scopeLabel: selectedBranchId
                ? `Selected branch: ${selectedBranchTitle || selectedBranchId}`
                : 'Whole workspace'
        });

    const recordRelationshipReviewExport = (method) => {
        recordActivity({
            type: 'relationship_review_exported',
            title: 'Relationship review exported',
            summary: `Exported ${relationshipReviewRows.length} reviewable relationship${
                relationshipReviewRows.length === 1 ? '' : 's'
            } as markdown.`,
            metadata: {
                method,
                relationship_count: relationshipReviewRows.length,
                scope: selectedBranchId ? 'branch' : 'workspace'
            }
        });
    };

    const copyRelationshipReviewMarkdown = async () => {
        if (relationshipReviewRows.length === 0) {
            return;
        }
        const markdown = buildCurrentRelationshipReviewMarkdown();
        try {
            await navigator.clipboard.writeText(markdown);
            setRelationshipExportStatus('Copied relationship review markdown.');
            recordRelationshipReviewExport('clipboard');
        } catch {
            setRelationshipExportStatus('Copy unavailable. Download the markdown review instead.');
        }
    };

    const downloadRelationshipReviewMarkdown = () => {
        if (relationshipReviewRows.length === 0) {
            return;
        }
        const markdown = buildCurrentRelationshipReviewMarkdown();
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const scopeSlug = selectedBranchId
            ? safeDownloadSlug(selectedBranchTitle || selectedBranchId)
            : 'workspace';
        anchor.href = url;
        anchor.download = `${scopeSlug}-relationship-review.md`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        setRelationshipExportStatus('Downloaded relationship review markdown.');
        recordRelationshipReviewExport('download');
    };

    const openFollowUpAction = (action) => {
        if (!flowId) {
            return;
        }
        if (action.requiresSource && activeSourceIds.length === 0) {
            openSourcePicker();
            return;
        }

        pushNode(PromptModal, {
            scope: followUpContext.scope,
            nodeId: followUpContext.nodeId,
            initialRoleId: action.role,
            initialActionId: action.action,
            initialPrompt: `${action.prompt}\n\nCurrent context: ${followUpContext.summary}.`,
            initialVisual: action.initialVisual || 'auto',
            initialContextSourceIds: action.requiresSource ? activeSourceIds : []
        });
        recordActivity({
            type: 'ai_follow_up_action_opened',
            title: `${action.label} opened`,
            summary: `${action.intent} ${followUpContext.label}.`,
            node_ids: followUpContext.nodeId ? [followUpContext.nodeId] : [],
            source_ids: action.requiresSource ? activeSourceIds : [],
            metadata: {
                scope: followUpContext.scope,
                action: action.action,
                follow_up_action: action.id
            }
        });
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

    const outputPanel = (
        <OutputPanel
            activeView={activeView}
            nodes={nodes}
            edges={edges}
            projection={projection}
            graphConfidence={graphConfidence}
            flowId={flowId}
            showCanvasNudges={showCanvasNudges}
            showTaskNudges={showTaskNudges}
            knowledgeGraphRows={knowledgeGraphRows}
            connectionRows={connectionRows}
            crossLinkRows={crossLinkRows}
            relationshipReviewGroups={relationshipReviewGroups}
            relationshipReviewRows={relationshipReviewRows}
            relationshipExportStatus={relationshipExportStatus}
            executiveOutput={executiveOutput}
            taskRows={taskRows}
            generatedTaskPreview={generatedTaskPreview}
            generatedChecklistPreview={generatedChecklistPreview}
            generatedSourceRepairPreview={generatedSourceRepairPreview}
            generatedReviewerGapsPreview={generatedReviewerGapsPreview}
            generatedReviewerSmePreview={generatedReviewerSmePreview}
            generatedIntegrationHandoffPreview={generatedIntegrationHandoffPreview}
            generatedIntegrationSyncPreview={generatedIntegrationSyncPreview}
            previewRows={previewRows}
            activePreviewIds={activePreviewIds}
            taskPreviewDiffSummary={taskPreviewDiffSummary}
            selectedBranchId={selectedBranchId}
            sourceRepairPreset={AI_ACTION_PRESETS.sources}
            setNodes={setNodes}
            setEdges={setEdges}
            setActiveView={setActiveView}
            clearGeneratedHelperPreview={clearGeneratedHelperPreview}
            onAddRoot={addRootNode}
            onAddSource={openSourcePicker}
            onOpenBrief={openBrief}
            onAskAi={openWorkspaceAskAi}
            onOpenAiPreset={openAiPreset}
            onOpenWorkspaceAskAi={openWorkspaceAskAi}
            onOpenNode={openNode}
            onSelectBranch={selectBranch}
            onSelectEdge={onSelectEdge}
            onCopyRelationshipReview={copyRelationshipReviewMarkdown}
            onDownloadRelationshipReview={downloadRelationshipReviewMarkdown}
            onAcceptTaskPreview={acceptTaskPreview}
            onTogglePreviewRow={togglePreviewRow}
        />
    );

    if (isCanvasView) {
        return (
            <section
                ref={panelRef}
                className="local-views-panel local-views-panel-compact local-canvas-command-bar"
            >
                <CompactMapControls
                    panelRef={panelRef}
                    activeCanvasOption={activeCanvasOption}
                    activeCanvasView={activeCanvasView}
                    activeView={activeView}
                    activeOutputOption={activeOutputOption}
                    outputModeValue={outputModeValue}
                    activeGraphFilters={activeGraphFilters}
                    selectedBranchId={selectedBranchId}
                    branchLensCandidate={branchLensCandidate}
                    nodes={nodes}
                    refs={{
                        viewMenuButtonRef,
                        nodeViewMenuButtonRef,
                        outputMenuButtonRef,
                        filtersMenuButtonRef
                    }}
                    menus={{
                        viewMenuOpen,
                        nodeViewMenuOpen,
                        outputMenuOpen,
                        filtersOpen
                    }}
                    setters={{
                        setViewMenuOpen,
                        setNodeViewMenuOpen,
                        setOutputMenuOpen,
                        setFiltersOpen,
                        setSelectedBranchId,
                        setActiveCanvasView,
                        setCanvasNodeDensity,
                        setActiveGraphFilters,
                        toggleGraphFilter,
                        setActiveView,
                        applySelectedBranchScope
                    }}
                    constants={{
                        coreViews: CORE_VIEWS,
                        nodeDensityOptions: NODE_DENSITY_OPTIONS,
                        canvasNodeDensity,
                        canReflowCanvas,
                        graphFilters: GRAPH_FILTERS,
                        activeFilterSet,
                        outputGroups: WORKSPACE_OUTPUT_GROUPS
                    }}
                />
                {nodes.length > 0 ? (
                    <FollowUpActionsBar
                        compact
                        context={followUpContext}
                        activeSourceCount={activeSourceIds.length}
                        sourceLabel="source"
                        confidenceScore={graphConfidence.score}
                        open={followUpActionsOpen}
                        actions={followUpActions}
                        onToggle={() => setFollowUpActionsOpen((open) => !open)}
                        onAction={openFollowUpAction}
                    />
                ) : null}
            </section>
        );
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
            <ExpandedMapControls
                coreViewGroups={CORE_VIEW_GROUPS}
                activeCanvasView={activeCanvasView}
                setActiveCanvasView={setActiveCanvasView}
                selectedBranchId={selectedBranchId}
                setSelectedBranchId={setSelectedBranchId}
                branchLensCandidate={branchLensCandidate}
                branchLensCandidateTitle={branchLensCandidateTitle}
                selectedBranchTitle={selectedBranchTitle}
                applySelectedBranchScope={applySelectedBranchScope}
                outputMenuButtonRef={outputMenuButtonRef}
                filtersMenuButtonRef={filtersMenuButtonRef}
                outputMenuOpen={outputMenuOpen}
                filtersOpen={filtersOpen}
                setOutputMenuOpen={setOutputMenuOpen}
                setFiltersOpen={setFiltersOpen}
                outputModeValue={outputModeValue}
                activeOutputOption={activeOutputOption}
                activeCanvasOption={activeCanvasOption}
                activeGraphFilters={activeGraphFilters}
                isCanvasView={isCanvasView}
                activeNextActionDetail={activeNextActionDetail}
                showNextActionEmptyHint={crossLinkRows.length === 0}
            />
            <FilterPopover
                open={filtersOpen}
                anchorRef={filtersMenuButtonRef}
                filters={GRAPH_FILTERS}
                activeFilterSet={activeFilterSet}
                activeGraphFilters={activeGraphFilters}
                onClose={() => setFiltersOpen(false)}
                onReset={() => setActiveGraphFilters([])}
                onToggleFilter={toggleGraphFilter}
            />
            <OutputWorkflowPopover
                open={outputMenuOpen}
                anchorRef={outputMenuButtonRef}
                outputGroups={WORKSPACE_OUTPUT_GROUPS}
                activeView={activeView}
                onClose={() => setOutputMenuOpen(false)}
                onSelectView={(viewId) => {
                    setActiveView(viewId);
                    setOutputMenuOpen(false);
                }}
            />
            <ActiveScopeStrip
                hidden={filtersOpen}
                items={activeScopeItems}
                onClearAll={clearScopeAndFilters}
            />

            {nodes.length > 0 ? (
                <FollowUpActionsBar
                    compact={isCanvasView}
                    context={followUpContext}
                    activeSourceCount={activeSourceIds.length}
                    sourceLabel="active source"
                    confidenceScore={graphConfidence.score}
                    open={followUpActionsOpen}
                    actions={followUpActions}
                    onToggle={() => setFollowUpActionsOpen((open) => !open)}
                    onAction={openFollowUpAction}
                />
            ) : null}

            {!isCanvasView ? outputPanel : null}
        </section>
    );
};

export default LocalViewsPanel;
