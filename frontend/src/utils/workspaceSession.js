const LAST_WORKSPACE_KEY = 'docmap.lastWorkspaceId';

export const rememberWorkspace = (flowId) => {
    try {
        if (flowId) {
            window.localStorage.setItem(LAST_WORKSPACE_KEY, flowId);
        }
    } catch {
        // Remembering a workspace is a convenience; opening still works without it.
    }
};

export const forgetWorkspace = (flowId) => {
    try {
        if (!flowId || window.localStorage.getItem(LAST_WORKSPACE_KEY) === flowId) {
            window.localStorage.removeItem(LAST_WORKSPACE_KEY);
        }
    } catch {
        // Best-effort cleanup only.
    }
};

export const getRememberedWorkspaceId = () => {
    try {
        return window.localStorage.getItem(LAST_WORKSPACE_KEY) || '';
    } catch {
        return '';
    }
};

export const selectStartupWorkspace = (flows) => {
    if (!Array.isArray(flows) || flows.length === 0) {
        return undefined;
    }

    const rememberedWorkspaceId = getRememberedWorkspaceId();
    const rememberedWorkspace = flows.find(
        (flow) => flow.flow_id === rememberedWorkspaceId
    );

    if (rememberedWorkspace) {
        return rememberedWorkspace;
    }

    return [...flows].sort((left, right) =>
        String(right.flow_id || '').localeCompare(String(left.flow_id || ''))
    )[0];
};
