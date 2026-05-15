import { Handle } from '@xyflow/react';
import axios from 'axios';
import { lazy, Suspense, useMemo, useState } from 'react';
import {
    FiCalendar,
    FiCheckSquare,
    FiChevronRight,
    FiCopy,
    FiFileText,
    FiGitBranch,
    FiMaximize2,
    FiMessageSquare,
    FiMoreHorizontal,
    FiPlus,
    FiScissors,
    FiSend,
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
    getActionsForProfileAndScope,
    getDefaultActionForProfile,
    getFollowUpSuggestions,
    getPromptProfilesForScope
} from '../prompts/promptsModel';
import {
    buildAIDraftSessionRequestPayload,
    createAIDraftSession
} from '../utils/aiDraftSessions';
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

const INLINE_AI_DRAFT_NODE_ACTIONS = new Set([
    'expand_this_node',
    'ask_follow_up',
    'generate_child_nodes',
    'convert_to_checklist',
    'create_sme_questions',
    'find_missing_source_support',
    'generate_tasks',
    'generate_checklist',
    'custom_prompt'
]);

const draftSessionEndpoint = ({ flowId }) =>
    `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions`;

const inferInlineAIIntent = (prompt, profiles) => {
    const normalizedPrompt = prompt.toLowerCase();
    const rules = [
        {
            match: /(task|todo|to-do|owner|due|action item)/,
            profileId: 'task-planner',
            actionId: 'generate_tasks'
        },
        {
            match: /(source|citation|cite|unsupported|evidence|reference)/,
            profileId: 'source-ref-repair',
            actionId: 'find_missing_source_support'
        },
        {
            match: /(question|follow.?up|sme|ask)/,
            profileId: 'sme-question-generator',
            actionId: 'create_sme_questions'
        },
        {
            match: /(checklist|check list)/,
            profileId: 'training-guide-builder',
            actionId: 'convert_to_checklist'
        },
        {
            match: /(how\s+(to|do i)|recipe|cook|make|build|create|procedure|process|workflow|step|steps)/,
            profileId: 'workflow-mapper',
            actionId: 'generate_child_nodes'
        },
        {
            match: /(expand|child|children|break down|branch|brainstorm|generate)/,
            profileId: 'workflow-mapper',
            actionId: 'generate_child_nodes'
        }
    ];
    const rule = rules.find((candidate) => candidate.match.test(normalizedPrompt));
    const role =
        profiles.find((profile) => profile.id === rule?.profileId) ||
        profiles.find((profile) => profile.id === 'custom') ||
        profiles[0];
    const actions = getActionsForProfileAndScope(role, 'node');
    const action =
        actions.find((candidate) => candidate.id === rule?.actionId) ||
        actions.find((candidate) => candidate.id === getDefaultActionForProfile(role, 'node')) ||
        actions.find((candidate) => candidate.id === 'custom_prompt') ||
        actions[0] ||
        { id: 'custom_prompt', label: 'Custom prompt' };

    return { role, action };
};

const draftNodeTypeForAction = (actionId = '') => {
    if (actionId.includes('task') || actionId.includes('checklist')) {
        return 'task';
    }
    if (actionId.includes('question') || actionId.includes('follow')) {
        return 'question';
    }
    if (actionId.includes('source') || actionId.includes('gap') || actionId.includes('unsupported')) {
        return 'needs_review';
    }
    if (actionId.includes('child') || actionId.includes('expand')) {
        return 'step';
    }
    return 'concept';
};

const titleFromPrompt = (prompt = '') => {
    const cleaned = String(prompt || '')
        .replace(/[?!.\s]+$/g, '')
        .replace(/^(please\s+)?(show me\s+)?(how\s+(to|do i)\s+|can you\s+|could you\s+|make\s+|create\s+|build\s+)/i, '')
        .trim();
    if (!cleaned) {
        return 'AI draft';
    }
    return cleaned.length > 80 ? `${cleaned.slice(0, 77).trim()}...` : cleaned;
};

const compactNodeText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const shouldAttachInlineSourceRefs = (prompt = '') =>
    /\b(from this|from the|based on|according to|source|citation|cite|evidence|document|docx|pdf|reference)\b/i.test(
        prompt
    );

