import { useCallback, useMemo } from 'react';
import { FiChevronLeft, FiChevronRight, FiMaximize2 } from 'react-icons/fi';
import ActivityPanel from '../global-components/ActivityPanel.jsx';
import { OutlineNode } from '../views/localViews/ReviewExplanationContent.jsx';

const HIERARCHY_EDGE_TYPES = new Set([
    '',
    'contains',
    'parent_child',
    'parent-child',
    'child',
    'section',
    'subtopic',
    'branch',
    'step'
]);

const nodeTitle = (node = {}) =>
    node.data?.title || node.data?.data?.summ || node.data?.question || node.id || 'Untitled node';

const relationshipType = (edge = {}) =>
    String(
        edge.relationship_type ||
            edge.data?.relationship_type ||
            edge.data?.relationshipType ||
            edge.metadata?.relationship_type ||
            edge.type ||
            ''
    )
        .trim()
        .toLowerCase();

const buildOutlineProjection = (nodes = [], edges = []) => {
    const nodeLookup = new Map(
        nodes.map((node) => [
            node.id,
            {
                ...node,
                title: nodeTitle(node),
                node_type: node.data?.node_type || node.data?.type || node.type || 'node'
            }
        ])
    );
    const childrenByParent = new Map();
    const childIds = new Set();

    edges.forEach((edge) => {
        if (
            !nodeLookup.has(edge.source) ||
            !nodeLookup.has(edge.target) ||
            !HIERARCHY_EDGE_TYPES.has(relationshipType(edge))
        ) {
            return;
        }
        const children = childrenByParent.get(edge.source) || [];
        children.push(edge.target);
        childrenByParent.set(edge.source, children);
        childIds.add(edge.target);
    });

    const sortedNodes = [...nodeLookup.values()].sort((left, right) =>
        Number(left.position?.x || 0) - Number(right.position?.x || 0) ||
        Number(left.position?.y || 0) - Number(right.position?.y || 0) ||
        left.title.localeCompare(right.title)
    );

    const roots = sortedNodes
        .filter((node) => !childIds.has(node.id))
        .slice();

    return {
        childrenByParent,
        nodeLookup,
        roots: roots.length || !sortedNodes.length ? roots : sortedNodes
    };
};

const ShellOutlineNavigator = ({ nodes, edges, onOpenNode, onSelectBranch }) => {
    const projection = useMemo(() => buildOutlineProjection(nodes, edges), [edges, nodes]);

    return (
        <section className="shell-left-outline" aria-label="Workspace outline">
            <div className="shell-left-outline__header">
                <strong>Outline</strong>
                <span>{nodes.length}</span>
            </div>
            {projection.roots.length ? (
                <ol className="local-outline shell-left-outline__tree">
                    {projection.roots.map((node) => (
                        <OutlineNode
                            key={node.id}
                            node={node}
                            childrenByParent={projection.childrenByParent}
                            nodeLookup={projection.nodeLookup}
                            depth={0}
                            onSelectBranch={onSelectBranch}
                            onOpenNode={onOpenNode}
                        />
                    ))}
                </ol>
            ) : (
                <p className="shell-left-outline__empty">
                    Add workspace nodes before the outline is available.
                </p>
            )}
        </section>
    );
};

const ShellLeftNavigatorHost = ({
    activeKind,
    collapsed = false,
    nodes = [],
    edges = [],
    onCollapsedChange,
    onOpenActivity,
    onOpenNode,
    onOpenOutline,
    onOpenSources,
    onOpenWorkspace,
    onSelectBranch,
    onWidthChange,
    sourceNavigator,
    width = 17.65,
    workspaceNavigator
}) => {
    const isOutline = activeKind === 'outline';
    const isActivity = activeKind === 'activity';
    const isSources = activeKind === 'sources';
    const isWorkspace = !isOutline && !isActivity && !isSources;

    const startResize = useCallback(
        (event) => {
            if (event.button !== 0 || isWorkspace) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const startX = event.clientX;
            const startWidth = Number.isFinite(Number(width)) ? Number(width) : 17.65;

            const handlePointerMove = (moveEvent) => {
                const widthDelta = (moveEvent.clientX - startX) / 16;
                const nextWidth = Math.max(15.5, Math.min(startWidth + widthDelta, 27));
                onWidthChange?.(nextWidth);
            };

            const stopResize = () => {
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', stopResize);
                window.removeEventListener('pointercancel', stopResize);
            };

            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', stopResize);
            window.addEventListener('pointercancel', stopResize);
        },
        [isWorkspace, onWidthChange, width]
    );

    return (
        <section
            className={[
                'shell-left-navigator',
                collapsed ? 'shell-left-navigator--collapsed' : ''
            ]
                .filter(Boolean)
                .join(' ')}
            aria-label="Workspace navigator"
        >
            <div className="shell-left-navigator__modebar" aria-label="Navigator modes">
                <button
                    type="button"
                    className={isWorkspace ? 'active' : ''}
                    onClick={onOpenWorkspace}
                >
                    Workspace
                </button>
                <button
                    type="button"
                    className={isOutline ? 'active' : ''}
                    onClick={onOpenOutline}
                >
                    Outline
                </button>
                <button
                    type="button"
                    className={isSources ? 'active' : ''}
                    onClick={onOpenSources}
                >
                    Sources
                </button>
                <button
                    type="button"
                    className={isActivity ? 'active' : ''}
                    onClick={onOpenActivity}
                >
                    Activity
                </button>
                {!isWorkspace ? (
                    <button
                        type="button"
                        className="shell-left-navigator__icon-button"
                        title={collapsed ? 'Expand navigator' : 'Collapse navigator'}
                        aria-label={collapsed ? 'Expand navigator' : 'Collapse navigator'}
                        onClick={() => onCollapsedChange?.(!collapsed)}
                    >
                        {collapsed ? <FiChevronRight /> : <FiChevronLeft />}
                    </button>
                ) : null}
            </div>
            {isWorkspace || !collapsed ? (
                <div className="shell-left-navigator__body">
                    {isOutline ? (
                        <ShellOutlineNavigator
                            nodes={nodes}
                            edges={edges}
                            onOpenNode={onOpenNode}
                            onSelectBranch={onSelectBranch}
                        />
                    ) : isSources ? (
                        sourceNavigator
                    ) : isActivity ? (
                        <ActivityPanel embedded />
                    ) : (
                        workspaceNavigator
                    )}
                </div>
            ) : null}
            {!isWorkspace && !collapsed ? (
                <button
                    type="button"
                    className="shell-left-navigator__resize-handle"
                    title="Resize navigator"
                    aria-label="Resize navigator"
                    onPointerDown={startResize}
                >
                    <FiMaximize2 />
                </button>
            ) : null}
        </section>
    );
};

export default ShellLeftNavigatorHost;
