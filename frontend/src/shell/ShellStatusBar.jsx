const ShellStatusBar = ({ items = [], overrides = [] }) => {
    const visibleItems = items.filter((item) => item?.label || item?.value);
    const visibleOverrides = overrides.filter((override) => override?.label);

    if (!visibleItems.length && !visibleOverrides.length) {
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
        </div>
    );
};

export default ShellStatusBar;