const buildInlineDraftSteps = ({ prompt = '', actionId = '' }) => {
    const normalizedPrompt = prompt.toLowerCase();
    const subject = titleFromPrompt(prompt);

    if (/grilled\s+cheese|cheese\s+sandwich/.test(normalizedPrompt)) {
        return [
            {
                title: 'Gather bread, cheese, and butter',
                summary: 'Set out two slices of bread, cheese that melts well, softened butter, and a skillet.'
            },
            {
                title: 'Butter the outside of the bread',
                summary: 'Spread a thin, even layer of butter on the two sides that will touch the pan.'
            },
            {
                title: 'Assemble the sandwich',
                summary: 'Place cheese between the unbuttered sides so the buttered faces stay outside.'
            },
            {
                title: 'Toast the first side',
                summary: 'Cook over medium-low heat until the bottom is golden and the cheese starts melting.'
            },
            {
                title: 'Flip and finish',
                summary: 'Turn the sandwich carefully and cook until the second side is golden and the cheese is fully melted.'
            },
            {
                title: 'Rest, slice, and serve',
                summary: 'Let it sit briefly, then cut and serve while the center is still warm and melted.'
            }
        ];
    }

    if (actionId.includes('question') || actionId.includes('follow')) {
        return [
            {
                title: `Clarify the goal for ${subject}`,
                summary: `Ask what outcome, constraints, or audience should shape ${subject}.`,
                node_type: 'question'
            },
            {
                title: `Confirm missing inputs for ${subject}`,
                summary: `Identify any information needed before turning ${subject} into map nodes.`,
                node_type: 'question'
            }
        ];
    }

    if (actionId.includes('source') || actionId.includes('gap') || actionId.includes('unsupported')) {
        return [
            {
                title: `Check source support for ${subject}`,
                summary: `Review which claims in ${subject} need citations, quotes, or confirmation.`,
                node_type: 'needs_review'
            },
            {
                title: `Mark unsupported assumptions for ${subject}`,
                summary: `Separate inferred content from source-backed content so it can be reviewed.`,
                node_type: 'needs_review'
            }
        ];
    }

    if (actionId.includes('task')) {
        return [
            {
                title: `Define outcome for ${subject}`,
                summary: `State what done looks like for ${subject}.`,
                node_type: 'task'
            },
            {
                title: `Prepare inputs for ${subject}`,
                summary: `Gather the materials, references, people, or context needed to start.`,
                node_type: 'task'
            },
            {
                title: `Execute ${subject}`,
                summary: `Complete the core work and record any blockers or decisions.`,
                node_type: 'task'
            },
            {
                title: `Review ${subject}`,
                summary: `Check the result, capture changes, and decide what should happen next.`,
                node_type: 'task'
            }
        ];
    }

    return [
        {
            title: `Start ${subject}`,
            summary: `Define the goal and collect what is needed for ${subject}.`
        },
        {
            title: `Prepare ${subject}`,
            summary: `Set up the inputs, environment, and constraints before doing the work.`
        },
        {
            title: `Do ${subject}`,
            summary: `Work through the main action in a clear sequence.`
        },
        {
            title: `Check ${subject}`,
            summary: `Review the result against the goal and note anything that needs another pass.`
        }
    ];
};

const sessionFromResponse = (responseData, fallbackSession) =>
    responseData?.session_id
        ? responseData
        : responseData?.draft_session?.session_id
          ? responseData.draft_session
          : responseData?.session?.session_id
            ? responseData.session
            : fallbackSession;

