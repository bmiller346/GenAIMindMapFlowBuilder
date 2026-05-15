import { nanoid } from 'nanoid';
import {
    createWorkspaceEdge,
    createWorkspaceNode,
    getChildPosition
} from './manualNodes.js';

export const AI_DRAFT_SESSION_CONTRACT_VERSION = '1';
export const AI_DRAFT_ACCEPT_MODES = [
    'append',
    'replace',
    'merge',
    'selected',
    'cited_only',
    'notes_only'
];

const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const firstText = (...values) =>
    values.find((value) => typeof value === 'string' && value.trim()) || '';
const numericConfidence = (value) => {
    if (typeof value === 'number') {
        return value;
    }
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'high') {
        return 0.9;
    }
    if (normalized === 'medium') {
        return 0.65;
    }
    if (normalized === 'low') {
        return 0.35;
    }
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const AI_DRAFT_MEMORY_NODE_LIMIT = 24;
const AI_DRAFT_MEMORY_EDGE_LIMIT = 40;
const AI_DRAFT_MEMORY_SOURCE_REF_LIMIT = 30;
const AI_DRAFT_MEMORY_PROMPT_LIMIT = 3;

const truncateMemoryText = (value, limit = 480) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text || text.length <= limit) {
        return text;
    }
    return `${text.slice(0, Math.max(0, limit - 3))}...`;
};

const edgeSourceId = (edge = {}) => firstText(edge.source, edge.source_node_id, edge.parent_id);
const edgeTargetId = (edge = {}) => firstText(edge.target, edge.target_node_id, edge.child_id);

const sourceRefsFromNode = (node = {}) => {
    const data = node.data || {};
    const nestedData = data.data || {};
    return mergeSourceRefs(
        mergeSourceRefs(asArray(data.source_refs), asArray(data.sourceRefs)),
        mergeSourceRefs(asArray(nestedData.source_refs), asArray(nestedData.sourceRefs))
    );
};

const normalizeMemorySourceRef = (ref = {}) => {
    if (!ref || typeof ref !== 'object') {
        return {};
    }
    return {
        document_id: firstText(ref.document_id, ref.documentId, ref.source_id),
        chunk_id: firstText(ref.chunk_id, ref.chunkId, ref.id),
        page: ref.page ?? ref.page_number ?? '',
        section: firstText(ref.section, ref.heading),
        quote_snippet: truncateMemoryText(firstText(ref.quote_snippet, ref.snippet, ref.text), 240),
        confidence: firstText(ref.confidence)
    };
};

const normalizeMemorySourceRefs = (...refLists) => {
    const refs = mergeSourceRefs(
        mergeSourceRefs(refLists[0] || [], refLists[1] || []),
        refLists.slice(2).flatMap((refsForList) => asArray(refsForList))
    );
    return refs
        .map(normalizeMemorySourceRef)
        .filter((ref) => ref.document_id || ref.chunk_id || ref.quote_snippet)
        .slice(0, AI_DRAFT_MEMORY_SOURCE_REF_LIMIT);
};

const sourceRefMatchesSourceId = (ref = {}, sourceId = '') => {
    const normalizedSourceId = String(sourceId || '').trim();
    if (!normalizedSourceId) {
        return false;
    }
    return [
        ref.document_id,
        ref.documentId,
        ref.source_id,
        ref.sourceId,
        ref.normalized_document_id
    ].some((value) => String(value || '').trim() === normalizedSourceId);
};

const collectBranchNodeIds = (edges = [], rootId = '') => {
    const root = String(rootId || '').trim();
    if (!root) {
        return new Set();
    }
    const childIdsByParent = new Map();
    asArray(edges).forEach((edge) => {
        const source = edgeSourceId(edge);
        const target = edgeTargetId(edge);
        if (!source || !target) {
            return;
        }
        childIdsByParent.set(source, [...(childIdsByParent.get(source) || []), target]);
    });

    const ids = new Set([root]);
    const queue = [root];
    while (queue.length) {
        const parentId = queue.shift();
        asArray(childIdsByParent.get(parentId)).forEach((childId) => {
            if (ids.has(childId)) {
                return;
            }
            ids.add(childId);
            queue.push(childId);
        });
    }
    return ids;
};

const collectScopedNodeIds = ({ nodes = [], edges = [], scope = {} } = {}) => {
    const normalizedScope = normalizeAIDraftScope(scope);
    if (normalizedScope.type === 'branch' && normalizedScope.node_id) {
        return collectBranchNodeIds(edges, normalizedScope.node_id);
    }
    if (normalizedScope.type === 'node' && normalizedScope.node_id) {
        return new Set([normalizedScope.node_id]);
    }
    if (normalizedScope.type === 'nodes') {
        return new Set(asArray(normalizedScope.node_ids));
    }
    if (normalizedScope.type === 'source' && normalizedScope.source_id) {
        const sourceMatchedIds = asArray(nodes)
            .filter((node) =>
                sourceRefsFromNode(node).some((ref) =>
                    sourceRefMatchesSourceId(ref, normalizedScope.source_id)
                )
            )
            .map((node) => node.id)
            .filter(Boolean);
        return new Set(sourceMatchedIds.length ? sourceMatchedIds : asArray(nodes).map((node) => node.id));
    }
    return new Set(asArray(nodes).map((node) => node.id).filter(Boolean));
};

