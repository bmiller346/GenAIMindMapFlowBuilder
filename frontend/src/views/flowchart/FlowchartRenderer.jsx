import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiMaximize, FiMinus, FiPlus } from 'react-icons/fi';
import FlowchartShape from './FlowchartShape.jsx';
import {
    FLOWCHART_LENSES,
    flowchartConnectorLensState,
    flowchartLensLabel,
    flowchartNodeLensState
} from './flowchartLens.js';
import {
    FLOWCHART_DISPLAY_MODES,
    flowchartDisplayLabel
} from './flowchartDisplay.js';
import { createFlowchartLayout, summaryText } from './flowchartLayout.js';
import {
    FLOWCHART_MAX_ZOOM,
    FLOWCHART_MIN_ZOOM,
    wheelDeltaMultiplier,
    zoomViewportAroundPoint
} from './flowchartViewport.js';
import TrustStateBadges from '../../components/TrustStateBadges';
import './FlowchartRenderer.css';

const IMPROVE_FLOW_PROMPT =
    'Improve this flowchart only. Preserve the existing workspace, then refine step order, decision paths, dependencies, handoffs, exception paths, and source-backed review notes.';
const ENHANCE_FLOW_BRANCHES_PROMPT =
    'Enhance this flowchart only by filling in missing decision branches. Preserve existing steps, then add or refine yes/no paths, exception paths, branch conditions, handoffs, dependencies, and source-backed review notes.';
const DRAFT_FLOW_PROMPT =
    'Create a flowchart from this workspace with ordered steps, decision points, dependencies, handoffs, exception paths, and source-backed review notes.';

const improveStepPrompt = (step = {}) => {
    const title = step.title || 'the selected flowchart step';
    const kind = step.flow_kind || step.shape || 'step';
    return `Improve the flowchart around "${title}" (${kind}). Preserve the existing workspace, then add or refine its immediate predecessor/successor steps, decision branches, exception paths, handoffs, dependencies, and source-backed review notes.`;
};

const connectorTitle = (connector = {}) =>
    [connector.label, connector.condition, connector.target_title].filter(Boolean).join(' | ');

const branchClass = (connector = {}) =>
    `canvas-flowchart-diagram-edge-label canvas-flowchart-diagram-edge-label-${connector.branch_kind || 'default'}`;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const MIN_ZOOM = FLOWCHART_MIN_ZOOM;
const MAX_ZOOM = FLOWCHART_MAX_ZOOM;

const FlowchartNode = ({ step, lens, onOpenNode, onAddStep, onAddDecisionBranch, onImproveStep }) => {
    const description = summaryText(step);
    const shapeLabel = step.shape === 'terminator' ? 'Terminator' : step.shape;
    const lensState = flowchartNodeLensState(step, lens);

    return (
        <article
            className={[
                'canvas-flowchart-diagram-node',
                `canvas-flowchart-diagram-node-${step.flow_kind || 'step'}`,
                `canvas-flowchart-diagram-shape-${step.shape || 'process'}`,
                `canvas-flowchart-lens-state-${lensState}`
            ].join(' ')}
            style={{
                left: `${step.x}px`,
                top: `${step.y}px`,
                width: `${step.width}px`,
                height: `${step.height}px`
            }}
            aria-label={`${shapeLabel} flowchart step: ${step.title}`}
            title={description || step.title}
        >
            <div className="canvas-flowchart-diagram-node-surface">
                <svg
                    className="canvas-flowchart-diagram-node-svg"
                    viewBox="0 0 200 136"
                    aria-hidden="true"
                    focusable="false"
                    preserveAspectRatio="none"
                >
                    <FlowchartShape shape={step.shape} />
                </svg>
                <span>{step.flow_kind === 'decision' ? 'Decision' : shapeLabel}</span>
                <button type="button" onClick={() => onOpenNode?.(step.id)}>
                    {step.title}
                </button>
                <small>
                    <TrustStateBadges
                        subject={{
                            ...step,
                            source_backed: step.source_backed,
                            status: step.review_state || step.status
                        }}
                    />
                </small>
                <div className="canvas-flowchart-diagram-node-actions">
                    <button
                        type="button"
                        onClick={() =>
                            onAddStep?.({
                                sourceId: step.id,
                                nodeType: 'process',
                                title: 'New process step'
                            })
                        }
                    >
                        + Step
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            step.flow_kind === 'decision'
                                ? onAddDecisionBranch?.(step.id, 'yes')
                                : onAddStep?.({
                                      sourceId: step.id,
                                      nodeType: 'decision',
                                      title: 'New decision'
                                  })
                        }
                    >
                        {step.flow_kind === 'decision' ? '+ Yes' : '+ Decision'}
                    </button>
                    {step.flow_kind === 'decision' ? (
                        <button type="button" onClick={() => onAddDecisionBranch?.(step.id, 'no')}>
                            + No
                        </button>
                    ) : null}
                    <button
                        type="button"
                        title="Improve this flow step"
                        aria-label={`Improve ${step.title} with AI`}
                        onClick={() => onImproveStep?.(step)}
                    >
                        AI
                    </button>
                </div>
            </div>
        </article>
    );
};

