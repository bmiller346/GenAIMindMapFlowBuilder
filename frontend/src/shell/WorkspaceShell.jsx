const renderSlot = (slot) => (slot ? slot : null);

const WorkspaceShell = ({
    ribbon,
    leftPanel,
    centerCanvas,
    rightPanel,
    rightPanelPlaceholder,
    bottomTray,
    bottomTrayPlaceholder,
    overlayLayer,
    style
}) => {
    const hasLeftPanel = Boolean(leftPanel);
    const hasRightPanel = Boolean(rightPanel || rightPanelPlaceholder);
    const hasBottomTray = Boolean(bottomTray || bottomTrayPlaceholder);

    return (
        <div
            className={[
                'workspace-shell',
                hasLeftPanel ? 'workspace-shell--has-left' : '',
                hasRightPanel ? 'workspace-shell--has-right' : '',
                hasBottomTray ? 'workspace-shell--has-bottom' : ''
            ]
                .filter(Boolean)
                .join(' ')}
            style={style}
            data-testid="workspace-shell"
            data-has-left-panel={hasLeftPanel ? 'true' : 'false'}
            data-has-right-panel={hasRightPanel ? 'true' : 'false'}
            data-has-bottom-tray={hasBottomTray ? 'true' : 'false'}
        >
            <div className="workspace-shell__ribbon" data-testid="workspace-shell-ribbon-slot">
                {renderSlot(ribbon)}
            </div>
            {hasLeftPanel ? (
                <aside
                    className="workspace-shell__left"
                    aria-label="Workspace navigator"
                    data-testid="workspace-shell-left-slot"
                >
                    {leftPanel}
                </aside>
            ) : null}
            <main
                className="workspace-shell__canvas"
                aria-label="Workspace canvas"
                data-testid="workspace-shell-canvas-slot"
            >
                {renderSlot(centerCanvas)}
            </main>
            {hasRightPanel ? (
                <aside
                    className="workspace-shell__right"
                    aria-label="Properties panel"
                    data-testid="workspace-shell-right-slot"
                >
                    {rightPanel || rightPanelPlaceholder}
                </aside>
            ) : null}
            {hasBottomTray ? (
                <section
                    className="workspace-shell__bottom"
                    aria-label="Review tray"
                    data-testid="workspace-shell-bottom-slot"
                >
                    {bottomTray || bottomTrayPlaceholder}
                </section>
            ) : null}
            <div
                className="workspace-shell__overlay"
                aria-live="polite"
                data-testid="workspace-shell-overlay-slot"
            >
                {renderSlot(overlayLayer)}
            </div>
        </div>
    );
};

export default WorkspaceShell;