const memoryNodeRecord = (node = {}) => {
    const data = node.data || {};
    const nestedData = data.data || {};
    const sourceRefs = sourceRefsFromNode(node);
    return {
        id: String(node.id || ''),
        title: truncateMemoryText(
            firstText(data.title, data.label, data.content, data.body, data.summ, nestedData.summ, node.id),
            180
        ),
        node_type: firstText(data.node_type, data.nodeType, data.type, node.type, 'concept'),
        status: firstText(data.status, nestedData.status),
        summary: truncateMemoryText(
            firstText(
                data.summary,
                data.summ,
                data.body,
                data.content,
                nestedData.summary,
                nestedData.summ
            ),
            520
        ),
        source_ref_count: sourceRefs.length
    };
};

const memoryEdgeRecord = (edge = {}) => {
    const metadata = edge.metadata || edge.data?.metadata || {};
    const relationshipType = firstText(
        edge.relationship_type,
        edge.type,
        edge.data?.relationship_type,
        metadata.relationship_type,
        metadata.kind,
        'contains'
    );
    return {
        id: firstText(edge.id, `${edgeSourceId(edge)}-${edgeTargetId(edge)}`),
        source: edgeSourceId(edge),
        target: edgeTargetId(edge),
        relationship_type: relationshipType,
        confidence: metadata.confidence ?? edge.confidence ?? '',
        rationale: truncateMemoryText(firstText(metadata.rationale, edge.rationale, edge.label), 320)
    };
};

const draftNodeMemoryRecord = (node = {}) => ({
    id: firstText(node.id, node.node_id),
    title: truncateMemoryText(firstText(node.title, node.label), 160),
    node_type: firstText(node.node_type, node.type, 'concept'),
    status: firstText(node.status),
    summary: truncateMemoryText(firstText(node.summary, node.body, node.rationale), 400),
    source_ref_count: asArray(node.source_refs).length
});

export const normalizeAIDraftChangeIntent = (intent = '', fallback = 'supplement') => {
    const normalized = String(intent || '').trim().toLowerCase();
    if (['update', 'supplement', 'compare'].includes(normalized)) {
        return normalized;
    }
    const normalizedFallback = String(fallback || '').trim().toLowerCase();
    return ['update', 'supplement', 'compare'].includes(normalizedFallback)
        ? normalizedFallback
        : 'supplement';
};

export const inferAIDraftChangeIntent = (prompt = '', fallback = 'supplement') => {
    const text = String(prompt || '').toLowerCase();
    if (/\b(compare|contrast|versus|vs\.?|difference|differences|tradeoff|trade-off)\b/.test(text)) {
        return 'compare';
    }
    if (
        /\b(make|revise|rewrite|update|change|tailor|adapt|speciali[sz]e|refine|convert|turn)\b/.test(text) ||
        /\b(specific to|more specific|instead of|replace|swap)\b/.test(text)
    ) {
        return 'update';
    }
    if (/\b(add|include|also|expand|extend|more|what about|supplement|another|additional)\b/.test(text)) {
        return 'supplement';
    }
    return normalizeAIDraftChangeIntent(fallback);
};

