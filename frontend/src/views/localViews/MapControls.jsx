/* eslint-disable react/prop-types */
import AnchoredPopover from '../../global-components/AnchoredPopover';
import FilterPopover from './FilterControls';
import { NextActionPreview, OutputMenuButton, OutputWorkflowPopover } from './OutputWorkflowControls';

export const MapControlPopovers = ({
    viewMenuOpen,
    viewMenuButtonRef,
    nodeViewMenuOpen,
    nodeViewMenuButtonRef,
    filtersOpen,
    filtersMenuButtonRef,
    outputMenuOpen,
    outputMenuButtonRef,
    coreViews,
    activeCanvasView,
    setActiveCanvasView,
    setViewMenuOpen,
    nodeDensityOptions,
    canvasNodeDensity,
    setCanvasNodeDensity,
    canUseNodeDensity = true,
    canReflowCanvas,
    setNodeViewMenuOpen,
    graphFilters,
    activeFilterSet,
    activeGraphFilters,
    setFiltersOpen,
    setActiveGraphFilters,
    toggleGraphFilter,
    outputGroups,
    activeView,
    setActiveView,
    setOutputMenuOpen,
    popoverClassPrefix = 'local-canvas-popover '
}) => (
    <>
        <AnchoredPopover
            open={viewMenuOpen}
            anchorRef={viewMenuButtonRef}
            className={`local-view-popover ${popoverClassPrefix}local-canvas-popover-portal`}
            ariaLabel="Canvas views"
            dataAttribute="local-views-popover"
        >
            {coreViews.map((view) => (
                <button
                    key={view.id}
                    type="button"
                    className={activeCanvasView === view.id ? 'active' : ''}
                    title={view.detail}
                    aria-label={view.ariaLabel || view.label}
                    onClick={() => {
                        setActiveCanvasView(view.id);
                        setViewMenuOpen(false);
                    }}
                >
                    <span>{view.group}</span>
                    <strong>{view.label}</strong>
                </button>
            ))}
        </AnchoredPopover>

        {canUseNodeDensity ? (
            <AnchoredPopover
                open={nodeViewMenuOpen && canUseNodeDensity}
                anchorRef={nodeViewMenuButtonRef}
                className={`local-node-view-popover ${popoverClassPrefix}local-canvas-popover-portal`}
                ariaLabel="Node display"
                dataAttribute="local-views-popover"
            >
                <div className="local-node-view-options">
                    {nodeDensityOptions.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className={canvasNodeDensity === option.id ? 'active' : ''}
                            onClick={() => setCanvasNodeDensity(option.id)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    className="local-node-view-reflow"
                    disabled={!canReflowCanvas}
                    title={
                        canReflowCanvas
                            ? 'Reflow the current map layout'
                            : 'Map reflow is available in mind map and knowledge graph views'
                    }
                    onClick={() => {
                        if (!canReflowCanvas) {
                            return;
                        }
                        window.dispatchEvent(new CustomEvent('docmap:reflow-canvas'));
                        setNodeViewMenuOpen(false);
                    }}
                >
                    Reflow map
                </button>
            </AnchoredPopover>
        ) : null}

        <FilterPopover
            open={filtersOpen}
            anchorRef={filtersMenuButtonRef}
            className={`local-filter-popover ${popoverClassPrefix}local-canvas-popover-portal`}
            filters={graphFilters}
            activeFilterSet={activeFilterSet}
            activeGraphFilters={activeGraphFilters}
            onClose={() => setFiltersOpen(false)}
            onReset={() => setActiveGraphFilters([])}
            onToggleFilter={toggleGraphFilter}
        />

        <OutputWorkflowPopover
            open={outputMenuOpen}
            anchorRef={outputMenuButtonRef}
            className={`local-output-popover ${popoverClassPrefix}local-canvas-popover-portal`}
            outputGroups={outputGroups}
            activeView={activeView}
            onClose={() => setOutputMenuOpen(false)}
            onSelectView={(viewId) => {
                setActiveView(viewId);
                setOutputMenuOpen(false);
            }}
        />
    </>
);

export const CompactMapControls = ({
    panelRef,
    activeCanvasOption,
    activeCanvasView,
    activeView,
    activeOutputOption,
    outputModeValue,
    activeGraphFilters,
    selectedBranchId,
    branchLensCandidate,
    nodes,
    refs,
    menus,
    setters,
    constants
}) => (
    <>
        <div className="local-canvas-command-main">
            <button
                ref={refs.viewMenuButtonRef}
                type="button"
                className={`local-canvas-view-button ${menus.viewMenuOpen ? 'active' : ''}`}
                onClick={() => {
                    setters.setViewMenuOpen((open) => !open);
                    setters.setOutputMenuOpen(false);
                    setters.setFiltersOpen(false);
                    setters.setNodeViewMenuOpen(false);
                }}
                aria-expanded={menus.viewMenuOpen}
                aria-label={activeCanvasOption?.ariaLabel || activeCanvasOption?.label || 'TraceSpace Map'}
            >
                <span>View</span>
                <strong>{activeCanvasOption?.label || 'Map'}</strong>
                <span className="local-filter-menu-caret" aria-hidden="true">
                    {menus.viewMenuOpen ? '^' : 'v'}
                </span>
            </button>
            <div className="local-canvas-command-controls">
                <div className="local-filter-chips local-canvas-scope">
                    <button
                        type="button"
                        className={!selectedBranchId ? 'active' : ''}
                        onClick={() => setters.setSelectedBranchId(undefined)}
                    >
                        Whole
                    </button>
                    <button
                        type="button"
                        className={selectedBranchId ? 'active' : ''}
                        disabled={!branchLensCandidate}
                        onClick={setters.applySelectedBranchScope}
                    >
                        Branch
                    </button>
                </div>
                {nodes.length > 0 && (constants.canUseNodeDensity ?? true) ? (
                    <button
                        ref={refs.nodeViewMenuButtonRef}
                        type="button"
                        className={`local-filter-menu-button local-canvas-menu-button ${menus.nodeViewMenuOpen ? 'active' : ''}`}
                        onClick={() => {
                            setters.setNodeViewMenuOpen((open) => !open);
                            setters.setViewMenuOpen(false);
                            setters.setOutputMenuOpen(false);
                            setters.setFiltersOpen(false);
                        }}
                        aria-expanded={menus.nodeViewMenuOpen}
                    >
                        <span>Nodes</span>
                        <span className="local-filter-menu-caret" aria-hidden="true">
                            {menus.nodeViewMenuOpen ? '^' : 'v'}
                        </span>
                    </button>
                ) : null}
                <OutputMenuButton
                    buttonRef={refs.outputMenuButtonRef}
                    className="local-output-menu-button local-canvas-menu-button"
                    open={menus.outputMenuOpen}
                    active={Boolean(outputModeValue)}
                    label={activeOutputOption?.label || 'Outputs'}
                    onClick={() => {
                        setters.setOutputMenuOpen((open) => !open);
                        setters.setViewMenuOpen(false);
                        setters.setFiltersOpen(false);
                        setters.setNodeViewMenuOpen(false);
                    }}
                />
                <button
                    ref={refs.filtersMenuButtonRef}
                    type="button"
                    className={`local-filter-menu-button local-canvas-menu-button ${menus.filtersOpen ? 'active' : ''}`}
                    onClick={() => {
                        setters.setFiltersOpen((open) => !open);
                        setters.setViewMenuOpen(false);
                        setters.setOutputMenuOpen(false);
                        setters.setNodeViewMenuOpen(false);
                    }}
                    aria-expanded={menus.filtersOpen}
                >
                    <span>Filters</span>
                    {activeGraphFilters.length > 0 ? <small>{activeGraphFilters.length}</small> : null}
                    <span className="local-filter-menu-caret" aria-hidden="true">
                        {menus.filtersOpen ? '^' : 'v'}
                    </span>
                </button>
            </div>
        </div>
        <MapControlPopovers
            panelRef={panelRef}
            viewMenuOpen={menus.viewMenuOpen}
            viewMenuButtonRef={refs.viewMenuButtonRef}
            nodeViewMenuOpen={menus.nodeViewMenuOpen}
            nodeViewMenuButtonRef={refs.nodeViewMenuButtonRef}
            filtersOpen={menus.filtersOpen}
            filtersMenuButtonRef={refs.filtersMenuButtonRef}
            outputMenuOpen={menus.outputMenuOpen}
            outputMenuButtonRef={refs.outputMenuButtonRef}
            coreViews={constants.coreViews}
            activeCanvasView={activeCanvasView}
            setActiveCanvasView={setters.setActiveCanvasView}
            setViewMenuOpen={setters.setViewMenuOpen}
            nodeDensityOptions={constants.nodeDensityOptions}
            canvasNodeDensity={constants.canvasNodeDensity}
            setCanvasNodeDensity={setters.setCanvasNodeDensity}
            canUseNodeDensity={constants.canUseNodeDensity ?? true}
            canReflowCanvas={constants.canReflowCanvas}
            setNodeViewMenuOpen={setters.setNodeViewMenuOpen}
            graphFilters={constants.graphFilters}
            activeFilterSet={constants.activeFilterSet}
            activeGraphFilters={activeGraphFilters}
            setFiltersOpen={setters.setFiltersOpen}
            setActiveGraphFilters={setters.setActiveGraphFilters}
            toggleGraphFilter={setters.toggleGraphFilter}
            outputGroups={constants.outputGroups}
            activeView={activeView}
            setActiveView={setters.setActiveView}
            setOutputMenuOpen={setters.setOutputMenuOpen}
        />
    </>
);

export const ExpandedMapControls = ({
    coreViewGroups,
    activeCanvasView,
    setActiveCanvasView,
    selectedBranchId,
    setSelectedBranchId,
    branchLensCandidate,
    branchLensCandidateTitle,
    selectedBranchTitle,
    applySelectedBranchScope,
    outputMenuButtonRef,
    filtersMenuButtonRef,
    outputMenuOpen,
    filtersOpen,
    setOutputMenuOpen,
    setFiltersOpen,
    outputModeValue,
    activeOutputOption,
    activeCanvasOption,
    activeGraphFilters,
    isCanvasView,
    activeNextActionDetail,
    showNextActionEmptyHint
}) => (
    <div className="local-views-toolbar">
        <div className="local-view-taxonomy" role="navigation" aria-label="Workspace lenses and outputs">
            <div className="local-view-primary-row">
                <div className="local-view-section local-view-section-views">
                    <span>Make it useful</span>
                    <div className="local-view-tabs" role="tablist" aria-label="Canvas views">
                        {coreViewGroups.map((group) => (
                            <div key={group.label} className="local-intent-group">
                                <small>{group.label}</small>
                                {group.views.map((view) => (
                                    <button
                                        key={view.id}
                                        type="button"
                                        title={view.detail}
                                        aria-label={view.ariaLabel || view.label}
                                        className={activeCanvasView === view.id ? 'active' : ''}
                                        onClick={() => setActiveCanvasView(view.id)}
                                    >
                                        {view.label}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="local-view-section local-view-section-scope">
                    <span>Scope</span>
                    <div className="local-filter-chips">
                        <button
                            type="button"
                            className={!selectedBranchId ? 'active' : ''}
                            onClick={() => setSelectedBranchId(undefined)}
                        >
                            Whole workspace
                        </button>
                        <button
                            type="button"
                            className={selectedBranchId ? 'active' : ''}
                            disabled={!branchLensCandidate}
                            onClick={applySelectedBranchScope}
                        >
                            Selected branch
                        </button>
                    </div>
                    <div className="local-scope-context">
                        <span>
                            {selectedBranchId
                                ? selectedBranchTitle || selectedBranchId
                                : branchLensCandidateTitle
                                  ? `Ready: ${branchLensCandidateTitle}`
                                  : 'Whole graph'}
                        </span>
                        {selectedBranchId ? (
                            <button type="button" onClick={() => setSelectedBranchId(undefined)}>
                                Clear
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
            <div className="local-view-output-row">
                <div className="local-view-section local-view-section-output">
                    <span>{outputModeValue ? 'Next action' : 'Improve workspace'}</span>
                    <OutputMenuButton
                        buttonRef={outputMenuButtonRef}
                        className="local-output-menu-button"
                        open={outputMenuOpen}
                        active={Boolean(outputModeValue)}
                        label={activeOutputOption?.label || `Use ${activeCanvasOption?.label || 'workspace'}`}
                        onClick={() => setOutputMenuOpen((open) => !open)}
                    />
                </div>
                <div className="local-view-section local-view-section-filters">
                    <span>Filters</span>
                    <button
                        ref={filtersMenuButtonRef}
                        type="button"
                        className={`local-filter-menu-button ${filtersOpen ? 'active' : ''}`}
                        onClick={() => setFiltersOpen((open) => !open)}
                        aria-expanded={filtersOpen}
                    >
                        <span>{filtersOpen ? 'Hide filters' : 'Node filters'}</span>
                        {activeGraphFilters.length > 0 ? <small>{activeGraphFilters.length}</small> : null}
                        <span className="local-filter-menu-caret" aria-hidden="true">
                            {filtersOpen ? '^' : 'v'}
                        </span>
                    </button>
                </div>
                {!isCanvasView ? (
                    <button
                        type="button"
                        className="local-back-to-map"
                        onClick={() => setActiveCanvasView(activeCanvasView || 'mindmap')}
                    >
                        Back to canvas
                    </button>
                ) : null}
            </div>
            <NextActionPreview detail={activeNextActionDetail} showEmptyHint={showNextActionEmptyHint} />
        </div>
    </div>
);
