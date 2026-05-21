const ShellStatusBar = ({ actions = [], items = [], overrides = [], progress = null }) => {
    const visibleActions = actions.filter((action) => action?.label && action?.onClick);
    const visibleItems = items.filter((item) => item?.label || item?.value);
    const visibleOverrides = overrides.filter((override) => override?.label);
    const visibleProgress = progress && (progress.title || progress.status || progress.latestStatus)
        ? progress
        : null;

    if (!visibleItems.length && !visibleOverrides.length && !visibleActions.length && !visibleProgress) {
        return null;
    }

    return (
        <div className="shell-status-bar" role="status" aria-label="Workspace status">
            <div className="shell-status-bar__items">
                {visibleItems.map((item) => (
                    <span
                        key={item.id || `${item.label}-${item.value}`}
                        className={`shell-status-bar__item ${item.tone ? `shell-status-bar__item--${item.tone}` : ''}`}
                    >
                        {item.label ? <span>{item.label}</span> : null}
                        {item.value ? <strong>{item.value}</strong> : null}
                    </span>
                ))}
            </div>
            {visibleOverrides.length ? (
                <div className="shell-status-bar__overrides" aria-label="Temporary view overrides">
                    {visibleOverrides.map((override) => (
                        <span
                            key={override.id || override.label}
                            className="shell-status-bar__override"
                        >
                            <span>{override.label}</span>
                            {override.onClear ? (
                                <button
                                    type="button"
                                    aria-label={`Clear ${override.label}`}
                                    onClick={override.onClear}
                                >
                                    x
                                </button>
                            ) : null}
                        </span>
                    ))}
                </div>
            ) : null}
            {visibleProgress ? (
                <div
                    className={`shell-status-bar__progress shell-status-bar__progress--${visibleProgress.status || 'running'}`}
                    aria-label="AI generation progress"
                    role={visibleProgress.onExpand ? 'button' : undefined}
                    tabIndex={visibleProgress.onExpand ? 0 : undefined}
                    title={visibleProgress.onExpand ? 'Double-click to expand AI progress' : undefined}
                    onDoubleClick={visibleProgress.onExpand}
                    onKeyDown={(event) => {
                        if (!visibleProgress.onExpand) {
                            return;
                        }
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            visibleProgress.onExpand();
                        }
                    }}
                >
                    <div className="shell-status-bar__progress-copy">
                        <span>{visibleProgress.scopeLabel || 'AI draft'}</span>
                        <strong>{visibleProgress.title || 'Ask AI is drafting'}</strong>
                        {visibleProgress.latestStatus ? <small>{visibleProgress.latestStatus}</small> : null}
                    </div>
                    <div className="shell-status-bar__progress-meter" aria-hidden="true">
                        <span style={{ width: `${Math.max(0, Math.min(Number(visibleProgress.progress) || 0, 100))}%` }} />
                    </div>
                    {visibleProgress.onExpand ? (
                        <button
                            type="button"
                            aria-label="Expand AI generation progress"
                            onClick={(event) => {
                                event.stopPropagation();
                                visibleProgress.onExpand();
                            }}
                        >
                            ^
                        </button>
                    ) : null}
                    {visibleProgress.onDismiss ? (
                        <button
                            type="button"
                            aria-label="Dismiss AI generation progress"
                            onClick={(event) => {
                                event.stopPropagation();
                                visibleProgress.onDismiss();
                            }}
                        >
                            x
                        </button>
                    ) : null}
                </div>
            ) : null}
            {visibleActions.length ? (
                <div className="shell-status-bar__actions" aria-label="Selection actions">
                    {visibleActions.map((action) => (
                        <button
                            key={action.id || action.label}
                            type="button"
                            className={action.tone ? `shell-status-bar__action shell-status-bar__action--${action.tone}` : 'shell-status-bar__action'}
                            onClick={action.onClick}
                        >
                            {action.icon ? <span aria-hidden="true">{action.icon}</span> : null}
                            {action.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
};

export default ShellStatusBar;