export const buildAIDraftMemoryContext = ({
    nodes = [],
    edges = [],
    scope = { type: 'workspace' },
    sourceRefs = [],
    selectedSourcePayload = null,
    activeDraftSession = null,
    prompt = '',
    changeIntent = '',
    outputMode = 'draft'
} = {}) => {
    const normalizedScope = normalizeAIDraftScope(scope);
    const scopedIds = collectScopedNodeIds({ nodes, edges, scope: normalizedScope });
    const scopedNodes = asArray(nodes).filter((node) => scopedIds.has(node.id));
    const scopedEdges = asArray(edges).filter((edge) => {
        const sourceId = edgeSourceId(edge);
        const targetId = edgeTargetId(edge);
        return scopedIds.has(sourceId) && scopedIds.has(targetId);
    });
    const activeRevision = asArray(activeDraftSession?.revisions).at(-1) || {};
    const priorPromptHistory = asArray(activeDraftSession?.prompt_history)
        .filter((entry) => firstText(entry.content, entry.prompt, entry.text))
        .slice(-AI_DRAFT_MEMORY_PROMPT_LIMIT)
        .map((entry) => ({
            role: firstText(entry.role, 'user'),
            content: truncateMemoryText(firstText(entry.content, entry.prompt, entry.text), 320)
        }));
    const nodeSourceRefs = scopedNodes.flatMap(sourceRefsFromNode);
    const revisionSourceRefs = [
        ...asArray(activeRevision.draft_items).flatMap((item) => asArray(item.source_refs)),
        ...asArray(activeRevision.draft_nodes).flatMap((node) => asArray(node.source_refs)),
        ...asArray(activeRevision.draft_annotations).flatMap((annotation) => asArray(annotation.source_refs))
    ];
    const normalizedChangeIntent = normalizeAIDraftChangeIntent(
        changeIntent || inferAIDraftChangeIntent(prompt)
    );

    return {
        schema_version: '1',
        change_intent: normalizedChangeIntent,
        output_mode: outputMode || 'draft',
        scope: normalizedScope,
        current_prompt: truncateMemoryText(prompt, 640),
        graph_context: {
            total_nodes: asArray(nodes).length,
            total_edges: asArray(edges).length,
            scoped_node_count: scopedNodes.length,
            scoped_edge_count: scopedEdges.length,
            nodes_truncated: scopedNodes.length > AI_DRAFT_MEMORY_NODE_LIMIT,
            edges_truncated: scopedEdges.length > AI_DRAFT_MEMORY_EDGE_LIMIT,
            nodes: scopedNodes.slice(0, AI_DRAFT_MEMORY_NODE_LIMIT).map(memoryNodeRecord),
            edges: scopedEdges.slice(0, AI_DRAFT_MEMORY_EDGE_LIMIT).map(memoryEdgeRecord)
        },
        source_refs: normalizeMemorySourceRefs(
            sourceRefs,
            selectedSourcePayload?.source_refs,
            nodeSourceRefs,
            revisionSourceRefs
        ),
        source_context: selectedSourcePayload?.metadata || null,
        prior_draft_session: activeDraftSession?.session_id
            ? {
                  session_id: activeDraftSession.session_id,
                  status: activeDraftSession.status || '',
                  role: activeDraftSession.role || '',
                  intent: activeDraftSession.intent || activeDraftSession.action || '',
                  latest_revision_id: activeRevision.revision_id || '',
                  latest_revision_prompt: truncateMemoryText(activeRevision.prompt, 420),
                  prompt_history: priorPromptHistory,
                  draft_node_count: asArray(activeRevision.draft_nodes).length,
                  draft_edge_count: asArray(activeRevision.draft_edges).length,
                  draft_nodes: asArray(activeRevision.draft_nodes)
                      .slice(0, 12)
                      .map(draftNodeMemoryRecord)
              }
            : null
    };
};

export const normalizeAIDraftScope = (scope = {}) => {
    const type = ['workspace', 'source', 'branch', 'node', 'nodes'].includes(scope.type)
        ? scope.type
        : 'workspace';
    if ((type === 'branch' || type === 'node') && scope.node_id) {
        return { type, node_id: String(scope.node_id).trim() };
    }
    if (type === 'source' && scope.source_id) {
        return { type, source_id: String(scope.source_id).trim() };
    }
    if (type === 'nodes') {
        return {
            type,
            node_ids: asArray(scope.node_ids)
                .map((nodeId) => String(nodeId).trim())
                .filter(Boolean)
        };
    }
    return { type };
};

export const normalizeAIDraftSourceChunk = (chunk = {}, source = {}) => {
    const documentId = firstText(
        chunk.document_id,
        chunk.documentId,
        chunk.source_id,
        source.id,
        source.document_id
    );
    const chunkId = firstText(chunk.id, chunk.chunk_id, `${documentId || 'source'}_chunk`);
    const section = firstText(chunk.heading, chunk.section);
    const snippet = firstText(chunk.snippet, chunk.text, chunk.quote_snippet);
    const sourceRef =
        chunk.source_ref && typeof chunk.source_ref === 'object'
            ? { ...chunk.source_ref }
            : {
                  document_id: documentId,
                  chunk_id: chunkId,
                  page: chunk.page ?? '',
                  section,
                  quote_snippet: snippet,
                  confidence: firstText(chunk.confidence, 'medium')
              };

    return {
        id: chunkId,
        document_id: documentId,
        page: chunk.page ?? '',
        heading: section,
        snippet,
        text: firstText(chunk.text, snippet),
        source_ref: sourceRef,
        source_refs: asArray(chunk.source_refs).length ? asArray(chunk.source_refs) : [sourceRef],
        metadata: {
            source_title: firstText(source.title, source.filename, source.name),
            ...(chunk.metadata && typeof chunk.metadata === 'object' ? chunk.metadata : {})
        }
    };
};

