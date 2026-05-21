export const DEFAULT_SHELL_RIBBON_TABS = [
    { id: 'home', label: 'Home' },
    { id: 'map', label: 'Map' },
    { id: 'ai', label: 'AI' },
    { id: 'review', label: 'Review' },
    { id: 'sources', label: 'Sources' },
    { id: 'outputs', label: 'Outputs' }
];

const ShellRibbon = ({
    activeTab = 'home',
    onTabChange,
    showTabs = true,
    tabs = DEFAULT_SHELL_RIBBON_TABS,
    renderContent,
    children
}) => {
    const activeTabConfig = tabs.find((tab) => tab.id === activeTab) || tabs[0];
    const activeTabId = activeTabConfig?.id || activeTab;
    const activePanelId = `shell-ribbon-panel-${activeTabId}`;
    const renderedContent = renderContent?.({
        activeTab: activeTabId,
        activeTabConfig,
        tabs
    });

    return (
        <nav
            className={['shell-ribbon', showTabs ? '' : 'shell-ribbon--content-only']
                .filter(Boolean)
                .join(' ')}
            aria-label="Workspace command ribbon"
            data-testid="shell-ribbon"
            data-active-tab={activeTabId}
        >
            {showTabs ? (
                <div className="shell-ribbon__tabs" role="tablist" aria-label="Ribbon tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            id={`shell-ribbon-tab-${tab.id}`}
                            className={activeTabId === tab.id ? 'active' : ''}
                            role="tab"
                            aria-controls={`shell-ribbon-panel-${tab.id}`}
                            aria-selected={activeTabId === tab.id}
                            onClick={() => onTabChange?.(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            ) : null}
            <div
                id={activePanelId}
                className="shell-ribbon__content"
                role="tabpanel"
                aria-labelledby={`shell-ribbon-tab-${activeTabId}`}
                data-testid="shell-ribbon-content"
            >
                {renderedContent || children || (
                    <div className="shell-ribbon__placeholder" aria-label="Ribbon command groups">
                        <span>Workspace commands</span>
                    </div>
                )}
            </div>
        </nav>
    );
};

export default ShellRibbon;
