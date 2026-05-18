import {
    createOperationSnapshot,
    restoreOperationSnapshot
} from './operationSnapshots';

export const createSourceUndoSnapshot = ({ nodes, edges, viewport, workspaceBrief, mapStyle }) =>
    createOperationSnapshot({
        nodes,
        edges,
        viewport,
        workspaceBrief,
        mapStyle
    });

export const createSourceUndoHandler = ({
    activityId,
    snapshot,
    updateActivity,
    setNodes,
    setEdges,
    setWorkspaceBrief,
    setMapStyle,
    setViewPort,
    setViewport,
    context
}) => () => {
    restoreOperationSnapshot({
        snapshot,
        setNodes,
        setEdges,
        setWorkspaceBrief,
        setMapStyle,
        setViewPort,
        setViewport
    });
    updateActivity(activityId, {
        status: 'completed',
        context,
        undo: undefined
    });
};
