const ShellLeftRail = ({ title = 'Workspace', children }) => (
    <div className="shell-left-rail">
        <div className="shell-slot-header">
            <strong>{title}</strong>
        </div>
        <div className="shell-slot-body">
            {children || <p className="shell-slot-empty">Workspace navigator slot.</p>}
        </div>
    </div>
);

export default ShellLeftRail;
