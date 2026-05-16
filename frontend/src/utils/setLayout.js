import dagre from "@dagrejs/dagre"

const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes, edges) => {
	const graphDirection = 'LR' // horizontal
	dagreGraph.setGraph({ rankdir: graphDirection, ranksep: 96, nodesep: 42 })
	nodes.forEach((node) => {
		const width = node.measured?.width || node.width || 220;
		const height = node.measured?.height || node.height || 88;
		dagreGraph.setNode(node.id, { width, height });
	});

	edges.forEach((edge) => {
		dagreGraph.setEdge(edge.source, edge.target);
	});

	dagre.layout(dagreGraph);

	const newNodes = nodes.map((node) => {
		const nodeWithPosition = dagreGraph.node(node.id);
		const width = node.measured?.width || node.width || 220;
		const height = node.measured?.height || node.height || 88;
		const newNode = {
			...node,
			targetPosition: 'left',
			sourcePosition: 'right',
			position: {
				x: nodeWithPosition.x - width / 2,
				y: nodeWithPosition.y - height / 2,
			},
		};
		return newNode;
	});
	return { nodes: newNodes, edges };

}

export default getLayoutedElements
