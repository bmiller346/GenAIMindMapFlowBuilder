import { nanoid } from 'nanoid';
import {
    createWorkspaceEdge,
    createWorkspaceNode,
    getChildPosition,
    reflowSiblingSubtrees
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

export const AI_DRAFT_EXPANSION_MODES = ['exploratory', 'strict'];

export const normalizeAIDraftExpansionMode = (value = '') =>
    AI_DRAFT_EXPANSION_MODES.includes(String(value || '').trim().toLowerCase())
        ? String(value || '').trim().toLowerCase()
        : 'exploratory';

export const AI_DRAFT_EXPANSION_TARGETS = [
    'selected_node',
    'existing_children',
    'leaves',
    'whole_branch'
];

export const normalizeAIDraftExpansionTarget = (value = '') =>
    AI_DRAFT_EXPANSION_TARGETS.includes(String(value || '').trim().toLowerCase())
        ? String(value || '').trim().toLowerCase()
        : 'selected_node';

export const AI_DRAFT_EVIDENCE_MODES = [
    'workspace',
    'uploaded_sources',
    'general_knowledge',
    'web_sources',
    'sharepoint'
];

export const normalizeAIDraftEvidenceMode = (value = '') =>
    AI_DRAFT_EVIDENCE_MODES.includes(String(value || '').trim().toLowerCase())
        ? String(value || '').trim().toLowerCase()
        : 'workspace';

export const AI_DRAFT_EVIDENCE_MODE_LABELS = {
    workspace: 'Workspace inference',
    uploaded_sources: 'Uploaded sources',
    general_knowledge: 'General knowledge',
    web_sources: 'Web/current sources',
    sharepoint: 'SharePoint/internal'
};

export const aiDraftEvidenceModeLabel = (mode = '') =>
    AI_DRAFT_EVIDENCE_MODE_LABELS[normalizeAIDraftEvidenceMode(mode)] || 'Workspace inference';

export const AI_DRAFT_CITATION_POLICIES = ['required', 'preferred', 'not_required'];

export const normalizeAIDraftCitationPolicy = (value = '') =>
    AI_DRAFT_CITATION_POLICIES.includes(String(value || '').trim().toLowerCase())
        ? String(value || '').trim().toLowerCase()
        : 'preferred';

export const AI_DRAFT_CITATION_POLICY_LABELS = {
    required: 'Citations required',
    preferred: 'Citations preferred',
    not_required: 'Citations not required'
};

export const aiDraftCitationPolicyLabel = (policy = '') =>
    AI_DRAFT_CITATION_POLICY_LABELS[normalizeAIDraftCitationPolicy(policy)] || 'Citations preferred';

export const inferAIDraftEvidencePreferences = ({
    prompt = '',
    scope = { type: 'node' },
    selectedSourceCount = 0,
    loadedSourceCount = 0,
    fallbackEvidenceMode = '',
    fallbackCitationPolicy = ''
} = {}) => {
    const text = String(prompt || '').toLowerCase();
    const normalizedScope = normalizeAIDraftScope(scope);
    let evidenceMode = normalizeAIDraftEvidenceMode(
        fallbackEvidenceMode ||
            (normalizedScope.type === 'source' || selectedSourceCount > 0
                ? 'uploaded_sources'
                : 'workspace')
    );
    if (/\b(web|online|internet|current news|latest news|news article|urls?|links?|public sources?)\b/.test(text)) {
        evidenceMode = 'web_sources';
    } else if (/\b(sharepoint|internal article|intranet|intranet update|announcement|internal comms?|internal communications?|release notes?|stakeholder updates?|monthly update|monthly news)\b/.test(text)) {
        evidenceMode = 'sharepoint';
    } else if (/\b(general knowledge|brainstorm|from your knowledge|model knowledge|no sources|uncited|assume)\b/.test(text)) {
        evidenceMode = 'general_knowledge';
    } else if (/\b(uploaded|document|docx|pdf|source|citation|cite|evidence|grounded)\b/.test(text) || selectedSourceCount > 0) {
        evidenceMode = loadedSourceCount > 0 || selectedSourceCount > 0 ? 'uploaded_sources' : evidenceMode;
    }

    let citationPolicy = normalizeAIDraftCitationPolicy(fallbackCitationPolicy || 'preferred');
    if (/\b(require citations|citation required|must cite|cite every|source-backed|source backed|grounded)\b/.test(text)) {
        citationPolicy = 'required';
    } else if (/\b(no citations|citation not required|uncited|assumption only|no sources)\b/.test(text)) {
        citationPolicy = 'not_required';
    } else if (['uploaded_sources', 'web_sources', 'sharepoint'].includes(evidenceMode)) {
        citationPolicy = 'required';
    } else if (evidenceMode === 'general_knowledge') {
        citationPolicy = 'not_required';
    }

    return {
        evidenceMode,
        citationPolicy
    };
};

export const inferAIDraftExpansionPreferences = ({
    prompt = '',
    scope = { type: 'node' },
    fallbackMode = 'exploratory',
    fallbackTarget = ''
} = {}) => {
    const text = String(prompt || '').toLowerCase();
    const scopeType = normalizeAIDraftScope(scope).type;
    const defaultTarget = scopeType === 'branch' ? 'leaves' : 'selected_node';
    const countPattern =
        /\b(?:exactly|only|just|give me|add|create|generate|with)\s+\d+\s+(?:more\s+)?(?:nodes?|items?|children|subtopics?|branches?)\b/;
    const strictPattern =
        /\b(strict|exactly|only|just|direct children|children only|one level|single level|no grand(?:child|children)|without grand(?:child|children)|no nested|without nested|not nested)\b/;
    const exploratoryPattern =
        /\b(exploratory|explore|comprehensive|deep|deeper|fully|fuller|more complete|logical manner|propagate|for each|for every|each child|every child|whole branch|entire branch|throughout|leaves|leaf nodes?)\b/;

    let expansionMode = normalizeAIDraftExpansionMode(fallbackMode);
    if (strictPattern.test(text) || countPattern.test(text)) {
        expansionMode = 'strict';
    }
    if (exploratoryPattern.test(text) && !strictPattern.test(text) && !countPattern.test(text)) {
        expansionMode = 'exploratory';
    }

    let expansionTarget = normalizeAIDraftExpansionTarget(fallbackTarget || defaultTarget);
    if (/\b(children only|direct children|one level|single level|no grand(?:child|children)|without grand(?:child|children)|no nested|without nested|not nested)\b/.test(text)) {
        expansionTarget = 'selected_node';
    } else if (scopeType === 'branch' && /\b(whole branch|entire branch|full branch|throughout|all descendants|all existing nodes|entire subtree|whole subtree)\b/.test(text)) {
        expansionTarget = 'whole_branch';
    } else if (scopeType === 'branch' && /\b(leaves|leaf nodes?|terminal nodes?|end nodes?)\b/.test(text)) {
        expansionTarget = 'leaves';
    } else if (['branch', 'node'].includes(scopeType) && /\b(each child|every child|for each child|for every child|existing children|propagate|across children)\b/.test(text)) {
        expansionTarget = 'existing_children';
    } else if (countPattern.test(text)) {
        expansionTarget = 'selected_node';
    } else if (!fallbackTarget) {
        expansionTarget = defaultTarget;
    }

    return {
        expansionMode,
        expansionTarget
    };
};

export const AI_DRAFT_ACCEPT_MODE_DETAILS = {
    append: {
        label: 'Supplement',
        help: 'Keep the current workspace visible and add this draft as reviewed supporting content.',
        user_choice: 'supplement'
    },
    replace: {
        label: 'Replace selected scope',
        help: 'Replace the scoped branch with this reviewed draft after acceptance. Branch contents in scope may be removed.',
        user_choice: 'replace'
    },
    merge: {
        label: 'Update matching',
        help: 'Update matching nodes and keep existing content that is not touched by the draft.',
        user_choice: 'update_matching'
    },
    selected: {
        label: 'Accept selected',
        help: 'Apply only the checked draft items and leave the rest as draft-only.',
        user_choice: 'accept_selected'
    },
    cited_only: {
        label: 'Accept cited only',
        help: 'Apply only draft items that include source references.',
        user_choice: 'accept_cited_only'
    },
    notes_only: {
        label: 'Preview only',
        help: 'Leave the workspace graph unchanged and preserve the draft notes for review.',
        user_choice: 'preview_only'
    }
};

export const acceptModeForChangeIntent = (intent = '', fallback = 'append') => {
    const normalizedIntent = normalizeAIDraftChangeIntent(intent, 'supplement');
    if (normalizedIntent === 'update') {
        return 'merge';
    }
    if (normalizedIntent === 'compare') {
        return 'append';
    }
    return AI_DRAFT_ACCEPT_MODES.includes(fallback) ? fallback : 'append';
};

export const getAIDraftAcceptModeDetail = (mode = 'append') =>
    AI_DRAFT_ACCEPT_MODE_DETAILS[mode] || {
        label: firstText(mode, 'Accept draft'),
        help: 'Review the draft before applying changes.',
        user_choice: firstText(mode, 'accept')
    };

const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const firstText = (...values) =>
    values.find((value) => typeof value === 'string' && value.trim()) || '';
const INTERNAL_AI_DRAFT_PROMPT_MARKERS = [
    'Use this follow-up AI memory while answering.',
    'Follow-up memory context JSON:',
    'Use this structured workspace brief while answering.'
];

export const isInternalAIDraftPrompt = (value = '') => {
    const text = String(value || '');
    return INTERNAL_AI_DRAFT_PROMPT_MARKERS.some((marker) => text.includes(marker));
};

const decodeJsonStringValue = (value = '') => {
    try {
        return JSON.parse(`"${value}"`);
    } catch {
        return String(value || '')
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t');
    }
};

export const visibleAIDraftPromptText = (value = '', fallback = '') => {
    const text = String(value || '').trim();
    const fallbackText = String(fallback || '').trim();
    const safeFallback = fallbackText && !isInternalAIDraftPrompt(fallbackText) ? fallbackText : '';

    if (!text) {
        return safeFallback;
    }
    if (!isInternalAIDraftPrompt(text)) {
        return text;
    }

    const currentPromptMatch = text.match(/"current_prompt"\s*:\s*"((?:\\.|[^"\\])*)"/);
    const currentPrompt = currentPromptMatch
        ? decodeJsonStringValue(currentPromptMatch[1]).trim()
        : '';
    if (currentPrompt && !isInternalAIDraftPrompt(currentPrompt)) {
        return currentPrompt;
    }

    const userQuestionMatch = text.match(/User question:\s*([\s\S]*)$/i);
    const userQuestion = userQuestionMatch ? userQuestionMatch[1].trim() : '';
    if (userQuestion && !isInternalAIDraftPrompt(userQuestion)) {
        return userQuestion;
    }

    return safeFallback;
};

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

