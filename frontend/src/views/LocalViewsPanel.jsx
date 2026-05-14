/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
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
    { id: 'sources', label: 'Sources' }
];

const HANDOFF_VIEWS = [
    { id: 'mondayInput', label: 'monday input' },
    { id: 'mondayStatus', label: 'monday status' }
];

const sourceLabel = (node) => {
    const ref = node.source_ref || {};
    const parts = [ref.document_id, ref.page ? `p. ${ref.page}` : '', ref.section]
        .filter(Boolean)
        .join(' | ');

    return parts || 'No source';
};

const OutlineNode = ({ node, childrenByParent, nodeLookup, depth, onSelectBranch }) => {
    const children = (childrenByParent.get(node.id) || [])
        .map((childId) => nodeLookup.get(childId))
        .filter(Boolean);

    return (
        <li>
            <div className="local-outline-row" style={{ paddingLeft: depth * 14 }}>
                <button type="button" onClick={() => onSelectBranch(node.id)}>
                    Select branch
                </button>
                <span>{node.title}</span>
                <small>{node.node_type}</small>
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
                        />
                    ))}
                </ol>
            ) : null}
        </li>
    );
};

const EmptyState = ({ activeView }) => (
    <div className="local-view-empty">
        <strong>No graph nodes yet</strong>
        <span>
            {activeView === 'mindmap'
                ? 'Add or open a workspace.'
                : 'This view will populate from the current graph.'}
        </span>
    </div>
);

const LocalViewsPanel = ({ hidden }) => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        setNodes: state.setNodes,
        activeView: state.activeView,
        setActiveView: state.setActiveView,
        selectedBranchId: state.selectedBranchId,
        setSelectedBranchId: state.setSelectedBranchId
    });
    const {
        nodes,
        edges,
        setNodes,
        activeView,
        setActiveView,
        selectedBranchId,
        setSelectedBranchId
    } = useStore(useShallow(selector));
    const [acceptedPreviewIds, setAcceptedPreviewIds] = useState(new Set());

    const projection = useMemo(
        () => buildGraphProjection(nodes, edges, selectedBranchId),
        [nodes, edges, selectedBranchId]
    );
    const taskRows = useMemo(() => getTaskRows(projection), [projection]);
    const previewRows = useMemo(() => getTaskPreviewRows(projection), [projection]);
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
    const activeHandoffView = HANDOFF_VIEWS.some((view) => view.id === activeView)
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
                const data = withLocalPreviewAcceptance(node.data, {
                    flow: 'branch_to_task',
                    accepted_at: acceptedAt,
                    node_id: node.id,
                    preview_type: row?.preview_type || 'task',
                    preview_status: row?.preview_status || 'needs_review'
                });

                return {
                    ...node,
                    data: {
                        ...data,
                        node_type: node.data?.node_type || 'task',
                        task_projection: {
                            accepted: true,
                            accepted_at: acceptedAt,
                            preview_type: row?.preview_type || 'task',
                            preview_status: row?.preview_status || 'needs_review'
                        }
                    }
                };
            })
        );
        setAcceptedPreviewIds(new Set());
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
                    <select
                        className={activeHandoffView ? 'active' : ''}
                        value={activeHandoffView}
                        onChange={(event) => {
                            if (event.target.value) {
                                setActiveView(event.target.value);
                            }
                        }}
                        aria-label="Handoff views"
                    >
                        <option value="">Handoff</option>
                        {HANDOFF_VIEWS.map((view) => (
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

            {nodes.length === 0 ? <EmptyState activeView={activeView} /> : null}

            {activeView === 'outline' && nodes.length > 0 ? (
                <ol className="local-outline">
                    {projection.roots.map((root) => (
                        <OutlineNode
                            key={root.id}
                            node={root}
                            childrenByParent={projection.childrenByParent}
                            nodeLookup={projection.nodeLookup}
                            depth={0}
                            onSelectBranch={setSelectedBranchId}
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
                                <th>Status</th>
                                <th>Priority</th>
                                <th>Owner</th>
                                <th>Due</th>
                                <th>Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {taskRows.map((row) => (
                                <tr key={row.id}>
                                    <td>{row.title}</td>
                                    <td>{row.status}</td>
                                    <td>{row.priority || '-'}</td>
                                    <td>{row.owner_id || '-'}</td>
                                    <td>{row.due_date || '-'}</td>
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
                                <th>Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projection.nodes.map((row) => (
                                <tr key={row.id}>
                                    <td>{row.title}</td>
                                    <td>{row.node_type}</td>
                                    <td>{row.status}</td>
                                    <td>{row.confidence || '-'}</td>
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
                    </div>
                    <div className="local-table-wrap">
                        <table className="local-projection-table">
                            <thead>
                                <tr>
                                    <th>Use</th>
                                    <th>Task</th>
                                    <th>Current type</th>
                                    <th>Preview status</th>
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
                />
            ) : null}

            {activeView === 'gaps' && nodes.length > 0 ? (
                <MissingInfoPreview
                    nodes={nodes}
                    projection={projection}
                    setNodes={setNodes}
                    setActiveView={setActiveView}
                />
            ) : null}

            {activeView === 'sme' && nodes.length > 0 ? (
                <SmeQuestionsPreview
                    nodes={nodes}
                    projection={projection}
                    setNodes={setNodes}
                    setActiveView={setActiveView}
                />
            ) : null}

            {activeView === 'sources' && nodes.length > 0 ? (
                <SourceRepairPreview
                    nodes={nodes}
                    projection={projection}
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
                />
            ) : null}

            {activeView === 'mondayStatus' && nodes.length > 0 ? (
                <MondayStatusBackPreview
                    nodes={nodes}
                    projection={projection}
                    setNodes={setNodes}
                    setActiveView={setActiveView}
                />
            ) : null}
        </section>
    );
};

export default LocalViewsPanel;