export const buildSelectedSourceDraftPayload = (source = {}) => {
    const sourceId = firstText(source.id, source.document_id, source.source_id);
    const chunks = asArray(source.chunks).map((chunk) =>
        normalizeAIDraftSourceChunk(chunk, source)
    );
    const sourceRefs = mergeSourceRefs(
        asArray(source.source_refs),
        chunks.flatMap((chunk) => asArray(chunk.source_refs))
    );
    return {
        scope: { type: 'source', source_id: sourceId },
        source_chunks: chunks,
        source_refs: sourceRefs,
        metadata: {
            selected_source_id: sourceId,
            selected_source_title: firstText(source.title, source.filename, source.name),
            selected_source_type: firstText(source.type, source.type_label),
            selected_source_chunk_count: chunks.length
        }
    };
};

export const buildSelectedSourcesDraftPayload = (sources = []) => {
    const normalizedSources = asArray(sources);
    if (normalizedSources.length === 1) {
        return buildSelectedSourceDraftPayload(normalizedSources[0]);
    }
    const chunks = normalizedSources.flatMap((source) =>
        asArray(source.chunks).map((chunk) => normalizeAIDraftSourceChunk(chunk, source))
    );
    const sourceRefs = mergeSourceRefs(
        normalizedSources.flatMap((source) => asArray(source.source_refs)),
        chunks.flatMap((chunk) => asArray(chunk.source_refs))
    );
    const sourceIds = normalizedSources
        .map((source) => firstText(source.id, source.document_id, source.source_id))
        .filter(Boolean);
    return {
        scope: { type: 'workspace' },
        source_chunks: chunks,
        source_refs: sourceRefs,
        metadata: {
            selected_source_ids: sourceIds,
            selected_source_titles: normalizedSources.map((source) =>
                firstText(source.title, source.filename, source.name)
            ),
            selected_source_count: sourceIds.length,
            selected_source_chunk_count: chunks.length,
            source_context_mode: 'bounded_multi_source'
        }
    };
};

export const buildAIDraftSessionRequestPayload = ({
    role = {},
    action = {},
    scope = { type: 'workspace' },
    prompt = '',
    createdBy = 'user',
    selectedModel = 'auto',
    selectedSourcePayload = null,
    desiredOutputs = [],
    workspaceBrief = {},
    metadata = {},
    memoryContext = null,
    changeIntent = ''
} = {}) => {
    const normalizedMemory =
        memoryContext && typeof memoryContext === 'object' && Object.keys(memoryContext).length
            ? memoryContext
            : null;
    const normalizedChangeIntent = normalizeAIDraftChangeIntent(
        changeIntent || normalizedMemory?.change_intent || metadata.change_intent,
        inferAIDraftChangeIntent(prompt, 'supplement')
    );
    return {
        role: role.id || role.role_id || role.label || 'ask-ai',
        role_id: role.id || role.role_id || '',
        action: action.id || action.action || 'custom_prompt',
        intent: action.id || action.action || 'custom_prompt',
        scope: normalizeAIDraftScope(scope),
        custom_prompt: prompt.trim() || null,
        prompt: prompt.trim() || action.label || action.id || 'Ask AI',
        created_by: createdBy,
        model_policy: selectedModel === 'auto' ? 'balanced' : 'explicit',
        model: selectedModel === 'auto' ? null : selectedModel,
        source_chunks: selectedSourcePayload?.source_chunks || [],
        desired_outputs: Array.isArray(desiredOutputs) ? desiredOutputs.filter(Boolean) : [],
        workspace_brief: workspaceBrief && typeof workspaceBrief === 'object' ? workspaceBrief : {},
        change_intent: normalizedChangeIntent,
        memory_context: normalizedMemory || undefined,
        source_refs: normalizedMemory?.source_refs || normalizeMemorySourceRefs(selectedSourcePayload?.source_refs),
        metadata: {
            ...metadata,
            change_intent: normalizedChangeIntent,
            follow_up_memory: normalizedMemory || metadata.follow_up_memory,
            workspace_brief: workspaceBrief && typeof workspaceBrief === 'object' ? workspaceBrief : {},
            source_context: selectedSourcePayload?.metadata
        }
    };
};

export const normalizeAIDraftItem = (item = {}) => {
    const title = firstText(item.title, item.label, 'AI draft item');
    return {
        id: firstText(item.id, item.node_id, `draft_item_${nanoid(8)}`),
        item_type: firstText(item.item_type, item.type, 'note'),
        title,
        content: firstText(item.content, item.body, item.summary, title),
        source_refs: asArray(item.source_refs),
        assumptions: asArray(item.assumptions).filter((value) => typeof value === 'string'),
        status: firstText(item.status, 'draft'),
        selected: item.selected !== false,
        metadata: item.metadata && typeof item.metadata === 'object' ? { ...item.metadata } : {}
    };
};

