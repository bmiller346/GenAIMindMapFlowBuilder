/* eslint-disable react/prop-types */
import AnchoredPopover from '../../global-components/AnchoredPopover';

const FilterPopover = ({
    open,
    anchorRef,
    avoidRef,
    className = 'local-filter-popover local-canvas-popover-portal',
    filters,
    activeFilterSet,
    activeGraphFilters,
    onClose,
    onReset,
    onToggleFilter
}) => (
    <AnchoredPopover
        open={open}
        anchorRef={anchorRef}
        avoidRef={avoidRef}
        className={className}
        ariaLabel="Persisted graph filters"
        dataAttribute="local-views-popover"
    >
        <div className="local-filter-popover-header">
            <span>Node filters</span>
            <button type="button" onClick={onClose}>
                Done
            </button>
            {activeGraphFilters.length > 0 ? (
                <button type="button" onClick={onReset}>
                    Reset
                </button>
            ) : null}
        </div>
        <div className="local-filter-popover-chips">
            {filters.map((filter) => (
                <button
                    key={filter.id}
                    type="button"
                    className={activeFilterSet.has(filter.id) ? 'active' : ''}
                    onClick={() => onToggleFilter(filter.id)}
                >
                    {filter.label}
                </button>
            ))}
        </div>
    </AnchoredPopover>
);

export const ActiveScopeStrip = ({ hidden, items, onClearAll }) => {
    if (hidden) {
        return null;
    }

    return (
        <div className="local-active-filter-strip" aria-label="Current scope and filters">
            <span>Showing:</span>
            {items.length > 0 ? (
                items.map((item) => (
                    <button key={item.id} type="button" onClick={item.onClear} title="Remove">
                        {item.label} x
                    </button>
                ))
            ) : (
                <small>Whole workspace</small>
            )}
            {items.length > 0 ? (
                <button type="button" className="local-clear-scope-filters" onClick={onClearAll}>
                    Clear all
                </button>
            ) : null}
        </div>
    );
};

export default FilterPopover;
