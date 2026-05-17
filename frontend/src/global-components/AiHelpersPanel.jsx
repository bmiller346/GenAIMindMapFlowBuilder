/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import useActivityStore from '../stores/activityStore';
import flowStore from '../stores/flowStore';
import modalStore from '../stores/modalStore';
import PromptModal from '../modals/PromptModal';
import {
    buildGraphProjection,
    buildFilteredGraphProjection,
    getChecklistPreviewRows,
    getMissingInfoPreviewRows,
    getSmeQuestionPreviewRows,
    getSourceRepairPreviewRows,
    getTaskPreviewRows
} from '../views/graphProjection';
import { buildWorkspaceNextSteps } from '../utils/workspaceNudges';

const helperAction = (id, label, view, count, detail, helperId, previewAction, previewKey) => ({
    id,
    label,
    view,
    count,
    detail,
    helperId,
    previewAction,
    previewKey
});

const SCOPE_OPTIONS = [
    { id: 'workspace', label: 'Whole workspace' },
    { id: 'branch', label: 'Selected branch' },
    { id: 'nodes', label: 'Selected nodes' },
    { id: 'source_document', label: 'Selected source document' },
    { id: 'filtered_view', label: 'Current filtered view' }
];

const OUTPUT_PROMPT_DEFAULTS = {
    'create-knowledge-graph': {
        role: 'standards-extractor',
        action: 'custom_prompt',
        visual: 'knowledge_graph',
        prompt:
            'Analyze the current workspace and create a knowledge graph layer. Preserve the existing hierarchy, then propose entities, cross-branch relationship edges, dependencies, conflicts, overlaps, source signals, confidence, rationale, and review state.'
    },
    'find-connections': {
        role: 'gap-analyst',
        action: 'find_duplicate_overlapping_nodes',
        visual: 'knowledge_graph',
        prompt:
            'Find cross-branch connection candidates in the current workspace. Do not rewrite the hierarchy. Propose relationship edges only when there is a clear signal, and include duplicates, overlaps, dependencies, supporting relationships, conflicts, blockers, rationale, confidence, and review state.'
    },
    'create-flow-chart': {
        role: 'workflow-mapper',
        action: 'custom_prompt'
    },
    'extract-chart-data': {
        role: 'data-table-interpreter',
        action: 'interpret_table_data'
    }
};

const sourceIdsFromNode = (node = {}) =>
    [
        node.id,
        node.data?.source_document_id,
        node.data?.source_document?.id,
        node.data?.document_id,
        node.data?.component_id
    ].filter(Boolean);

const sourceTitleFromNode = (node = {}) =>
    node.title ||
    node.filename ||
    node.name ||
    node.data?.source_document?.original_filename ||
    node.data?.source_document?.filename ||
    node.data?.filename ||
    node.data?.title ||
    node.data?.content ||
    node.id ||
    'Selected source';

