import AddDataSource from '../AddDataSource.jsx';

const WorkspaceSourcesTab = ({ onOpenSources }) => (
    <div className="workspace-dock-section">
        <div className="workspace-dock-header">
            <strong>Sources</strong>
            <button type="button" onClick={onOpenSources}>
                Library
            </button>
        </div>
        <AddDataSource />
    </div>
);

export default WorkspaceSourcesTab;
