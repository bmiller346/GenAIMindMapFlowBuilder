const SOURCE_SET_COMPONENT_PREFIX = 'source-set';

const extensionFromName = (name = '') => {
    const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1] || 'source';
};

const sourceTypeLabel = (type = '') => {
    const normalized = String(type || '').toLowerCase();
    const labels = {
        docx: 'DOCX',
        html: 'HTML',
        md: 'Markdown',
        markdown: 'Markdown',
        pdf: 'PDF',
        pptx: 'PPTX',
        txt: 'Text'
    };
    return labels[normalized] || (normalized ? normalized.toUpperCase() : 'Source');
};

const stablePathToken = (path = '', index = 0) =>
    String(path || `source-${index + 1}`)
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || `source-${index + 1}`;

export const selectedSourceSetFiles = (fileList) =>
    Array.from(fileList || [])
        .filter(Boolean)
        .map((file) => ({
            file,
            relativePath: file.webkitRelativePath || file.relativePath || file.name || 'Untitled source'
        }));

export const buildBoundedSelectedSourcesForAI = (
    sources = [],
    { maxSources = 6, maxChunks = 36, maxChunksPerSource = 10 } = {}
) => {
    const selectedSources = Array.isArray(sources) ? sources.filter(Boolean) : [];
    if (!selectedSources.length) {
        return [];
    }

    let remainingChunks = maxChunks;
    return selectedSources.slice(0, maxSources).map((source) => {
        const chunks = Array.isArray(source.chunks) ? source.chunks : [];
        const sourceRefs = Array.isArray(source.source_refs) ? source.source_refs : [];
        const chunkLimit = Math.max(0, Math.min(maxChunksPerSource, remainingChunks));
        const boundedChunks = chunks.slice(0, chunkLimit);
        remainingChunks -= boundedChunks.length;

        return {
            ...source,
            chunks: boundedChunks,
            source_refs: sourceRefs,
            metadata: {
                ...(source.metadata || {}),
                source_context_bounded: true,
                source_context_original_chunk_count: chunks.length,
                source_context_sent_chunk_count: boundedChunks.length,
                source_context_preserve_refs_only: true
            }
        };
    });
};

export const appendSourceSetFormData = (
    formData,
    { files = [], flowId, operationId, sourceIntent = 'source_set_review' } = {}
) => {
    files.forEach(({ file, relativePath }) => {
        formData.append('files', file);
        formData.append('relative_paths', relativePath);
    });
    formData.append('relative_paths_json', JSON.stringify(files.map((entry) => entry.relativePath)));
    formData.append('flow_id', flowId);
    formData.append('source_intent', sourceIntent);
    formData.append('operation_id', operationId);
    return formData;
};

const sourceDocumentsFromResponse = (data = {}) => {
    const graph =
        typeof data.mindmap_json === 'string'
            ? (() => {
                  try {
                      return JSON.parse(data.mindmap_json);
                  } catch (error) {
                      return {};
                  }
              })()
            : data.mindmap_json || {};
    const graphLibrary = graph.source_library || {};

    return [
        data.uploaded_sources,
        data.sources,
        data.documents,
        data.source_library?.documents,
        graphLibrary.documents,
        graph.source_library
    ].find((candidate) => Array.isArray(candidate)) || [];
};

