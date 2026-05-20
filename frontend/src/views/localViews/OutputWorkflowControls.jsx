/* eslint-disable react/prop-types */
import AnchoredPopover from '../../global-components/AnchoredPopover';

export const OutputMenuButton = ({
    buttonRef,
    className,
    open,
    active,
    label,
    onClick
}) => (
    <button
        ref={buttonRef}
        type="button"
        className={`${className} ${open || active ? 'active' : ''}`}
        onClick={onClick}
        aria-expanded={open}
    >
        <span>{label}</span>
        <span className="local-filter-menu-caret" aria-hidden="true">
            {open ? '^' : 'v'}
        </span>
    </button>
);

export const OutputWorkflowPopover = ({
    open,
    anchorRef,
    avoidRef,
    className = 'local-output-popover local-canvas-popover-portal',
    outputGroups,
    activeView,
    onClose,
    onSelectView
}) => (
    <AnchoredPopover
        open={open}
        anchorRef={anchorRef}
        avoidRef={avoidRef}
        className={className}
        ariaLabel="Workspace actions"
        dataAttribute="local-views-popover"
    >
        <div className="local-output-popover-header">
            <span>Choose what to do next</span>
            <button type="button" onClick={onClose}>
                Done
            </button>
        </div>
        <div className="local-output-groups">
            {outputGroups.map((group) => (
                <div key={group.label} className="local-output-group">
                    <strong>{group.label}</strong>
                    <div>
                        {group.views.map((view) => (
                            <button
                                key={view.id}
                                type="button"
                                className={activeView === view.id ? 'active' : ''}
                                onClick={() => onSelectView(view.id)}
                            >
                                {view.label}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    </AnchoredPopover>
);

export const NextActionPreview = ({ detail, showEmptyHint }) => {
    if (!detail) {
        return null;
    }

    return (
        <div className="local-next-action-preview">
            <div>
                <strong>{detail.title}</strong>
                <span>{detail.description}</span>
            </div>
            <div className="local-next-action-expected" aria-label="Expected result">
                {detail.expected.map((item) => (
                    <span key={item}>{item}</span>
                ))}
            </div>
            {detail.emptyHint && showEmptyHint ? <small>{detail.emptyHint}</small> : null}
        </div>
    );
};