const FlowchartRenderer = ({
    flowchart = {},
    onOpenNode,
    onOpenEdge,
    onAddStep,
    onAddDecisionBranch,
    onAskAi,
    flowchartLens = FLOWCHART_LENSES.PROCESS,
    flowchartDisplayMode = FLOWCHART_DISPLAY_MODES.CARDS
}) => {
    const steps = Array.isArray(flowchart.steps) ? flowchart.steps : [];
    const layout = useMemo(() => createFlowchartLayout(flowchart), [flowchart]);
    const canvasRef = useRef(null);
    const dragRef = useRef(null);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

    const askAiForFlow = useCallback((prompt, options = {}) => {
        onAskAi?.({
            scope: options.scope || 'workspace',
            nodeId: options.nodeId,
            nodeIds: options.nodeIds,
            initialVisual: 'flow_chart',
            initialPrompt: prompt,
            initialExpansionTarget: options.initialExpansionTarget || 'whole_branch',
            initialChangeIntent: options.initialChangeIntent || 'update',
            initialRequestMetadata: {
                surface: 'flowchart',
                flowchart_action: options.flowchartAction || 'improve_flow',
                flowchart_lens: flowchartLens,
                flowchart_display_mode: flowchartDisplayMode,
                ...(options.metadata || {})
            }
        });
    }, [flowchartDisplayMode, flowchartLens, onAskAi]);

    const improveStepWithAi = useCallback((step) => {
        askAiForFlow(improveStepPrompt(step), {
            scope: 'node',
            nodeId: step.id,
            flowchartAction: 'improve_step',
            initialExpansionTarget: 'selected_node',
            metadata: {
                flowchart_step_id: step.id,
                flowchart_step_title: step.title || '',
                flowchart_step_kind: step.flow_kind || step.shape || 'step'
            }
        });
    }, [askAiForFlow]);

    const enhancePathsWithAi = useCallback(() => {
        const decisionNodeIds = layout.nodes
            .filter((step) => step.flow_kind === 'decision' || step.shape === 'decision')
            .map((step) => step.id)
            .filter(Boolean);
        askAiForFlow(ENHANCE_FLOW_BRANCHES_PROMPT, {
            scope: decisionNodeIds.length ? 'nodes' : 'workspace',
            nodeIds: decisionNodeIds,
            flowchartAction: 'enhance_decision_paths',
            metadata: {
                flowchart_decision_node_ids: decisionNodeIds,
                flowchart_decision_count: decisionNodeIds.length
            }
        });
    }, [askAiForFlow, layout.nodes]);

    const fitView = useCallback(() => {
        const width = canvasSize.width || canvasRef.current?.clientWidth || 0;
        const height = canvasSize.height || canvasRef.current?.clientHeight || 0;
        if (!width || !height || !layout.width || !layout.height) {
            return;
        }
        const zoom = clamp(
            Math.min((width - 64) / layout.width, (height - 64) / layout.height),
            MIN_ZOOM,
            1
        );
        setViewport({
            x: Math.round((width - layout.width * zoom) / 2),
            y: Math.round((height - layout.height * zoom) / 2),
            zoom
        });
    }, [canvasSize.height, canvasSize.width, layout.height, layout.width]);

    useEffect(() => {
        const element = canvasRef.current;
        if (!element) {
            return undefined;
        }
        const updateSize = () =>
            setCanvasSize({
                width: element.clientWidth,
                height: element.clientHeight
            });
        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(element);
        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        fitView();
    }, [fitView]);

    const zoomBy = useCallback((delta) => {
        setViewport((current) => ({
            ...current,
            zoom: clamp(Number((current.zoom + delta).toFixed(2)), MIN_ZOOM, MAX_ZOOM)
        }));
    }, []);

    const handleWheel = useCallback((event) => {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        const pointerX = event.clientX - bounds.left;
        const pointerY = event.clientY - bounds.top;
        const wheelDelta = event.deltaY * wheelDeltaMultiplier(event.deltaMode, bounds.height);

        setViewport((current) =>
            zoomViewportAroundPoint({
                viewport: current,
                pointerX,
                pointerY,
                wheelDelta,
                minZoom: MIN_ZOOM,
                maxZoom: MAX_ZOOM
            })
        );
    }, []);

    const handlePointerDown = useCallback((event) => {
        if (event.target.closest('button')) {
            return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            viewport
        };
    }, [viewport]);

    const handlePointerMove = useCallback((event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }
        setViewport({
            ...drag.viewport,
            x: drag.viewport.x + event.clientX - drag.startX,
            y: drag.viewport.y + event.clientY - drag.startY
        });
    }, []);

    const handlePointerUp = useCallback((event) => {
        const drag = dragRef.current;
        if (drag?.pointerId === event.pointerId) {
            dragRef.current = null;
        }
    }, []);

    const minimap = useMemo(() => {
        const width = 176;
        const height = 116;
        const scale = Math.min(width / Math.max(layout.width, 1), height / Math.max(layout.height, 1));
        const diagramWidth = layout.width * scale;
        const diagramHeight = layout.height * scale;
        const offsetX = (width - diagramWidth) / 2;
        const offsetY = (height - diagramHeight) / 2;
        const visibleWidth = (canvasSize.width || 0) / viewport.zoom;
        const visibleHeight = (canvasSize.height || 0) / viewport.zoom;
        return {
            width,
            height,
            scale,
            offsetX,
            offsetY,
            nodes: layout.nodes.map((node) => ({
                id: node.id,
                x: offsetX + node.x * scale,
                y: offsetY + node.y * scale,
                width: Math.max(2, node.width * scale),
                height: Math.max(2, node.height * scale)
            })),
            viewportRect: {
                x: clamp(offsetX + (-viewport.x / viewport.zoom) * scale, 0, width),
                y: clamp(offsetY + (-viewport.y / viewport.zoom) * scale, 0, height),
                width: clamp(visibleWidth * scale, 8, width),
                height: clamp(visibleHeight * scale, 8, height)
            }
        };
    }, [canvasSize.height, canvasSize.width, layout.height, layout.nodes, layout.width, viewport.x, viewport.y, viewport.zoom]);

    if (!steps.length) {
        return (
            <div className="canvas-structured-empty inline">
                <strong>No flowchart steps projected</strong>
                <span>Ask AI to infer process steps, decisions, and handoffs from the current scope.</span>
                <button
                    type="button"
                    onClick={() =>
                        onAskAi?.({
                            initialVisual: 'flow_chart',
                            initialPrompt: DRAFT_FLOW_PROMPT
                        })
                    }
                >
                    Ask AI to draft flowchart
                </button>
                <button
                    type="button"
                    onClick={() =>
                        onAddStep?.({
                            nodeType: 'process',
                            title: 'Start process'
                        })
                    }
                >
                    Add first step
                </button>
            </div>
        );
    }

    return (
        <div className="canvas-flowchart-view canvas-flowchart-diagram-view" aria-label="Flowchart">
            <div
                ref={canvasRef}
                className={`canvas-flowchart-diagram-canvas canvas-flowchart-lens-${flowchartLens} canvas-flowchart-display-${flowchartDisplayMode}`}
                role="group"
                aria-label={`${flowchart.metadata?.step_count || steps.length} step flowchart with ${flowchart.metadata?.connector_count || 0} connector paths`}
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div
                    className="canvas-flowchart-diagram-stage"
                    style={{
                        width: `${layout.width}px`,
                        height: `${layout.height}px`,
                        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`
                    }}
                >
                    <svg
                        className="canvas-flowchart-diagram-svg"
                        viewBox={`0 0 ${layout.width} ${layout.height}`}
                        aria-hidden="true"
                        focusable="false"
                    >
                        <defs>
                            <marker
                                id="canvas-flowchart-arrow"
                                markerWidth="10"
                                markerHeight="10"
                                refX="8"
                                refY="5"
                                orient="auto"
                                markerUnits="strokeWidth"
                            >
                                <path d="M 0 0 L 10 5 L 0 10 z" />
                            </marker>
                        </defs>
                        {layout.paths.map((edge) => (
                            <path
                                key={edge.id}
                                className={[
                                    'canvas-flowchart-diagram-edge',
                                    `canvas-flowchart-diagram-edge-${edge.branchKind}`,
                                    `canvas-flowchart-lens-state-${flowchartConnectorLensState(edge.connector, flowchartLens)}`,
                                    edge.exceptionPath ? 'is-exception' : ''
                                ].join(' ')}
                                d={edge.path}
                                markerEnd="url(#canvas-flowchart-arrow)"
                            />
                        ))}
                    </svg>
                    {layout.edgeLabels.map((connector) => (
                        <button
                            type="button"
                            key={connector.id}
                            className={[
                                branchClass(connector),
                                `canvas-flowchart-lens-state-${flowchartConnectorLensState(connector, flowchartLens)}`
                            ].join(' ')}
                            style={{
                                left: `${connector.x}px`,
                                top: `${connector.y}px`,
                                width: `${connector.width}px`,
                                minHeight: `${connector.height}px`
                            }}
                            title={connectorTitle(connector)}
                            aria-label={`Open ${connector.target_title || connector.target}. Branch ${connector.label || 'Next'}`}
                            onClick={() => onOpenEdge?.(connector.id)}
                        >
                            <strong>{connector.label || 'Next'}</strong>
                            {connector.condition ? <span>{connector.condition}</span> : null}
                        </button>
                    ))}
                    {layout.nodes.map((step) => (
                        <FlowchartNode
                            key={step.id}
                            step={step}
                            lens={flowchartLens}
                            onOpenNode={onOpenNode}
                            onAddStep={onAddStep}
                            onAddDecisionBranch={onAddDecisionBranch}
                            onImproveStep={improveStepWithAi}
                        />
                    ))}
                </div>
                <div className="canvas-flowchart-viewport-controls" aria-label="Flowchart zoom controls">
                    <button type="button" onClick={() => zoomBy(0.12)} aria-label="Zoom in">
                        <FiPlus aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => zoomBy(-0.12)} aria-label="Zoom out">
                        <FiMinus aria-hidden="true" />
                    </button>
                    <button type="button" onClick={fitView} aria-label="Fit flowchart">
                        <FiMaximize aria-hidden="true" />
                    </button>
                </div>
                {layout.nodes.length >= 5 ? (
                    <div className="canvas-flowchart-minimap" aria-hidden="true">
                        <svg viewBox={`0 0 ${minimap.width} ${minimap.height}`} focusable="false">
                            <rect className="canvas-flowchart-minimap-bg" x="0" y="0" width={minimap.width} height={minimap.height} rx="7" />
                            {minimap.nodes.map((node) => (
                                <rect
                                    key={node.id}
                                    className="canvas-flowchart-minimap-node"
                                    x={node.x}
                                    y={node.y}
                                    width={node.width}
                                    height={node.height}
                                    rx="1.5"
                                />
                            ))}
                            <rect
                                className="canvas-flowchart-minimap-window"
                                x={minimap.viewportRect.x}
                                y={minimap.viewportRect.y}
                                width={minimap.viewportRect.width}
                                height={minimap.viewportRect.height}
                                rx="3"
                            />
                        </svg>
                    </div>
                ) : null}
            </div>
            <aside className="canvas-flowchart-summary">
                <strong>Flow signals</strong>
                <span>Lens: {flowchartLensLabel(flowchartLens)}</span>
                <span>View: {flowchartDisplayLabel(flowchartDisplayMode)}</span>
                <span>{flowchart.metadata?.step_count || steps.length} steps</span>
                <span>{flowchart.metadata?.connector_count || 0} connectors</span>
                <span>{flowchart.metadata?.decision_count || 0} decisions</span>
                <span>{flowchart.metadata?.source_backed_count || 0} sourced</span>
                <button
                    type="button"
                    onClick={() =>
                        askAiForFlow(IMPROVE_FLOW_PROMPT, {
                            scope: 'nodes',
                            nodeIds: layout.nodes.map((step) => step.id).filter(Boolean),
                            flowchartAction: 'improve_whole_flow',
                            metadata: {
                                flowchart_step_node_ids: layout.nodes.map((step) => step.id).filter(Boolean),
                                flowchart_step_count: steps.length,
                                flowchart_connector_count: flowchart.metadata?.connector_count || 0
                            }
                        })
                    }
                >
                    Improve whole flow
                </button>
                <button
                    type="button"
                    onClick={enhancePathsWithAi}
                >
                    Enhance paths
                </button>
                <button
                    type="button"
                    onClick={() =>
                        onAddStep?.({
                            nodeType: 'process',
                            title: 'New process step'
                        })
                    }
                >
                    Add step
                </button>
                <button
                    type="button"
                    onClick={() =>
                        onAddStep?.({
                            nodeType: 'decision',
                            title: 'New decision'
                        })
                    }
                >
                    Add decision
                </button>
            </aside>
        </div>
    );
};

export default FlowchartRenderer;
