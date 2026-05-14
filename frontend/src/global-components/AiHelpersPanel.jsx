/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import useActivityStore from '../stores/activityStore';
import {
    buildGraphProjection,
    getChecklistPreviewRows,
    getMissingInfoPreviewRows,
    getSmeQuestionPreviewRows,
    getSourceRepairPreviewRows,
    getTaskPreviewRows
} from '../views/graphProjection';

const helperAction = (id, label, view, count, detail) => ({
    id,
    label,
    view,
    count,
    detail
});

const AiHelpersPanel = ({ hidden }) => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        activeView: state.activeView,
        setActiveView: state.setActiveView,
        selectedBranchId: state.selectedBranchId,
        setSelectedBranchId: state.setSelectedBranchId
    });
    const {
        nodes,
        edges,
        activeView,
        setActiveView,
        selectedBranchId,
        setSelectedBranchId
    } = useStore(useShallow(selector));
    const addActivity = useActivityStore((s) => s.addActivity);
    const [isOpen, setIsOpen] = useState(false);

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
                    'Source Librarian prepared citation repair candidates.'
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
                    'Reviewer prepared missing-information findings.'
                ),
                helperAction(
                    'draft-sme-questions',
                    'Draft SME Qs',
                    'sme',
                    helperCounts.smeQuestions,
                    'Reviewer prepared SME review questions.'
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
                    'Integration Operator prepared monday input rows.'
                ),
                helperAction(
                    'review-monday-status',
                    'monday status',
                    'mondayStatus',
                    helperCounts.mondayMapped,
                    'Integration Operator prepared monday status review.'
                )
            ]
        }
    ];

    const openHelperAction = (role, action) => {
        setActiveView(action.view);
        setIsOpen(false);
        addActivity({
            status: 'completed',
            title: `${role.name}: ${action.label}`,
            detail: action.detail,
            context: selectedRoot
                ? `Scope: ${selectedRoot.title}`
                : `Scope: whole graph (${projection.nodes.length} nodes)`
        });
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
                                        disabled={nodes.length === 0}
                                    >
                                        <span>{action.label}</span>
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