export const normalizeAIDraftNode = (node = {}) => ({
    ...node,
    id: firstText(node.id, node.node_id, `draft_node_${nanoid(8)}`),
    title: firstText(node.title, node.label, 'AI draft'),
    summary: firstText(node.summary, node.body, node.rationale),
    node_type: firstText(node.node_type, node.type, 'concept'),
    status: firstText(node.status, 'ai_generated'),
    source_refs: asArray(node.source_refs),
    external_refs:
        node.external_refs && typeof node.external_refs === 'object'
            ? { ...node.external_refs }
            : {},
    metadata: node.metadata && typeof node.metadata === 'object' ? { ...node.metadata } : {}
});

export const normalizeAIDraftEdge = (edge = {}) => ({
    id: firstText(edge.id, edge.edge_id, `draft_edge_${nanoid(8)}`),
    source_node_id: firstText(edge.source_node_id, edge.source, edge.parent_id),
    target_node_id: firstText(edge.target_node_id, edge.target, edge.child_id),
    relationship_type: firstText(edge.relationship_type, 'contains'),
    metadata: edge.metadata && typeof edge.metadata === 'object' ? { ...edge.metadata } : {}
});

export const createAIDraftRevision = ({
    sessionId = '',
    prompt = '',
    draftItems,
    draftNodes = [],
    draftEdges = [],
    draftAnnotations = [],
    revisionId = `ai_draft_revision_${nanoid(10)}`,
    createdAt = new Date().toISOString(),
    model = '',
    metadata = {}
} = {}) => {
    const nodes = asArray(draftNodes).map(normalizeAIDraftNode);
    const annotations = asArray(draftAnnotations);
    const items =
        asArray(draftItems).length > 0
            ? asArray(draftItems).map(normalizeAIDraftItem)
            : [
                  ...nodes.map((node) =>
                      normalizeAIDraftItem({
                          id: node.id,
                          item_type: 'node',
                          title: node.title,
                          content: node.summary || node.title,
                          source_refs: node.source_refs,
                          selected: true,
                          metadata: { draft_node_id: node.id }
                      })
                  ),
                  ...annotations.map((annotation) =>
                      normalizeAIDraftItem({
                          id: annotation.id,
                          item_type: annotation.type || 'annotation',
                          title: annotation.title,
                          content: annotation.body || annotation.content,
                          source_refs: annotation.source_refs,
                          assumptions: annotation.assumptions,
                          selected: true,
                          metadata: { draft_annotation_id: annotation.id }
                      })
                  )
              ];
    const revision = {
        revision_id: revisionId,
        session_id: sessionId,
        prompt,
        draft_items: items,
        draft_nodes: nodes,
        draft_edges: asArray(draftEdges).map(normalizeAIDraftEdge),
        draft_annotations: annotations,
        preview_diff: {},
        validation_report: validateAIDraftRevision({ draft_nodes: nodes, draft_edges: draftEdges }),
        created_at: createdAt,
        model,
        metadata: {
            ...metadata,
            ai_draft_session_contract_version: AI_DRAFT_SESSION_CONTRACT_VERSION,
            canonical: false
        }
    };
    revision.preview_diff = buildAIDraftPreviewDiff({ revisions: [revision] });
    return revision;
};

export const createAIDraftSession = ({
    workspaceId = '',
    scope = { type: 'workspace' },
    role = 'Ask AI',
    intent = 'custom_prompt',
    prompt = '',
    draftNodes = [],
    draftEdges = [],
    draftItems,
    draftAnnotations = [],
    modelPolicy = 'balanced',
    selectedModel = '',
    modelReason = '',
    sessionId = `ai_draft_${nanoid(10)}`,
    revisionId,
    createdAt = new Date().toISOString(),
    metadata = {}
} = {}) => {
    const revision = createAIDraftRevision({
        sessionId,
        prompt,
        draftItems,
        draftNodes,
        draftEdges,
        draftAnnotations,
        revisionId,
        createdAt,
        model: selectedModel
    });
    return {
        session_id: sessionId,
        workspace_id: workspaceId,
        scope: normalizeAIDraftScope(scope),
        role,
        intent,
        prompt_history: [
            { role: 'user', content: prompt, created_at: createdAt, revision_id: revision.revision_id }
        ],
        model_policy: modelPolicy,
        selected_model: selectedModel,
        model_reason: modelReason,
        revisions: [revision],
        source_refs: collectRevisionSourceRefs(revision),
        validation_reports: [revision.validation_report],
        accept_history: [],
        status: 'draft',
        metadata: {
            ...metadata,
            ai_draft_session_contract_version: AI_DRAFT_SESSION_CONTRACT_VERSION,
            canonical: false
        }
    };
};