const ResponseNode = ({ id, data }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSlashOpen, setIsSlashOpen] = useState(false);
    const [slashQuery, setSlashQuery] = useState('');
    const [activeSlashIndex, setActiveSlashIndex] = useState(0);
    const [inlineAiPrompt, setInlineAiPrompt] = useState('');
    const [inlineAiStatus, setInlineAiStatus] = useState('');
    const [isInlineAiGenerating, setIsInlineAiGenerating] = useState(false);
    const [isTableExpanded, setIsTableExpanded] = useState(false);
    const [areDetailsExpanded, setAreDetailsExpanded] = useState(false);
    const nodes = useStore((state) => state.nodes);
    const edges = useStore((state) => state.edges);
    const setNodes = useStore((state) => state.setNodes);
    const setEdges = useStore((state) => state.setEdges);
    const setInspectorNodeId = useStore((state) => state.setInspectorNodeId);
    const setActiveView = useStore((state) => state.setActiveView);
    const setSelectedBranchId = useStore((state) => state.setSelectedBranchId);
    const setGeneratedHelperPreview = useStore((state) => state.setGeneratedHelperPreview);
    const setActiveAIActionPreview = useStore((state) => state.setActiveAIActionPreview);
    const setActiveAIDraftSession = useStore((state) => state.setActiveAIDraftSession);
    const activeAIDraftSession = useStore((state) => state.activeAIDraftSession);
    const pushModal = modalStore((state) => state.pushNode);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const flowId = flowStore((state) => state.flow_id);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const workspaceData = useMemo(
        () => getWorkspaceNodeData({ id, type: 'response', data }),
        [data, id]
    );
    const inlineAIProfiles = useMemo(() => getPromptProfilesForScope('node'), []);
    const responseData = data.data || {};
    const displayTitle = workspaceData.title || '';
    const summary = workspaceData.body || '';
    const query = workspaceData.query || '';
    const df = Array.isArray(workspaceData.df) ? workspaceData.df : [];
    const graph = workspaceData.graph || {};
    const isManualTable = data.manual && df.length > 0;
    const titleValue = displayTitle || summary || '';
    const summaryPreview = compactNodeText(summary);
    const shouldShowSummaryPreview =
        summaryPreview.length > 0 &&
        compactNodeText(titleValue).toLowerCase() !== summaryPreview.toLowerCase();
    const nodeStatus = workspaceData.status || 'ai_generated';
    const dueDate = workspaceData.dueDate || '';
    const assignee = workspaceData.ownerId || '';
    const directChildIds = useMemo(
        () => edges.filter((edge) => edge.source === id).map((edge) => edge.target),
        [edges, id]
    );
    const hasActiveInlineDraft =
        activeAIDraftSession?.metadata?.preview_mode === 'inline_node_prompt' &&
        activeAIDraftSession?.scope?.node_id === id &&
        !['accepted', 'discarded', 'rejected'].includes(activeAIDraftSession?.status);
    const displayedInlineAiStatus = hasActiveInlineDraft
        ? 'Draft ready. Review and accept it in the node panel.'
        : inlineAiStatus;
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
                    type: edge.type
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

    const openAskAi = (scope = 'node', options = {}) => {
        setSelectedBranchId(id);
        pushModal(PromptModal, {
            scope,
            nodeId: id,
            initialRoleId: options.initialRoleId,
            initialActionId: options.initialActionId,
            initialPrompt: options.initialPrompt || '',
            initialVisual: options.initialVisual || 'auto',
            initialPromptPlaceholder: options.initialPromptPlaceholder || ''
        });
        recordActivity({
            type: 'ai_action_picker_opened',
            title:
                options.intent === 'specialize_branch'
                    ? 'Branch specialization opened'
                    : scope === 'branch'
                      ? 'Branch Ask AI opened'
                      : 'Node Ask AI opened',
            summary:
                options.intent === 'specialize_branch'
                    ? `Opened preview-first specialization for ${displayTitle || summary || id}.`
                    : `Opened preview-first AI actions for ${displayTitle || summary || id}.`,
            node_ids: [id],
            metadata: {
                scope,
                intent: options.intent || ''
            }
        });
        setIsMenuOpen(false);
        setIsSlashOpen(false);
        setSlashQuery('');
        setActiveSlashIndex(0);
    };

    const openSpecializeBranch = () =>
        openAskAi('branch', {
            initialRoleId: 'workflow-mapper',
            initialActionId: 'custom_prompt',
            initialVisual: 'mind_map',
            initialPrompt: '',
            initialPromptPlaceholder:
                'Describe the domain, audience, product line, standard, or implementation context to specialize this branch for.',
            intent: 'specialize_branch'
        });

    const stageInlineAiDraft = async (event) => {
        event.preventDefault();
        const localPrompt = inlineAiPrompt.trim();

        if (!localPrompt || isInlineAiGenerating) {
            if (!localPrompt) {
                setInlineAiStatus('Type a request, or open advanced.');
            }
            return;
        }

        const { role, action: selectedAction } = inferInlineAIIntent(
            localPrompt,
            inlineAIProfiles
        );
        const targetLabel = displayTitle || summary || id;
        const normalizedScope = { type: 'node', node_id: id };
        const sourceRefs = shouldAttachInlineSourceRefs(localPrompt)
            ? workspaceData.sourceRefs || []
            : [];
        const childEdges = edges.filter((edge) => edge.source === id);
        const suggestions = getFollowUpSuggestions(
            role,
            selectedAction,
            targetLabel,
            'node'
        ).slice(0, 3);
        const shouldDraftNode = INLINE_AI_DRAFT_NODE_ACTIONS.has(selectedAction.id);
        const draftPrefix = `draft-${Date.now()}`;
        const defaultNodeType = draftNodeTypeForAction(selectedAction.id);
        const inlineDraftSteps = buildInlineDraftSteps({
            prompt: localPrompt,
            actionId: selectedAction.id
        });
        const draftNodes = shouldDraftNode
            ? inlineDraftSteps.map((step, index) => ({
                  id: `${draftPrefix}-${index + 1}`,
                  parent_id: id,
                  title: step.title,
                  summary: step.summary || localPrompt,
                  node_type: step.node_type || defaultNodeType,
                  status: sourceRefs.length ? 'ai_generated' : 'needs_review',
                  source_refs: sourceRefs,
                  assumptions: sourceRefs.length ? [] : [`User instruction: ${localPrompt}`],
                  metadata: {
                      inline_prompt: localPrompt,
                      inline_prompt_step: index + 1,
                      action_id: selectedAction.id,
                      role_id: role.id
                  }
              }))
            : [];
        const draftEdges = shouldDraftNode
            ? draftNodes.map((node) => ({
                  id: `draft-edge-${id}-${node.id}`,
                  source_node_id: id,
                  target_node_id: node.id,
                  relationship_type: 'contains',
                  metadata: {
                      inline_prompt: localPrompt
                  }
              }))
            : [];
        const draftAnnotations =
            selectedAction.id === 'custom_prompt'
                ? []
                : suggestions.map((suggestion, index) => ({
                      id: `inline-suggestion-${index + 1}`,
                      type: 'follow_up_suggestion',
                      title: suggestion,
                      body: suggestion
                  }));
        const fallbackSession = createAIDraftSession({
            workspaceId: flowId || '',
            scope: normalizedScope,
            role: role.label,
            intent: selectedAction.id,
            prompt: localPrompt,
            draftNodes,
            draftEdges,
            draftAnnotations,
            modelPolicy: 'balanced',
            selectedModel: 'auto',
            modelReason: 'Inline node prompt uses automatic model selection.',
            metadata: {
                role_id: role.id,
                action_label: selectedAction.label,
                preview_mode: 'inline_node_prompt',
                source_node_id: id
            }
        });
        const legacyPreview = {
            preview_id: fallbackSession.session_id,
            ai_action_id: fallbackSession.session_id,
            workspace_id: flowId || '',
            scope: normalizedScope,
            source_node_id: id,
            role: role.label,
            role_id: role.id,
            action: selectedAction.id,
            action_label: selectedAction.label,
            custom_prompt: localPrompt,
            input_node_ids: [id, ...childEdges.map((edge) => edge.target)],
            draft_nodes: draftNodes,
            draft_edges: draftEdges,
            draft_annotations: draftAnnotations,
            validation_report: {
                status: 'not_run',
                message: 'Inline draft preview is waiting for review.'
            },
            source_refs: sourceRefs,
            assumptions: [`User instruction: ${localPrompt}`],
            metadata: {
                preview_mode: 'inline_node_prompt',
                model: 'auto',
                model_tier: 'auto',
                model_reason: 'Inline node prompt uses automatic model selection.'
            }
        };

        const activateSession = (session) => {
            const nextSession = sessionFromResponse(session, fallbackSession);
            setGeneratedHelperPreview('nodeAiActionRequest', legacyPreview);
            setActiveAIActionPreview(undefined);
            setActiveAIDraftSession(nextSession);
            setSelectedBranchId(id);
            setInspectorNodeId(id);
            setActiveView('mindmap');
            recordActivity({
                type: 'inline_ai_prompt_submitted',
                title: `${role.label}: ${selectedAction.label}`,
                summary: localPrompt,
                node_ids: [id],
                metadata: {
                    scope: 'node',
                    role: role.label,
                    action: selectedAction.id,
                    model: 'auto'
                }
            });
            setInlineAiPrompt('');
            setInlineAiStatus('');
            setIsMenuOpen(false);
            setIsSlashOpen(false);
        };

        setIsInlineAiGenerating(true);
        setInlineAiStatus('Drafting from this node...');

        try {
            const baseRequestPayload = buildAIDraftSessionRequestPayload({
                role,
                action: selectedAction,
                scope: normalizedScope,
                prompt: localPrompt,
                selectedModel: 'auto'
            });
            const response = flowId
                ? await axios.post(
                      draftSessionEndpoint({ flowId }),
                      {
                          ...baseRequestPayload,
                          draft_nodes: draftNodes,
                          draft_edges: draftEdges,
                          draft_annotations: draftAnnotations,
                          source_refs: sourceRefs,
                          assumptions: [`User instruction: ${localPrompt}`],
                          metadata: {
                              ...(baseRequestPayload.metadata || {}),
                              role_id: role.id,
                              action_label: selectedAction.label,
                              preview_mode: 'inline_node_prompt',
                              source_node_id: id,
                              source_context_attached: sourceRefs.length > 0
                          }
                      }
                  )
                : null;
            activateSession(response?.data || fallbackSession);
        } catch (error) {
            const detail =
                error.response?.data?.detail?.message ||
                error.response?.data?.detail ||
                error.message ||
                'Unable to generate inline draft.';
            activateSession({
                ...fallbackSession,
                warnings: [String(detail)],
                revisions: fallbackSession.revisions.map((revision) => ({
                    ...revision,
                    validation_report: {
                        ...revision.validation_report,
                        status: 'fallback',
                        message: 'Backend draft session was unavailable; staged a local inline draft.'
                    }
                })),
                metadata: {
                    ...fallbackSession.metadata,
                    backend_warning: String(detail)
                }
            });
        } finally {
            setIsInlineAiGenerating(false);
        }
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
            label: 'Advanced Ask AI',
            description: 'Open the full role/action picker',
            previewOnly: true,
            action: () => openAskAi('node')
        },
        {
            id: 'branch-ai',
            group: 'AI',
            label: 'Advanced branch AI',
            description: 'Open the full branch role picker',
            previewOnly: true,
            action: () => openAskAi('branch')
        },
        {
            id: 'specialize-branch',
            group: 'AI',
            label: 'Specialize branch',
            description: 'Make this branch domain-specific',
            previewOnly: true,
            action: () => openSpecializeBranch()
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

    const initialSeedVisual =
        data.metadata?.initial_seed_visual || data.data?.metadata?.initial_seed_visual || '';
    const nodeClassName = [
        'node-response',
        `node-response-status-${nodeStatus}`,
        workspaceData.nodeType ? `node-response-type-${workspaceData.nodeType}` : '',
        initialSeedVisual ? 'node-response-initial-seed' : '',
        initialSeedVisual ? `node-response-initial-seed-${initialSeedVisual}` : ''
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={nodeClassName}>
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
                {shouldShowSummaryPreview ? (
                    <p className="node-summary-preview">{summaryPreview}</p>
                ) : null}
                <form
                    className={`node-inline-ai-composer nodrag${
                        isInlineAiGenerating ? ' generating' : ''
                    }${displayedInlineAiStatus ? ' has-status' : ''}`}
                    onSubmit={stageInlineAiDraft}
                >
                    <FiMessageSquare aria-hidden="true" />
                    <input
                        type="text"
                        value={inlineAiPrompt}
                        aria-label="Ask AI from this node"
                        placeholder={
                            isInlineAiGenerating
                                ? 'Drafting...'
                                : 'Ask AI from this node'
                        }
                        disabled={isInlineAiGenerating}
                        onChange={(event) => {
                            setInlineAiPrompt(event.target.value);
                            if (inlineAiStatus) {
                                setInlineAiStatus('');
                            }
                        }}
                        onFocus={() => setIsMenuOpen(false)}
                    />
                    <button
                        type="submit"
                        className="node-inline-ai-send"
                        disabled={isInlineAiGenerating || !inlineAiPrompt.trim()}
                        title="Generate a draft from this node"
                    >
                        <FiSend />
                    </button>
                    <button
                        type="button"
                        className="node-inline-ai-advanced"
                        onClick={() => openAskAi('node')}
                        title="Advanced Ask AI"
                    >
                        <FiMaximize2 />
                    </button>
                    {displayedInlineAiStatus ? (
                        <span className="node-inline-ai-status">{displayedInlineAiStatus}</span>
                    ) : null}
                </form>
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
                                Advanced Ask AI
                            </button>
                            <button type="button" onClick={() => openAskAi('branch')}>
                                <FiGitBranch />
                                Advanced branch AI
                            </button>
                            <button type="button" onClick={openSpecializeBranch}>
                                <FiGitBranch />
                                Specialize branch
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
