import { useMemo } from 'react';
import FlowchartShape from './FlowchartShape.jsx';
import { createFlowchartLayout, summaryText } from './flowchartLayout.js';
import './FlowchartRenderer.css';

const IMPROVE_FLOW_PROMPT =
    'Improve this flowchart with clearer step order, decision paths, dependencies, handoffs, and source-backed review notes.';
const DRAFT_FLOW_PROMPT =
    'Create a flowchart from this workspace with ordered steps, decision points, dependencies, handoffs, exception paths, and source-backed review notes.';

const connectorTitle = (connector = {}) =>
    [connector.label, connector.condition, connector.target_title].filter(Boolean).join(' | ');

const branchClass = (connector = {}) =>
    `canvas-flowchart-diagram-edge-label canvas-flowchart-diagram-edge-label-${connector.branch_kind || 'default'}`;

const FlowchartNode = ({ step, onOpenNode }) => {
    const description = summaryText(step);
    const shapeLabel = step.shape === 'terminator' ? 'Terminator' : step.shape;

    return (
        <article
            className={[
                'canvas-flowchart-diagram-node',
                `canvas-flowchart-diagram-node-${step.flow_kind || 'step'}`,
                `canvas-flowchart-diagram-shape-${step.shape || 'process'}`
            ].join(' ')}
            style={{
                left: `${step.x}px`,
                top: `${step.y}px`,
                width: `${step.width}px`,
                height: `${step.height}px`
            }}
            aria-label={`${shapeLabel} flowchart step: ${step.title}`}
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
                <small>{step.source_backed ? 'Source-backed' : 'Needs source review'}</small>
            </div>
            {description ? <p>{description}</p> : null}
        </article>
    );
};

const FlowchartRenderer = ({ flowchart = {}, onOpenNode, onAskAi }) => {
    const steps = Array.isArray(flowchart.steps) ? flowchart.steps : [];
    const layout = useMemo(() => createFlowchartLayout(flowchart), [flowchart]);

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
            </div>
        );
    }

    return (
        <div className="canvas-flowchart-view canvas-flowchart-diagram-view" aria-label="Flowchart">
            <div
                className="canvas-flowchart-diagram-canvas"
                role="group"
                aria-label={`${flowchart.metadata?.step_count || steps.length} step flowchart with ${flowchart.metadata?.connector_count || 0} connector paths`}
            >
                <div
                    className="canvas-flowchart-diagram-stage"
                    style={{ width: `${layout.width}px`, height: `${layout.height}px` }}
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
                            className={branchClass(connector)}
                            style={{
                                left: `${connector.x}px`,
                                top: `${connector.y}px`,
                                width: `${connector.width}px`,
                                minHeight: `${connector.height}px`
                            }}
                            title={connectorTitle(connector)}
                            aria-label={`Open ${connector.target_title || connector.target}. Branch ${connector.label || 'Next'}`}
                            onClick={() => onOpenNode?.(connector.target)}
                        >
                            <strong>{connector.label || 'Next'}</strong>
                            {connector.condition ? <span>{connector.condition}</span> : null}
                        </button>
                    ))}
                    {layout.nodes.map((step) => (
                        <FlowchartNode key={step.id} step={step} onOpenNode={onOpenNode} />
                    ))}
                </div>
            </div>
            <aside className="canvas-flowchart-summary">
                <strong>Flow signals</strong>
                <span>{flowchart.metadata?.step_count || steps.length} steps</span>
                <span>{flowchart.metadata?.connector_count || 0} connectors</span>
                <span>{flowchart.metadata?.decision_count || 0} decisions</span>
                <span>{flowchart.metadata?.source_backed_count || 0} sourced</span>
                <button
                    type="button"
                    onClick={() =>
                        onAskAi?.({
                            initialVisual: 'flow_chart',
                            initialPrompt: IMPROVE_FLOW_PROMPT
                        })
                    }
                >
                    Ask AI to improve flow
                </button>
            </aside>
        </div>
    );
};

export default FlowchartRenderer;