export const reviseAIDraftSession = (session = {}, options = {}) => {
    const revision = createAIDraftRevision({
        sessionId: session.session_id,
        ...options
    });
    return {
        ...session,
        prompt_history: [
            ...asArray(session.prompt_history),
            {
                role: 'user',
                content: options.prompt || '',
                created_at: revision.created_at,
                revision_id: revision.revision_id
            }
        ],
        revisions: [...asArray(session.revisions), revision],
        source_refs: mergeSourceRefs(session.source_refs, collectRevisionSourceRefs(revision)),
        validation_reports: [...asArray(session.validation_reports), revision.validation_report],
        status: 'draft',
        metadata: {
            ...(session.metadata || {}),
            ai_draft_session_contract_version: AI_DRAFT_SESSION_CONTRACT_VERSION,
            canonical: false
        }
    };
};

export const latestAIDraftRevision = (session = {}) => asArray(session.revisions).at(-1) || {};

export const getAIDraftModelMetadata = (session = {}, revision = latestAIDraftRevision(session)) => {
    const metadata = {
        ...(session.metadata || {}),
        ...(revision.metadata || {})
    };
    const usage =
        metadata.usage && typeof metadata.usage === 'object'
            ? metadata.usage
            : session.usage && typeof session.usage === 'object'
              ? session.usage
              : {};
    const policy =
        typeof session.model_policy === 'string'
            ? session.model_policy
            : session.model_policy?.policy || metadata.model_policy || '';
    const riskTier = firstText(
        metadata.risk_tier,
        metadata.risk,
        metadata.model_tier,
        metadata.cost_tier,
        metadata.token_cost_tier
    );
    const tokenEstimate =
        usage.total_tokens ??
        metadata.total_tokens ??
        metadata.token_estimate ??
        metadata.estimated_tokens ??
        metadata.input_tokens ??
        metadata.tokens;
    const costEstimate =
        usage.estimated_cost_usd ??
        metadata.estimated_cost_usd ??
        metadata.estimated_cost ??
        metadata.cost_estimate ??
        metadata.cost;
    return {
        model: firstText(
            metadata.actual_model,
            metadata.model,
            session.selected_model,
            revision.model,
            'auto'
        ),
        reason: firstText(
            session.model_reason,
            metadata.model_reason,
            revision.model_reason,
            'Model will be selected when the draft is generated.'
        ),
        policy,
        riskTier,
        tokenEstimate,
        costEstimate,
        inputTokens: usage.input_tokens ?? metadata.input_tokens,
        outputTokens: usage.output_tokens ?? metadata.output_tokens,
        totalTokens: usage.total_tokens ?? metadata.total_tokens ?? tokenEstimate,
        usageCostSource: usage.cost_source ?? metadata.usage_cost_source
    };
};

export const formatAIDraftPreviewDiffSummary = (diff = {}) => ({
    nodes: Number(diff.added_nodes || diff.nodes || 0),
    edges: Number(diff.added_edges || diff.edges || 0),
    updates: Number(diff.updated_nodes || diff.updates || 0),
    needsReview: Number(diff.needs_review_repairs || diff.needs_review_items || 0),
    reviewOutputs: Number(diff.review_outputs || 0),
    text: [
        `+${Number(diff.added_nodes || diff.nodes || 0)} nodes`,
        `+${Number(diff.added_edges || diff.edges || 0)} edges`,
        `~${Number(diff.updated_nodes || diff.updates || 0)} updates`,
        `!${Number(diff.needs_review_repairs || diff.needs_review_items || 0)} needs_review items`
    ].join('  ')
});

export const getAIDraftItemBadges = (item = {}) => {
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const sourceRefs = asArray(item.source_refs);
    const assumptions = asArray(item.assumptions);
    const confidence = numericConfidence(item.confidence ?? metadata.confidence);
    const status = firstText(item.status, metadata.status).toLowerCase();
    const type = firstText(item.item_type, metadata.node_type, metadata.type).toLowerCase();
    const badges = [];

    if (sourceRefs.length > 0) {
        badges.push({ id: 'source-backed', label: 'Source-backed', tone: 'good' });
    } else {
        badges.push({ id: 'needs-review', label: 'Needs review', tone: 'warn' });
    }
    if (status === 'needs_review' || type === 'needs_review' || metadata.needs_review === true) {
        if (!badges.some((badge) => badge.id === 'needs-review')) {
            badges.push({ id: 'needs-review', label: 'Needs review', tone: 'warn' });
        }
    }
    if (
        assumptions.length > 0 ||
        metadata.assumption === true ||
        metadata.assumptions === true ||
        type === 'assumption'
    ) {
        badges.push({ id: 'assumption', label: 'Assumption', tone: 'neutral' });
    }
    if (confidence !== null && confidence < 0.6) {
        badges.push({ id: 'low-confidence', label: 'Low confidence', tone: 'warn' });
    }
    if (metadata.duplicate === true || metadata.duplicate_of || type.includes('duplicate')) {
        badges.push({ id: 'duplicate', label: 'Duplicate', tone: 'caution' });
    }
    if (metadata.conflict === true || metadata.conflicts || type.includes('conflict')) {
        badges.push({ id: 'conflict', label: 'Conflict', tone: 'danger' });
    }
    return badges;
};

