import dagre from '@dagrejs/dagre';

export const NODE_SIZE_BY_SHAPE = {
    decision: { width: 190, height: 136 },
    terminator: { width: 188, height: 92 },
    document: { width: 196, height: 118 },
    process: { width: 196, height: 106 }
};

const DEFAULT_NODE_SIZE = NODE_SIZE_BY_SHAPE.process;
const EDGE_LABEL_WIDTH = 132;
const EDGE_LABEL_HEIGHT = 38;
const GRAPH_PADDING = 44;

export const summaryText = (node) => {
    const value = node?.summary || node?.query || '';
    return typeof value === 'string' ? value : '';
};

export const shapeForStep = (step = {}) => {
    const shape = String(step.shape || '').toLowerCase();
    if (shape === 'decision' || step.flow_kind === 'decision') {
        return 'decision';
    }
    if (shape === 'terminator' || shape === 'document' || shape === 'process') {
        return shape;
    }
    return 'process';
};

export const nodeSize = (step = {}) => NODE_SIZE_BY_SHAPE[shapeForStep(step)] || DEFAULT_NODE_SIZE;

export const createFlowchartLayout = (flowchart = {}) => {
    const steps = Array.isArray(flowchart.steps) ? flowchart.steps : [];
    const connectors = Array.isArray(flowchart.connectors) ? flowchart.connectors : [];
    const graph = new dagre.graphlib.Graph({ multigraph: true });

    graph.setGraph({
        rankdir: 'LR',
        nodesep: 76,
        ranksep: 116,
        marginx: GRAPH_PADDING,
        marginy: GRAPH_PADDING
    });
    graph.setDefaultEdgeLabel(() => ({}));

    steps.forEach((step) => {
        graph.setNode(step.id, nodeSize(step));
    });

    connectors.forEach((connector, index) => {
        if (graph.hasNode(connector.source) && graph.hasNode(connector.target)) {
            graph.setEdge(connector.source, connector.target, {}, connector.id || `edge-${index}`);
        }
    });

    dagre.layout(graph);

    const nodes = steps.map((step, index) => {
        const size = nodeSize(step);
        const layoutNode = graph.node(step.id) || {
            x: GRAPH_PADDING + size.width / 2 + index * (size.width + 96),
            y: GRAPH_PADDING + size.height / 2
        };

        return {
            ...step,
            shape: shapeForStep(step),
            width: size.width,
            height: size.height,
            x: layoutNode.x - size.width / 2,
            y: layoutNode.y - size.height / 2
        };
    });
    const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
    const edgeLabels = [];
    const paths = connectors
        .map((connector, index) => {
            const source = nodeLookup.get(connector.source);
            const target = nodeLookup.get(connector.target);

            if (!source || !target) {
                return null;
            }

            const sourceX = source.x + source.width;
            const sourceY = source.y + source.height / 2;
            const targetX = target.x;
            const targetY = target.y + target.height / 2;
            const midX = sourceX + Math.max(48, (targetX - sourceX) / 2);
            const labelX = midX - EDGE_LABEL_WIDTH / 2;
            const labelY = (sourceY + targetY) / 2 - EDGE_LABEL_HEIGHT / 2;

            edgeLabels.push({
                ...connector,
                id: connector.id || `${connector.source}-${connector.target}-${index}`,
                x: labelX,
                y: labelY,
                width: EDGE_LABEL_WIDTH,
                height: EDGE_LABEL_HEIGHT
            });

            return {
                id: connector.id || `${connector.source}-${connector.target}-${index}`,
                points: {
                    sourceX,
                    sourceY,
                    midX,
                    targetX,
                    targetY
                },
                branchKind: connector.branch_kind || 'default',
                exceptionPath: connector.exception_path === true
            };
        })
        .filter(Boolean);

    const bounds = [...nodes, ...edgeLabels].reduce(
        (current, item) => ({
            minX: Math.min(current.minX, item.x),
            minY: Math.min(current.minY, item.y),
            maxX: Math.max(current.maxX, item.x + (item.width || 0)),
            maxY: Math.max(current.maxY, item.y + (item.height || 0))
        }),
        {
            minX: GRAPH_PADDING,
            minY: GRAPH_PADDING,
            maxX: GRAPH_PADDING + 1,
            maxY: GRAPH_PADDING + 1
        }
    );

    const offsetX = GRAPH_PADDING - bounds.minX;
    const offsetY = GRAPH_PADDING - bounds.minY;

    return {
        nodes: nodes.map((node) => ({ ...node, x: node.x + offsetX, y: node.y + offsetY })),
        paths: paths.map((edge) => {
            const sourceX = edge.points.sourceX + offsetX;
            const sourceY = edge.points.sourceY + offsetY;
            const midX = edge.points.midX + offsetX;
            const targetX = edge.points.targetX + offsetX;
            const targetY = edge.points.targetY + offsetY;

            return {
                ...edge,
                path: `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`
            };
        }),
        edgeLabels: edgeLabels.map((label) => ({ ...label, x: label.x + offsetX, y: label.y + offsetY })),
        width: Math.max(680, bounds.maxX - bounds.minX + GRAPH_PADDING * 2),
        height: Math.max(360, bounds.maxY - bounds.minY + GRAPH_PADDING * 2)
    };
};
