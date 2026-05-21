import { nanoid } from 'nanoid';
import { asArray, collectScopedNodeIds, edgeSourceId, edgeTargetId, firstText, mergeSourceRefs, sourceRefsFromNode } from './aiDraftSessionCommon.js';
import { normalizeAIDraftScope } from './aiDraftSessionScopes.js';
import {
    draftArtifactPreviewToMarkdown,
    normalizeAcceptedDraftArtifacts,
    normalizePublishableDraftArtifacts,
    normalizeSoftwareOverlapReports
} from './aiDraftArtifacts.js';
import {
    buildAIDraftPreviewDiff,
    formatAIDraftPreviewDiffSummary,
    getAIDraftItemBadges,
    selectedDraftNodes
} from './aiDraftPreviewDiff.js';
import { acceptAIDraftSession, rejectAIDraftSession } from './aiDraftAcceptance.js';

export { normalizeAIDraftScope };
export {
    draftArtifactPreviewToMarkdown,
    normalizeAcceptedDraftArtifacts,
    normalizePublishableDraftArtifacts,
    normalizeSoftwareOverlapReports
};
export {
    buildAIDraftPreviewDiff,
    formatAIDraftPreviewDiffSummary,
    getAIDraftItemBadges,
    selectedDraftNodes
};
export { acceptAIDraftSession, rejectAIDraftSession };

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

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')\]}]+/gi;

const normalizePastedSourceUrl = (value = '') => {
    const trimmed = String(value || '').trim().replace(/[.,;:!?]+$/g, '');
    try {
        const parsed = new URL(trimmed);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return '';
        }
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return '';
    }
};

export const sourceRefsFromPastedUrls = (text = '') => {
    const refs = [];
    const seen = new Set();
    String(text || '').replace(URL_PATTERN, (match) => {
        const url = normalizePastedSourceUrl(match);
        if (url && !seen.has(url)) {
            refs.push({
                document_id: url,
                section: 'Pasted URL',
                quote_snippet: '',
                confidence: 'medium',
                source_type: 'url'
            });
            seen.add(url);
        }
        return match;
    });
    return refs;
};

