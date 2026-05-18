import dagre from "@dagrejs/dagre"

const FALLBACK_NODE_WIDTH = 352;
const FALLBACK_NODE_HEIGHT = 112;
const MIN_RANK_GAP = 430;
const MIN_LANE_GAP = 152;
const FLOW_NODE_TYPES = new Set([
	'workflow',
	'process',
	'step',
	'task',
	'requirement',
	'question',
	'decision',
	'approval',
	'handoff',
	'exception'
]);
const HIERARCHY_RELATIONSHIP_TYPES = new Set([
	'',
	'contains',
	'parent_child',
	'parent-child',
	'child',
	'section',
	'subtopic',
	'branch',
	'step',
	'smoothstep'
]);

const getNodeWidth = (node) => node.measured?.width || node.width || FALLBACK_NODE_WIDTH;
const getNodeHeight = (node) => node.measured?.height || node.height || FALLBACK_NODE_HEIGHT;

const textValue = (...values) =>
	values
		.map((value) => (typeof value === 'string' ? value.trim() : ''))
		.find(Boolean) || '';

const nodeText = (node) => {
	const data = node?.data || {};
	const nested = data.data && typeof data.data === 'object' ? data.data : {};
	return textValue(data.title, nested.title, data.summary, data.body, nested.summ, node?.id);
};

const nodeKind = (node) => {
	const data = node?.data || {};
	const nested = data.data && typeof data.data === 'object' ? data.data : {};
	return textValue(data.node_type, nested.node_type, data.component_type, node?.type).toLowerCase();
};

const edgeText = (edge) => {
	const data = edge?.data && typeof edge.data === 'object' ? edge.data : {};
	return textValue(
		edge?.label,
		edge?.condition,
		edge?.relationship_type,
		data.branch_label,
		data.condition,
		data.relationship_type,
		data.rationale
	).toLowerCase();
};

const edgeRelationshipType = (edge) => {
	const data = edge?.data && typeof edge.data === 'object' ? edge.data : {};
	const metadata = edge?.metadata && typeof edge.metadata === 'object' ? edge.metadata : {};
	return textValue(
		edge?.relationship_type,
		data.relationship_type,
		data.relationshipType,
		metadata.relationship_type,
		edge?.type
	).toLowerCase();
};

const isHierarchyEdge = (edge) => HIERARCHY_RELATIONSHIP_TYPES.has(edgeRelationshipType(edge));

const isDecisionNode = (node) => {
	const kind = nodeKind(node);
	const text = nodeText(node).toLowerCase();
	return (
		kind === 'question' ||
		kind === 'decision' ||
		kind === 'approval' ||
		/\b(decision|approved\?|complete\?|ready\?|supported\?)\b/.test(text)
	);
};

const isExceptionNode = (node) => {
	const kind = nodeKind(node);
	const text = nodeText(node).toLowerCase();
	return kind === 'exception' || /\b(exception|missing|blocked|defect|deferred|manual ui)\b/.test(text);
};

const branchLaneHint = (node, incomingEdges = [], outgoingEdges = [], orderById = new Map()) => {
	const incomingText = incomingEdges.map(edgeText).join(' ');
	const outgoingBackEdge = outgoingEdges.some(
		(edge) => (orderById.get(edge.source) ?? 0) >= (orderById.get(edge.target) ?? 0)
	);
	if (
		isExceptionNode(node) ||
		outgoingBackEdge ||
		/\b(no|false|reject|rejected|exception|missing|blocked|escalate|manual|defer)\b/.test(
			incomingText
		)
	) {
		return -1;
	}
	if (/\b(yes|true|approved|ready|complete|continue|next)\b/.test(incomingText)) {
		return 1;
	}
	return 0;
};

const edgeIsBackEdge = (edge, orderById) => {
	const sourceOrder = orderById.get(edge.source);
	const targetOrder = orderById.get(edge.target);
	if (!Number.isFinite(sourceOrder) || !Number.isFinite(targetOrder)) {
		return false;
	}
	return sourceOrder >= targetOrder || /\b(return|loop|retry|rework|back)\b/.test(edgeText(edge));
};

const shouldUseFlowchartLayout = (nodes = [], edges = []) => {
	if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length < 4 || edges.length < 3) {
		return false;
	}
	const flowishNodes = nodes.filter((node) => FLOW_NODE_TYPES.has(nodeKind(node))).length;
	const hasDecision = nodes.some(isDecisionNode);
	const hasException = nodes.some(isExceptionNode);
	const orderById = new Map(nodes.map((node, index) => [node.id, index]));
	const hasReturnEdge = edges.some((edge) => edgeIsBackEdge(edge, orderById));
	return hasDecision || hasException || hasReturnEdge || flowishNodes / nodes.length >= 0.6;
};

const firstFinitePosition = (nodes, axis, fallback) => {
	const values = nodes
		.map((node) => Number(node.position?.[axis]))
		.filter((value) => Number.isFinite(value));
	return values.length ? Math.min(...values) : fallback;
};

const assignFlowchartRanks = (nodes, edges, orderById) => {
	const ranks = new Map();
	const forwardEdges = edges.filter((edge) => !edgeIsBackEdge(edge, orderById));

	nodes.forEach((node, index) => {
		const incoming = forwardEdges.filter((edge) => edge.target === node.id);
		if (!incoming.length) {
			ranks.set(node.id, ranks.has(node.id) ? ranks.get(node.id) : index === 0 ? 0 : ranks.size);
			return;
		}
		const rank = Math.max(
			...incoming.map((edge) => (ranks.get(edge.source) ?? orderById.get(edge.source) ?? 0) + 1)
		);
		ranks.set(node.id, Math.max(ranks.get(node.id) ?? 0, rank));
	});

	return ranks;
};

