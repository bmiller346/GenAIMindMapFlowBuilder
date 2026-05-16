const DEFAULT_WORKSPACE_NAMES = new Set(['', 'untitled workspace', 'new flow']);
const SOURCE_EXTENSION_PATTERN =
    /\.(csv|docx?|html?|jpe?g|md|mmd|mp3|mp4|pdf|png|pptx?|txt|webp|xlsx?)$/i;

const cleanWorkspaceTitleCandidate = (value) => {
    const candidate = String(value || '')
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .replace(SOURCE_EXTENSION_PATTERN, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.:,;!?()[\]{}'"`]+$/g, '')
        .trim();

    if (!candidate || DEFAULT_WORKSPACE_NAMES.has(candidate.toLowerCase())) {
        return '';
    }

    return candidate.length > 64 ? `${candidate.slice(0, 61).trim()}...` : candidate;
};

const nodeTitleCandidate = (node) =>
    cleanWorkspaceTitleCandidate(
        node?.data?.title ||
            node?.data?.label ||
            node?.data?.question ||
            node?.data?.summ ||
            node?.data?.content ||
            node?.data?.name
    );

export const isDefaultWorkspaceName = (name) =>
    DEFAULT_WORKSPACE_NAMES.has(String(name || '').trim().toLowerCase());

export const deriveAutoWorkspaceName = ({
    uploadData = {},
    sourceInput,
    fallbackTitle = '',
    sourceRecord,
    graph = {}
} = {}) => {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const nonSourceNodes = nodes.filter((node) => node?.type !== 'dataSource');
    const rootTargets = new Set(
        (Array.isArray(graph.edges) ? graph.edges : []).map((edge) => edge?.target)
    );
    const rootContentNode = nonSourceNodes.find((node) => !rootTargets.has(node?.id));
    const firstContentNode = nonSourceNodes.find(nodeTitleCandidate);

    const candidates = [
        uploadData.suggested_workspace_name,
        uploadData.title,
        rootContentNode && nodeTitleCandidate(rootContentNode),
        firstContentNode && nodeTitleCandidate(firstContentNode),
        sourceInput?.name,
        sourceInput?.content,
        fallbackTitle,
        sourceRecord?.title
    ];

    for (const candidate of candidates) {
        const cleaned = cleanWorkspaceTitleCandidate(candidate);
        if (cleaned) {
            return cleaned;
        }
    }

    return 'Untitled workspace';
};

export const chooseGeneratedWorkspaceName = ({
    uploadData,
    sourceInput,
    fallbackTitle,
    sourceRecord,
    graph,
    currentFlowName
}) => {
    const incomingName = cleanWorkspaceTitleCandidate(uploadData?.flow_name);
    if (incomingName && !isDefaultWorkspaceName(incomingName)) {
        return incomingName;
    }

    if (!isDefaultWorkspaceName(currentFlowName)) {
        return currentFlowName;
    }

    return deriveAutoWorkspaceName({
        uploadData,
        sourceInput,
        fallbackTitle,
        sourceRecord,
        graph
    });
};
