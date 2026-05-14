import { Handle, useReactFlow } from '@xyflow/react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { FiChevronRight, FiCopy, FiFileText, FiMoreHorizontal, FiPlus, FiTrash2 } from 'react-icons/fi';
import SQLSvg from '../assets/sql.svg';
import STARSvg from '../assets/star.svg';
import NodeMetadataBadges from './NodeMetadataBadges';
import ManualTableEditor from '../global-components/ManualTableEditor';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import {
    createWorkspaceEdge,
    createWorkspaceNode,
    getChildPosition,
    getSiblingPosition
} from '../utils/manualNodes';

const Graph = lazy(() => import('../global-components/Graph'));
const TableComponent = lazy(() => import('../global-components/TableComponent'));

const ResponseNode = ({ id, data }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSlashOpen, setIsSlashOpen] = useState(false);
    const [isTableExpanded, setIsTableExpanded] = useState(false);
    const nodes = useStore((state) => state.nodes);
    const edges = useStore((state) => state.edges);
    const setNodes = useStore((state) => state.setNodes);
    const setEdges = useStore((state) => state.setEdges);
    const setInspectorNodeId = useStore((state) => state.setInspectorNodeId);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const { deleteElements } = useReactFlow();
    const responseData = data.data || {};
    const displayTitle = data.title || responseData.title || '';
    const summary = responseData.summ || data.summary || '';
    const query = responseData.query || '';
    const df = Array.isArray(responseData.df) ? responseData.df : [];
    const graph = responseData.graph || {};
    const isManualTable = data.manual && df.length > 0;
    const tableColumns = useMemo(
        () =>
            Array.from(
                df.reduce((columns, row) => {
                    Object.keys(row || {}).forEach((key) => columns.add(key));
                    return columns;
                }, new Set())
            ),
        [df]
    );

    const updateNodeData = (updater) => {
        setNodes(
            nodes.map((node) =>
                node.id === id
                    ? {
                          ...node,
                          data: updater(node.data || {})
                      }
                    : node
            )
        );
        setSaveStatus('dirty');
    };

    const updateTitle = (value) => {
        if (value.includes('/')) {
            setIsSlashOpen(true);
        }
        updateNodeData((nodeData) => ({
            ...nodeData,
            title: value,
            data: {
                ...(nodeData.data || {}),
                summ: nodeData.manual ? value.replace('/', '') : nodeData.data?.summ
            }
        }));
    };

    const addChild = ({
        title = 'New task',
        nodeType = 'task',
        df: childRows = []
    } = {}) => {
        const childNode = createWorkspaceNode({
            title,
            nodeType,
            position: getChildPosition(nodes, edges, id),
            df: childRows
        });
        setNodes([...nodes, childNode]);
        setEdges([...edges, createWorkspaceEdge(id, childNode.id)]);
        recordActivity({
            type: childRows.length ? 'manual_table_created' : 'manual_node_created',
            title: childRows.length ? 'Manual table added' : 'Manual child added',
            summary: `Added ${title} under ${displayTitle || summary || id}.`,
            node_ids: [id, childNode.id],
            metadata: {
                parent_id: id,
                node_type: nodeType
            }
        });
        setSaveStatus('dirty');
        setIsMenuOpen(false);
        setIsSlashOpen(false);
    };

    const addSibling = (direction = 'below') => {
        const siblingNode = createWorkspaceNode({
            title: 'New task',
            nodeType: 'task',
            position: getSiblingPosition(nodes, id, direction)
        });
        const parentEdge = edges.find((edge) => edge.target === id);
        setNodes([...nodes, siblingNode]);
        setEdges(
            parentEdge
                ? [...edges, createWorkspaceEdge(parentEdge.source, siblingNode.id)]
                : edges
        );
        recordActivity({
            type: 'manual_node_created',
            title: 'Manual sibling added',
            summary: `Added a task ${direction} ${displayTitle || summary || id}.`,
            node_ids: [id, siblingNode.id],
            metadata: {
                direction,
                parent_id: parentEdge?.source || ''
            }
        });
        setSaveStatus('dirty');
        setIsMenuOpen(false);
    };

    const duplicateNode = () => {
        const currentNode = nodes.find((node) => node.id === id);
        if (!currentNode) {
            return;
        }
        const duplicate = {
            ...createWorkspaceNode({
                title: `${displayTitle || summary || 'Node'} copy`,
                nodeType: data.node_type || 'concept',
                position: getSiblingPosition(nodes, id, 'below')
            }),
            data: {
                ...JSON.parse(JSON.stringify(currentNode.data || {})),
                title: `${displayTitle || summary || 'Node'} copy`
            }
        };
        const parentEdge = edges.find((edge) => edge.target === id);
        setNodes([...nodes, duplicate]);
        setEdges(
            parentEdge
                ? [...edges, createWorkspaceEdge(parentEdge.source, duplicate.id)]
                : edges
        );
        recordActivity({
            type: 'manual_node_created',
            title: 'Node duplicated',
            summary: `Duplicated ${displayTitle || summary || id}.`,
            node_ids: [id, duplicate.id]
        });
        setSaveStatus('dirty');
        setIsMenuOpen(false);
    };

    const sortChildren = () => {
        const childIds = edges
            .filter((edge) => edge.source === id)
            .map((edge) => edge.target);
        const children = nodes
            .filter((node) => childIds.includes(node.id))
            .sort((a, b) =>
                (a.data?.title || a.data?.data?.summ || '').localeCompare(
                    b.data?.title || b.data?.data?.summ || ''
                )
            );
        const parentNode = nodes.find((node) => node.id === id);
        setNodes(
            nodes.map((node) => {
                const sortedIndex = children.findIndex((child) => child.id === node.id);
                if (sortedIndex === -1) {
                    return node;
                }
                return {
                    ...node,
                    position: {
                        x: (parentNode?.position?.x || 0) + 430,
                        y: (parentNode?.position?.y || 0) + sortedIndex * 96
                    }
                };
            })
        );
        recordActivity({
            type: 'manual_nodes_reordered',
            title: 'Sorted child nodes',
            summary: `Sorted children under ${displayTitle || summary || id}.`,
            node_ids: [id, ...childIds]
        });
        setSaveStatus('dirty');
        setIsMenuOpen(false);
    };

    const markReviewed = () => {
        updateNodeData((nodeData) => ({
            ...nodeData,
            status: 'reviewed'
        }));
        recordActivity({
            type: 'node_metadata_applied',
            title: 'Marked node reviewed',
            summary: `${displayTitle || summary || id} was marked reviewed.`,
            node_ids: [id],
            metadata: {
                status: 'reviewed'
            }
        });
        setIsMenuOpen(false);
    };

    const openDetails = () => {
        setInspectorNodeId(id);
        setIsMenuOpen(false);
    };

    const deleteNode = () => {
        deleteElements({ nodes: [{ id }] });
        recordActivity({
            type: 'manual_node_deleted',
            title: 'Deleted node',
            summary: `Deleted ${displayTitle || summary || id}.`,
            node_ids: [id]
        });
        setSaveStatus('dirty');
        setIsMenuOpen(false);
    };

    const slashCommands = [
        {
            id: 'task',
            label: 'Add task',
            description: 'Create a child task',
            action: () => addChild({ title: 'New task', nodeType: 'task' })
        },
        {
            id: 'table',
            label: 'Add table',
            description: 'Create a child table',
            action: () =>
                addChild({
                    title: 'Manual table',
                    nodeType: 'reference',
                    df: [{ Column: 'Value' }]
                })
        },
        {
            id: 'question',
            label: 'Generate questions',
            description: 'Add a review prompt node',
            action: () =>
                addChild({
                    title: 'Questions to answer',
                    nodeType: 'question'
                })
        },
        {
            id: 'note',
            label: 'Add note',
            description: 'Create a child note',
            action: () => addChild({ title: 'New note', nodeType: 'reference' })
        }
    ];

    const summaryBlock = () => {
        return (
            <div className="summary-block">
                <img
                    src={STARSvg}
                    alt="prompt svg"
                />
                <div>
                    <h3 id="reponse-title">Summary</h3>
                    <div>{summary}</div>
                </div>
            </div>
        );
    };

    if (summary.length > 0) {
        console.log(summary);
    }

    return (
        <div className="node-response">
            <button
                type="button"
                className="node-quick-add"
                onClick={() => addChild()}
                title="Add child node"
            >
                <FiPlus />
            </button>
            <div className="node-receiver-dot" aria-hidden="true" />
            <div className="node-response-main">
                <div className="node-response-row">
                    <input
                        className="node-title-input nodrag"
                        value={displayTitle || summary || ''}
                        placeholder="Untitled node"
                        onChange={(event) => updateTitle(event.target.value)}
                        onFocus={(event) =>
                            setIsSlashOpen(event.target.value.includes('/'))
                        }
                    />
                    <button
                        type="button"
                        className="node-menu-trigger nodrag"
                        onClick={() => setIsMenuOpen((current) => !current)}
                        title="Node actions"
                    >
                        <FiMoreHorizontal />
                    </button>
                </div>
                {isSlashOpen ? (
                    <div className="node-slash-menu nodrag">
                        <p>Blocks</p>
                        {slashCommands.map((command) => (
                            <button
                                key={command.id}
                                type="button"
                                onClick={command.action}
                            >
                                <FiChevronRight />
                                <span>
                                    <strong>{command.label}</strong>
                                    <small>{command.description}</small>
                                </span>
                            </button>
                        ))}
                    </div>
                ) : null}
                {isMenuOpen ? (
                    <div className="node-action-menu nodrag">
                        <button type="button" onClick={() => addSibling('above')}>
                            <FiPlus />
                            Add task above
                        </button>
                        <button type="button" onClick={() => addSibling('below')}>
                            <FiPlus />
                            Add task below
                        </button>
                        <button type="button" onClick={() => addChild()}>
                            <FiFileText />
                            Add child
                        </button>
                        <button type="button" onClick={duplicateNode}>
                            <FiCopy />
                            Duplicate
                        </button>
                        <button type="button" onClick={sortChildren}>
                            Sort children
                        </button>
                        <button type="button" onClick={openDetails}>
                            Node settings
                        </button>
                        <button type="button" onClick={markReviewed}>
                            Check reviewed
                        </button>
                        <button
                            type="button"
                            className="node-action-danger"
                            onClick={deleteNode}
                        >
                            <FiTrash2 />
                            Delete
                        </button>
                    </div>
                ) : null}
            </div>
            <NodeMetadataBadges data={data} />
            {!data.manual && summary.length > 0 && summaryBlock()}
            {query.length > 0 && (
                <div className="query-block">
                    <img
                        src={SQLSvg}
                        alt="Sql svg"
                    />
                    <div>
                        <h3 id="response-title">SQL QUERY</h3>
                        <div className="code-block">
                            <pre>
                                <code>{query}</code>
                            </pre>
                        </div>
                    </div>
                </div>
            )}
            {isManualTable ? (
                isTableExpanded ? (
                    <ManualTableEditor nodeId={id} rows={df} />
                ) : (
                    <div className="manual-table-preview">
                        <span>{df.length} rows</span>
                        <strong>{tableColumns.join(', ') || 'Empty table'}</strong>
                        <button type="button" onClick={() => setIsTableExpanded(true)}>
                            Edit table
                        </button>
                    </div>
                )
            ) : null}
            {!isManualTable && df.length > 0 && (
                <Suspense fallback={<div className="lazy-block">Loading table...</div>}>
                    <TableComponent df={df} />
                </Suspense>
            )}
            {Object.keys(graph).length !== 0 && (
                <Suspense fallback={<div className="lazy-block">Loading chart...</div>}>
                    <Graph data={graph} />
                </Suspense>
            )}

            <Handle
                type="target"
                position="left"
                className="node-flow-handle node-flow-handle-target"
            />
            <Handle
                type="source"
                position="right"
                className="node-flow-handle node-flow-handle-source"
            />
        </div>
    );
};

export default ResponseNode;
