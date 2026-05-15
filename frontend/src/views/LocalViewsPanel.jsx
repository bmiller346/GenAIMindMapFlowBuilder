/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import modalStore from '../stores/modalStore';
import DataSourceSelect from '../global-components/DataSourceSelect';
import PromptModal from '../modals/PromptModal';
import WorkspaceBriefModal from '../modals/WorkspaceBriefModal';
import {
    buildGraphProjection,
    getTaskPreviewRows,
    getTaskRows
} from './graphProjection';
import ChecklistPreview from './ChecklistPreview';
import MissingInfoPreview from './MissingInfoPreview';
import SmeQuestionsPreview from './SmeQuestionsPreview';
import SourceRepairPreview from './SourceRepairPreview';
import MondaySelectionInput from './MondaySelectionInput';
import MondayStatusBackPreview from './MondayStatusBackPreview';
import { withLocalPreviewAcceptance } from './localPreviewMetadata';
import useActivityStore from '../stores/activityStore';
import flowStore from '../stores/flowStore';
import { createWorkspaceNode, getRootPosition } from '../utils/manualNodes';

const CORE_VIEWS = [
    { id: 'mindmap', label: 'Map' },
    { id: 'outline', label: 'Outline' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'table', label: 'Table' }
];

const REVIEW_VIEWS = [
    { id: 'preview', label: 'Tasks preview' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'gaps', label: 'Gaps' },
    { id: 'sme', label: 'SME Qs' },
    { id: 'sources', label: 'Source repair' }
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
    onAskAi
}) => (
    <div className="local-view-empty">
        <span className="local-view-empty-kicker">Start your Think Space</span>
        <strong>No graph nodes yet</strong>
        <span>
            {activeView === 'mindmap'
                ? 'Add sources, sketch a root node, or define the brief that AI should use.'
                : 'This view will populate once the workspace has graph nodes.'}
        </span>
        <div className="local-view-empty-actions">
            <button type="button" onClick={onAddSource}>
                Add source
            </button>
            <button type="button" onClick={onAddRoot} disabled={!canUseWorkspace}>
                Create root node
            </button>
            <button type="button" onClick={onOpenBrief}>
                Set brief
            </button>
            <button type="button" onClick={onAskAi} disabled={!canUseWorkspace}>
                Ask AI
            </button>
        </div>
        {!canUseWorkspace ? (
            <small>Open or create a workspace to add nodes or ask AI.</small>
        ) : null}
    </div>
);

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
        clearGeneratedHelperPreview: state.clearGeneratedHelperPreview
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
        clearGeneratedHelperPreview
    } = useStore(useShallow(selector));
    const [acceptedPreviewIds, setAcceptedPreviewIds] = useState(new Set());
    const addActivity = useActivityStore((s) => s.addActivity);
    const recordActivity = useActivityStore((s) => s.recordActivity);
    const flowId = flowStore((s) => s.flow_id);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const pushNode = modalStore((s) => s.pushNode);

    const projection = useMemo(
        () => buildGraphProjection(nodes, edges, selectedBranchId),
        [nodes, edges, selectedBranchId]
    );
    const taskRows = useMemo(() => getTaskRows(projection), [projection]);
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

    const selectedRoot = projection.nodes.find((node) => node.id === selectedBranchId);
    const activePreviewIds =
        acceptedPreviewIds.size > 0 ? acceptedPreviewIds : allPreviewIds;
    const activeReviewView = REVIEW_VIEWS.some((view) => view.id === activeView)
        ? activeView
        : '';

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

    const openWorkspaceAskAi = () => {
        if (!flowId) {
            return;
        }
        pushNode(PromptModal, { scope: 'workspace' });
        recordActivity({
            type: 'ai_action_picker_opened',
            title: 'Workspace Ask AI opened',
            summary: 'Opened preview-first AI actions from the empty workspace state.',
            metadata: {
                scope: 'workspace'
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
                <div className="local-view-tabs" role="tablist" aria-label="Graph views">
                    {CORE_VIEWS.map((view) => (
                        <button
                            key={view.id}
                            type="button"
                            className={activeView === view.id ? 'active' : ''}
                            onClick={() => setActiveView(view.id)}
                        >
                            {view.label}
                        </button>
                    ))}
                    <select
                        className={activeReviewView ? 'active' : ''}
                        value={activeReviewView}
                        onChange={(event) => {
                            if (event.target.value) {
                                setActiveView(event.target.value);
                            }
                        }}
                        aria-label="Review views"
                    >
                        <option value="">Review</option>
                        {REVIEW_VIEWS.map((view) => (
                            <option key={view.id} value={view.id}>
                                {view.label}
                            </option>
                        ))}
                    </select>
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

            {nodes.length === 0 ? (
                <EmptyState
                    activeView={activeView}
                    canUseWorkspace={Boolean(flowId)}
                    onAddRoot={addRootNode}
                    onAddSource={openSourcePicker}
                    onOpenBrief={openBrief}
                    onAskAi={openWorkspaceAskAi}
                />
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
                                    <td>{sourceLabel(row)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {taskRows.length === 0 ? (
                        <p className="local-table-empty">No task-capable nodes in this branch.</p>
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
                            <strong>Branch-to-task preview</strong>
                            <span>{previewRows.length} candidate nodes</span>
                        </div>
                        <button type="button" onClick={acceptTaskPreview}>
                            Accept selected
                        </button>
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
                                        <td>{sourceLabel(row)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
