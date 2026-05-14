export const sourceUploadLoading = (sourceType, fileName) => ({
    title: `Adding ${sourceType} source`,
    detail: fileName
        ? `${fileName} is being uploaded, parsed, and prepared for DocMap.`
        : 'The source is being uploaded, parsed, and prepared for DocMap.',
    context: 'DocMap is extracting source text and preserving references before it updates the workspace.',
    aiContext: 'AI phase: reading the source, applying the workspace brief, and deriving reviewable structure.',
    steps: [
        'Uploading source file',
        'Extracting document text',
        'AI is reading the source',
        'AI is deriving workspace nodes'
    ]
});

export const questionAnswerLoading = (brief) => ({
    title: 'Deriving answer',
    detail: 'The AI is using connected source context and the current workspace brief.',
    context: brief?.goal
        ? `Workspace goal: ${brief.goal}`
        : 'No workspace goal is set yet.',
    aiContext: 'AI phase: grounding the answer, checking for assumptions, and preparing review metadata.',
    steps: [
        'Collecting connected context',
        'AI is reading source passages',
        'AI is reasoning over the brief',
        'Preparing answer node'
    ]
});
