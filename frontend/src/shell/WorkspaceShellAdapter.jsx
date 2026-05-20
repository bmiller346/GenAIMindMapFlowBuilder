import ShellRibbon from './ShellRibbon.jsx';
import WorkspaceShell from './WorkspaceShell.jsx';

const WorkspaceShellAdapter = ({
    activeRibbonTab,
    bottomTray,
    bottomTrayPlaceholder,
    centerCanvas,
    leftPanel,
    leftWidth,
    onRibbonTabChange,
    overlayLayer,
    renderRibbonContent,
    rightPanel,
    rightPanelPlaceholder,
    rightWidth = '31rem'
}) => (
    <WorkspaceShell
        style={{
            '--workspace-shell-left-width': leftWidth,
            '--workspace-shell-right-width': rightWidth
        }}
        ribbon={
            <ShellRibbon
                activeTab={activeRibbonTab}
                onTabChange={onRibbonTabChange}
                renderContent={renderRibbonContent}
            />
        }
        leftPanel={leftPanel}
        centerCanvas={centerCanvas}
        rightPanel={rightPanel}
        rightPanelPlaceholder={rightPanelPlaceholder}
        bottomTray={bottomTray}
        bottomTrayPlaceholder={bottomTrayPlaceholder}
        overlayLayer={overlayLayer}
    />
);

export default WorkspaceShellAdapter;
