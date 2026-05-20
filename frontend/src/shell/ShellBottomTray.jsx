const ShellBottomTray = ({ title = 'Review', children }) => (
    <div className="shell-bottom-tray">
        <div className="shell-slot-header">
            <strong>{title}</strong>
        </div>
        <div className="shell-slot-body">
            {children || <p className="shell-slot-empty">Reviewable work will appear here.</p>}
        </div>
    </div>
);

export default ShellBottomTray;
