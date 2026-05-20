const ShellRightPanel = ({ title = 'Properties', children }) => (
    <div className="shell-right-panel">
        <div className="shell-slot-header">
            <strong>{title}</strong>
        </div>
        <div className="shell-slot-body">
            {children || <p className="shell-slot-empty">Select a node, edge, branch, or source.</p>}
        </div>
    </div>
);

export default ShellRightPanel;
