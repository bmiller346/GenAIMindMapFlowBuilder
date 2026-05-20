import EdgeInspector from '../global-components/EdgeInspector.jsx';
import NodeInspector from '../global-components/NodeInspector.jsx';
import BranchPropertiesPanel from './BranchPropertiesPanel.jsx';
import ShellRightPanel from './ShellRightPanel.jsx';
import SourcePropertiesPanel from './SourcePropertiesPanel.jsx';

const ShellPropertiesPanelHost = ({
    edges = [],
    nodes = [],
    onClearBranch,
    onCloseBranch,
    onCloseEdge,
    onCloseNode,
    onFocusBranchNode,
    rightPanel,
    sourceLibrary = [],
    selectedNodeIssues = [],
    workspaceBrief = {}
}) => {
    const panelKind = rightPanel?.kind;
    const panelId = rightPanel?.id;

    if (!panelKind || !panelId) {
        return null;
    }

    if (rightPanel?.kind === 'branch') {
        return (
            <BranchPropertiesPanel
                branchId={panelId}
                edges={edges}
                nodes={nodes}
                onClearBranch={onClearBranch}
                onClose={onCloseBranch}
                onFocusNode={onFocusBranchNode}
            />
        );
    }

    if (rightPanel?.kind === 'source') {
        return (
            <SourcePropertiesPanel
                edges={edges}
                nodes={nodes}
                onClose={onCloseBranch}
                onSelectNode={onFocusBranchNode}
                sourceId={panelId}
                sourceLibrary={sourceLibrary}
                workspaceBrief={workspaceBrief}
            />
        );
    }

    return (
        <ShellRightPanel title={panelKind === 'edge' ? 'Relationship properties' : 'Node properties'}>
            {panelKind === 'edge' ? (
                <EdgeInspector
                    selectedEdgeId={panelId}
                    onClose={onCloseEdge}
                />
            ) : (
                <NodeInspector
                    selectedNodeId={panelId}
                    validationIssues={selectedNodeIssues}
                    onClose={onCloseNode}
                    metadataOnly
                />
            )}
        </ShellRightPanel>
    );
};

export default ShellPropertiesPanelHost;