export const selectedDraftNodes = ({ revision = {}, mode = 'append', selectedItemIds = [] } = {}) => {
    const selected = new Set(asArray(selectedItemIds));
    let nodes = asArray(revision.draft_nodes).map(normalizeAIDraftNode);
    if (selected.size > 0) {
        nodes = nodes.filter((node) => selected.has(node.id));
    }
    if (mode === 'cited_only') {
        return nodes.filter((node) => asArray(node.source_refs).length > 0);
    }
    if (mode === 'notes_only') {
        return [];
    }
    return nodes;
};

export const buildAIDraftPreviewDiff = (
    session = {},
    { mode = 'append', selectedItemIds = [] } = {}
) => {
    const revision = latestAIDraftRevision(session);
    const nodes = selectedDraftNodes({ revision, mode, selectedItemIds });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges =
        mode === 'notes_only'
            ? []
            : asArray(revision.draft_edges).filter((edge) => nodeIds.has(edge.target_node_id));
    const needsReviewRepairs =
        mode === 'notes_only'
            ? 0
            : nodes.filter((node) => node.node_type !== 'reference' && asArray(node.source_refs).length === 0)
                  .length;
    const updatedNodes = mode === 'merge' ? nodes.length : 0;
    const diff = {
        mode,
        added_nodes: mode === 'merge' ? 0 : nodes.length,
        added_edges: mode === 'merge' ? 0 : edges.length,
        updated_nodes: updatedNodes,
        review_outputs: asArray(revision.draft_annotations).length,
        needs_review_repairs: needsReviewRepairs,
        accepted_item_ids: asArray(selectedItemIds).length
            ? asArray(selectedItemIds)
            : nodes.map((node) => node.id)
    };
    diff.summary = [
        `+${diff.added_nodes} nodes`,
        `+${diff.added_edges} edges`,
        diff.updated_nodes ? `~${diff.updated_nodes} nodes updated` : '',
        diff.needs_review_repairs ? `!${diff.needs_review_repairs} marked needs_review` : ''
    ]
        .filter(Boolean)
        .join(', ');
    return diff;
};

export const rejectAIDraftSession = (
    session = {},
    { rejectedAt = new Date().toISOString(), rejectedBy = 'user', reason = 'Rejected by user' } = {}
) => ({
    ...session,
    status: 'discarded',
    accept_history: asArray(session.accept_history),
    metadata: {
        ...(session.metadata || {}),
        ai_draft_session_contract_version: AI_DRAFT_SESSION_CONTRACT_VERSION,
        canonical: false,
        rejected_at: rejectedAt,
        rejected_by: rejectedBy,
        rejection_reason: reason
    }
});

export const acceptAIDraftSession = ({
    session = {},
    nodes = [],
    edges = [],
    mode = 'append',
    selectedItemIds = [],
    acceptedAt = new Date().toISOString()
} = {}) => {
    const revision = latestAIDraftRevision(session);
    const acceptedDrafts = selectedDraftNodes({ revision, mode, selectedItemIds });
    const existingIds = new Set(nodes.map((node) => node.id));
    const generatedNodes =
        mode === 'notes_only'
            ? []
            : acceptedDrafts
                  .map((draft, index) =>
                      createAcceptedNode({ draft, session, revision, nodes, edges, index })
                  )
                  .filter((node) => !existingIds.has(node.id));
    const generatedIds = new Set(generatedNodes.map((node) => node.id));
    const existingEdgeKeys = new Set(edges.map((edge) => `${edge.source}->${edge.target}`));
    const generatedEdges =
        mode === 'notes_only'
            ? []
            : asArray(revision.draft_edges)
                  .map(normalizeAIDraftEdge)
                  .filter((edge) => generatedIds.has(edge.target_node_id))
                  .map((edge) =>
                      createWorkspaceEdge(edge.source_node_id, edge.target_node_id, {
                          id: edge.id,
                          animated: true
                      })
                  )
                  .filter((edge) => {
                      const key = `${edge.source}->${edge.target}`;
                      if (existingEdgeKeys.has(key)) {
                          return false;
                      }
                      existingEdgeKeys.add(key);
                      return true;
                  });
    const nextNodes = attachDraftNotes({
        nodes: [...nodes, ...generatedNodes],
        session,
        revision,
        mode,
        acceptedAt
    });
    const previewDiff = buildAIDraftPreviewDiff(session, { mode, selectedItemIds });
    const acceptedSession = {
        ...session,
        status: 'accepted',
        accept_history: [
            ...asArray(session.accept_history),
            {
                session_id: session.session_id,
                revision_id: revision.revision_id,
                mode,
                selected_item_ids: asArray(selectedItemIds),
                accepted_node_ids: [...generatedIds],
                preview_diff: previewDiff,
                accepted_at: acceptedAt
            }
        ]
    };

    return {
        nodes: nextNodes,
        edges: [...edges, ...generatedEdges],
        session: acceptedSession,
        accept_result: {
            session_id: session.session_id,
            revision_id: revision.revision_id,
            mode,
            accepted_node_ids: [...generatedIds],
            accepted_edge_ids: generatedEdges.map((edge) => edge.id),
            preview_diff: previewDiff,
            canonical_graph_mutated: mode !== 'notes_only'
        }
    };
};

