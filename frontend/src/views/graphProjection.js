import { getWorkspaceNodeData } from '../utils/manualNodes.js';

const TASK_CAPABLE_TYPES = new Set([
    'task',
    'procedure',
    'workflow',
    'needs_review',
    'requirement'
]);

const getNestedData = (node) => {
    const data = node?.data || {};
    return data.data && typeof data.data === 'object' ? data.data : {};
};

const firstValue = (node, keys, fallback = '') => {
    const data = node?.data || {};
    const nestedData = getNestedData(node);

    for (const key of keys) {
        const value = data[key] ?? nestedData[key];
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return fallback;
};

const sourceRefs = (node) => {
    const data = node?.data || {};
    const nestedData = getNestedData(node);
    const refs = data.source_refs || nestedData.source_refs;

    return Array.isArray(refs) ? refs.filter(Boolean) : [];
};

const firstSourceRef = (node) => {
    const refs = sourceRefs(node);

    return refs[0] || {};
};

const tableRows = (node) => {
    const nestedData = getNestedData(node);
    const rows = node?.data?.df ?? nestedData.df;

    return Array.isArray(rows) ? rows : [];
};

const tableColumns = (rows) =>
    Array.from(
        rows.reduce((columns, row) => {
            Object.keys(row || {}).forEach((key) => columns.add(key));
            return columns;
        }, new Set())
    );

const hasSourceDocument = (sourceRef) => Boolean(sourceRef?.document_id);

const hasCompleteSourceRef = (sourceRef) =>
    Boolean(
        sourceRef?.document_id &&
            (sourceRef?.page || sourceRef?.section || sourceRef?.quote_snippet)
    );

const sourceRefIssues = (sourceRef) => {
    const issues = [];

    if (!sourceRef?.document_id) {
        issues.push('Missing source document');
        return issues;
    }
    if (!sourceRef.page && !sourceRef.section) {
        issues.push('Missing source location');
    }
    if (!sourceRef.quote_snippet) {
        issues.push('Missing source quote');
    }
    if (!sourceRef.confidence) {
        issues.push('Missing source confidence');
    }

    return issues;
};

export const normalizeGraphNode = (node) => {
    const workspaceData = getWorkspaceNodeData(node);
    const sourceRef = firstSourceRef(node);
    const rows = tableRows(node);
    const nodeType =
        workspaceData.nodeType ||
        firstValue(node, ['node_type', 'component_type', 'name']) ||
        (node?.type === 'pdfResponse' || node?.type === 'response'
            ? 'concept'
            : node?.type || 'concept');

    return {
        id: node?.id || '',
        title:
            workspaceData.title ||
            firstValue(
                node,
                ['title', 'question', 'content', 'prompt', 'answer', 'summ'],
                node?.type || 'Untitled Node'
            ),
        summary: workspaceData.body || firstValue(node, ['summary', 'summ', 'answer']),
        node_type: nodeType,
        status: workspaceData.status || firstValue(node, ['status'], 'ai_generated'),
        priority: workspaceData.priority || firstValue(node, ['priority']),
        owner_id: workspaceData.ownerId || firstValue(node, ['owner_id', 'assignee', 'owner']),
        due_date: workspaceData.dueDate || firstValue(node, ['due_date']),
        confidence:
            workspaceData.confidence ||
            firstValue(node, ['confidence'], sourceRef.confidence || ''),
        source_ref: sourceRef,
        source_refs: workspaceData.sourceRefs.length ? workspaceData.sourceRefs : sourceRefs(node),
        table_rows: workspaceData.df.length ? workspaceData.df : rows,
        table_columns: tableColumns(workspaceData.df.length ? workspaceData.df : rows),
        is_manual: workspaceData.manual,
        display: workspaceData.display,
        react_flow_type: node?.type || ''
    };
};

const SOURCE_TYPE_LABELS = {
    pdf: 'PDF',
    docx: 'DOCX',
    md: 'Markdown',
    txt: 'Text',
    web: 'Web',
    html: 'HTML',
    img: 'Image',
    image: 'Image',
    audio: 'Audio',
    video: 'Video',
    youtube: 'YouTube',
    pptx: 'PowerPoint',
    csv: 'CSV',
    sql: 'SQL',
    brief: 'Brief'
};

const sourceTypeLabel = (type = '') => SOURCE_TYPE_LABELS[type] || type || 'Source';

const sourceTitle = (data = {}) =>
    data.source_document?.original_filename ||
    data.source_document?.filename ||
    data.original_name ||
    data.file?.name ||
    data.filename ||
    data.title ||
    data.content ||
    data.data?.title ||
    data.data?.content ||
    'Untitled source';

const sourceIdFromData = (node) => {
    const data = node?.data || {};

    return (
        data.source_document_id ||
        data.source_document?.id ||
        data.document_id ||
        data.component_id ||
        node?.id
    );
};

const normalizePersistedSource = (source = {}) => ({
    id: source.id || source.source_document_id || source.document_id || '',
    title: source.title || source.name || source.filename || 'Untitled source',
    type: source.type || '',
    type_label: source.type_label || sourceTypeLabel(source.type),
    status: source.status || 'uploaded',
    node_id: source.node_id || '',
    component_id: source.component_id || '',
    flow_id: source.flow_id || '',
    file_hash: source.file_hash || source.metadata?.file_hash || '',
    size: source.size || source.metadata?.size || 0,
    version: source.version || source.metadata?.version || '',
    metadata: source.metadata || {},
    chunks: Array.isArray(source.chunks) ? source.chunks : [],
    segments: Array.isArray(source.segments) ? source.segments : [],
    normalized_document_id: source.normalized_document_id || ''
});

const sourceRecordFromNode = (node) => {
    const data = node?.data || {};
    const type = data.source_document?.type || data.name || node?.type || '';

    return normalizePersistedSource({
        id: sourceIdFromData(node),
        title: sourceTitle(data),
        type,
        type_label: sourceTypeLabel(type),
        status: data.status || (data.source_document ? 'parsed' : 'uploaded'),
        node_id: node?.id || '',
        component_id: data.component_id || node?.id || '',
        flow_id: data.flow_id || '',
        file_hash: data.file_hash || data.source_document?.file_hash || '',
        size: data.size || data.source_document?.size || data.file?.size || 0,
        version: data.source_document?.version || '',
        metadata: data.source_document || {},
        chunks: Array.isArray(data.document_chunks) ? data.document_chunks : [],
        segments: Array.isArray(data.source_segments) ? data.source_segments : []
    });
};

const mergeSourceRecord = (current = {}, next = {}) => ({
    ...current,
    ...next,
    id: current.id || next.id,
    title: current.title && current.title !== 'Untitled source' ? current.title : next.title,
    type: current.type || next.type,
    type_label: current.type_label || next.type_label,
    status: next.status || current.status,
    chunks: current.chunks?.length ? current.chunks : next.chunks || [],
    segments: current.segments?.length ? current.segments : next.segments || []
});

const sourceRecordFromRef = (ref) => ({
    id: ref.document_id,
    title: ref.document_id,
    type: ref.type || '',
    type_label: sourceTypeLabel(ref.type),
    status: 'used in graph',
    node_id: '',
    component_id: '',
    metadata: {},
    chunks: [],
    segments: []
});

const sourceLocationLabel = (ref = {}) =>
    [ref.page ? `p. ${ref.page}` : '', ref.section].filter(Boolean).join(' | ');

export const buildSourceLibraryProjection = (
    nodes,
    edges,
    workspaceBrief = {},
    persistedSources = []
) => {
    const projection = buildGraphProjection(nodes, edges);
    const sourceMap = new Map();
    const uploadedSources = nodes.filter((node) => node.type === 'dataSource').map(sourceRecordFromNode);
    const citingNodesBySource = new Map();
    const snippetsBySource = new Map();
    const incompleteRefs = [];
    const uncitedNodes = [];

    persistedSources.map(normalizePersistedSource).forEach((source) => {
        if (source.id) {
            sourceMap.set(source.id, mergeSourceRecord(sourceMap.get(source.id), source));
        }
    });

    uploadedSources.forEach((source) => {
        sourceMap.set(source.id, mergeSourceRecord(sourceMap.get(source.id), source));
    });

    const sourceIdForRef = (ref) => {
        if (!ref?.document_id) {
            return '';
        }
        if (sourceMap.has(ref.document_id) || uploadedSources.length !== 1) {
            return ref.document_id;
        }

        const uploadedSource = uploadedSources[0];
        sourceMap.set(
            uploadedSource.id,
            mergeSourceRecord(sourceMap.get(uploadedSource.id), {
                ...sourceRecordFromRef(ref),
                id: uploadedSource.id,
                normalized_document_id: ref.document_id
            })
        );
        return uploadedSource.id;
    };

    projection.nodes.forEach((node) => {
        if (node.react_flow_type === 'dataSource') {
            return;
        }

        const refs = node.source_refs || [];
        if (refs.length === 0) {
            uncitedNodes.push(node);
            return;
        }

        refs.forEach((ref) => {
            if (!ref?.document_id) {
                incompleteRefs.push({ node, ref, issues: sourceRefIssues(ref) });
                return;
            }

            const sourceId = sourceIdForRef(ref);

            sourceMap.set(
                sourceId,
                mergeSourceRecord(sourceMap.get(sourceId), sourceRecordFromRef(ref))
            );

            const citingNodes = citingNodesBySource.get(sourceId) || [];
            citingNodes.push({
                ...node,
                source_ref: ref,
                source_location: sourceLocationLabel(ref)
            });
            citingNodesBySource.set(sourceId, citingNodes);

            if (ref.quote_snippet) {
                const snippets = snippetsBySource.get(sourceId) || [];
                snippets.push({
                    node_id: node.id,
                    node_title: node.title,
                    location: sourceLocationLabel(ref),
                    text: ref.quote_snippet
                });
                snippetsBySource.set(sourceId, snippets);
            }

            const issues = sourceRefIssues(ref);
            if (issues.length > 0) {
                incompleteRefs.push({ node, ref, issues });
            }
        });
    });

    if (sourceMap.size === 0 && workspaceBrief?.configured) {
        sourceMap.set('brief-only', {
            id: 'brief-only',
            title: workspaceBrief.goal || 'Workspace brief',
            type: 'brief',
            type_label: 'Brief',
            status: 'brief only',
            metadata: workspaceBrief,
            chunks: [],
            segments: []
        });
    }

    const sources = Array.from(sourceMap.values())
        .map((source) => {
            const citingNodes = citingNodesBySource.get(source.id) || [];
            const snippets = snippetsBySource.get(source.id) || [];
            const status = citingNodes.length > 0 ? 'used in graph' : source.status;

            return {
                ...source,
                status,
                coverage_count: citingNodes.length,
                citing_nodes: citingNodes,
                snippets,
                chunk_count: source.chunks?.length || 0,
                segment_count: source.segments?.length || 0
            };
        })
        .sort((a, b) => b.coverage_count - a.coverage_count || a.title.localeCompare(b.title));

    return {
        sources,
        uncited_nodes: uncitedNodes,
        incomplete_refs: incompleteRefs,
        total_graph_nodes: projection.nodes.filter((node) => node.react_flow_type !== 'dataSource').length,
        cited_node_count: projection.nodes.filter(
            (node) => node.react_flow_type !== 'dataSource' && node.source_refs?.some((ref) => ref?.document_id)
        ).length
    };
};

export const createSourceLibrarySnapshot = ({
    nodes = [],
    edges = [],
    workspaceBrief = {},
    sourceLibrary = []
}) =>
    buildSourceLibraryProjection(nodes, edges, workspaceBrief, sourceLibrary).sources.map(
        ({
            citing_nodes,
            snippets,
            coverage_count,
            chunk_count,
            segment_count,
            ...source
        }) =>
            normalizePersistedSource({
                ...source,
                status: source.status === 'used in graph' ? 'parsed' : source.status
            })
    );

export const collectBranchIds = (rootId, childrenByParent) => {
    const branchIds = new Set([rootId]);
    const stack = [...(childrenByParent.get(rootId) || [])];

    while (stack.length > 0) {
        const currentId = stack.pop();
        if (branchIds.has(currentId)) {
            continue;
        }

        branchIds.add(currentId);
        stack.push(...(childrenByParent.get(currentId) || []));
    }

    return branchIds;
};

export const buildGraphProjection = (nodes, edges, branchId) => {
    const nodeLookup = new Map(nodes.map((node) => [node.id, normalizeGraphNode(node)]));
    const childrenByParent = new Map();

    edges.forEach((edge) => {
        if (!edge.source || !edge.target) {
            return;
        }

        const children = childrenByParent.get(edge.source) || [];
        children.push(edge.target);
        childrenByParent.set(edge.source, children);
    });

    const branchIds = branchId
        ? collectBranchIds(branchId, childrenByParent)
        : new Set(nodes.map((node) => node.id));
    const visibleNodes = nodes
        .filter((node) => branchIds.has(node.id))
        .map(normalizeGraphNode);
    const visibleEdges = edges.filter(
        (edge) => branchIds.has(edge.source) && branchIds.has(edge.target)
    );
    const visibleTargetedIds = new Set(visibleEdges.map((edge) => edge.target));
    const roots = visibleNodes.filter((node) => !visibleTargetedIds.has(node.id));
    const selectedRoot = branchId ? nodeLookup.get(branchId) : undefined;

    return {
        nodes: visibleNodes,
        edges: visibleEdges,
        roots:
            selectedRoot && branchIds.has(selectedRoot.id)
                ? [
                      selectedRoot,
                      ...roots.filter((node) => node.id !== selectedRoot.id)
                  ]
                : roots,
        childrenByParent,
        nodeLookup,
        branchIds
    };
};

export const getTaskRows = (projection) =>
    projection.nodes
        .filter((node) => TASK_CAPABLE_TYPES.has(node.node_type))
        .map((node) => ({
            ...node,
            source_document: node.source_ref.document_id || '',
            source_page: node.source_ref.page || '',
            source_section: node.source_ref.section || '',
            source_quote: node.source_ref.quote_snippet || ''
        }));

export const getTaskPreviewRows = (projection) =>
    projection.nodes
        .filter((node) => node.node_type !== 'reference')
        .map((node) => {
            const isAlreadyTask = TASK_CAPABLE_TYPES.has(node.node_type);
            return {
                ...node,
                preview_type: isAlreadyTask ? node.node_type : 'task',
                preview_status:
                    node.status === 'approved' || node.status === 'reviewed'
                        ? node.status
                        : 'needs_review',
                included: isAlreadyTask || node.node_type !== 'question'
            };
        });

export const getChecklistPreviewRows = (projection) => {
    const childCountByNode = projection.edges.reduce((counts, edge) => {
        counts.set(edge.source, (counts.get(edge.source) || 0) + 1);
        return counts;
    }, new Map());

    return projection.nodes
        .filter((node) => node.node_type !== 'reference')
        .map((node, index) => {
            const hasChildren = childCountByNode.has(node.id);
            const isReviewItem =
                node.status === 'needs_review' || node.node_type === 'needs_review';

            return {
                ...node,
                checklist_order: index + 1,
                checklist_label: node.title,
                checklist_note:
                    node.summary ||
                    (hasChildren
                        ? 'Parent item with nested follow-up work.'
                        : 'Leaf item ready for checklist review.'),
                included: !hasChildren || isReviewItem,
                review_required:
                    isReviewItem || !node.source_ref?.document_id || !node.confidence
            };
        });
};

const missingInfoReasons = (node) => {
    const reasons = [];
    const isTaskCapable = TASK_CAPABLE_TYPES.has(node.node_type);

    if (!node.source_ref?.document_id) {
        reasons.push('Missing source document');
    }
    if (!node.confidence) {
        reasons.push('Missing confidence');
    }
    if (!node.summary && node.node_type !== 'reference') {
        reasons.push('Missing summary');
    }
    if (node.status === 'needs_review' || node.node_type === 'needs_review') {
        reasons.push('Marked for review');
    }
    if (isTaskCapable && !node.owner_id) {
        reasons.push('Missing owner');
    }
    if (isTaskCapable && !node.due_date) {
        reasons.push('Missing due date');
    }
    if (isTaskCapable && !node.priority) {
        reasons.push('Missing priority');
    }

    return reasons;
};

export const getMissingInfoPreviewRows = (projection) =>
    projection.nodes
        .map((node) => {
            const reasons = missingInfoReasons(node);
            const severity =
                reasons.some((reason) => reason.includes('source')) ||
                reasons.some((reason) => reason.includes('review'))
                    ? 'high'
                    : reasons.length >= 3
                      ? 'medium'
                      : 'low';

            return {
                ...node,
                reasons,
                severity,
                included: reasons.length > 0
            };
        })
        .filter((node) => node.reasons.length > 0);

const questionForReason = (node, reason) => {
    if (reason === 'Missing source document') {
        return `Which source document, page, or section verifies "${node.title}"?`;
    }
    if (reason === 'Missing confidence') {
        return `How confident should reviewers be in "${node.title}", and why?`;
    }
    if (reason === 'Missing summary') {
        return `What is the concise business meaning or requirement behind "${node.title}"?`;
    }
    if (reason === 'Marked for review') {
        return `What decision is needed before "${node.title}" can be approved?`;
    }
    if (reason === 'Missing owner') {
        return `Who should own follow-up for "${node.title}"?`;
    }
    if (reason === 'Missing due date') {
        return `When should "${node.title}" be completed or reviewed?`;
    }
    if (reason === 'Missing priority') {
        return `What priority should "${node.title}" have for execution?`;
    }

    return `What information is needed to finalize "${node.title}"?`;
};

export const getSmeQuestionPreviewRows = (projection) =>
    getMissingInfoPreviewRows(projection).flatMap((node) =>
        node.reasons.map((reason, index) => ({
            ...node,
            question_id: `${node.id}-${reason.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            question_order: index + 1,
            reason,
            question: questionForReason(node, reason),
            included: true
        }))
    );

const getParentByChild = (edges) =>
    edges.reduce((parents, edge) => {
        if (edge.source && edge.target && !parents.has(edge.target)) {
            parents.set(edge.target, edge.source);
        }
        return parents;
    }, new Map());

const nearestAncestorSource = (node, projection, parentByChild) => {
    let currentId = parentByChild.get(node.id);

    while (currentId) {
        const parent = projection.nodeLookup.get(currentId);
        if (hasSourceDocument(parent?.source_ref)) {
            return {
                node: parent,
                source_ref: parent.source_ref,
                relationship: 'ancestor'
            };
        }

        currentId = parentByChild.get(currentId);
    }

    return undefined;
};

const nearestChildSource = (node, projection) => {
    const childIds = projection.childrenByParent.get(node.id) || [];

    for (const childId of childIds) {
        const child = projection.nodeLookup.get(childId);
        if (hasSourceDocument(child?.source_ref)) {
            return {
                node: child,
                source_ref: child.source_ref,
                relationship: 'child'
            };
        }
    }

    return undefined;
};

const nearestSiblingSource = (node, projection, parentByChild) => {
    const parentId = parentByChild.get(node.id);
    const siblingIds = parentId ? projection.childrenByParent.get(parentId) || [] : [];

    for (const siblingId of siblingIds) {
        if (siblingId === node.id) {
            continue;
        }

        const sibling = projection.nodeLookup.get(siblingId);
        if (hasSourceDocument(sibling?.source_ref)) {
            return {
                node: sibling,
                source_ref: sibling.source_ref,
                relationship: 'sibling'
            };
        }
    }

    return undefined;
};

const findSourceSuggestion = (node, projection, parentByChild) =>
    nearestAncestorSource(node, projection, parentByChild) ||
    nearestChildSource(node, projection) ||
    nearestSiblingSource(node, projection, parentByChild);

export const getSourceRepairPreviewRows = (projection) => {
    const parentByChild = getParentByChild(projection.edges);

    return projection.nodes
        .map((node) => {
            const issues = sourceRefIssues(node.source_ref);
            if (issues.length === 0 && hasCompleteSourceRef(node.source_ref)) {
                return undefined;
            }

            const suggestion = findSourceSuggestion(node, projection, parentByChild);
            const hasSuggestion = Boolean(suggestion?.source_ref?.document_id);

            return {
                ...node,
                repair_id: `${node.id}-source-repair`,
                issues,
                repair_type: hasSuggestion ? 'suggest_source_ref' : 'request_source_ref',
                suggested_source_ref: hasSuggestion ? suggestion.source_ref : undefined,
                suggested_from_node_id: suggestion?.node?.id || '',
                suggested_from_title: suggestion?.node?.title || '',
                suggestion_relationship: suggestion?.relationship || '',
                repair_confidence: hasSuggestion ? 'low' : node.confidence || '',
                included: true
            };
        })
        .filter(Boolean);
};