const sourcePolicyRequiresCitation = ({ metadata = {}, status = '', type = '' } = {}) =>
    metadata.source_required === true ||
    metadata.requires_source === true ||
    metadata.requires_source_ref === true ||
    metadata.citation_required === true ||
    metadata.source_policy_requires_citation === true ||
    metadata.source_context_attached === true ||
    metadata.missing_source_ref === true ||
    metadata.source_gap === true ||
    metadata.source_status === 'missing_required_source' ||
    status === 'missing_source_ref' ||
    status === 'source_missing' ||
    type === 'source_gap' ||
    type === 'missing_source_ref' ||
    type === 'needs_source_ref';

export const getAIDraftSourceStatus = (item = {}) => {
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const sourceRefs = asArray(item.source_refs);
    const status = firstText(item.status, metadata.status, metadata.review_state).toLowerCase();
    const type = firstText(item.item_type, item.node_type, metadata.node_type, metadata.type).toLowerCase();

    if (sourceRefs.length > 0) {
        return {
            id: 'source_backed',
            badgeId: 'source-backed',
            label: 'Source-backed',
            tone: 'good',
            reviewable: false,
            source_required: false
        };
    }

    if (sourcePolicyRequiresCitation({ metadata, status, type })) {
        return {
            id: 'missing_required_source',
            badgeId: 'missing-source',
            label: 'Missing citation',
            tone: 'warn',
            reviewable: true,
            source_required: true
        };
    }

    return {
        id: 'ai_assumption_uncited',
        badgeId: 'ai-assumption',
        label: 'AI assumption',
        tone: 'neutral',
        reviewable: true,
        source_required: false
    };
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

const sourceRefsFromDraftItem = (item = {}) =>
    mergeSourceRefs(asArray(item.source_refs), asArray(item.metadata?.source_refs));

const hasSourceRefs = (item = {}) => sourceRefsFromDraftItem(item).length > 0;

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

const collectReplacementNodeIds = ({ nodes = [], edges = [], scope = {} } = {}) => {
    const normalizedScope = normalizeAIDraftScope(scope);
    if ((normalizedScope.type === 'branch' || normalizedScope.type === 'node') && normalizedScope.node_id) {
        const scopedNodeIds = collectBranchNodeIds(edges, normalizedScope.node_id);
        scopedNodeIds.delete(normalizedScope.node_id);
        return scopedNodeIds;
    }
    if (normalizedScope.type === 'nodes') {
        return new Set(asArray(normalizedScope.node_ids));
    }
    return collectScopedNodeIds({ nodes, edges, scope });
};

const graphAfterReplacementRemoval = ({ nodes = [], edges = [], scope = {} } = {}) => {
    const removedNodeIds = collectReplacementNodeIds({ nodes, edges, scope });
    const removedEdgeIds = new Set(
        asArray(edges)
            .filter((edge) => removedNodeIds.has(edgeSourceId(edge)) || removedNodeIds.has(edgeTargetId(edge)))
            .map((edge) => firstText(edge.id, `${edgeSourceId(edge)}->${edgeTargetId(edge)}`))
    );
    return {
        nodes: asArray(nodes).filter((node) => !removedNodeIds.has(node.id)),
        edges: asArray(edges).filter((edge) => !removedEdgeIds.has(firstText(edge.id, `${edgeSourceId(edge)}->${edgeTargetId(edge)}`))),
        removed_node_ids: [...removedNodeIds],
        removed_edge_ids: [...removedEdgeIds]
    };
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

export const changeIntentFromAIDraftSession = (session = {}, revision = latestAIDraftRevision(session)) => {
    const sessionMetadata =
        session.metadata && typeof session.metadata === 'object' ? session.metadata : {};
    const revisionMetadata =
        revision.metadata && typeof revision.metadata === 'object' ? revision.metadata : {};
    const promptHistory = asArray(session.prompt_history);
    return normalizeAIDraftChangeIntent(
        firstText(
            revisionMetadata.change_intent,
            sessionMetadata.change_intent,
            session.change_intent,
            revision.change_intent
        ),
        inferAIDraftChangeIntent(
            firstText(revision.prompt, promptHistory.at(-1)?.content, session.prompt),
            'supplement'
        )
    );
};

export const inferAIDraftChangeIntent = (prompt = '', fallback = 'supplement') => {
    const text = String(prompt || '').toLowerCase();
    if (/\b(compare|contrast|versus|vs\.?|difference|differences|tradeoff|trade-off)\b/.test(text)) {
        return 'compare';
    }
    if (/\b(add|include|also|expand|extend|more|what about|supplement|another|additional)\b/.test(text)) {
        return 'supplement';
    }
    if (
        /\b(make|revise|rewrite|update|change|tailor|adapt|speciali[sz]e|refine|convert|turn)\b/.test(text) ||
        /\b(specific to|more specific|instead of|replace|swap)\b/.test(text)
    ) {
        return 'update';
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
    const sessionSourceRefs = asArray(activeDraftSession?.source_refs);
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
            revisionSourceRefs,
            sessionSourceRefs
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
    changeIntent = '',
    expansionMode = '',
    expansionTarget = '',
    evidenceMode = '',
    citationPolicy = ''
} = {}) => {
    const normalizedMemory =
        memoryContext && typeof memoryContext === 'object' && Object.keys(memoryContext).length
            ? memoryContext
            : null;
    const normalizedChangeIntent = normalizeAIDraftChangeIntent(
        changeIntent || normalizedMemory?.change_intent || metadata.change_intent,
        inferAIDraftChangeIntent(prompt, 'supplement')
    );
    const normalizedExpansionMode = normalizeAIDraftExpansionMode(
        expansionMode || metadata.expansion_mode || normalizedMemory?.expansion_mode
    );
    const normalizedExpansionTarget = normalizeAIDraftExpansionTarget(
        expansionTarget || metadata.expansion_target || normalizedMemory?.expansion_target
    );
    const normalizedEvidenceMode = normalizeAIDraftEvidenceMode(
        evidenceMode || metadata.evidence_mode || normalizedMemory?.evidence_mode
    );
    const normalizedCitationPolicy = normalizeAIDraftCitationPolicy(
        citationPolicy || metadata.citation_policy || normalizedMemory?.citation_policy
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
            expansion_mode: normalizedExpansionMode,
            expansion_target: normalizedExpansionTarget,
            evidence_mode: normalizedEvidenceMode,
            citation_policy: normalizedCitationPolicy,
            source_policy_requires_citation: normalizedCitationPolicy === 'required',
            follow_up_memory: normalizedMemory || metadata.follow_up_memory,
            workspace_brief: workspaceBrief && typeof workspaceBrief === 'object' ? workspaceBrief : {},
            source_context: selectedSourcePayload?.metadata
        }
    };
};

export const normalizeAIDraftItem = (item = {}) => {
    const title = firstText(item.title, item.label, 'AI draft item');
    return {
        ...item,
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

const softwareOverlapArtifactTypes = new Set([
    'software_overlap_report',
    'software_overlap_candidate',
    'overlap_candidate',
    'tool_overlap',
    'duplicate_tool',
    'software_rationalization'
]);

const normalizeSoftwareFactor = (factor = {}, index = 0) => {
    if (typeof factor === 'string') {
        return {
            id: `factor-${index + 1}`,
            label: factor,
            value: ''
        };
    }
    return {
        id: firstText(factor.id, factor.key, factor.name, `factor-${index + 1}`),
        label: firstText(factor.label, factor.name, factor.key, factor.factor, `Factor ${index + 1}`),
        value: firstText(factor.value, factor.score, factor.weight, factor.detail, factor.summary)
    };
};

const normalizeSoftwareEvidence = (evidence = {}, index = 0) => {
    if (typeof evidence === 'string') {
        return {
            id: `evidence-${index + 1}`,
            label: evidence,
            source: ''
        };
    }
    return {
        id: firstText(evidence.id, evidence.source_id, evidence.document_id, `evidence-${index + 1}`),
        label: firstText(
            evidence.label,
            evidence.quote_snippet,
            evidence.snippet,
            evidence.text,
            evidence.summary,
            evidence.title,
            `Evidence ${index + 1}`
        ),
        source: [
            firstText(evidence.document_id, evidence.source_id, evidence.source),
            evidence.page ? `p. ${evidence.page}` : '',
            firstText(evidence.section)
        ]
            .filter(Boolean)
            .join(' | ')
    };
};

const collectSoftwareOverlapCandidates = (artifact = {}) =>
    [
        artifact.candidates,
        artifact.overlap_candidates,
        artifact.software_overlap_candidates,
        artifact.items,
        artifact.findings,
        artifact.matches,
        artifact.metadata?.candidates,
        artifact.metadata?.overlap_candidates,
        artifact.metadata?.software_overlap_candidates
    ].find((value) => Array.isArray(value) && value.length) || [];

const artifactType = (item = {}) =>
    firstText(
        item.artifact_type,
        item.candidate_type,
        item.item_type,
        item.type,
        item.metadata?.artifact_type,
        item.metadata?.candidate_type,
        item.metadata?.type
    ).toLowerCase();

const isSoftwareOverlapArtifact = (item = {}) => {
    const type = artifactType(item);
    const title = firstText(item.title, item.label).toLowerCase();
    return (
        softwareOverlapArtifactTypes.has(type) ||
        type.includes('software_overlap') ||
        type.includes('tool_overlap') ||
        (type.includes('overlap') && /\b(software|tool|application|app|system)\b/.test(title))
    );
};

const publishableArtifactTypes = new Set([
    'executive_summary',
    'executive_output',
    'news_article',
    'newsletter'
]);

const artifactPayload = (artifact = {}) =>
    artifact.data && typeof artifact.data === 'object'
        ? { ...artifact.data, ...artifact }
        : artifact;

const collectTextList = (...values) =>
    [
        ...new Set(
            values
                .flatMap((value) => asArray(value))
                .map((value) =>
                    typeof value === 'string'
                        ? value.trim()
                        : firstText(value?.text, value?.content, value?.summary, value?.title, value?.label)
                )
                .filter(Boolean)
        )
    ];

const normalizeArtifactSection = (section = {}, index = 0) => {
    if (typeof section === 'string') {
        return {
            id: `section-${index + 1}`,
            title: `Section ${index + 1}`,
            body: section.trim(),
            bullets: []
        };
    }
    return {
        id: firstText(section.id, section.section_id, section.title, `section-${index + 1}`),
        title: firstText(section.title, section.heading, section.label, `Section ${index + 1}`),
        body: firstText(section.body, section.content, section.text, section.summary),
        bullets: collectTextList(section.bullets, section.points, section.key_points)
    };
};

const publishableArtifactType = (artifact = {}) => {
    const type = artifactType(artifact);
    if (publishableArtifactTypes.has(type)) {
        return type;
    }
    if (type.includes('executive')) {
        return 'executive_summary';
    }
    if (type.includes('news') || type.includes('article')) {
        return 'news_article';
    }
    if (type.includes('newsletter') || type.includes('update_brief')) {
        return 'newsletter';
    }
    return '';
};

const artifactSourceRefs = (payload = {}) =>
    mergeSourceRefs(
        mergeSourceRefs(asArray(payload.source_refs), asArray(payload.sourceRefs)),
        mergeSourceRefs(
            asArray(payload.data?.source_refs),
            mergeSourceRefs(
                asArray(payload.provenance?.input_source_refs),
                asArray(payload.metadata?.source_refs)
            )
        )
    );

const artifactAssumptions = (payload = {}) =>
    collectTextList(
        payload.assumptions,
        payload.data?.assumptions,
        payload.provenance?.assumptions,
        payload.metadata?.assumptions
    );

const normalizeSourceNote = (note = {}, index = 0) => {
    if (typeof note === 'string') {
        return note.trim();
    }
    const sourceLabel = firstText(note.source, note.document_id, note.documentId, note.source_id);
    const detail = firstText(note.note, note.text, note.content, note.summary, note.quote_snippet, note.snippet);
    return [sourceLabel, detail].filter(Boolean).join(': ') || `Source note ${index + 1}`;
};

const normalizeFactCheckNote = (note = {}, index = 0) => {
    if (typeof note === 'string') {
        return note.trim();
    }
    const claim = firstText(note.claim, note.title, note.label, `Check ${index + 1}`);
    const status = firstText(note.status, note.review_state, note.reviewState);
    const detail = firstText(note.note, note.result, note.finding, note.text, note.content, note.summary);
    return [claim, status, detail].filter(Boolean).join(' - ');
};

const normalizeSourceRefLabel = (ref = {}, index = 0) => {
    if (typeof ref === 'string') {
        return ref.trim();
    }
    const source = firstText(ref.document_id, ref.documentId, ref.source_id, ref.sourceId, ref.title, ref.label);
    const locator = [
        ref.page || ref.page_number ? `p. ${ref.page || ref.page_number}` : '',
        firstText(ref.section, ref.heading),
        firstText(ref.chunk_id, ref.chunkId)
    ].filter(Boolean).join(' | ');
    const quote = firstText(ref.quote_snippet, ref.snippet, ref.text);
    const prefix = [source || `Source ${index + 1}`, locator].filter(Boolean).join(' | ');
    return quote ? `${prefix}: ${quote}` : prefix;
};

const normalizePublishableArtifactProvenance = (payload = {}, revision = {}) => {
    const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
    const revisionMetadata =
        revision.metadata && typeof revision.metadata === 'object' ? revision.metadata : {};
    const provenance =
        payload.provenance && typeof payload.provenance === 'object' ? payload.provenance : {};
    const evidenceMode = normalizeAIDraftEvidenceMode(
        firstText(
            metadata.evidence_mode,
            metadata.evidenceMode,
            provenance.evidence_mode,
            provenance.evidenceMode,
            revisionMetadata.evidence_mode,
            revisionMetadata.evidenceMode
        )
    );
    const citationPolicy = normalizeAIDraftCitationPolicy(
        firstText(
            metadata.citation_policy,
            metadata.citationPolicy,
            provenance.citation_policy,
            provenance.citationPolicy,
            revisionMetadata.citation_policy,
            revisionMetadata.citationPolicy
        )
    );
    const sourceRefs = artifactSourceRefs(payload);
    const assumptions = artifactAssumptions(payload);
    const confidence = firstText(
        provenance.confidence_summary,
        metadata.confidence_summary,
        payload.review_state,
        payload.review_status,
        payload.status
    );
    const parts = [
        aiDraftEvidenceModeLabel(evidenceMode),
        aiDraftCitationPolicyLabel(citationPolicy),
        sourceRefs.length
            ? `${sourceRefs.length} source ${sourceRefs.length === 1 ? 'reference' : 'references'}`
            : 'No source references yet',
        assumptions.length
            ? `${assumptions.length} ${assumptions.length === 1 ? 'assumption' : 'assumptions'}`
            : ''
    ].filter(Boolean);

    return {
        evidenceMode,
        evidenceLabel: aiDraftEvidenceModeLabel(evidenceMode),
        citationPolicy,
        citationLabel: aiDraftCitationPolicyLabel(citationPolicy),
        sourceRefCount: sourceRefs.length,
        assumptionCount: assumptions.length,
        confidence,
        tone:
            citationPolicy === 'required' && !sourceRefs.length
                ? 'warn'
                : sourceRefs.length
                  ? 'good'
                  : 'neutral',
        summary: parts.join(', ')
    };
};

export const normalizePublishableDraftArtifacts = (revision = {}) => {
    const artifacts = [
        ...asArray(revision.generated_artifacts),
        ...asArray(revision.artifacts),
        ...asArray(revision.draft_items)
    ];

    return artifacts
        .map((artifact, index) => {
            const payload = artifactPayload(artifact);
            const type = publishableArtifactType(payload);
            if (!type) {
                return null;
            }
            const provenance = normalizePublishableArtifactProvenance(payload, revision);
            const sections = [
                ...asArray(payload.sections),
                ...asArray(payload.body_sections),
                ...asArray(payload.article_sections),
                ...asArray(payload.issue_sections)
            ].map(normalizeArtifactSection);
            const newsletterHighlights = asArray(payload.highlights).map(normalizeArtifactSection);
            const newsletterUpcoming = asArray(payload.upcoming).map(normalizeArtifactSection);
            const newsletterRisks = asArray(payload.risks).map(normalizeArtifactSection);
            const newsletterDecisions = asArray(payload.decisions_needed || payload.required_decisions).map(normalizeArtifactSection);
            const visualBlocks = asArray(payload.visual_blocks || payload.visualBlocks).map(normalizeArtifactSection);
            const keyPoints = collectTextList(
                payload.key_points,
                payload.key_takeaways,
                payload.takeaways,
                payload.highlights,
                payload.recommendations
            );
            const recommendedActions = collectTextList(
                payload.recommended_actions,
                payload.actions,
                payload.next_actions,
                payload.recommended_next_actions
            );
            const risks = collectTextList(payload.risks, payload.risk_items);
            const sourceBackedAppendix = collectTextList(
                payload.source_backed_appendix,
                payload.source_appendix,
                payload.appendix,
                payload.source_backed_facts,
                payload.verified_facts
            );
            const assumptions = artifactAssumptions(payload);
            const sourceRefs = artifactSourceRefs(payload);
            const factChecks = [
                ...asArray(payload.fact_checks),
                ...asArray(payload.fact_check_notes),
                ...asArray(payload.factcheck_notes),
                ...asArray(payload.metadata?.fact_checks)
            ]
                .map(normalizeFactCheckNote)
                .filter(Boolean);
            const sourceNotes = [
                ...asArray(payload.source_notes),
                ...asArray(payload.sourceNotes),
                ...asArray(payload.quote_notes),
                ...asArray(payload.quotes),
                ...asArray(payload.attribution_notes),
                ...asArray(payload.metadata?.source_notes)
            ]
                .map(normalizeSourceNote)
                .filter(Boolean);
            return {
                id: firstText(payload.id, payload.artifact_id, `draft-artifact-${index + 1}`),
                artifactType: type,
                label: type === 'newsletter' ? 'Newsletter' : type === 'news_article' ? 'News article' : 'Executive summary',
                title: firstText(
                    payload.headline,
                    payload.title,
                    payload.label,
                    type === 'newsletter' ? 'Draft newsletter' : '',
                    type === 'news_article' ? 'Draft news article' : 'Draft executive summary'
                ),
                dek: firstText(payload.dek, payload.subhead, payload.subtitle, payload.summary),
                lede: firstText(payload.lede, payload.lead, payload.intro, payload.opening),
                issueLabel: firstText(payload.issue_label, payload.issueLabel, payload.issue, payload.date_label),
                cadence: firstText(payload.cadence, payload.frequency),
                openingNote: firstText(payload.opening_note, payload.openingNote, payload.editor_note, payload.intro),
                body: firstText(payload.body, payload.content, payload.text, payload.narrative),
                keyPoints,
                sections,
                audience: firstText(payload.audience, payload.metadata?.audience),
                publishTarget: firstText(
                    payload.publish_target,
                    payload.channel,
                    payload.metadata?.publish_target,
                    payload.metadata?.channel
                ),
                summary: firstText(payload.summary, payload.abstract),
                reviewState: firstText(
                    payload.review_state,
                    payload.reviewState,
                    payload.review_status,
                    payload.status,
                    payload.metadata?.reviewState,
                    payload.metadata?.review_state,
                    'needs_review'
                ),
                confidence: firstText(
                    payload.confidence,
                    payload.confidence_summary,
                    payload.metadata?.confidence,
                    payload.provenance?.confidence
                ),
                recommendedActions,
                risks,
                sourceBackedAppendix,
                factChecks,
                sourceNotes,
                sourceRefs,
                newsletterHighlights,
                newsletterUpcoming,
                newsletterRisks,
                newsletterDecisions,
                visualBlocks,
                assumptions,
                provenance
            };
        })
        .filter(Boolean);
};

export const draftArtifactPreviewToMarkdown = (artifact = {}) => {
    const lines = [];
    if (artifact.title) {
        lines.push(`# ${artifact.title}`);
    }
    if (artifact.dek) {
        lines.push('', `_${artifact.dek}_`);
    }
    if (artifact.artifactType === 'news_article') {
        if (artifact.lede) {
            lines.push('', artifact.lede);
        }
        if (artifact.body) {
            lines.push('', artifact.body);
        }
        asArray(artifact.sections).forEach((section) => {
            lines.push('', `## ${section.title}`);
            if (section.body) {
                lines.push('', section.body);
            }
            if (section.bullets?.length) {
                lines.push('', ...section.bullets.map((point) => `- ${point}`));
            }
        });
        if (artifact.audience || artifact.publishTarget || artifact.provenance?.summary) {
            lines.push('', '## Editorial notes');
            if (artifact.audience || artifact.publishTarget) {
                lines.push(
                    [artifact.audience ? `Audience: ${artifact.audience}` : '', artifact.publishTarget ? `Channel: ${artifact.publishTarget}` : '']
                        .filter(Boolean)
                        .join(' | ')
                );
            }
            if (artifact.provenance?.summary) {
                lines.push(`Evidence: ${artifact.provenance.summary}`);
            }
        }
        if (artifact.factChecks?.length) {
            lines.push('', '## Fact-check notes', ...artifact.factChecks.map((point) => `- ${point}`));
        }
        if (artifact.sourceNotes?.length) {
            lines.push('', '## Source notes', ...artifact.sourceNotes.map((point) => `- ${point}`));
        }
        const appendix = artifact.sourceBackedAppendix?.length
            ? artifact.sourceBackedAppendix
            : asArray(artifact.sourceRefs).map(normalizeSourceRefLabel).filter(Boolean);
        if (appendix.length) {
            lines.push('', '## Source-backed appendix', ...appendix.map((point) => `- ${point}`));
        }
        if (artifact.assumptions?.length) {
            lines.push('', '## Assumptions', ...artifact.assumptions.map((point) => `- ${point}`));
        }
        return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    if (artifact.artifactType === 'newsletter') {
        if (artifact.issueLabel || artifact.cadence || artifact.audience) {
            lines.push(
                '',
                [
                    artifact.issueLabel ? `Issue: ${artifact.issueLabel}` : '',
                    artifact.cadence ? `Cadence: ${artifact.cadence}` : '',
                    artifact.audience ? `Audience: ${artifact.audience}` : ''
                ]
                    .filter(Boolean)
                    .join(' | ')
            );
        }
        if (artifact.openingNote || artifact.lede || artifact.body) {
            lines.push('', artifact.openingNote || artifact.lede || artifact.body);
        }
        const renderSections = (heading, sections) => {
            if (!sections?.length) {
                return;
            }
            lines.push('', `## ${heading}`);
            sections.forEach((section) => {
                lines.push('', `### ${section.title}`);
                if (section.body) {
                    lines.push(section.body);
                }
                if (section.bullets?.length) {
                    lines.push(...section.bullets.map((point) => `- ${point}`));
                }
            });
        };
        renderSections('Top highlights', artifact.newsletterHighlights);
        renderSections('In this issue', artifact.sections);
        renderSections('Upcoming', artifact.newsletterUpcoming);
        renderSections('Risks and watch items', artifact.newsletterRisks);
        renderSections('Decisions needed', artifact.newsletterDecisions);
        renderSections('Visual blocks', artifact.visualBlocks);
        if (artifact.provenance?.summary) {
            lines.push('', '## Editor notes', `Evidence: ${artifact.provenance.summary}`);
        }
        const appendix = artifact.sourceBackedAppendix?.length
            ? artifact.sourceBackedAppendix
            : asArray(artifact.sourceRefs).map(normalizeSourceRefLabel).filter(Boolean);
        if (appendix.length) {
            lines.push('', '## Source-backed appendix', ...appendix.map((point) => `- ${point}`));
        }
        if (artifact.assumptions?.length) {
            lines.push('', '## Assumptions', ...artifact.assumptions.map((point) => `- ${point}`));
        }
        return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    if (artifact.audience || artifact.publishTarget) {
        lines.push(
            '',
            [artifact.audience ? `Audience: ${artifact.audience}` : '', artifact.publishTarget ? `Channel: ${artifact.publishTarget}` : '']
                .filter(Boolean)
                .join(' | ')
        );
    }
    if (artifact.provenance?.summary) {
        lines.push('', `Evidence: ${artifact.provenance.summary}`);
    }
    if (artifact.summary) {
        lines.push('', '## Summary', '', artifact.summary);
    }
    if (artifact.keyPoints?.length) {
        lines.push('', '## Key points', ...artifact.keyPoints.map((point) => `- ${point}`));
    }
    if (artifact.recommendedActions?.length) {
        lines.push('', '## Recommended actions', ...artifact.recommendedActions.map((point) => `- ${point}`));
    }
    if (artifact.risks?.length) {
        lines.push('', '## Risks', ...artifact.risks.map((point) => `- ${point}`));
    }
    if (artifact.body) {
        lines.push('', artifact.body);
    }
    asArray(artifact.sections).forEach((section) => {
        lines.push('', `## ${section.title}`);
        if (section.body) {
            lines.push('', section.body);
        }
        if (section.bullets?.length) {
            lines.push('', ...section.bullets.map((point) => `- ${point}`));
        }
    });
    if (artifact.sourceBackedAppendix?.length) {
        lines.push('', '## Source-backed appendix', ...artifact.sourceBackedAppendix.map((point) => `- ${point}`));
    }
    if (artifact.assumptions?.length) {
        lines.push('', '## Assumptions', ...artifact.assumptions.map((point) => `- ${point}`));
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const normalizeSoftwareOverlapCandidate = (candidate = {}, index = 0) => {
    const metadata = candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : {};
    const applications = [
        ...asArray(candidate.applications),
        ...asArray(candidate.tools),
        ...asArray(candidate.systems),
        candidate.source_application,
        candidate.target_application,
        candidate.source_tool,
        candidate.target_tool
    ]
        .map((value) =>
            typeof value === 'string'
                ? value
                : firstText(value?.name, value?.title, value?.label, value?.id)
        )
        .filter(Boolean);
    const evidence = [
        ...asArray(candidate.evidence),
        ...asArray(candidate.evidence_refs),
        ...asArray(candidate.source_refs),
        ...asArray(metadata.evidence)
    ].map(normalizeSoftwareEvidence);
    const factors = [
        ...asArray(candidate.factors),
        ...asArray(candidate.scoring_factors),
        ...asArray(metadata.factors)
    ].map(normalizeSoftwareFactor);

    return {
        id: firstText(candidate.id, candidate.candidate_id, `software-overlap-${index + 1}`),
        title: firstText(candidate.title, candidate.label, applications.join(' / '), `Potential overlap ${index + 1}`),
        applications,
        score: candidate.score ?? candidate.overlap_score ?? candidate.similarity_score ?? metadata.score ?? '',
        confidence: firstText(candidate.confidence, metadata.confidence),
        reviewState: firstText(
            candidate.review_state,
            candidate.review_status,
            candidate.status,
            metadata.review_state,
            'needs_review'
        ),
        recommendation: firstText(
            candidate.recommendation,
            candidate.recommended_action,
            candidate.owner_review,
            metadata.recommendation
        ),
        rationale: firstText(candidate.rationale, candidate.reason, candidate.summary, candidate.content),
        factors,
        evidence
    };
};

export const normalizeSoftwareOverlapReports = (revision = {}) => {
    const artifacts = [
        ...asArray(revision.generated_artifacts),
        ...asArray(revision.artifacts),
        ...asArray(revision.draft_items),
        ...asArray(revision.draft_annotations)
    ].filter(isSoftwareOverlapArtifact);

    return artifacts.map((artifact, artifactIndex) => {
        const candidates = collectSoftwareOverlapCandidates(artifact);
        const fallbackCandidate =
            candidates.length === 0 && isSoftwareOverlapArtifact(artifact)
                ? [artifact]
                : candidates;
        return {
            id: firstText(artifact.id, artifact.artifact_id, `software-overlap-report-${artifactIndex + 1}`),
            title: firstText(artifact.title, artifact.label, 'Software overlap report'),
            summary: firstText(artifact.summary, artifact.content, artifact.body, artifact.description),
            reviewState: firstText(
                artifact.review_state,
                artifact.review_status,
                artifact.status,
                artifact.metadata?.review_state,
                'needs_review'
            ),
            candidates: fallbackCandidate.map(normalizeSoftwareOverlapCandidate)
        };
    });
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

const HIERARCHY_RELATIONSHIP_TYPES = new Set([
    'contains',
    'child',
    'children',
    'has_child',
    'includes',
    'part_of',
    'decomposes_to',
    'step',
    'subtopic',
    'sub_topic'
]);

const isHierarchyDraftEdge = (edge = {}) => {
    const relationshipType = firstText(edge.relationship_type, edge.metadata?.relationship_type, 'contains')
        .toLowerCase()
        .replaceAll(' ', '_');
    return HIERARCHY_RELATIONSHIP_TYPES.has(relationshipType);
};

const normalizeHierarchyRelationshipType = (edge = {}) =>
    isHierarchyDraftEdge(edge) ? 'contains' : firstText(edge.relationship_type, edge.metadata?.relationship_type, 'contains');

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
        model: selectedModel,
        metadata
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
    removals: Number(diff.removed_nodes || diff.removals || 0),
    removedEdges: Number(diff.removed_edges || 0),
    needsReview: Number(diff.needs_review_repairs || diff.needs_review_items || 0),
    reviewOutputs: Number(diff.review_outputs || 0),
    text: [
        `+${Number(diff.added_nodes || diff.nodes || 0)} nodes`,
        `+${Number(diff.added_edges || diff.edges || 0)} edges`,
        `~${Number(diff.updated_nodes || diff.updates || 0)} updates`,
        `-${Number(diff.removed_nodes || diff.removals || 0)} removals`,
        `!${Number(diff.needs_review_repairs || diff.needs_review_items || 0)} needs_review items`
    ].join('  ')
});

export const getAIDraftItemBadges = (item = {}) => {
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const assumptions = asArray(item.assumptions);
    const confidence = numericConfidence(item.confidence ?? metadata.confidence);
    const status = firstText(item.status, metadata.status).toLowerCase();
    const type = firstText(item.item_type, metadata.node_type, metadata.type).toLowerCase();
    const sourceStatus = getAIDraftSourceStatus(item);
    const badges = [];

    badges.push({ id: sourceStatus.badgeId, label: sourceStatus.label, tone: sourceStatus.tone });
    if (sourceStatus.reviewable) {
        badges.push({ id: 'needs-review', label: 'Needs review', tone: 'warn' });
    }
    if (status === 'needs_review' || type === 'needs_review' || metadata.needs_review === true) {
        if (!badges.some((badge) => badge.id === 'needs-review')) {
            badges.push({ id: 'needs-review', label: 'Needs review', tone: 'warn' });
        }
    }
    if (
        sourceStatus.id !== 'ai_assumption_uncited' &&
        (assumptions.length > 0 ||
            metadata.assumption === true ||
            metadata.assumptions === true ||
            type === 'assumption')
    ) {
        badges.push({ id: 'assumption', label: 'Assumption', tone: 'neutral' });
    }
    if (confidence !== null && confidence < 0.6) {
        badges.push({ id: 'low-confidence', label: 'Low confidence', tone: 'warn' });
    }
    if (metadata.duplicate === true || metadata.duplicate_of || type.includes('duplicate')) {
        badges.push({ id: 'duplicate', label: 'Duplicate', tone: 'caution' });
    }
    if (isSoftwareOverlapArtifact(item)) {
        badges.push({ id: 'potential-overlap', label: 'Potential overlap', tone: 'caution' });
    }
    if (metadata.conflict === true || metadata.conflicts || type.includes('conflict')) {
        badges.push({ id: 'conflict', label: 'Conflict', tone: 'danger' });
    }
    return badges;
};

export const selectedDraftNodes = ({ revision = {}, mode = 'append', selectedItemIds = [] } = {}) => {
    const selected = new Set(asArray(selectedItemIds));
    let nodes = asArray(revision.draft_nodes).map(normalizeAIDraftNode);
    if (mode === 'selected') {
        return selected.size > 0 ? nodes.filter((node) => selected.has(node.id)) : [];
    }
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

const selectedRelationshipDraftItems = ({ revision = {}, mode = 'append', selectedItemIds = [] } = {}) => {
    if (mode === 'notes_only') {
        return [];
    }
    const selected = new Set(asArray(selectedItemIds));
    return asArray(revision.draft_items)
        .map(normalizeAIDraftItem)
        .filter((item) => {
            const metadata = item.metadata || {};
            const relationshipType = firstText(metadata.relationship_type, item.relationship_type);
            if (!metadata.source_node_id || !metadata.target_node_id || !relationshipType) {
                return false;
            }
            if (['contains', 'child', 'parent'].includes(relationshipType)) {
                return false;
            }
            if (mode === 'selected') {
                return selected.size > 0 && selected.has(item.id);
            }
            if (mode === 'cited_only') {
                return hasSourceRefs(item);
            }
            return true;
        });
};

const relationshipEndpointIds = (item = {}) => {
    const metadata = item.metadata || {};
    return {
        sourceId: firstText(metadata.source_node_id, metadata.source, item.source_node_id),
        targetId: firstText(metadata.target_node_id, metadata.target, item.target_node_id)
    };
};

const filterRelationshipsForAcceptedDraftNodes = ({
    revision = {},
    relationshipItems = [],
    acceptedNodeIds = new Set()
} = {}) => {
    const draftNodeIds = new Set(
        asArray(revision.draft_nodes)
            .map((node) => firstText(node.id, node.node_id))
            .filter(Boolean)
    );
    return asArray(relationshipItems).filter((item) => {
        const { sourceId, targetId } = relationshipEndpointIds(item);
        return [sourceId, targetId].every((nodeId) => !draftNodeIds.has(nodeId) || acceptedNodeIds.has(nodeId));
    });
};

const scopedRemovalCounts = ({ mode = 'append', nodes = [], edges = [], scope = {} } = {}) => {
    if (mode !== 'replace') {
        return { removed_nodes: 0, removed_edges: 0, removed_node_ids: [], removed_edge_ids: [] };
    }
    const removal = graphAfterReplacementRemoval({ nodes, edges, scope });
    return {
        removed_nodes: removal.removed_node_ids.length,
        removed_edges: removal.removed_edge_ids.length,
        removed_node_ids: removal.removed_node_ids,
        removed_edge_ids: removal.removed_edge_ids
    };
};

const describeAIDraftPreviewDiff = ({
    mode = 'append',
    nodes = [],
    edges = [],
    relationshipItems = [],
    reviewOutputs = 0,
    removedNodes = 0,
    removedEdges = 0,
    needsReviewRepairs = 0,
    assumptionRepairs = 0,
    missingSourceRepairs = 0,
    updatedNodes = 0
} = {}) => {
    const draftItemCount = nodes.length + relationshipItems.length;
    if (mode === 'notes_only') {
        return [
            'Graph will not change.',
            reviewOutputs
                ? `${reviewOutputs} review artifact${reviewOutputs === 1 ? '' : 's'} stay available for reference.`
                : 'Draft notes stay available for review.'
        ];
    }
    if (mode === 'merge') {
        return [
            updatedNodes
                ? `${updatedNodes} matching node${updatedNodes === 1 ? '' : 's'} will be updated.`
                : 'No matching node updates are selected yet.',
            'Existing content outside matching draft items stays in place.'
        ];
    }
    if (mode === 'replace') {
        return [
            removedNodes || removedEdges
                ? `${removedNodes} scoped node${removedNodes === 1 ? '' : 's'} and ${removedEdges} connected edge${removedEdges === 1 ? '' : 's'} may be removed before the draft is applied.`
                : 'Selected scope will be replaced by the reviewed draft.',
            `${nodes.length} draft node${nodes.length === 1 ? '' : 's'} and ${edges.length + relationshipItems.length} edge${edges.length + relationshipItems.length === 1 ? '' : 's'} will be added.`
        ];
    }
    if (mode === 'selected') {
        return [
            draftItemCount
                ? `${draftItemCount} checked draft item${draftItemCount === 1 ? '' : 's'} will be accepted.`
                : 'No checked draft items will be accepted yet.',
            'Unchecked draft items remain draft-only.'
        ];
    }
    if (mode === 'cited_only') {
        return [
            draftItemCount
                ? `${draftItemCount} source-backed draft item${draftItemCount === 1 ? '' : 's'} will be accepted.`
                : 'No source-backed draft items are available to accept.',
            needsReviewRepairs
                ? `${needsReviewRepairs} uncited item${needsReviewRepairs === 1 ? '' : 's'} stay draft-only (${missingSourceRepairs} missing citation${missingSourceRepairs === 1 ? '' : 's'}, ${assumptionRepairs} AI assumption${assumptionRepairs === 1 ? '' : 's'}).`
                : 'Uncited draft items stay out of the graph.'
        ];
    }
    return [
        `${nodes.length} draft node${nodes.length === 1 ? '' : 's'} will be added as supporting content.`,
        'Existing workspace content stays in place.'
    ];
};

const reviewSourceStatusCounts = (items = []) =>
    asArray(items).reduce(
        (counts, item) => {
            const sourceStatus = getAIDraftSourceStatus(item);
            if (sourceStatus.id === 'missing_required_source') {
                counts.missing_required_source += 1;
            } else if (sourceStatus.id === 'ai_assumption_uncited') {
                counts.ai_assumption_uncited += 1;
            }
            return counts;
        },
        { ai_assumption_uncited: 0, missing_required_source: 0 }
    );

export const buildAIDraftPreviewDiff = (
    session = {},
    { mode = 'append', selectedItemIds = [], currentNodes = [], currentEdges = [] } = {}
) => {
    const revision = latestAIDraftRevision(session);
    const changeIntent = changeIntentFromAIDraftSession(session, revision);
    const acceptModeDetail = getAIDraftAcceptModeDetail(mode);
    const nodes = selectedDraftNodes({ revision, mode, selectedItemIds });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges =
        mode === 'notes_only'
            ? []
            : asArray(revision.draft_edges).filter((edge) => nodeIds.has(edge.target_node_id));
    const relationshipItems = filterRelationshipsForAcceptedDraftNodes({
        revision,
        relationshipItems: selectedRelationshipDraftItems({ revision, mode, selectedItemIds }),
        acceptedNodeIds: nodeIds
    });
    const removals = scopedRemovalCounts({
        mode,
        nodes: currentNodes,
        edges: currentEdges,
        scope: session.scope
    });
    const needsReviewNodes =
        mode === 'notes_only'
            ? []
            : mode === 'cited_only'
              ? asArray(revision.draft_nodes).filter(
                    (node) => node.node_type !== 'reference' && asArray(node.source_refs).length === 0
                )
              : nodes.filter((node) => node.node_type !== 'reference' && asArray(node.source_refs).length === 0);
    const needsReviewRepairs = needsReviewNodes.length;
    const sourceStatusCounts = reviewSourceStatusCounts(needsReviewNodes);
    const updatedNodes = mode === 'merge' ? nodes.length : 0;
    const addedEdges = mode === 'merge' ? 0 : edges.length + relationshipItems.length;
    const previewLines = describeAIDraftPreviewDiff({
        mode,
        nodes,
        edges,
        relationshipItems,
        reviewOutputs: asArray(revision.draft_annotations).length,
        removedNodes: removals.removed_nodes,
        removedEdges: removals.removed_edges,
        needsReviewRepairs,
        assumptionRepairs: sourceStatusCounts.ai_assumption_uncited,
        missingSourceRepairs: sourceStatusCounts.missing_required_source,
        updatedNodes
    });
    const diff = {
        mode,
        added_nodes: mode === 'merge' ? 0 : nodes.length,
        added_edges: addedEdges,
        updated_nodes: updatedNodes,
        removed_nodes: removals.removed_nodes,
        removed_edges: removals.removed_edges,
        review_outputs: asArray(revision.draft_annotations).length,
        needs_review_repairs: needsReviewRepairs,
        ai_assumption_repairs: sourceStatusCounts.ai_assumption_uncited,
        missing_source_repairs: sourceStatusCounts.missing_required_source,
        accepted_item_ids: asArray(selectedItemIds).length
            ? asArray(selectedItemIds)
            : [...nodes.map((node) => node.id), ...relationshipItems.map((item) => item.id)],
        preview_lines: previewLines,
        metadata: {
            change_intent: changeIntent,
            accept_mode: mode,
            accept_mode_label: acceptModeDetail.label,
            accept_mode_help: acceptModeDetail.help,
            user_choice: acceptModeDetail.user_choice,
            preview_lines: previewLines,
            source_status_counts: sourceStatusCounts,
            removed_node_ids: removals.removed_node_ids,
            removed_edge_ids: removals.removed_edge_ids,
            follow_up_semantics: {
                change_intent: changeIntent,
                accept_mode: mode,
                accept_mode_label: acceptModeDetail.label,
                accept_mode_help: acceptModeDetail.help,
                user_choice: acceptModeDetail.user_choice,
                preserves_existing: mode !== 'replace',
                canonical_graph_mutated: mode !== 'notes_only',
                selected_only: mode === 'selected',
                adds_as_alternate: mode === 'append',
                source_backed_only: mode === 'cited_only'
            }
        }
    };
    diff.summary = [
        `+${diff.added_nodes} nodes`,
        `+${diff.added_edges} edges`,
        diff.updated_nodes ? `~${diff.updated_nodes} nodes updated` : '',
        diff.removed_nodes ? `-${diff.removed_nodes} scoped nodes` : '',
        diff.needs_review_repairs
            ? `!${diff.needs_review_repairs} reviewable (${diff.missing_source_repairs} missing citation, ${diff.ai_assumption_repairs} AI assumption)`
            : ''
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
    const acceptedDraftIds = new Set(acceptedDrafts.map((draft) => draft.id));
    const acceptedRelationships = filterRelationshipsForAcceptedDraftNodes({
        revision,
        relationshipItems: selectedRelationshipDraftItems({ revision, mode, selectedItemIds }),
        acceptedNodeIds: acceptedDraftIds
    });
    const baseGraph =
        mode === 'replace'
            ? graphAfterReplacementRemoval({ nodes, edges, scope: session.scope })
            : { nodes: asArray(nodes), edges: asArray(edges), removed_node_ids: [], removed_edge_ids: [] };
    const existingIds = new Set(baseGraph.nodes.map((node) => node.id));
    const normalizedDraftEdges = asArray(revision.draft_edges).map(normalizeAIDraftEdge);
    const hierarchyDraftEdges = normalizedDraftEdges.filter(isHierarchyDraftEdge);
    const relationshipDraftEdges = normalizedDraftEdges.filter((edge) => !isHierarchyDraftEdge(edge));
    const parentIdByDraftId = new Map(
        hierarchyDraftEdges
            .filter((edge) => edge.source_node_id && edge.target_node_id)
            .map((edge) => [edge.target_node_id, edge.source_node_id])
    );
    const generatedNodes = [];
    const workingHierarchyEdges = [...baseGraph.edges];
    if (mode !== 'notes_only') {
        acceptedDrafts.forEach((draft) => {
            if (existingIds.has(draft.id)) {
                return;
            }
            const node = createAcceptedNode({
                draft,
                session,
                revision,
                nodes: [...baseGraph.nodes, ...generatedNodes],
                edges: workingHierarchyEdges,
                parentId: parentIdByDraftId.get(draft.id)
            });
            generatedNodes.push(node);
            existingIds.add(node.id);
            const parentId = parentIdByDraftId.get(draft.id) || draft.parent_id || session.scope?.node_id || '';
            if (parentId) {
                workingHierarchyEdges.push({
                    id: `draft_position_edge_${parentId}_${node.id}`,
                    source: parentId,
                    target: node.id
                });
            }
        });
    }
    const generatedIds = new Set(generatedNodes.map((node) => node.id));
    const acceptedOrExistingIds = new Set([
        ...baseGraph.nodes.map((node) => node.id),
        ...generatedIds
    ]);
    const existingEdgeKeys = new Set(baseGraph.edges.map((edge) => `${edge.source}->${edge.target}`));
    const generatedHierarchyEdges =
        mode === 'notes_only'
            ? []
            : hierarchyDraftEdges
                  .filter((edge) => generatedIds.has(edge.target_node_id))
                  .filter((edge) => acceptedOrExistingIds.has(edge.source_node_id))
                  .map((edge) => {
                      const relationshipType = normalizeHierarchyRelationshipType(edge);
                      return {
                          ...createWorkspaceEdge(edge.source_node_id, edge.target_node_id, {
                          id: edge.id,
                          animated: true
                          }),
                          relationship_type: relationshipType,
                          metadata: {
                              ...(edge.metadata || {}),
                              relationship_type: relationshipType,
                              source: firstText(edge.metadata?.source, 'ai_draft_hierarchy')
                          },
                          data: {
                              relationship_type: relationshipType,
                              source: firstText(edge.metadata?.source, 'ai_draft_hierarchy')
                          }
                      };
                  })
                  .filter((edge) => {
                      const key = `${edge.source}->${edge.target}`;
                      if (existingEdgeKeys.has(key)) {
                          return false;
                      }
                      existingEdgeKeys.add(key);
                      return true;
                  });
    const generatedRelationshipEdges =
        mode === 'notes_only'
            ? []
            : [
                  ...acceptedRelationships.map((item) => ({
                      id: item.id,
                      source_node_id: item.metadata?.source_node_id,
                      target_node_id: item.metadata?.target_node_id,
                      relationship_type: firstText(item.metadata?.relationship_type, item.relationship_type, 'related_to'),
                      source_refs: asArray(item.source_refs),
                      confidence: item.confidence,
                      status: item.status,
                      content: item.content,
                      metadata: item.metadata || {}
                  })),
                  ...relationshipDraftEdges.map((edge) => ({
                      id: edge.id,
                      source_node_id: edge.source_node_id,
                      target_node_id: edge.target_node_id,
                      relationship_type: edge.relationship_type,
                      source_refs: [],
                      metadata: edge.metadata || {}
                  }))
              ]
                  .map((item) => {
                      const metadata = item.metadata || {};
                      const relationshipType = firstText(metadata.relationship_type, item.relationship_type, 'related_to');
                      return {
                          id: firstText(metadata.relationship_edge_id, metadata.edge_id, item.id),
                          source: firstText(metadata.source_node_id, item.source_node_id),
                          target: firstText(metadata.target_node_id, item.target_node_id),
                          type: 'smoothstep',
                          animated: false,
                          relationship_type: relationshipType,
                          source_refs: asArray(item.source_refs),
                          metadata: {
                              ...metadata,
                              source: metadata.source || 'ai_draft_relationship',
                              confidence: item.confidence ?? metadata.confidence ?? '',
                              rationale: firstText(metadata.rationale, item.content),
                              review_state: firstText(item.status, metadata.review_state, 'needs_review')
                          },
                          data: {
                              relationship_type: relationshipType,
                              confidence: item.confidence ?? metadata.confidence ?? '',
                              rationale: firstText(metadata.rationale, item.content),
                              review_state: firstText(item.status, metadata.review_state, 'needs_review')
                          }
                      };
                  })
                  .filter((edge) => edge.source && edge.target)
                  .filter((edge) => acceptedOrExistingIds.has(edge.source) && acceptedOrExistingIds.has(edge.target))
                  .filter((edge) => {
                      const key = `${edge.source}->${edge.target}->${edge.relationship_type}`;
                      if (existingEdgeKeys.has(key)) {
                          return false;
                      }
                      existingEdgeKeys.add(key);
                      return true;
                  });
    const generatedEdges = [...generatedHierarchyEdges, ...generatedRelationshipEdges];
    const nextEdges = [...baseGraph.edges, ...generatedEdges];
    const normalizedScope = normalizeAIDraftScope(session.scope);
    const existingNodeIds = new Set(baseGraph.nodes.map((node) => node.id));
    const reflowedExistingSources = new Set();
    const internallyReseatedNodes = generatedHierarchyEdges.reduce((nextNodes, edge) => {
        const sourceId = edgeSourceId(edge);
        if (!sourceId || !existingNodeIds.has(sourceId) || reflowedExistingSources.has(sourceId)) {
            return nextNodes;
        }
        const parentId = edgeSourceId(nextEdges.find((candidate) => edgeTargetId(candidate) === sourceId));
        if (!parentId) {
            return nextNodes;
        }
        reflowedExistingSources.add(sourceId);
        return reflowSiblingSubtrees({
            nodes: nextNodes,
            edges: nextEdges,
            parentId,
            anchorNodeId: sourceId
        });
    }, [...baseGraph.nodes, ...generatedNodes]);
    const scopeParentId =
        ['branch', 'node'].includes(normalizedScope.type) && normalizedScope.node_id
            ? edgeSourceId(nextEdges.find((edge) => edgeTargetId(edge) === normalizedScope.node_id))
            : '';
    const reseatedNodes = scopeParentId
        ? reflowSiblingSubtrees({
              nodes: internallyReseatedNodes,
              edges: nextEdges,
              parentId: scopeParentId,
              anchorNodeId: normalizedScope.node_id
          })
        : internallyReseatedNodes;
    const nextNodes = attachDraftNotes({
        nodes: reseatedNodes,
        session,
        revision,
        mode,
        acceptedAt
    });
    const previewDiff = buildAIDraftPreviewDiff(session, {
        mode,
        selectedItemIds,
        currentNodes: nodes,
        currentEdges: edges
    });
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
        edges: nextEdges,
        session: acceptedSession,
        accept_result: {
            session_id: session.session_id,
            revision_id: revision.revision_id,
            mode,
            accepted_node_ids: [...generatedIds],
            accepted_edge_ids: generatedEdges.map((edge) => edge.id),
            preview_diff: previewDiff,
            patch_operations: [
                ...baseGraph.removed_edge_ids.map((edgeId) => ({
                    op: 'remove_edge',
                    edge_id: edgeId,
                    metadata: { mode: 'replace' }
                })),
                ...baseGraph.removed_node_ids.map((nodeId) => ({
                    op: 'remove_node',
                    node_id: nodeId,
                    metadata: {
                        mode: 'replace',
                        scope_node_id: session.scope?.node_id || ''
                    }
                }))
            ],
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

const createAcceptedNode = ({ draft, session, revision, nodes, edges, parentId }) => {
    const preferredParentId = parentId || draft.parent_id || session.scope?.node_id || '';
    const resolvedParentId = nodes.some((node) => node.id === preferredParentId)
        ? preferredParentId
        : session.scope?.node_id || '';
    const sourceRefs = asArray(draft.source_refs);
    const sourceStatus = getAIDraftSourceStatus(draft);
    const position = resolvedParentId ? getChildPosition(nodes, edges, resolvedParentId) : undefined;
    const assumption =
        draft.assumption ?? draft.metadata?.assumption ?? draft.metadata?.assumptions ?? false;
    const confidence = draft.confidence ?? draft.metadata?.confidence ?? '';
    const duplicate = draft.duplicate ?? draft.metadata?.duplicate ?? draft.metadata?.duplicate_of ?? '';
    const conflict = draft.conflict ?? draft.metadata?.conflict ?? draft.metadata?.conflicts ?? '';
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
        position: position || { x: nodes.length * 320, y: nodes.length * 120 },
        metadata: {
            ...(draft.metadata || {}),
            source_status: sourceStatus.id,
            source_required: sourceStatus.source_required,
            reviewable_unsourced: sourceStatus.reviewable && sourceRefs.length === 0
        },
        display: draft.display || {}
    });
    const provenance = {
            ...(draft.metadata || {}),
            source: 'ai_draft_session',
            source_status: sourceStatus.id,
            source_status_label: sourceStatus.label,
            source_required: sourceStatus.source_required,
            reviewable_unsourced: sourceStatus.reviewable && sourceRefs.length === 0,
            ai_draft_session_id: session.session_id,
            ai_draft_revision_id: revision.revision_id,
            ai_draft_intent: session.intent,
            ai_draft_role: session.role
    };
    return {
        ...node,
        data: {
            ...node.data,
            assumption,
            confidence,
            duplicate,
            conflict,
            metadata: provenance,
            ai_draft_session_id: session.session_id,
            ai_draft_revision_id: revision.revision_id,
            data: {
                ...node.data.data,
                assumption,
                confidence,
                duplicate,
                conflict,
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