export const normalizeSourceSetUploadResult = ({
    data = {},
    selectedFiles = [],
    flowId = ''
} = {}) => {
    const returnedSources = sourceDocumentsFromResponse(data);
    const selectedPaths = new Set(
        selectedFiles.flatMap((entry) =>
            [
                entry.relativePath,
                entry.file?.name,
                entry.relativePath?.split('/').pop()
            ].filter(Boolean)
        )
    );
    const returnedSelectedSources = selectedPaths.size
        ? returnedSources.filter((source = {}) =>
              [
                  source.relative_path,
                  source.path,
                  source.metadata?.relative_path,
                  source.metadata?.path,
                  source.title,
                  source.filename,
                  source.original_filename
              ].some((value) => selectedPaths.has(value))
          )
        : returnedSources;
    const responseCandidates = returnedSelectedSources.length ? returnedSelectedSources : returnedSources;
    const sourceSetId =
        data.source_set?.id || data.source_set_id || data.component_id || 'workspace-source-set';
    const candidates = responseCandidates.length
        ? responseCandidates
        : selectedFiles.map((entry) => ({
              filename: entry.file?.name,
              original_filename: entry.file?.name,
              relative_path: entry.relativePath,
              size: entry.file?.size,
              type: extensionFromName(entry.file?.name)
          }));

    return candidates.map((source, index) => {
        const selected = selectedFiles[index] || {};
        const relativePath =
            source.relative_path ||
            source.path ||
            source.metadata?.relative_path ||
            source.metadata?.path ||
            selected.relativePath ||
            source.filename ||
            source.title ||
            selected.file?.name ||
            `source-${index + 1}`;
        const title =
            source.title ||
            source.filename ||
            source.original_filename ||
            selected.file?.name ||
            relativePath.split('/').pop() ||
            'Uploaded source';
        const type = source.type || extensionFromName(title);
        const componentId =
            source.component_id ||
            `${SOURCE_SET_COMPONENT_PREFIX}-${stablePathToken(relativePath, index)}`;
        const id =
            source.id ||
            source.document_id ||
            source.source_document_id ||
            source.normalized_document_id ||
            componentId;

        return {
            id,
            title,
            type,
            type_label: source.type_label || sourceTypeLabel(type),
            status: source.status || 'uploaded',
            node_id: source.node_id || componentId,
            component_id: componentId,
            flow_id: source.flow_id || data.flow_id || flowId || '',
            file_hash: source.file_hash || source.metadata?.file_hash || data.file_hash || '',
            path: relativePath,
            size: source.size || source.metadata?.size || selected.file?.size || 0,
            version: source.version || source.metadata?.version || '',
            metadata: {
                ...(source.metadata || {}),
                ...source,
                id,
                document_id: id,
                filename: source.filename || title,
                original_filename: source.original_filename || selected.file?.name || title,
                type,
                path: relativePath,
                relative_path: relativePath,
                source_set_id: source.source_set_id || sourceSetId,
                source_set: source.source_set || data.source_set || {}
            },
            chunks: Array.isArray(source.chunks)
                ? source.chunks
                : Array.isArray(source.document_chunks)
                  ? source.document_chunks
                  : [],
            segments: Array.isArray(source.segments)
                ? source.segments
                : Array.isArray(source.source_segments)
                  ? source.source_segments
                  : [],
            source_refs: Array.isArray(source.source_refs)
                ? source.source_refs
                : Array.isArray(source.metadata?.source_refs)
                  ? source.metadata.source_refs
                  : [],
            normalized_document_id:
                source.normalized_document_id || source.document_id || source.source_document_id || '',
            file: selected.file,
            source_set_id: source.source_set_id || sourceSetId,
            source_set: source.source_set || data.source_set || {}
        };
    });
};

export const sourceSetNodesFromRecords = (records = [], flowId = '') =>
    records.map((source, index) => ({
        id: source.component_id,
        position: { x: 0, y: index * 120 },
        type: 'dataSource',
        data: {
            name: source.type || 'source',
            content: source.title,
            flow_id: source.flow_id || flowId,
            prompt: 'Source set review',
            file: source.file,
            component_id: source.component_id,
            source_document_id: source.id,
            source_document: source.metadata,
            document_chunks: source.chunks,
            source_segments: source.segments,
            source_refs: source.source_refs || [],
            relative_path: source.path,
            source_set_id: source.source_set_id,
            source_set: source.source_set || source.metadata?.source_set || {},
            source_set_upload: true
        }
    }));
