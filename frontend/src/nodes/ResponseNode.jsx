import { Handle } from '@xyflow/react';
import { lazy, Suspense, useMemo, useState } from 'react';
import {
    FiCalendar,
    FiCheckSquare,
    FiChevronRight,
    FiCopy,
    FiFileText,
    FiGitBranch,
    FiMessageSquare,
    FiMoreHorizontal,
    FiPlus,
    FiScissors,
    FiTrash2,
    FiUser
} from 'react-icons/fi';
import SQLSvg from '../assets/sql.svg';
import STARSvg from '../assets/star.svg';
import NodeMetadataBadges from './NodeMetadataBadges';
import ManualTableEditor from '../global-components/ManualTableEditor';
import PromptModal from '../modals/PromptModal';
import useStore from '../stores/store';
import modalStore from '../stores/modalStore';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import {
    createWorkspaceEdge,
    createWorkspaceNode,
    getChildPosition,
    getSiblingPosition,
    getWorkspaceNodeData,
    updateWorkspaceNode,
    layoutDirectChildren
} from '../utils/manualNodes';

const Graph = lazy(() => import('../global-components/Graph'));
const TableComponent = lazy(() => import('../global-components/TableComponent'));

const ResponseNode = ({ id, data }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSlashOpen, setIsSlashOpen] = useState(false);
    const [slashQuery, setSlashQuery] = useState('');
    const [activeSlashIndex, setActiveSlashIndex] = useState(0);
    const [isTableExpanded, setIsTableExpanded] = useState(false);
    const [areDetailsExpanded, setAreDetailsExpanded] = useState(false);
    const nodes = useStore((state) => state.nodes);
    const edges = useStore((state) => state.edges);
    const setNodes = useStore((state) => state.setNodes);
    const setEdges = useStore((state) => state.setEdges);
    const setInspectorNodeId = useStore((state) => state.setInspectorNodeId);
    const setActiveView = useStore((state) => state.setActiveView);
    const setSelectedBranchId = useStore((state) => state.setSelectedBranchId);
    const pushModal = modalStore((state) => state.pushNode);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const workspaceData = useMemo(
        () => getWorkspaceNodeData({ id, type: 'response', data }),
        [data, id]
    );
    const responseData = data.data || {};
    const displayTitle = workspaceData.title || '';
    const summary = workspaceData.body || '';
    const query = workspaceData.query || '';
    const df = Array.isArray(workspaceData.df) ? workspaceData.df : [];
    const graph = workspaceData.graph || {};
    const isManualTable = data.manual && df.length > 0;
    const titleValue = displayTitle || summary || '';
    const nodeStatus = workspaceData.status || 'ai_generated';
    const dueDate = workspaceData.dueDate || '';
    const assignee = workspaceData.ownerId || '';
    const directChildIds = useMemo(
        () => edges.filter((edge) => edge.source === id).map((edge) => edge.target),
        [edges, id]
    );
    const isBranchCollapsed = Boolean(data.display?.collapsed);
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
    const getNodeLabel = (node) => getWorkspaceNodeData(node).title || node?.id || '';

    const updateNodeData = (updater) => {
        setNodes(
            nodes.map((node) => {
                if (node.id !== id) {
                    return node;
                }

                const nextData = updater(node.data || {});
                return updateWorkspaceNode(
                    {
                        ...node,
                        data: nextData
                    },
                    { data: nextData }
                );
            })
        );
        setSaveStatus('dirty');
    };

    const getDescendantIds = (parentId) => {
        const descendantIds = new Set();
        const collectDescendants = (currentParentId) => {
            edges
                .filter((edge) => edge.source === currentParentId)
                .forEach((edge) => {
                    if (!descendantIds.has(edge.target)) {
                        descendantIds.add(edge.target);
                        collectDescendants(edge.target);
                    }
                });
        };

        collectDescendants(parentId);
        return descendantIds;
    };

    const getDescendantEdgeIds = (descendantIds) =>
        new Set(
            edges
                .filter(
                    (edge) =>
                        edge.source === id ||
                        descendantIds.has(edge.source) ||
                        descendantIds.has(edge.target)
                )
                .map((edge) => edge.id)
        );

    const getSlashQuery = (value) => {
        const slashIndex = value.lastIndexOf('/');
        if (slashIndex === -1) {
            return null;
        }

        return value.slice(slashIndex + 1).trimStart().toLowerCase();
    };

    const getTitleWithoutSlash = (value) => {
        const slashIndex = value.lastIndexOf('/');
        if (slashIndex === -1) {
            return value;
        }

        return value.slice(0, slashIndex).trimEnd();
    };

    const updateTitle = (value) => {
        const nextSlashQuery = getSlashQuery(value);
        setIsSlashOpen(nextSlashQuery !== null);
        setSlashQuery(nextSlashQuery || '');
        setActiveSlashIndex(0);
        updateNodeData((nodeData) => ({
            ...nodeData,
            title: value,
            data: {
                ...(nodeData.data || {}),
                summ: nodeData.manual ? value : nodeData.data?.summ
            }
        }));
    };

    const addChild = ({
        title = 'New task',
        nodeType = 'task',
        df: childRows = []
    } = {}, baseNodes = nodes) => {
        const childNode = createWorkspaceNode({
            title,
            nodeType,
            position: getChildPosition(baseNodes, edges, id),
            df: childRows
        });
        setNodes([...baseNodes, childNode]);
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
        setSlashQuery('');
        setActiveSlashIndex(0);
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
        setNodes(
            layoutDirectChildren({
                nodes,
                edges,
                parentId: id,
                childIds: children.map((child) => child.id),
                mode: data.display?.layoutMode
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

    const sortBranch = () => {
        const branchIds = getDescendantIds(id);
        let nextNodes = nodes;
        [id, ...branchIds].forEach((parentId) => {
            const sortedChildIds = edges
                .filter((edge) => edge.source === parentId && branchIds.has(edge.target))
                .map((edge) => edge.target)
                .sort((aId, bId) => {
                    const aNode = nextNodes.find((node) => node.id === aId);
                    const bNode = nextNodes.find((node) => node.id === bId);
                    return (aNode?.data?.title || aNode?.data?.data?.summ || '').localeCompare(
                        bNode?.data?.title || bNode?.data?.data?.summ || ''
                    );
                });

            if (sortedChildIds.length > 0) {
                nextNodes = layoutDirectChildren({
                    nodes: nextNodes,
                    edges,
                    parentId,
                    childIds: sortedChildIds,
                    mode: nextNodes.find((node) => node.id === parentId)?.data?.display?.layoutMode
                });
            }
        });

        setNodes(nextNodes);
        recordActivity({
            type: 'manual_nodes_reordered',
            title: 'Sorted branch',
            summary: `Sorted branch under ${displayTitle || summary || id}.`,
            node_ids: [id, ...branchIds]
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

    const updateQuickMetadata = (patch, activityTitle, activitySummary) => {
        updateNodeData((nodeData) => ({
            ...nodeData,
            ...patch,
            data: {
                ...(nodeData.data || {}),
                ...patch
            }
        }));
        recordActivity({
            type: 'node_metadata_applied',
            title: activityTitle,
            summary: activitySummary,
            node_ids: [id],
            metadata: patch
        });
        setIsMenuOpen(false);
    };

    const markBranchReviewed = () => {
        const branchIds = getDescendantIds(id);
        setNodes(
            nodes.map((node) =>
                node.id === id || branchIds.has(node.id)
                    ? {
                          ...node,
                          data: {
                              ...(node.data || {}),
                              status: 'reviewed',
                              data: {
                                  ...(node.data?.data || {}),
                                  status: 'reviewed'
                              }
                          }
                      }
                    : node
            )
        );
        recordActivity({
            type: 'node_metadata_applied',
            title: 'Marked branch reviewed',
            summary: `Marked ${branchIds.size + 1} node${branchIds.size === 0 ? '' : 's'} reviewed.`,
            node_ids: [id, ...branchIds],
            metadata: {
                status: 'reviewed'
            }
        });
        setSaveStatus('dirty');
        setIsMenuOpen(false);
    };

    const setStatus = (status) => {
        updateQuickMetadata(
            { status },
            'Changed node status',
            `${displayTitle || summary || id} status changed to ${status}.`
        );
    };

    const setDueDate = () => {
        const value = window.prompt('Due date', dueDate || '');
        if (value === null) {
            return;
        }

        updateQuickMetadata(
            { due_date: value.trim() },
            'Changed due date',
            `${displayTitle || summary || id} due date changed.`
        );
    };

    const setAssignee = () => {
        const value = window.prompt('Assignee', assignee || '');
        if (value === null) {
            return;
        }

        updateQuickMetadata(
            { owner_id: value.trim(), assignee: value.trim() },
            'Changed assignee',
            `${displayTitle || summary || id} assignee changed.`
        );
    };

    const toggleBranchFold = () => {
        const descendantIds = getDescendantIds(id);
        const descendantEdgeIds = getDescendantEdgeIds(descendantIds);
        const shouldCollapse = !isBranchCollapsed;

        setNodes(
            nodes.map((node) => {
                if (node.id === id) {
                    return {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            display: {
                                ...(node.data?.display || {}),
                                collapsed: shouldCollapse
                            }
                        }
                    };
                }

                if (descendantIds.has(node.id)) {
                    return {
                        ...node,
                        hidden: shouldCollapse
                    };
                }

                return node;
            })
        );
        setEdges(
            edges.map((edge) =>
                descendantEdgeIds.has(edge.id)
                    ? {
                          ...edge,
                          hidden: shouldCollapse
                      }
                    : edge
            )
        );
        recordActivity({
            type: 'manual_branch_display_changed',
            title: shouldCollapse ? 'Folded branch' : 'Expanded branch',
            summary: `${shouldCollapse ? 'Folded' : 'Expanded'} ${descendantIds.size} descendant node${descendantIds.size === 1 ? '' : 's'}.`,
            node_ids: [id, ...descendantIds],
            metadata: {
                collapsed: shouldCollapse
            }
        });
        setSaveStatus('dirty');
        setIsMenuOpen(false);
    };

    const moveToBranch = () => {
        const parentLabel = window.prompt('Move under node ID or exact title');
        const nextParent = nodes.find(
            (node) =>
                node.id === parentLabel ||
                getNodeLabel(node) === parentLabel
        );
        const descendantIds = getDescendantIds(id);
        if (!nextParent || nextParent.id === id || descendantIds.has(nextParent.id)) {
            window.alert('Pick an existing node outside this branch.');
            return;
        }

        const currentParentEdge = edges.find((edge) => edge.target === id);
        setEdges([
            ...edges.filter((edge) => edge.id !== currentParentEdge?.id),
            createWorkspaceEdge(nextParent.id, id)
        ]);
        setNodes(
            nodes.map((node) =>
                node.id === id
                    ? {
                          ...node,
                          position: getChildPosition(nodes, edges, nextParent.id)
                      }
                    : node
            )
        );
        recordActivity({
            type: 'manual_branch_moved',
            title: 'Moved branch',
            summary: `Moved ${displayTitle || summary || id} under ${getNodeLabel(nextParent) || nextParent.id}.`,
            node_ids: [id, nextParent.id],
            metadata: {
                parent_id: nextParent.id
            }
        });
        setSaveStatus('dirty');
        setIsMenuOpen(false);
    };

    const copyToBranch = () => {
        const parentLabel = window.prompt('Copy under node ID or exact title');
        const nextParent = nodes.find(
            (node) =>
                node.id === parentLabel ||
                getNodeLabel(node) === parentLabel
        );
        if (!nextParent || nextParent.id === id) {
            window.alert('Pick an existing destination node.');
            return;
        }

        const branchIds = [id, ...getDescendantIds(id)];
        const currentBranchNodes = nodes.filter((node) => branchIds.includes(node.id));
        const sourceRoot = nodes.find((node) => node.id === id);
        const rootCopyPosition = getChildPosition(nodes, edges, nextParent.id);
        const idMap = new Map();
        const copiedNodes = currentBranchNodes.map((node) => {
            const copiedWorkspaceData = getWorkspaceNodeData(node);
            const copiedNode = createWorkspaceNode({
                title: copiedWorkspaceData.title || 'Copied node',
                nodeType: copiedWorkspaceData.nodeType || 'concept',
                position:
                    node.id === id
                        ? rootCopyPosition
                        : {
                              x:
                                  rootCopyPosition.x +
                                  ((node.position?.x || 0) - (sourceRoot?.position?.x || 0)),
                              y:
                                  rootCopyPosition.y +
                                  ((node.position?.y || 0) - (sourceRoot?.position?.y || 0))
                          },
                df: copiedWorkspaceData.df || [],
                status: copiedWorkspaceData.status || 'needs_review',
                body: copiedWorkspaceData.body || '',
                sourceRefs: copiedWorkspaceData.sourceRefs || [],
                display: copiedWorkspaceData.display || {}
            });
            idMap.set(node.id, copiedNode.id);
            const copiedData = JSON.parse(JSON.stringify(node.data || copiedNode.data));
            return {
                ...copiedNode,
                data: {
                    ...copiedData,
                    display: {
                        ...(copiedData.display || {}),
                        collapsed: false
                    }
                },
                hidden: false
            };
        });

        const copiedEdges = edges
            .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
            .map((edge) =>
                createWorkspaceEdge(idMap.get(edge.source), idMap.get(edge.target), {
                    type: edge.type,
                    animated: edge.animated
                })
            );

        setNodes([...nodes, ...copiedNodes]);
        setEdges([
            ...edges,
            createWorkspaceEdge(nextParent.id, idMap.get(id)),
            ...copiedEdges
        ]);
        recordActivity({
            type: 'manual_branch_copied',
            title: 'Copied branch',
            summary: `Copied ${displayTitle || summary || id} under ${getNodeLabel(nextParent) || nextParent.id}.`,
            node_ids: [id, nextParent.id, ...copiedNodes.map((node) => node.id)],
            metadata: {
                parent_id: nextParent.id
            }
        });
        setSaveStatus('dirty');
        setIsMenuOpen(false);
    };

    const openDetails = () => {
        setInspectorNodeId(id);
        setIsMenuOpen(false);
    };

    const openAskAi = (scope = 'node') => {
        setSelectedBranchId(id);
        pushModal(PromptModal, { scope, nodeId: id });
        recordActivity({
            type: 'ai_action_picker_opened',
            title: scope === 'branch' ? 'Branch Ask AI opened' : 'Node Ask AI opened',
            summary: `Opened preview-first AI actions for ${displayTitle || summary || id}.`,
            node_ids: [id],
            metadata: {
                scope
            }
        });
        setIsMenuOpen(false);
        setIsSlashOpen(false);
        setSlashQuery('');
        setActiveSlashIndex(0);
    };

    const deleteNode = () => {
        const descendantIds = getDescendantIds(id);

        if (
            descendantIds.size > 0 &&
            !window.confirm(
                `Delete this node and ${descendantIds.size} child node${descendantIds.size === 1 ? '' : 's'}?`
            )
        ) {
            return;
        }

        const deletedIds = new Set([id, ...descendantIds]);
        useStore.setState({
            nodes: nodes.filter((node) => !deletedIds.has(node.id)),
            edges: edges.filter(
                (edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)
            )
        });
        recordActivity({
            type: 'manual_node_deleted',
            title: 'Deleted node',
            summary: `Deleted ${displayTitle || summary || id}.`,
            node_ids: [...deletedIds]
        });
        setSaveStatus('dirty');
        window.setTimeout(() => setSaveStatus('dirty'), 100);
        setIsMenuOpen(false);
    };

    const slashCommands = [
        {
            id: 'task',
            group: 'Blocks',
            label: 'Add task',
            description: 'Create a child task',
            action: (baseNodes) => addChild({ title: 'New task', nodeType: 'task' }, baseNodes)
        },
        {
            id: 'table',
            group: 'Blocks',
            label: 'Add table',
            description: 'Create a child table',
            action: (baseNodes) =>
                addChild({
                    title: 'Manual table',
                    nodeType: 'reference',
                    df: [{ Column: 'Value' }]
                }, baseNodes)
        },
        {
            id: 'question-node',
            group: 'Review',
            label: 'Add question',
            description: 'Add a review prompt node',
            action: (baseNodes) =>
                addChild({
                    title: 'Questions to answer',
                    nodeType: 'question'
                }, baseNodes)
        },
        {
            id: 'note',
            group: 'Blocks',
            label: 'Add note',
            description: 'Create a child note',
            action: (baseNodes) => addChild({ title: 'New note', nodeType: 'reference' }, baseNodes)
        },
        {
            id: 'ask-ai',
            group: 'AI',
            label: 'Ask AI',
            description: 'Choose a role and preview action',
            previewOnly: true,
            action: () => openAskAi('node')
        },
        {
            id: 'branch-ai',
            group: 'AI',
            label: 'Ask AI about branch',
            description: 'Choose a role for this branch',
            previewOnly: true,
            action: () => openAskAi('branch')
        },
        {
            id: 'assistant',
            group: 'AI',
            label: 'Review branch',
            description: 'Route branch review through preview-first AI',
            previewOnly: true,
            action: (baseNodes) =>
                openPreviewCommand(
                    'gaps',
                    'AI assistant staged this branch for review.',
                    baseNodes
                )
        },
        {
            id: 'brainstorm',
            group: 'AI',
            label: 'Brainstorm',
            description: 'Open gap review for this branch',
            previewOnly: true,
            action: (baseNodes) =>
                openPreviewCommand(
                    'gaps',
                    'Brainstorm review staged for this branch.',
                    baseNodes
                )
        },
        {
            id: 'generate-questions',
            group: 'AI',
            label: 'Generate questions',
            description: 'Open SME question preview',
            previewOnly: true,
            action: (baseNodes) =>
                openPreviewCommand(
                    'sme',
                    'Question generation preview staged for this branch.',
                    baseNodes
                )
        },
        {
            id: 'outline',
            group: 'AI',
            label: 'Outline',
            description: 'Project branch to outline view',
            previewOnly: true,
            action: (baseNodes) =>
                openPreviewCommand(
                    'outline',
                    'Outline preview opened for this branch.',
                    baseNodes
                )
        },
        {
            id: 'expand',
            group: 'AI',
            label: 'Expand',
            description: 'Preview task expansion',
            previewOnly: true,
            action: (baseNodes) =>
                openPreviewCommand(
                    'preview',
                    'Expansion preview opened for this branch.',
                    baseNodes
                )
        },
        {
            id: 'rewrite',
            group: 'AI',
            label: 'Rewrite',
            description: 'Open node settings without mutation',
            previewOnly: true,
            action: (baseNodes) => {
                setInspectorNodeId(id);
                recordActivity({
                    type: 'ai_preview_requested',
                    title: 'Rewrite preview requested',
                    summary: `Opened ${displayTitle || summary || id} for preview-first rewrite review.`,
                    node_ids: [id]
                });
                setIsSlashOpen(false);
                setSlashQuery('');
                setActiveSlashIndex(0);
            }
        },
        {
            id: 'handoff',
            group: 'Handoff',
            label: 'Add handoff note',
            description: 'Create a child handoff note',
            action: (baseNodes) => addChild({ title: 'Handoff note', nodeType: 'reference' }, baseNodes)
        }
    ];

    const openPreviewCommand = (view, detail) => {
        setSelectedBranchId(id);
        setActiveView(view);
        recordActivity({
            type: 'ai_preview_requested',
            title: 'Preview-first command',
            summary: detail,
            node_ids: [id],
            metadata: {
                view
            }
        });
        setIsSlashOpen(false);
        setSlashQuery('');
        setActiveSlashIndex(0);
    };

    const filteredSlashCommands = useMemo(() => {
        if (!slashQuery) {
            return slashCommands;
        }

        return slashCommands.filter((command) =>
            `${command.label} ${command.description} ${command.group}`
                .toLowerCase()
                .includes(slashQuery)
        );
    }, [slashQuery]);

    const groupedSlashCommands = useMemo(
        () =>
            filteredSlashCommands.reduce((groups, command) => {
                const groupCommands = groups.get(command.group) || [];
                groups.set(command.group, [...groupCommands, command]);
                return groups;
            }, new Map()),
        [filteredSlashCommands]
    );

    const chooseSlashCommand = (command) => {
        if (!command || command.disabled) {
            return;
        }

        const cleanedTitle = getTitleWithoutSlash(titleValue) || displayTitle || 'Untitled node';
        const cleanedNodes = nodes.map((node) =>
            node.id === id
                ? {
                      ...node,
                      data: {
                          ...(node.data || {}),
                          title: cleanedTitle,
                          data: {
                              ...(node.data?.data || {}),
                              summ: node.data?.manual ? cleanedTitle : node.data?.data?.summ
                          }
                      }
                  }
                : node
        );

        command.action(command.previewOnly ? nodes : cleanedNodes);
    };

    const handleTitleKeyDown = (event) => {
        if (!isSlashOpen) {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            setIsSlashOpen(false);
            setSlashQuery('');
            setActiveSlashIndex(0);
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveSlashIndex((current) =>
                filteredSlashCommands.length
                    ? (current + 1) % filteredSlashCommands.length
                    : 0
            );
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveSlashIndex((current) =>
                filteredSlashCommands.length
                    ? (current - 1 + filteredSlashCommands.length) %
                      filteredSlashCommands.length
                    : 0
            );
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            chooseSlashCommand(filteredSlashCommands[activeSlashIndex]);
        }
    };

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

    return (
        <div className={`node-response node-response-status-${nodeStatus}`}>
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
                    <textarea
                        className="node-title-input nodrag"
                        value={titleValue}
                        placeholder="Untitled node"
                        rows={2}
                        onChange={(event) => updateTitle(event.target.value)}
                        onKeyDown={handleTitleKeyDown}
                        onFocus={(event) => {
                            const nextSlashQuery = getSlashQuery(event.target.value);
                            setIsSlashOpen(nextSlashQuery !== null);
                            setSlashQuery(nextSlashQuery || '');
                            setActiveSlashIndex(0);
                        }}
                    />
                    <button
                        type="button"
                        className="node-menu-trigger nodrag"
                        aria-haspopup="menu"
                        aria-expanded={isMenuOpen}
                        onClick={() => setIsMenuOpen((current) => !current)}
                        title="Node actions"
                    >
                        <FiMoreHorizontal />
                    </button>
                </div>
                {isSlashOpen ? (
                    <div className="node-slash-menu nodrag">
                        {filteredSlashCommands.length ? (
                            Array.from(groupedSlashCommands.entries()).map(
                                ([group, commands]) => (
                                    <div key={group} className="node-slash-group">
                                        <p>{group}</p>
                                        {commands.map((command) => {
                                            const commandIndex =
                                                filteredSlashCommands.findIndex(
                                                    (item) => item.id === command.id
                                                );
                                            return (
                                                <button
                                                    key={command.id}
                                                    type="button"
                                                    className={
                                                        commandIndex === activeSlashIndex
                                                            ? 'node-slash-active'
                                                            : ''
                                                    }
                                                    disabled={command.disabled}
                                                    aria-current={
                                                        commandIndex === activeSlashIndex
                                                            ? 'true'
                                                            : undefined
                                                    }
                                                    onMouseEnter={() =>
                                                        setActiveSlashIndex(commandIndex)
                                                    }
                                                    onClick={() => chooseSlashCommand(command)}
                                                >
                                                    <FiChevronRight />
                                                    <span>
                                                        <strong>{command.label}</strong>
                                                        <small>{command.description}</small>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )
                            )
                        ) : (
                            <div className="node-slash-empty">No matching commands</div>
                        )}
                    </div>
                ) : null}
                {isMenuOpen ? (
                    <div className="node-action-menu nodrag" role="menu">
                        <div className="node-action-group">
                            <p>Insert</p>
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
                            <button
                                type="button"
                                onClick={() =>
                                    addChild({ title: 'New note', nodeType: 'reference' })
                                }
                            >
                                <FiFileText />
                                Add note
                            </button>
                            <button type="button" onClick={duplicateNode}>
                                <FiCopy />
                                Duplicate
                            </button>
                        </div>
                        <div className="node-action-group">
                            <p>AI</p>
                            <button type="button" onClick={() => openAskAi('node')}>
                                <FiMessageSquare />
                                Ask AI about node
                            </button>
                            <button type="button" onClick={() => openAskAi('branch')}>
                                <FiGitBranch />
                                Ask AI about branch
                            </button>
                        </div>
                        <div className="node-action-group">
                            <p>Branch</p>
                            <button type="button" onClick={sortChildren}>
                                Sort children
                            </button>
                            <button type="button" onClick={sortBranch}>
                                <FiGitBranch />
                                Sort branch
                            </button>
                            <button type="button" onClick={toggleBranchFold}>
                                <FiScissors />
                                {isBranchCollapsed ? 'Expand branch' : 'Fold branch'}
                            </button>
                            <button type="button" onClick={moveToBranch}>
                                <FiGitBranch />
                                Move to branch
                            </button>
                            <button type="button" onClick={copyToBranch}>
                                <FiCopy />
                                Copy to branch
                            </button>
                        </div>
                        <div className="node-action-group">
                            <p>Review</p>
                            <button type="button" onClick={openDetails}>
                                Node settings
                            </button>
                            <button type="button" onClick={markReviewed}>
                                Check reviewed
                            </button>
                            <button type="button" onClick={markBranchReviewed}>
                                <FiCheckSquare />
                                Check branch
                            </button>
                            <button type="button" onClick={() => setStatus('needs_review')}>
                                Needs review
                            </button>
                            <button type="button" onClick={() => setStatus('approved')}>
                                Approve
                            </button>
                            <button type="button" onClick={setDueDate}>
                                <FiCalendar />
                                Due date
                            </button>
                            <button type="button" onClick={setAssignee}>
                                <FiUser />
                                Assignee
                            </button>
                        </div>
                        <div className="node-action-group">
                            <p>Danger</p>
                            <button
                                type="button"
                                className="node-action-danger"
                                onClick={deleteNode}
                            >
                                <FiTrash2 />
                                Delete
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
            {(directChildIds.length > 0 || dueDate || assignee) && (
                <div className="node-quick-meta">
                    {directChildIds.length > 0 ? (
                        <button
                            type="button"
                            className="node-branch-chip nodrag"
                            onClick={toggleBranchFold}
                        >
                            {isBranchCollapsed ? 'Expand' : 'Fold'} {directChildIds.length}
                        </button>
                    ) : null}
                    {dueDate ? <span>Due {dueDate}</span> : null}
                    {assignee ? <span>{assignee}</span> : null}
                </div>
            )}
            <NodeMetadataBadges data={data} />
            {!data.manual && summary.length > 0 ? (
                areDetailsExpanded ? (
                    <>
                        {summaryBlock()}
                        <button
                            type="button"
                            className="node-details-toggle nodrag"
                            onClick={() => setAreDetailsExpanded(false)}
                        >
                            Hide details
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        className="node-details-toggle nodrag"
                        onClick={() => setAreDetailsExpanded(true)}
                    >
                        Show details
                    </button>
                )
            ) : null}
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
                        <div className="manual-table-preview-header">
                            <span>{df.length} rows</span>
                            <strong>{tableColumns.join(', ') || 'Empty table'}</strong>
                        </div>
                        {tableColumns.length > 0 ? (
                            <table aria-label="Manual table preview">
                                <thead>
                                    <tr>
                                        {tableColumns.slice(0, 3).map((column) => (
                                            <th key={column}>{column}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {df.slice(0, 2).map((row, rowIndex) => (
                                        <tr key={rowIndex}>
                                            {tableColumns.slice(0, 3).map((column) => (
                                                <td key={column}>{row?.[column] || ''}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : null}
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
