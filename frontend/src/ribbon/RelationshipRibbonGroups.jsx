/* eslint-disable react/prop-types */
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

export const MindmapRelationshipRibbonGroup = ({
    options,
    mode,
    modeCounts,
    offMode,
    branchLegend,
    selectedBranchId,
    onModeChange,
    onBranchFocus
}) => (
    <section
        className="kg-relationship-controls mindmap-relationship-controls shell-ribbon-relationship-group"
        aria-label="Mind map relationship lens"
    >
        <div className="kg-relationship-header">
            <div>
                <span>Map lens</span>
                <strong>
                    {options.find((option) => option.id === mode)?.label || 'Structure Only'}
                </strong>
            </div>
        </div>
        <div className="kg-relationship-mode-buttons mindmap-relationship-mode-buttons">
            {options.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    className={mode === option.id ? 'active' : ''}
                    title={option.description}
                    onClick={() => onModeChange(option.id)}
                >
                    <span>{option.shortLabel || option.label}</span>
                    <small>
                        {option.id === offMode ? 'tree' : modeCounts[option.id] || 0}
                    </small>
                </button>
            ))}
        </div>
        {branchLegend.length ? (
            <div className="mindmap-branch-legend" aria-label="Mind map branches">
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
                        onClick={() => onBranchFocus(branch.id)}
                    >
                        <span />
                        <strong>{branch.title}</strong>
                    </button>
                ))}
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
