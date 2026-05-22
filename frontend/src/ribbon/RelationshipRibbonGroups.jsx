/* eslint-disable react/prop-types */
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import {
    FLOWCHART_DISPLAY_OPTIONS,
    flowchartDisplayLabel
} from '../views/flowchart/flowchartDisplay.js';
import { FLOWCHART_LENS_OPTIONS, flowchartLensLabel } from '../views/flowchart/flowchartLens.js';

export const MindmapRelationshipRibbonGroup = ({
    options,
    mode,
    modeCounts,
    offMode,
    branchLegend,
    selectedBranchId,
    collapsed,
    onModeChange,
    onBranchFocus,
    onToggleCollapsed
}) => (
    <section
        className={`kg-relationship-controls mindmap-relationship-controls shell-ribbon-relationship-group ${
            collapsed ? 'mindmap-relationship-controls--collapsed' : ''
        }`}
        aria-label="Mind map relationship lens"
    >
        <div className="kg-relationship-header">
            <div>
                <span>Map lens</span>
                <strong>
                    {options.find((option) => option.id === mode)?.label || 'Structure Only'}
                </strong>
            </div>
            <button
                type="button"
                className="kg-relationship-icon-button"
                title={collapsed ? 'Expand map lens' : 'Collapse map lens'}
                aria-label={collapsed ? 'Expand map lens' : 'Collapse map lens'}
                onClick={onToggleCollapsed}
            >
                {collapsed ? <FiChevronRight /> : <FiChevronLeft />}
            </button>
        </div>
        {!collapsed ? (
            <div className="kg-relationship-mode-buttons mindmap-relationship-mode-buttons">
                {options
                    .filter((option) => option.id === mode)
                    .map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className="active"
                            title={option.description}
                            onClick={() => onModeChange(option.id)}
                        >
                            <span>{option.shortLabel || option.label}</span>
                            <small>
                                {option.id === offMode ? 'tree' : modeCounts[option.id] || 0}
                            </small>
                        </button>
                    ))}
                <button
                    type="button"
                    className="mindmap-relationship-more-button"
                    popovertarget="mindmap-relationship-mode-popover"
                >
                    <span>Modes</span>
                </button>
                {branchLegend.length ? (
                    <button
                        type="button"
                        className="mindmap-relationship-more-button"
                        popovertarget="mindmap-branch-popover"
                    >
                        <span>Branches</span>
                        <small>{branchLegend.length}</small>
                    </button>
                ) : null}
            </div>
        ) : null}
        {!collapsed ? (
            <div
                id="mindmap-relationship-mode-popover"
                className="mindmap-relationship-mode-popover"
                popover="auto"
            >
                <span>Map lens modes</span>
                <div>
                    {options.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className={mode === option.id ? 'active' : ''}
                            title={option.description}
                            popovertarget="mindmap-relationship-mode-popover"
                            popovertargetaction="hide"
                            onClick={() => onModeChange(option.id)}
                        >
                            <span>{option.shortLabel || option.label}</span>
                            <small>
                                {option.id === offMode ? 'tree' : modeCounts[option.id] || 0}
                            </small>
                        </button>
                    ))}
                </div>
            </div>
        ) : null}
        {!collapsed && branchLegend.length ? (
            <div
                id="mindmap-branch-popover"
                className="mindmap-relationship-mode-popover mindmap-branch-popover"
                popover="auto"
            >
                <span>Map branches</span>
                <div>
                    {branchLegend.map((branch) => (
                        <button
                            key={branch.id}
                            type="button"
                            className={[
                                `canvas-branch-color-${branch.colorIndex}`,
                                selectedBranchId === branch.id ? 'active' : ''
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            title={`Focus ${branch.title}`}
                            popovertarget="mindmap-branch-popover"
                            popovertargetaction="hide"
                            onClick={() => onBranchFocus(branch.id)}
                        >
                            <span />
                            <strong>{branch.title}</strong>
                        </button>
                    ))}
                </div>
            </div>
        ) : null}
    </section>
);

export const KnowledgeGraphRelationshipRibbonGroup = ({
    options,
    mode,
    modeCounts,
    collapsed,
    topInsights,
    onModeChange,
    onToggleCollapsed,
    onOpenInsight
}) => (
    <section
        className={`kg-relationship-controls shell-ribbon-relationship-group ${
            collapsed ? 'kg-relationship-controls--collapsed' : ''
        }`}
        aria-label="Knowledge graph relationship focus"
    >
        <div className="kg-relationship-header">
            <div>
                <span>KG focus</span>
                <strong>
                    {options.find((option) => option.id === mode)?.label || 'Insight Focus'}
                </strong>
            </div>
            <button
                type="button"
                className="kg-relationship-icon-button"
                title={collapsed ? 'Expand relationship tray' : 'Collapse relationship tray'}
                aria-label={collapsed ? 'Expand relationship tray' : 'Collapse relationship tray'}
                onClick={onToggleCollapsed}
            >
                {collapsed ? <FiChevronRight /> : <FiChevronLeft />}
            </button>
        </div>
        <div className="kg-relationship-mode-buttons">
            {options.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    className={mode === option.id ? 'active' : ''}
                    title={option.description}
                    onClick={() => onModeChange(option.id)}
                >
                    <span>{option.shortLabel || option.label}</span>
                    <small>{modeCounts[option.id] || 0}</small>
                </button>
            ))}
        </div>
        {!collapsed ? (
            <>
                <div className="kg-top-insights" aria-label="Knowledge graph top insights">
                    {topInsights.length ? (
                        topInsights.map((insight) => (
                            <button
                                key={insight.id}
                                type="button"
                                title={insight.rationale || `${insight.sourceTitle} ${insight.relationship} ${insight.targetTitle}`}
                                onClick={() => onOpenInsight(insight.id)}
                            >
                                <span>{insight.familyLabel}</span>
                                <strong>{insight.sourceTitle}</strong>
                                <small>
                                    {insight.relationship} {insight.targetTitle}
                                </small>
                            </button>
                        ))
                    ) : (
                        <p>No accepted relationships in this focus yet.</p>
                    )}
                </div>
                <p className="kg-relationship-hint">
                    Use Outputs / Connections for the review table and copy or download export.
                </p>
            </>
        ) : null}
    </section>
);