const nextOpenLane = (preferredLane, usedLanes) => {
	if (!usedLanes.has(preferredLane)) {
		return preferredLane;
	}
	let distance = 1;
	while (distance < 16) {
		const lower = preferredLane - distance;
		const upper = preferredLane + distance;
		if (!usedLanes.has(lower)) {
			return lower;
		}
		if (!usedLanes.has(upper)) {
			return upper;
		}
		distance += 1;
	}
	return preferredLane + usedLanes.size;
};

const assignFlowchartLanes = (nodes, edges, ranks, orderById) => {
	const byRank = new Map();
	nodes.forEach((node) => {
		const rank = ranks.get(node.id) ?? 0;
		byRank.set(rank, [...(byRank.get(rank) || []), node]);
	});

	const lanes = new Map();
	Array.from(byRank.entries())
		.sort(([a], [b]) => a - b)
		.forEach(([, rankNodes]) => {
			const used = new Set();
			const ranked = rankNodes
				.map((node) => {
					const incoming = edges.filter((edge) => edge.target === node.id);
					const outgoing = edges.filter((edge) => edge.source === node.id);
					const hint = branchLaneHint(node, incoming, outgoing, orderById);
					return { node, hint };
				})
				.sort((a, b) => a.hint - b.hint || (orderById.get(a.node.id) ?? 0) - (orderById.get(b.node.id) ?? 0));

			const hasUpperBranch = ranked.some((item) => item.hint < 0);
			ranked.forEach((item) => {
				const preferred = rankNodes.length > 1 && item.hint === 0 && hasUpperBranch ? 1 : item.hint;
				const lane = nextOpenLane(preferred, used);
				used.add(lane);
				lanes.set(item.node.id, lane);
			});
		});

	return lanes;
};

const layoutFlowchartElements = (nodes, edges) => {
	const nodeIds = new Set(nodes.map((node) => node.id));
	const validEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
	const orderById = new Map(nodes.map((node, index) => [node.id, index]));
	const ranks = assignFlowchartRanks(nodes, validEdges, orderById);
	const lanes = assignFlowchartLanes(nodes, validEdges, ranks, orderById);
	const maxWidth = Math.max(...nodes.map(getNodeWidth), FALLBACK_NODE_WIDTH);
	const maxHeight = Math.max(...nodes.map(getNodeHeight), FALLBACK_NODE_HEIGHT);
	const rankGap = Math.max(MIN_RANK_GAP, maxWidth + 110);
	const laneGap = Math.max(MIN_LANE_GAP, maxHeight + 54);
	const minLane = Math.min(...Array.from(lanes.values()), 0);
	const anchorX = firstFinitePosition(nodes, 'x', 80);
	const anchorY = firstFinitePosition(nodes, 'y', 140) + Math.abs(Math.min(minLane, 0)) * laneGap;

	return {
		nodes: nodes.map((node) => ({
			...node,
			targetPosition: 'left',
			sourcePosition: 'right',
			position: {
				x: anchorX + (ranks.get(node.id) ?? 0) * rankGap,
				y: anchorY + (lanes.get(node.id) ?? 0) * laneGap
			}
		})),
		edges: edges.map((edge) => ({
			...edge,
			type: edge.type || 'smoothstep',
			data: {
				...(edge.data || {}),
				layoutRole: edgeIsBackEdge(edge, orderById) ? 'return' : 'forward'
			}
		}))
	};
};

const layoutWithDagre = (nodes, edges, options = {}) => {
	const graphDirection = 'LR'; // horizontal
	const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
	dagreGraph.setGraph({
		rankdir: graphDirection,
		ranksep: options.ranksep || 110,
		nodesep: options.nodesep || 52
	});

	nodes.forEach((node) => {
		dagreGraph.setNode(node.id, {
			width: getNodeWidth(node),
			height: getNodeHeight(node)
		});
	});

	edges.forEach((edge) => {
		dagreGraph.setEdge(edge.source, edge.target);
	});

	dagre.layout(dagreGraph);

	return {
		nodes: nodes.map((node) => {
			const nodeWithPosition = dagreGraph.node(node.id);
			const width = getNodeWidth(node);
			const height = getNodeHeight(node);
			return {
				...node,
				targetPosition: 'left',
				sourcePosition: 'right',
				position: {
					x: nodeWithPosition.x - width / 2,
					y: nodeWithPosition.y - height / 2
				}
			};
		}),
		edges
	};
};

const layoutKnowledgeGraphElements = (nodes, edges) => {
	const hierarchyEdges = edges.filter(isHierarchyEdge);
	const layoutEdges = hierarchyEdges.length ? hierarchyEdges : edges;
	const layouted = layoutWithDagre(nodes, layoutEdges, {
		ranksep: 160,
		nodesep: 74
	});
	return {
		nodes: layouted.nodes,
		edges: edges.map((edge) =>
			isHierarchyEdge(edge)
				? edge
				: {
					...edge,
					type: edge.type || 'semantic',
					data: {
						...(edge.data || {}),
						layoutRole: 'semantic_overlay'
					}
				}
		)
	};
};

const getLayoutedElements = (nodes, edges, options = {}) => {
	if (options.mode === 'knowledgeGraph') {
		return layoutKnowledgeGraphElements(nodes, edges);
	}
	if (shouldUseFlowchartLayout(nodes, edges)) {
		return layoutFlowchartElements(nodes, edges);
	}
	return layoutWithDagre(nodes, edges);
};

export default getLayoutedElements
