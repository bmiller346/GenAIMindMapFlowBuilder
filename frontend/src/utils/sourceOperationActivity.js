import {
    createOperationSnapshot,
    restoreOperationSnapshot
} from './operationSnapshots';

export const createSourceUndoSnapshot = ({ nodes, edges, viewport, workspaceBrief }) =>
    createOperationSnapshot({
        nodes,
        edges,
        viewport,
        workspaceBrief
    });

export const createSourceUndoHandler = ({
    activityId,
    snapshot,
    updateActivity,
    setNodes,
    setEdges,
    setWorkspaceBrief,
    setViewPort,
    setViewport,
    context
}) => () => {
    restoreOperationSnapshot({
        snapshot,
        setNodes,
        setEdges,
        setWorkspaceBrief,
        setViewPort,
        setViewport
    });
    updateActivity(activityId, {
        status: 'completed',
        context,
        undo: undefined
    });
};