export const FlowchartLensRibbonGroup = ({
    mode,
    displayMode,
    onModeChange,
    onDisplayModeChange
}) => (
    <section
        className="kg-relationship-controls flowchart-lens-ribbon-group shell-ribbon-relationship-group"
        aria-label="Flowchart lens"
    >
        <div className="kg-relationship-header">
            <div>
                <span>Flowchart lens</span>
                <strong>{flowchartLensLabel(mode)}</strong>
            </div>
        </div>
        <div className="kg-relationship-mode-buttons flowchart-lens-mode-buttons">
            {FLOWCHART_LENS_OPTIONS.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    className={mode === option.id ? 'active' : ''}
                    onClick={() => onModeChange(option.id)}
                >
                    <span>{option.label}</span>
                </button>
            ))}
            <button
                type="button"
                className="flowchart-display-menu-button"
                popovertarget="flowchart-display-popover"
                title="Flowchart display mode"
            >
                <span>{flowchartDisplayLabel(displayMode)}</span>
            </button>
        </div>
        <div
            id="flowchart-display-popover"
            className="mindmap-relationship-mode-popover flowchart-display-popover"
            popover="auto"
        >
            <span>Flow view</span>
            <div>
                {FLOWCHART_DISPLAY_OPTIONS.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        className={displayMode === option.id ? 'active' : ''}
                        title={option.description}
                        popovertarget="flowchart-display-popover"
                        popovertargetaction="hide"
                        onClick={() => onDisplayModeChange(option.id)}
                    >
                        <span>{option.label}</span>
                    </button>
                ))}
            </div>
        </div>
    </section>
);
