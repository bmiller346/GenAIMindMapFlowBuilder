/* eslint-disable react/prop-types */
const FollowUpActionsBar = ({
    compact,
    context,
    activeSourceCount,
    sourceLabel = 'active source',
    confidenceScore,
    open,
    actions,
    onToggle,
    onAction
}) => (
    <section
        className={`local-follow-up-panel ${compact ? 'local-follow-up-panel-compact' : ''}`}
        aria-label="Follow-up actions"
    >
        <div className="local-follow-up-context">
            <span>{context.summary}</span>
            <span>
                {activeSourceCount > 0
                    ? `${activeSourceCount} ${sourceLabel}${activeSourceCount === 1 ? '' : 's'}`
                    : sourceLabel === 'source' ? 'No sources' : 'No sources loaded'}
            </span>
            {typeof confidenceScore === 'number' ? <span>{confidenceScore}% confidence</span> : null}
            <button
                type="button"
                className="local-follow-up-toggle"
                onClick={onToggle}
                aria-expanded={open}
            >
                Actions {open ? '^' : 'v'}
            </button>
        </div>
        {open ? (
            <div className="local-follow-up-actions">
                {actions.map((action) => {
                    const needsSource = action.requiresSource && activeSourceCount === 0;
                    return (
                        <button
                            key={action.id}
                            type="button"
                            className={needsSource ? 'needs-source' : ''}
                            onClick={() => onAction(action)}
                        >
                            <span>{action.intent}</span>
                            <strong>{action.label}</strong>
                            <small>
                                {needsSource
                                    ? 'Add a source first, then compare or supplement this scope.'
                                    : action.description}
                            </small>
                        </button>
                    );
                })}
            </div>
        ) : null}
    </section>
);

export default FollowUpActionsBar;
