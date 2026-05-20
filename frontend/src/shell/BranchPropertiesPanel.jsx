import { useEffect, useState } from 'react';
import ShellRightPanel from './ShellRightPanel.jsx';

const BRANCH_STATUS_OPTIONS = [
    'ai_generated',
    'needs_review',
    'reviewed',
    'approved',
    'in_progress',
    'blocked',
    'done'
];

const nodeTitle = (node, fallback = 'Selected branch') =>
    node?.data?.title || node?.data?.content || node?.data?.summ || fallback;

const hasSourceReference = (node) =>
    Boolean(
        node?.data?.sourceId ||
            node?.data?.source_id ||
            node?.data?.sourceName ||
            node?.data?.source_name ||
            node?.data?.source_refs?.length ||
            node?.data?.sourceRefs?.length
    );

const collectBranchNodeIds = (branchId, nodes = [], edges = []) => {
    if (!branchId) {
        return new Set();
    }

    const nodeIds = new Set(nodes.map((node) => node.id));
    if (!nodeIds.has(branchId)) {
        return new Set();
    }

    const adjacency = new Map();
    edges.forEach((edge) => {
        if (!edge?.source || !edge?.target) {
            return;
        }
        const children = adjacency.get(edge.source) || [];
        children.push(edge.target);
        adjacency.set(edge.source, children);
    });

    const visibleIds = new Set([branchId]);
    const queue = [branchId];
    while (queue.length) {
        const currentId = queue.shift();
        (adjacency.get(currentId) || []).forEach((childId) => {
            if (!visibleIds.has(childId) && nodeIds.has(childId)) {
                visibleIds.add(childId);
                queue.push(childId);
            }
        });
    }
    return visibleIds;
};

const BranchPropertiesPanel = ({
    branchId,
    edges = [],
    nodes = [],
    onApplyBranch,
    onClearBranch,
    onClose,
    onFocusNode
}) => {
    const branchNode = nodes.find((node) => node.id === branchId);
    const branchData = branchNode?.data || {};
    const [draft, setDraft] = useState({
        title: '',
        node_type: '',
        status: '',
        owner_id: '',
        due_date: '',
        summary: ''
    });
    const branchNodeIds = collectBranchNodeIds(branchId, nodes, edges);
    const branchNodes = nodes.filter((node) => branchNodeIds.has(node.id));
    const branchEdges = edges.filter(
        (edge) => branchNodeIds.has(edge.source) && branchNodeIds.has(edge.target)
    );
    const directChildCount = edges.filter((edge) => edge.source === branchId).length;
    const sourceBackedCount = branchNodes.filter(hasSourceReference).length;
    const needsReviewCount = branchNodes.filter((node) =>
        Boolean(node?.data?.needs_review || node?.data?.needsReview)
    ).length;
    const updateDraft = (field, value) => {
        setDraft((current) => ({
            ...current,
            [field]: value
        }));
    };

    useEffect(() => {
        setDraft({
            title: branchData.title || branchData.content || branchData.summ || '',
            node_type: branchData.node_type || branchData.component_type || 'concept',
            status: branchData.status || 'reviewed',
            owner_id: branchData.owner_id || '',
            due_date: branchData.due_date || '',
            summary: branchData.summary || branchData.description || ''
        });
    }, [
        branchData.component_type,
        branchData.content,
        branchData.description,
        branchData.due_date,
        branchData.node_type,
        branchData.owner_id,
        branchData.status,
        branchData.summ,
        branchData.summary,
        branchData.title,
        branchId
    ]);

    const applyBranch = () => {
        onApplyBranch?.(branchId, draft);
    };

    return (
        <ShellRightPanel title="Branch properties">
            <section className="branch-properties-panel" aria-label="Branch properties">
                <div className="branch-properties-panel__header">
                    <span>Branch lens</span>
                    <h2>{nodeTitle(branchNode)}</h2>
                    <p>{branchId}</p>
                </div>

                <div className="branch-properties-panel__form">
                    <label>
                        <span>Title</span>
                        <input
                            value={draft.title}
                            onChange={(event) => updateDraft('title', event.target.value)}
                            aria-label="Branch title"
                        />
                    </label>
                    <label>
                        <span>Type</span>
                        <input
                            value={draft.node_type}
                            onChange={(event) => updateDraft('node_type', event.target.value)}
                            aria-label="Branch type"
                        />
                    </label>
                    <label>
                        <span>Status</span>
                        <select
                            value={draft.status}
                            onChange={(event) => updateDraft('status', event.target.value)}
                            aria-label="Branch status"
                        >
                            {BRANCH_STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>
                                    {status}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span>Owner</span>
                        <input
                            value={draft.owner_id}
                            onChange={(event) => updateDraft('owner_id', event.target.value)}
                            aria-label="Branch owner"
                        />
                    </label>
                    <label>
                        <span>Due</span>
                        <input
                            value={draft.due_date}
                            onChange={(event) => updateDraft('due_date', event.target.value)}
                            aria-label="Branch due date"
                        />
                    </label>
                    <label className="branch-properties-panel__wide-field">
                        <span>Summary</span>
                        <textarea
                            value={draft.summary}
                            onChange={(event) => updateDraft('summary', event.target.value)}
                            aria-label="Branch summary"
                            rows={3}
                        />
                    </label>
                </div>

                <dl className="branch-properties-panel__stats">
                    <div>
                        <dt>Nodes</dt>
                        <dd>{branchNodes.length}</dd>
                    </div>
                    <div>
                        <dt>Relationships</dt>
                        <dd>{branchEdges.length}</dd>
                    </div>
                    <div>
                        <dt>Direct children</dt>
                        <dd>{directChildCount}</dd>
                    </div>
                    <div>
                        <dt>Source backed</dt>
                        <dd>{sourceBackedCount}</dd>
                    </div>
                    <div>
                        <dt>Needs review</dt>
                        <dd>{needsReviewCount}</dd>
                    </div>
                </dl>

                <div className="branch-properties-panel__actions">
                    <button
                        type="button"
                        onClick={() => onFocusNode?.(branchId)}
                        disabled={!branchNode}
                    >
                        Focus root
                    </button>
                    <button type="button" onClick={applyBranch} disabled={!branchNode}>
                        Apply branch
                    </button>
                    <button type="button" onClick={onClearBranch}>
                        Clear lens
                    </button>
                    <button type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
            </section>
        </ShellRightPanel>
    );
};

export default BranchPropertiesPanel;
