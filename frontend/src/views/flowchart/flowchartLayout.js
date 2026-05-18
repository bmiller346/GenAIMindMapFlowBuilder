import dagre from '@dagrejs/dagre';

export const NODE_SIZE_BY_SHAPE = {
    decision: { width: 236, height: 176 },
    terminator: { width: 228, height: 134 },
    document: { width: 228, height: 152 },
    process: { width: 228, height: 142 }
};

const DEFAULT_NODE_SIZE = NODE_SIZE_BY_SHAPE.process;
const EDGE_LABEL_WIDTH = 104;
const EDGE_LABEL_HEIGHT = 30;
const GRAPH_PADDING = 64;

const rectsOverlap = (a = {}, b = {}, gap = 18) =>
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y;

const avoidNodeOverlaps = (label, nodes) => {
    const candidateOffsets = [
        { x: 0, y: 0 },
        { x: 0, y: -42 },
        { x: 0, y: 42 },
        { x: -54, y: -42 },
        { x: 54, y: -42 },
        { x: -54, y: 42 },
        { x: 54, y: 42 }
    ];
    const candidate = candidateOffsets
        .map((offset) => ({ ...label, x: label.x + offset.x, y: label.y + offset.y }))
        .find((nextLabel) => nodes.every((node) => !rectsOverlap(nextLabel, node)));
    return candidate || label;
};

const pathFromPoints = (points = []) => {
    const usablePoints = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (!usablePoints.length) {
        return '';
    }
    return usablePoints
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
        .join(' ');
};

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

export const nodeSize = (step = {}) => ({
    ...(NODE_SIZE_BY_SHAPE[shapeForStep(step)] || DEFAULT_NODE_SIZE)
});

export const createFlowchartLayout = (flowchart = {}) => {
    const steps = Array.isArray(flowchart.steps) ? flowchart.steps : [];
    const connectors = Array.isArray(flowchart.connectors) ? flowchart.connectors : [];
    const graph = new dagre.graphlib.Graph({ multigraph: true });

    graph.setGraph({
        rankdir: 'LR',
        nodesep: 136,
        ranksep: 180,
        edgesep: 58,
        marginx: GRAPH_PADDING,
        marginy: GRAPH_PADDING
    });
    graph.setDefaultEdgeLabel(() => ({}));

    steps.forEach((step) => {
        graph.setNode(step.id, nodeSize(step));
    });

    connectors.forEach((connector, index) => {
        if (graph.hasNode(connector.source) && graph.hasNode(connector.target)) {
            graph.setEdge(
                connector.source,
                connector.target,
                {
                    width: EDGE_LABEL_WIDTH,
                    height: EDGE_LABEL_HEIGHT
                },
                connector.id || `edge-${index}`
            );
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
    const edgeLabels = [];
    const paths = connectors
        .map((connector, index) => {
            const edgeId = connector.id || `edge-${index}`;
            const layoutEdge = graph.edge(connector.source, connector.target, edgeId);
            if (!layoutEdge?.points?.length) {
                return null;
            }

            const label = avoidNodeOverlaps({
                ...connector,
                id: edgeId,
                x: (layoutEdge.x ?? layoutEdge.points[Math.floor(layoutEdge.points.length / 2)].x) - EDGE_LABEL_WIDTH / 2,
                y: (layoutEdge.y ?? layoutEdge.points[Math.floor(layoutEdge.points.length / 2)].y) - EDGE_LABEL_HEIGHT / 2,
                width: EDGE_LABEL_WIDTH,
                height: EDGE_LABEL_HEIGHT
            }, nodes);
            edgeLabels.push(label);

            return {
                id: edgeId,
                points: layoutEdge.points,
                branchKind: connector.branch_kind || 'default',
                exceptionPath: connector.exception_path === true
            };
        })
        .filter(Boolean);

    const pathPoints = paths.flatMap((edge) => edge.points || []);
    const bounds = [...nodes, ...edgeLabels, ...pathPoints.map((point) => ({
        x: point.x,
        y: point.y,
        width: 0,
        height: 0
    }))].reduce(
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
            return {
                ...edge,
                points: edge.points.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY })),
                path: pathFromPoints(edge.points.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY })))
            };
        }),
        edgeLabels: edgeLabels.map((label) => ({ ...label, x: label.x + offsetX, y: label.y + offsetY })),
        width: Math.max(680, bounds.maxX - bounds.minX + GRAPH_PADDING * 2),
        height: Math.max(360, bounds.maxY - bounds.minY + GRAPH_PADDING * 2)
    };
};