export const validateAIDraftRevision = ({ draft_nodes = [], draft_edges = [] } = {}) => {
    const nodeIds = new Set(asArray(draft_nodes).map((node) => node.id));
    const issues = [
        ...asArray(draft_nodes)
            .filter((node) => node.node_type !== 'reference' && asArray(node.source_refs).length === 0)
            .map((node) => ({
                code: 'missing_source_ref',
                severity: 'warning',
                message: 'AI draft node is missing a source reference and will be marked needs_review on accept.',
                node_id: node.id,
                repaired: false
            })),
        ...asArray(draft_edges)
            .filter((edge) => !nodeIds.has(edge.target_node_id || edge.target))
            .map((edge) => ({
                code: 'draft_edge_target_missing',
                severity: 'error',
                message: 'AI draft edge target does not reference a draft node.',
                edge_id: edge.id || edge.edge_id || '',
                repaired: false
            }))
    ];
    return {
        is_valid: !issues.some((issue) => issue.severity === 'error'),
        repaired: false,
        issues
    };
};

const createAcceptedNode = ({ draft, session, revision, nodes, edges, index }) => {
    const parentId = draft.parent_id || session.scope?.node_id || '';
    const sourceRefs = asArray(draft.source_refs);
    const position = parentId ? getChildPosition(nodes, edges, parentId) : undefined;
    const status =
        draft.node_type !== 'reference' && sourceRefs.length === 0
            ? 'needs_review'
            : draft.status || 'ai_generated';

    const node = createWorkspaceNode({
        id: draft.id,
        title: draft.title,
        body: draft.summary || draft.body,
        nodeType: draft.node_type,
        status,
        sourceRefs,
        position: position
            ? { x: position.x, y: position.y + index * 96 }
            : { x: index * 320, y: index * 120 },
        display: draft.display || {}
    });
    const provenance = {
            ...(draft.metadata || {}),
            source: 'ai_draft_session',
            ai_draft_session_id: session.session_id,
            ai_draft_revision_id: revision.revision_id,
            ai_draft_intent: session.intent,
            ai_draft_role: session.role
    };
    return {
        ...node,
        data: {
            ...node.data,
            metadata: provenance,
            ai_draft_session_id: session.session_id,
            ai_draft_revision_id: revision.revision_id,
            data: {
                ...node.data.data,
                metadata: provenance
            }
        }
    };
};

const attachDraftNotes = ({ nodes = [], session = {}, revision = {}, mode, acceptedAt }) => {
    const annotations = asArray(revision.draft_annotations);
    if (annotations.length === 0 && mode !== 'notes_only') {
        return nodes;
    }
    const targetId = session.scope?.node_id || nodes[0]?.id;
    return nodes.map((node) =>
        node.id === targetId
            ? {
                  ...node,
                  data: {
                      ...(node.data || {}),
                      ai_draft_outputs: [
                          ...asArray(node.data?.ai_draft_outputs),
                          {
                              session_id: session.session_id,
                              revision_id: revision.revision_id,
                              mode,
                              accepted_at: acceptedAt,
                              outputs: annotations
                          }
                      ]
                  }
              }
            : node
    );
};

const collectRevisionSourceRefs = (revision = {}) =>
    mergeSourceRefs(
        mergeSourceRefs(
            asArray(revision.draft_items).flatMap((item) => asArray(item.source_refs)),
            asArray(revision.draft_nodes).flatMap((node) => asArray(node.source_refs))
        ),
        asArray(revision.draft_annotations).flatMap((annotation) => asArray(annotation.source_refs))
    );

const mergeSourceRefs = (current = [], next = []) => {
    const refs = [...asArray(current)];
    const seen = new Set(refs.map((ref) => JSON.stringify(ref)));
    asArray(next).forEach((ref) => {
        const key = JSON.stringify(ref);
        if (!seen.has(key)) {
            refs.push(ref);
            seen.add(key);
        }
    });
    return refs;
};