const AiHelpersPanel = ({
    hidden,
    selectedNodes = [],
    autoOpenToken = 0,
    summaryLabel = 'AI Helpers',
    onClose
}) => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        activeView: state.activeView,
        setActiveView: state.setActiveView,
        selectedBranchId: state.selectedBranchId,
        setSelectedBranchId: state.setSelectedBranchId,
        setGeneratedHelperPreview: state.setGeneratedHelperPreview,
        activeGraphFilters: state.activeGraphFilters,
        sourceLibrary: state.sourceLibrary
    });
    const {
        nodes,
        edges,
        activeView,
        setActiveView,
        selectedBranchId,
        setSelectedBranchId,
        setGeneratedHelperPreview,
        activeGraphFilters,
        sourceLibrary
    } = useStore(useShallow(selector));
    const addActivity = useActivityStore((s) => s.addActivity);
    const flowId = flowStore((s) => s.flow_id);
    const pushNode = modalStore((s) => s.pushNode);
    const selectedSourceId = modalStore((s) => s.sourceId);
    const [isOpen, setIsOpen] = useState(false);
    const [runningActionId, setRunningActionId] = useState('');
    const [actionError, setActionError] = useState('');
    const [scopeType, setScopeType] = useState('workspace');

    useEffect(() => {
        if (autoOpenToken) {
            setIsOpen(true);
        }
    }, [autoOpenToken]);

    const projection = useMemo(
        () => buildGraphProjection(nodes, edges, selectedBranchId),
        [nodes, edges, selectedBranchId]
    );
    const filteredProjection = useMemo(
        () =>
            buildFilteredGraphProjection(nodes, edges, {
                branchId: selectedBranchId,
                filters: activeGraphFilters
            }),
        [activeGraphFilters, edges, nodes, selectedBranchId]
    );
    const selectedNodeIds = useMemo(() => {
        const ids = [
            ...selectedNodes.map((node) => node.id),
            ...nodes
                .filter((node) => node.selected && node.type === 'response')
                .map((node) => node.id)
        ].filter(Boolean);
        return Array.from(new Set(ids));
    }, [nodes, selectedNodes]);
    const selectedSource = useMemo(
        () => {
            const librarySource = sourceLibrary.find(
                (source) =>
                    source.id === selectedSourceId ||
                    source.source_document_id === selectedSourceId ||
                    source.document_id === selectedSourceId
            );
            if (librarySource) {
                return librarySource;
            }

            return nodes.find(
                (node) =>
                    node.type === 'dataSource' &&
                    sourceIdsFromNode(node).includes(selectedSourceId)
            );
        },
        [nodes, selectedSourceId, sourceLibrary]
    );

    const helperCounts = useMemo(
        () => ({
            taskCandidates: getTaskPreviewRows(projection).length,
            checklistCandidates: getChecklistPreviewRows(projection).length,
            sourceRepairs: getSourceRepairPreviewRows(projection).length,
            missingInfo: getMissingInfoPreviewRows(projection).length,
            smeQuestions: getSmeQuestionPreviewRows(projection).length,
            mondayReady: projection.nodes.filter(
                (node) =>
                    node.node_type === 'task' ||
                    node.node_type === 'requirement' ||
                    node.node_type === 'workflow'
            ).length,
            mondayMapped: nodes.filter(
                (node) => node.data?.external_refs?.monday?.item_id
            ).length
        }),
        [nodes, projection]
    );
    const nextStepProjection = useMemo(
        () =>
            buildWorkspaceNextSteps({
                nodes,
                edges,
                sourceLibrary,
                selectedBranchId,
                filters: activeGraphFilters
            }),
        [activeGraphFilters, edges, nodes, selectedBranchId, sourceLibrary]
    );
    const selectedRoot = projection.nodes.find((node) => node.id === selectedBranchId);
    const hasFilteredScope = (activeGraphFilters || []).length > 0 || Boolean(selectedBranchId);
    const effectiveScopeType =
        (scopeType === 'branch' && !selectedBranchId) ||
        (scopeType === 'nodes' && selectedNodeIds.length === 0) ||
        (scopeType === 'source_document' && !selectedSourceId) ||
        (scopeType === 'filtered_view' && !hasFilteredScope)
            ? 'workspace'
            : scopeType;
    const scopeLabel =
        SCOPE_OPTIONS.find((option) => option.id === effectiveScopeType)?.label ||
        'Whole workspace';
    const requestedScopeLabel =
        SCOPE_OPTIONS.find((option) => option.id === scopeType)?.label ||
        'Whole workspace';
    const scopePayload = () => {
        if (effectiveScopeType === 'source_document' && selectedSourceId) {
            return { type: 'source', source_id: selectedSourceId };
        }
        if (effectiveScopeType === 'nodes' && selectedNodeIds.length > 0) {
            return { type: 'nodes', node_ids: selectedNodeIds };
        }
        if (
            (effectiveScopeType === 'branch' || effectiveScopeType === 'filtered_view') &&
            selectedBranchId
        ) {
            return { type: 'branch', node_id: selectedBranchId };
        }

        return { type: 'workspace' };
    };
    const draftScopePayload = () => {
        if (effectiveScopeType === 'source_document' && selectedSourceId) {
            return {
                scope: 'source',
                sourceId: selectedSourceId,
                source: selectedSource
                    ? {
                          id: selectedSourceId,
                          title: sourceTitleFromNode(selectedSource),
                          type:
                              selectedSource.data?.source_document?.type ||
                              selectedSource.type ||
                              selectedSource.type_label,
                          chunks: selectedSource.chunks || [],
                          source_refs: selectedSource.source_refs || []
                      }
                    : { id: selectedSourceId }
            };
        }
        if (effectiveScopeType === 'nodes' && selectedNodeIds.length > 0) {
            return { scope: 'nodes', nodeIds: selectedNodeIds };
        }
        if (effectiveScopeType === 'filtered_view') {
            return {
                scope: 'nodes',
                nodeIds: filteredProjection.nodes.map((node) => node.id)
            };
        }
        if (effectiveScopeType === 'branch' && selectedBranchId) {
            return { scope: 'branch', nodeId: selectedBranchId };
        }
        return { scope: 'workspace' };
    };
    const scopeDetail = () => {
        if (effectiveScopeType === 'branch' && selectedRoot) {
            return `${scopeLabel}: ${selectedRoot.title}`;
        }
        if (effectiveScopeType === 'nodes') {
            return `${scopeLabel}: ${selectedNodeIds.length} nodes`;
        }
        if (effectiveScopeType === 'source_document') {
            return `${scopeLabel}: ${
                selectedSource ? sourceTitleFromNode(selectedSource) : selectedSourceId
            }`;
        }
        if (effectiveScopeType === 'filtered_view') {
            return `${scopeLabel}: ${filteredProjection.nodes.length} filtered nodes`;
        }
        return `${scopeLabel}: ${projection.nodes.length} nodes`;
    };
    const helperRoles = [
        {
            id: 'output-builder',
            name: 'AI Output Builder',
            permission: 'Creates new artifact previews; nothing is accepted until review.',
            actions: [
                helperAction(
                    'create-knowledge-graph',
                    'Create knowledge graph',
                    'knowledgeGraph',
                    projection.nodes.length,
                    'Prepared knowledge graph output target.'
                ),
                helperAction(
                    'find-connections',
                    'Find connections',
                    'connections',
                    projection.edges.length,
                    'Prepared connection discovery output target.'
                ),
                helperAction(
                    'create-flow-chart',
                    'Create flow chart',
                    'flowchart',
                    projection.nodes.length,
                    'Prepared flow chart generation target.'
                ),
                helperAction(
                    'extract-chart-data',
                    'Create structured table',
                    'chartData',
                    projection.nodes.filter((node) => node.table_rows?.length).length,
                    'Prepared structured table generation target.'
                )
            ]
        },
        {
            id: 'source-librarian',
            name: 'Source Librarian',
            permission: 'May propose citation repairs; never rewrites node claims.',
            actions: [
                helperAction(
                    'repair-sources',
                    'Repair source refs',
                    'sources',
                    helperCounts.sourceRepairs,
                    'Source Librarian prepared citation repair candidates.',
                    'source-librarian',
                    'source_repair',
                    'sourceLibrarianSources'
                ),
                helperAction(
                    'source-coverage',
                    'Coverage report',
                    'sources',
                    helperCounts.sourceRepairs,
                    'Source Librarian prepared a source coverage report.',
                    'source-librarian',
                    'source_coverage',
                    'sourceLibrarianSources'
                )
            ]
        },
        {
            id: 'project-planner',
            name: 'Project Planner',
            permission: 'May project branches into task and checklist previews.',
            actions: [
                helperAction(
                    'preview-tasks',
                    'Generate task preview',
                    'preview',
                    helperCounts.taskCandidates,
                    'Project Planner prepared branch-to-task candidates.'
                ),
                helperAction(
                    'preview-checklist',
                    'Create checklist from this branch',
                    'checklist',
                    helperCounts.checklistCandidates,
                    'Project Planner prepared checklist candidates.'
                )
            ]
        },
        {
            id: 'reviewer',
            name: 'Reviewer',
            permission: 'May flag gaps and draft SME questions for review.',
            actions: [
                helperAction(
                    'find-gaps',
                    'Find gaps',
                    'gaps',
                    helperCounts.missingInfo,
                    'Reviewer prepared missing-information findings.',
                    'reviewer',
                    'missing_information',
                    'reviewerGaps'
                ),
                helperAction(
                    'draft-sme-questions',
                    'Draft SME questions',
                    'sme',
                    helperCounts.smeQuestions,
                    'Reviewer prepared SME review questions.',
                    'reviewer',
                    'sme_questions',
                    'reviewerSmeQuestions'
                ),
                helperAction(
                    'find-contradictions',
                    'Contradictions',
                    'gaps',
                    helperCounts.missingInfo,
                    'Reviewer prepared contradiction findings.',
                    'reviewer',
                    'contradictions',
                    'reviewerGaps'
                )
            ]
        },
        {
            id: 'integration-operator',
            name: 'Integration Operator',
            permission: 'May prepare handoff views; credentials and pushes stay elsewhere.',
            actions: [
                helperAction(
                    'prepare-monday',
                    'Create implementation handoff package',
                    'mondayInput',
                    helperCounts.mondayReady,
                    'Integration Operator prepared monday input rows.',
                    'integration-operator',
                    'handoff_readiness',
                    'integrationOperatorHandoff'
                ),
                helperAction(
                    'review-monday-status',
                    'Review handoff status',
                    'mondayStatus',
                    helperCounts.mondayMapped,
                    'Integration Operator prepared monday status review.',
                    'integration-operator',
                    'sync_issue_review',
                    'integrationOperatorSync'
                )
            ]
        }
    ];

    const projectPlannerAction = async (action) => {
        if (!flowId) {
            throw new Error('Create or open a workspace before generating a planner preview.');
        }

        const previewAction =
            action.id === 'preview-checklist'
                ? 'checklist_projection'
                : 'task_projection';
        const previewKey =
            previewAction === 'checklist_projection'
                ? 'projectPlannerChecklist'
                : 'projectPlannerTasks';
        const response = await axios.post(
            `http://localhost:8000/api/workspaces/${flowId}/ai/project-planner/preview`,
            {
                action: previewAction,
                scope: scopePayload(),
                use_ai: true,
                allow_deterministic_fallback: true
            }
        );
        setGeneratedHelperPreview(previewKey, response.data);
        return response.data;
    };

    const backendPreviewAction = async (action) => {
        if (!action.helperId) {
            return undefined;
        }
        if (roleDoesNotNeedBackend(action)) {
            return undefined;
        }
        if (!flowId) {
            throw new Error('Create or open a workspace before generating a helper preview.');
        }

        const response = await axios.post(
            `http://localhost:8000/api/workspaces/${flowId}/ai/${action.helperId}/preview`,
            {
                action: action.previewAction,
                scope: scopePayload(),
                use_ai: true,
                allow_deterministic_fallback: true
            }
        );
        setGeneratedHelperPreview(action.previewKey, response.data);
        return response.data;
    };

    const roleDoesNotNeedBackend = (action) =>
        action.helperId === 'project-planner';

    const openHelperAction = async (role, action) => {
        setActionError('');
        setRunningActionId(action.id);
        try {
            let generatedPreview;
            if (!action.helperId && role.id === 'output-builder') {
                const promptDefaults = OUTPUT_PROMPT_DEFAULTS[action.id] || {};
                pushNode(PromptModal, {
                    ...draftScopePayload(),
                    initialRoleId: promptDefaults.role,
                    initialActionId: promptDefaults.action,
                    initialPrompt: promptDefaults.prompt || '',
                    initialVisual: promptDefaults.visual || 'auto'
                });
                generatedPreview = undefined;
            } else if (role.id === 'project-planner') {
                generatedPreview = await projectPlannerAction(action);
            } else {
                generatedPreview = await backendPreviewAction(action);
            }

            setActiveView(action.view);
            setIsOpen(false);
            addActivity({
                status: 'completed',
                title: `${role.name}: ${action.label}`,
                detail: generatedPreview
                    ? `Generated ${generatedPreview.preview_items?.length || 0} helper preview item${
                          generatedPreview.preview_items?.length === 1 ? '' : 's'
                      }.`
                    : action.detail,
                context: selectedRoot
                    ? `Scope: ${scopeDetail()}${
                          requestedScopeLabel !== scopeLabel
                              ? ` (requested ${requestedScopeLabel})`
                              : ''
                      }`
                    : `Scope: ${scopeDetail()}${
                          requestedScopeLabel !== scopeLabel
                              ? ` (requested ${requestedScopeLabel})`
                              : ''
                      }`
            });
        } catch (error) {
            const detail =
                error.response?.data?.detail?.message ||
                error.response?.data?.detail ||
                error.message ||
                'Unable to generate helper preview.';
            setActionError(String(detail));
            addActivity({
                status: 'failed',
                title: `${role.name}: ${action.label}`,
                detail: String(detail),
                context: selectedRoot
                    ? `Scope: ${scopeDetail()}`
                    : `Scope: ${scopeDetail()}`
            });
        } finally {
            setRunningActionId('');
        }
    };

    const helperActionForNextStep = (step) => {
        const action = step.action || {};
        const outputType = action.output_type || action.view;
        let directActionId = '';

        if (action.type === 'open_view' && action.view === 'sources') {
            directActionId = 'repair-sources';
        } else if (action.type === 'open_view' && action.view === 'gaps') {
            directActionId = 'find-gaps';
        } else if (action.type === 'open_view' && action.view === 'tasks') {
            directActionId = 'preview-tasks';
        } else if (action.type === 'ai_enrichment' && outputType === 'knowledge_graph') {
            directActionId = 'find-connections';
        } else if (action.type === 'generate_output' && outputType === 'tasks') {
            directActionId = 'preview-tasks';
        } else if (action.type === 'generate_output' && outputType === 'checklist') {
            directActionId = 'preview-checklist';
        } else if (action.type === 'generate_output' && outputType === 'flow_chart') {
            directActionId = 'create-flow-chart';
        } else if (action.type === 'generate_output' && outputType === 'chart') {
            directActionId = 'extract-chart-data';
        } else if (action.type === 'generate_output' && outputType === 'knowledge_graph') {
            directActionId = 'create-knowledge-graph';
        }

        if (!directActionId) {
            return null;
        }

        for (const role of helperRoles) {
            const helperActionMatch = role.actions.find((item) => item.id === directActionId);
            if (helperActionMatch) {
                return { role, action: helperActionMatch };
            }
        }
        return null;
    };

    const viewForNextStep = (step) => {
        const view = step.action?.view || step.action?.output_type;
        return (
            {
                tasks: 'preview',
                table: 'chartData',
                chart: 'chartData',
                flow_chart: 'flowchart',
                knowledge_graph: 'connections'
            }[view] || view
        );
    };

    const canRouteNextStep = (step) => {
        if (helperActionForNextStep(step)) {
            return true;
        }
        if (step.action?.type === 'reset_branch') {
            return true;
        }
        return Boolean(viewForNextStep(step));
    };

    const recommendedNextSteps = useMemo(
        () => nextStepProjection.steps.filter(canRouteNextStep).slice(0, 3),
        [helperRoles, nextStepProjection.steps]
    );

    const openRecommendedNextStep = async (step) => {
        const helperTarget = helperActionForNextStep(step);
        if (helperTarget) {
            await openHelperAction(helperTarget.role, helperTarget.action);
            return;
        }
        if (step.action?.type === 'reset_branch') {
            setSelectedBranchId(undefined);
            setScopeType('workspace');
            return;
        }
        const nextView = viewForNextStep(step);
        if (nextView) {
            setActiveView(nextView);
            setIsOpen(false);
        }
    };

    if (hidden) {
        return null;
    }

    return (
        <section className="ai-helpers-panel">
            <button
                type="button"
                className={`ai-helpers-summary ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen((current) => !current)}
                aria-expanded={isOpen}
            >
                <span>{summaryLabel}</span>
                <strong>{selectedRoot ? selectedRoot.title : 'Whole graph'}</strong>
            </button>
            {isOpen ? (
                <div className="ai-helpers-body">
                    <div className="ai-helpers-body-header">
                        <div>
                            <strong>{summaryLabel}</strong>
                            <span>{scopeDetail()}</span>
                        </div>
                        <div>
                            <button type="button" onClick={() => setIsOpen(false)}>
                                Minimize
                            </button>
                            {typeof onClose === 'function' ? (
                                <button type="button" onClick={onClose}>
                                    Close
                                </button>
                            ) : null}
                        </div>
                    </div>
                    <div className="ai-helper-scope">
                        <label htmlFor="ai-helper-scope-select">Scope before generation</label>
                        <select
                            id="ai-helper-scope-select"
                            value={scopeType}
                            onChange={(event) => setScopeType(event.target.value)}
                        >
                            {SCOPE_OPTIONS.map((option) => (
                                <option
                                    key={option.id}
                                    value={option.id}
                                    disabled={
                                        (option.id === 'branch' && !selectedBranchId) ||
                                        (option.id === 'nodes' && selectedNodeIds.length === 0) ||
                                        (option.id === 'source_document' && !selectedSourceId) ||
                                        (option.id === 'filtered_view' && !hasFilteredScope)
                                    }
                                >
                                    {option.label}
                                    {option.id === 'branch' && !selectedBranchId
                                        ? ' (select branch first)'
                                        : ''}
                                    {option.id === 'nodes' && selectedNodeIds.length === 0
                                        ? ' (select nodes first)'
                                        : ''}
                                    {option.id === 'source_document' && !selectedSourceId
                                        ? ' (select source first)'
                                        : ''}
                                    {option.id === 'filtered_view' && !hasFilteredScope
                                        ? ' (apply filter first)'
                                        : ''}
                                </option>
                            ))}
                        </select>
                        <span>{scopeDetail()}</span>
                        {selectedBranchId ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedBranchId(undefined);
                                    setScopeType('workspace');
                                }}
                            >
                                Whole workspace
                            </button>
                        ) : null}
                    </div>
                    {actionError ? (
                        <div className="ai-helper-error">{actionError}</div>
                    ) : null}
                    {recommendedNextSteps.length > 0 ? (
                        <article className="ai-helper-next-steps">
                            <div className="ai-helper-next-steps__header">
                                <strong>Recommended next</strong>
                                <span>Reviewable actions based on the current graph.</span>
                            </div>
                            <div className="ai-helper-next-steps__list">
                                {recommendedNextSteps.map((step) => (
                                    <button
                                        key={step.id}
                                        type="button"
                                        onClick={() => openRecommendedNextStep(step)}
                                        disabled={nodes.length === 0 || Boolean(runningActionId)}
                                    >
                                        <span>{step.action_label}</span>
                                        <strong>{step.title}</strong>
                                        <small>{step.expected_result}</small>
                                    </button>
                                ))}
                            </div>
                        </article>
                    ) : null}
                    {helperRoles.map((role) => (
                        <article key={role.id} className="ai-helper-card">
                            <div>
                                <strong>{role.name}</strong>
                                <span>{role.permission}</span>
                            </div>
                            <div className="ai-helper-actions">
                                {role.actions.map((action) => (
                                    <button
                                        key={action.id}
                                        type="button"
                                        className={
                                            activeView === action.view ? 'active' : ''
                                        }
                                        onClick={() => openHelperAction(role, action)}
                                        disabled={nodes.length === 0 || Boolean(runningActionId)}
                                    >
                                        <span>
                                            {runningActionId === action.id
                                                ? 'Generating'
                                                : action.label}
                                        </span>
                                        <small>{action.count}</small>
                                    </button>
                                ))}
                            </div>
                        </article>
                    ))}
                </div>
            ) : null}
        </section>
    );
};

export default AiHelpersPanel;
