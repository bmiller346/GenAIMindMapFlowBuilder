import ShellRightPanel from './ShellRightPanel.jsx';

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
    onClearBranch,
    onClose,
    onFocusNode
}) => {
    const branchNode = nodes.find((node) => node.id === branchId);
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

    return (
        <ShellRightPanel title="Branch properties">
            <section className="branch-properties-panel" aria-label="Branch properties">
                <div className="branch-properties-panel__header">
                    <span>Branch lens</span>
                    <h2>{nodeTitle(branchNode)}</h2>
                    <p>{branchId}</p>
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
