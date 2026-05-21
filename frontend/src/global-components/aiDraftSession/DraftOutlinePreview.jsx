/* eslint-disable react/prop-types */
import DraftBadges from './DraftBadges';
import {
    asArray,
    collectVisibleDraftOutlineIds,
    draftNodeId,
    humanizeId
} from './draftPanelFormatters';

const DraftOutlinePreview = ({ preview }) => {
    if (!preview?.nodeCount) {
        return null;
    }
    const shownNodeIds = new Set();
    const visibleNodeIds = collectVisibleDraftOutlineIds(preview);
    const renderedRoots = preview.roots.map((root) => (
        <DraftOutlineNode
            key={`outline-root-${draftNodeId(root)}`}
            node={root}
            preview={preview}
            depth={0}
            shownNodeIds={shownNodeIds}
        />
    ));
    const hiddenNodeCount = Math.max(preview.nodeCount - visibleNodeIds.size, 0);
    return (
        <section className="ai-draft-outline-preview" aria-label="Draft tree preview">
            <div className="ai-draft-outline-header">
                <span>Draft outline</span>
                <strong>{preview.title}</strong>
                <p>
                    {preview.nodeCount} {preview.nodeCount === 1 ? 'node' : 'nodes'} · {preview.edgeCount}{' '}
                    {preview.edgeCount === 1 ? 'edge' : 'edges'} · {preview.needsReviewCount}{' '}
                    unsourced/needs-review
                </p>
            </div>
            <ol className="ai-draft-outline-tree">
                {renderedRoots}
                {hiddenNodeCount ? (
                    <li className="ai-draft-outline-more">
                        {hiddenNodeCount} more {hiddenNodeCount === 1 ? 'node' : 'nodes'} in item review
                    </li>
                ) : null}
            </ol>
        </section>
    );
};

const DraftOutlineNode = ({ node, preview, depth, shownNodeIds }) => {
    const nodeId = draftNodeId(node);
    if (!nodeId || shownNodeIds.has(nodeId)) {
        return null;
    }
    shownNodeIds.add(nodeId);
    const children = asArray(preview.childrenByParent.get(nodeId));
    const visibleChildren = depth < 1 ? children.slice(0, 6) : [];
    const hiddenChildren = Math.max(children.length - visibleChildren.length, 0);
    const relationLabel = humanizeId(node.relationship_type || node.metadata?.relationship_type || '');
    return (
        <li className={`ai-draft-outline-node depth-${Math.min(depth, 2)}`}>
            <div>
                <span>{depth === 0 ? 'Root' : relationLabel || `Level ${depth + 1}`}</span>
                <strong>{node.title || node.label || 'Untitled draft node'}</strong>
                {node.summary || node.body ? <p>{node.summary || node.body}</p> : null}
                <DraftBadges
                    item={{
                        ...node,
                        id: nodeId,
                        item_type: node.node_type || node.type || 'node'
                    }}
                    compact
                />
            </div>
            {visibleChildren.length || hiddenChildren ? (
                <ol>
                    {visibleChildren.map(({ edge, node: child }) => (
                        <DraftOutlineNode
                            key={`outline-${nodeId}-${draftNodeId(child)}`}
                            node={{
                                ...child,
                                relationship_type: edge.relationship_type
                            }}
                            preview={preview}
                            depth={depth + 1}
                            shownNodeIds={shownNodeIds}
                        />
                    ))}
                    {hiddenChildren ? (
                        <li className="ai-draft-outline-more">
                            {hiddenChildren} more below {node.title || nodeId}
                        </li>
                    ) : null}
                </ol>
            ) : null}
        </li>
    );
};

export default DraftOutlinePreview;
