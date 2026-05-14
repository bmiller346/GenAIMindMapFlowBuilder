/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import axios from 'axios';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import useActivityStore from '../stores/activityStore';
import flowStore from '../stores/flowStore';
import {
    buildGraphProjection,
    getChecklistPreviewRows,
    getMissingInfoPreviewRows,
    getSmeQuestionPreviewRows,
    getSourceRepairPreviewRows,
    getTaskPreviewRows
} from '../views/graphProjection';

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

const AiHelpersPanel = ({ hidden }) => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        activeView: state.activeView,
        setActiveView: state.setActiveView,
        selectedBranchId: state.selectedBranchId,
        setSelectedBranchId: state.setSelectedBranchId,
        setGeneratedHelperPreview: state.setGeneratedHelperPreview
    });
    const {
        nodes,
        edges,
        activeView,
        setActiveView,
        selectedBranchId,
        setSelectedBranchId,
        setGeneratedHelperPreview
    } = useStore(useShallow(selector));
    const addActivity = useActivityStore((s) => s.addActivity);
    const flowId = flowStore((s) => s.flow_id);
    const [isOpen, setIsOpen] = useState(false);
    const [runningActionId, setRunningActionId] = useState('');
    const [actionError, setActionError] = useState('');

    const projection = useMemo(
        () => buildGraphProjection(nodes, edges, selectedBranchId),
        [nodes, edges, selectedBranchId]
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

    const selectedRoot = projection.nodes.find((node) => node.id === selectedBranchId);
    const helperRoles = [
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
                    'Preview tasks',
                    'preview',
                    helperCounts.taskCandidates,
                    'Project Planner prepared branch-to-task candidates.'
                ),
                helperAction(
                    'preview-checklist',
                    'Preview checklist',
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
                    'Draft SME Qs',
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
                    'monday input',
                    'mondayInput',
                    helperCounts.mondayReady,
                    'Integration Operator prepared monday input rows.',
                    'integration-operator',
                    'handoff_readiness',
                    'integrationOperatorHandoff'
                ),
                helperAction(
                    'review-monday-status',
                    'monday status',
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
                scope: selectedBranchId
                    ? { type: 'branch', node_id: selectedBranchId }
                    : { type: 'workspace' },
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
                scope: selectedBranchId
                    ? { type: 'branch', node_id: selectedBranchId }
                    : { type: 'workspace' },
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
            if (role.id === 'project-planner') {
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
                    ? `Scope: ${selectedRoot.title}`
                    : `Scope: whole graph (${projection.nodes.length} nodes)`
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
                    ? `Scope: ${selectedRoot.title}`
                    : `Scope: whole graph (${projection.nodes.length} nodes)`
            });
        } finally {
            setRunningActionId('');
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
                <span>AI Helpers</span>
                <strong>{selectedRoot ? selectedRoot.title : 'Whole graph'}</strong>
            </button>
            {isOpen ? (
                <div className="ai-helpers-body">
                    <div className="ai-helper-scope">
                        <span>
                            {selectedRoot
                                ? `Selected branch: ${selectedRoot.title}`
                                : `${projection.nodes.length} nodes in scope`}
                        </span>
                        {selectedBranchId ? (
                            <button
                                type="button"
                                onClick={() => setSelectedBranchId(undefined)}
                            >
                                Whole graph
                            </button>
                        ) : null}
                    </div>
                    {actionError ? (
                        <div className="ai-helper-error">{actionError}</div>
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
