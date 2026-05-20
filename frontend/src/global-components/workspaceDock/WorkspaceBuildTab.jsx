import WorkspaceBriefPanel from '../WorkspaceBriefPanel.jsx';
import MapStylePanel from '../MapStylePanel.jsx';
import ManualNodeControls from '../ManualNodeControls.jsx';

const WorkspaceBuildTab = () => (
    <div className="workspace-flow-controls">
        <WorkspaceBriefPanel embedded />
        <MapStylePanel />
        <ManualNodeControls />
    </div>
);

export default WorkspaceBuildTab;
