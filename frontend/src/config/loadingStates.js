export const sourceUploadLoading = (sourceType, fileName) => ({
    title: `Adding ${sourceType} source`,
    detail: fileName
        ? `${fileName} is being uploaded, parsed, and prepared for TraceSpace.`
        : 'The source is being uploaded, parsed, and prepared for TraceSpace.',
    context: 'TraceSpace is extracting source text and preserving references before it updates the workspace.',
    aiContext: 'AI phase: reading the source, applying the workspace brief, and deriving reviewable structure.',
    steps: [
        'Uploading source file',
        'Extracting document text',
        'AI is reading the source',
        'AI is deriving workspace nodes'
    ]
});

export const structuredSourceLoading = (sourceType, label) => ({
    title: `Connecting ${sourceType} source`,
    detail: label
        ? `${label} is being validated and prepared for TraceSpace.`
        : 'The data source is being validated and prepared for TraceSpace.',
    context: 'TraceSpace is reading the source shape and preparing it for questions and derived nodes.',
    aiContext: 'AI phase: learning the available fields, relationships, and query surface.',
    steps: [
        'Validating source',
        'Reading schema',
        'Training query context',
        'Adding source node'
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

export const briefDraftLoading = (brief) => ({
    title: 'Deriving brief draft',
    detail: 'TraceSpace is turning the workspace setup into reviewable starter nodes.',
    context: brief?.goal
        ? `Workspace goal: ${brief.goal}`
        : 'No source document is attached, so this draft will be marked for review.',
    aiContext: 'Context phase: applying the brief, marking assumptions, and preparing an undoable workspace update.',
    steps: [
        'Reading workspace setup',
        'Structuring requested outputs',
        'Marking assumptions Needs Review',
        'Updating workspace'
    ]
});