export const inferAIDraftEvidencePreferences = ({
    prompt = '',
    scope = { type: 'node' },
    selectedSourceCount = 0,
    loadedSourceCount = 0,
    fallbackEvidenceMode = '',
    fallbackCitationPolicy = ''
} = {}) => {
    const text = String(prompt || '').toLowerCase();
    const hasPastedUrl = /https?:\/\/[^\s<>)"']+/i.test(String(prompt || ''));
    const asksForPublicReferenceEvidence =
        /\b(code references?|applicable codes?|standards?|regulations?|statutes?|authority|authorities|public references?|citeable|citable)\b/.test(text) ||
        /\b(nfpa|nec|njac|ucc|ibc|ifc|imc|ipc|ashrae|asme|osha|ul|ieee|ansi|ada|fema|ahj)\b/.test(text);
    const normalizedScope = normalizeAIDraftScope(scope);
    let evidenceMode = normalizeAIDraftEvidenceMode(
        fallbackEvidenceMode ||
            (normalizedScope.type === 'source' || selectedSourceCount > 0
                ? 'uploaded_sources'
                : 'workspace')
    );
    const hasChosenSources =
        normalizedScope.type === 'source' || selectedSourceCount > 0 || loadedSourceCount > 0;
    if (asksForPublicReferenceEvidence && hasChosenSources) {
        evidenceMode = 'uploaded_sources';
    } else if (
        hasPastedUrl ||
        /\b(web|online|internet|current news|latest news|news article|urls?|links?|public sources?)\b/.test(text) ||
        asksForPublicReferenceEvidence
    ) {
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
        confidence: firstText(ref.confidence),
        source_type: firstText(ref.source_type, ref.sourceType, ref.type),
        url: firstText(ref.url)
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
    adHocSourceRefs = [],
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
            adHocSourceRefs,
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
    adHocSourceRefs = [],
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
        source_refs: normalizedMemory?.source_refs || normalizeMemorySourceRefs(selectedSourcePayload?.source_refs, adHocSourceRefs),
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

export const normalizeAIDraftNode = (node = {}) => ({
    ...node,
    id: firstText(node.id, node.node_id, `draft_node_${nanoid(8)}`),
    title: firstText(node.title, node.label, 'AI draft'),
    summary: firstText(node.summary, node.body, node.rationale),
    node_type: firstText(node.node_type, node.type, 'concept'),
    status: firstText(node.status, 'ai_generated'),
    source_refs: asArray(node.source_refs),
    df: asArray(node.df || node.table_rows),
    graph: node.graph && typeof node.graph === 'object' ? { ...node.graph } : undefined,
    query: firstText(node.query),
    artifact_type: firstText(node.artifact_type),
    artifact_ids: asArray(node.artifact_ids),
    review_state: firstText(node.review_state, node.reviewState),
    generated_artifacts: asArray(node.generated_artifacts),
    external_refs:
        node.external_refs && typeof node.external_refs === 'object'
            ? { ...node.external_refs }
            : {},
    metadata: node.metadata && typeof node.metadata === 'object' ? { ...node.metadata } : {}
});

const connectedPackagePayload = (artifact = {}) =>
    artifact.data && typeof artifact.data === 'object' && (artifact.data.package_id || artifact.data.acceptance_groups)
        ? artifact.data
        : artifact;

const connectedPackageItemId = (item = {}) =>
    firstText(item.package_item_id, item.metadata?.package_item_id, item.id, item.node_id);

const connectedPackageCollection = (packageData = {}, key = '') =>
    asArray(packageData[key]).filter((item) => item && typeof item === 'object');

const connectedPackageDraftItemsFromArtifact = (artifact = {}, artifactIndex = 0) => {
    const artifactType = firstText(artifact.artifact_type, artifact.type);
    if (artifactType !== 'connected_picture_package') {
        const artifactId = firstText(artifact.id, artifact.artifact_id, `draft-artifact-${artifactIndex + 1}`);
        return [
            normalizeAIDraftItem({
                id: artifactId,
                item_type: artifactType || 'artifact',
                title: firstText(artifact.title, artifact.label, artifact.data?.title, `Artifact ${artifactIndex + 1}`),
                content: firstText(artifact.summary, artifact.description, artifact.data?.summary),
                source_refs: artifact.source_refs,
                selected: true,
                metadata: {
                    artifact_id: artifactId,
                    artifact_type: artifactType || 'artifact'
                }
            })
        ];
    }

    const packageData = connectedPackagePayload(artifact);
    const packageId = firstText(packageData.package_id, artifact.id, `connected-package-${artifactIndex + 1}`);
    const artifactId = firstText(artifact.id, packageId);
    const itemSpecs = [
        ['primary_nodes', 'package_node'],
        ['relationship_edges', 'relationship'],
        ['view_lenses', 'package_lens'],
        ['structured_evidence', 'package_evidence'],
        ['evidence_links', 'package_evidence_link'],
        ['tasks', 'task'],
        ['risks', 'risk'],
        ['decisions', 'decision'],
        ['repair_targets', 'repair_target']
    ];
    const items = itemSpecs.flatMap(([collectionKey, itemType]) =>
        connectedPackageCollection(packageData, collectionKey)
            .map((item) => {
                const packageItemId = connectedPackageItemId(item);
                if (!packageItemId) {
                    return null;
                }
                return normalizeAIDraftItem({
                    id: `item_${packageItemId}`,
                    item_type: itemType,
                    title: firstText(item.title, item.label, packageItemId),
                    content: firstText(item.summary, item.description, item.rationale),
                    source_refs: item.source_refs,
                    assumptions: item.assumptions,
                    status: firstText(item.status, item.review_state, 'draft'),
                    selected: true,
                    metadata: {
                        ...(item.metadata || {}),
                        artifact_id: artifactId,
                        artifact_type: 'connected_picture_package',
                        package_id: packageId,
                        package_item_id: packageItemId,
                        package_collection: collectionKey,
                        node_id: collectionKey === 'primary_nodes' ? firstText(item.node_id, packageItemId) : undefined,
                        relationship_edge_id: collectionKey === 'relationship_edges' ? packageItemId : undefined,
                        edge_id: collectionKey === 'relationship_edges' ? packageItemId : undefined,
                        source_node_id: collectionKey === 'relationship_edges' ? firstText(item.source_node_id) : undefined,
                        target_node_id: collectionKey === 'relationship_edges' ? firstText(item.target_node_id) : undefined,
                        relationship_type:
                            collectionKey === 'relationship_edges'
                                ? firstText(item.relationship_type, 'related_to')
                                : undefined
                    }
                });
            })
            .filter(Boolean)
    );
    connectedPackageCollection(packageData, 'acceptance_groups').forEach((group) => {
        const groupId = connectedPackageItemId(group);
        if (!groupId) {
            return;
        }
        items.push(
            normalizeAIDraftItem({
                id: `item_${groupId}`,
                item_type: 'acceptance_group',
                title: firstText(group.title, group.label, groupId),
                content: firstText(group.description, group.summary),
                source_refs: group.source_refs,
                assumptions: group.assumptions,
                status: firstText(group.status, group.review_state, 'draft'),
                selected: true,
                metadata: {
                    ...(group.metadata || {}),
                    artifact_id: artifactId,
                    artifact_type: 'connected_picture_package',
                    package_id: packageId,
                    package_item_id: groupId,
                    package_collection: 'acceptance_groups',
                    acceptance_group_id: groupId,
                    package_item_ids: asArray(group.item_ids)
                }
            })
        );
    });
    return items;
};

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
    generatedArtifacts = [],
    revisionId = `ai_draft_revision_${nanoid(10)}`,
    createdAt = new Date().toISOString(),
    model = '',
    metadata = {}
} = {}) => {
    const nodes = asArray(draftNodes).map(normalizeAIDraftNode);
    const annotations = asArray(draftAnnotations);
    const artifacts = asArray(generatedArtifacts);
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
                  ),
                  ...artifacts.flatMap(connectedPackageDraftItemsFromArtifact)
              ];
    const revision = {
        revision_id: revisionId,
        session_id: sessionId,
        prompt,
        draft_items: items,
        draft_nodes: nodes,
        draft_edges: asArray(draftEdges).map(normalizeAIDraftEdge),
        draft_annotations: annotations,
        generated_artifacts: artifacts,
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
    generatedArtifacts = [],
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
        generatedArtifacts,
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

const collectRevisionSourceRefs = (revision = {}) =>
    mergeSourceRefs(
        mergeSourceRefs(
            asArray(revision.draft_items).flatMap((item) => asArray(item.source_refs)),
            asArray(revision.draft_nodes).flatMap((node) => asArray(node.source_refs))
        ),
        asArray(revision.draft_annotations).flatMap((annotation) => asArray(annotation.source_refs))
    );
