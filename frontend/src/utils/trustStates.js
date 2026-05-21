const TRUST_STATE_DEFINITIONS = {
    cited: {
        id: 'cited',
        label: 'Cited',
        tone: 'good'
    },
    uncited: {
        id: 'uncited',
        label: 'Uncited',
        tone: 'warn'
    },
    inferred: {
        id: 'inferred',
        label: 'Inferred',
        tone: 'neutral'
    },
    'web-cited': {
        id: 'web-cited',
        label: 'Web-cited',
        tone: 'good'
    },
    'source-backed': {
        id: 'source-backed',
        label: 'Source-backed',
        tone: 'good'
    },
    needs_review: {
        id: 'needs_review',
        label: 'Needs review',
        tone: 'warn'
    }
};

const SOURCE_BACKED_VALUES = new Set([
    'source_backed',
    'source-backed',
    'source backed',
    'backed',
    'verified',
    'cited'
]);

const NEEDS_REVIEW_VALUES = new Set([
    'needs_review',
    'needs-review',
    'needs review',
    'review_required',
    'review required',
    'draft',
    'unreviewed'
]);

const INFERRED_VALUES = new Set([
    'inferred',
    'assumption',
    'ai_assumption',
    'ai assumption',
    'ai_assumption_uncited'
]);

const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const nestedData = (value = {}) =>
    value?.data && typeof value.data === 'object' ? value.data : {};

const normalized = (value) =>
    String(value ?? '')
        .trim()
        .toLowerCase();

const firstText = (...values) => {
    for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return String(value).trim();
        }
    }
    return '';
};

export const trustStateDefinition = (stateId = '') =>
    TRUST_STATE_DEFINITIONS[stateId] || {
        id: stateId,
        label: firstText(stateId).replaceAll('_', ' '),
        tone: 'neutral'
    };

export const trustStateLabel = (stateId = '') => trustStateDefinition(stateId).label;

export const sourceRefsFromTrustSubject = (subject = {}) => {
    const nested = nestedData(subject);
    return [
        subject.source_ref,
        subject.sourceRef,
        nested.source_ref,
        ...asArray(subject.source_refs),
        ...asArray(subject.sourceRefs),
        ...asArray(nested.source_refs),
        ...asArray(subject.provenance?.source_refs),
        ...asArray(subject.provenance?.input_source_refs),
        ...asArray(subject.metadata?.source_refs),
        ...asArray(subject.structured_evidence?.source_refs)
    ].filter(Boolean);
};

const hasWebCitation = (sourceRefs = []) =>
    sourceRefs.some((ref) => {
        if (typeof ref === 'string') {
            return /^https?:\/\//i.test(ref);
        }
        const url = firstText(ref?.url, ref?.uri, ref?.source_url, ref?.sourceUrl);
        const sourceType = normalized(firstText(ref?.source_type, ref?.type, ref?.kind));
        const documentId = firstText(ref?.document_id, ref?.source_id, ref?.id);
        return (
            /^https?:\/\//i.test(url) ||
            /^https?:\/\//i.test(documentId) ||
            sourceType === 'web' ||
            sourceType === 'url' ||
            sourceType === 'web_source' ||
            sourceType === 'web_sources'
        );
    });

const hasExplicitSourceBacked = (subject = {}) => {
    const nested = nestedData(subject);
    const metadata = subject.metadata && typeof subject.metadata === 'object' ? subject.metadata : {};
    const values = [
        subject.review_state,
        subject.reviewState,
        subject.source_status,
        subject.sourceStatus,
        subject.evidence_status,
        subject.evidenceStatus,
        subject.citation_status,
        subject.citationStatus,
        subject.status,
        nested.review_state,
        nested.source_status,
        nested.evidence_status,
        nested.citation_status,
        metadata.review_state,
        metadata.source_status,
        metadata.evidence_status,
        metadata.citation_status,
        subject.structured_evidence?.review_state,
        subject.structured_evidence?.evidence_status
    ].map(normalized);

    return (
        subject.source_backed === true ||
        subject.sourceBacked === true ||
        subject.structured_evidence?.source_backed === true ||
        values.some((value) => SOURCE_BACKED_VALUES.has(value))
    );
};

const hasNeedsReview = (subject = {}) => {
    const nested = nestedData(subject);
    const metadata = subject.metadata && typeof subject.metadata === 'object' ? subject.metadata : {};
    const values = [
        subject.review_state,
        subject.reviewState,
        subject.status,
        subject.source_status,
        subject.sourceStatus,
        subject.evidence_status,
        subject.evidenceStatus,
        nested.review_state,
        nested.status,
        metadata.review_state,
        metadata.status,
        metadata.source_status
    ].map(normalized);

    return (
        subject.needs_review === true ||
        subject.needsReview === true ||
        metadata.needs_review === true ||
        values.some((value) => NEEDS_REVIEW_VALUES.has(value))
    );
};

const hasInference = (subject = {}) => {
    const nested = nestedData(subject);
    const metadata = subject.metadata && typeof subject.metadata === 'object' ? subject.metadata : {};
    const values = [
        subject.review_state,
        subject.reviewState,
        subject.status,
        subject.source_status,
        subject.sourceStatus,
        subject.item_type,
        subject.node_type,
        nested.review_state,
        nested.status,
        metadata.review_state,
        metadata.status,
        metadata.source_status,
        metadata.type,
        metadata.node_type
    ].map(normalized);

    return (
        asArray(subject.assumptions).length > 0 ||
        asArray(metadata.assumptions).length > 0 ||
        Boolean(subject.assumption || nested.assumption || metadata.assumption) ||
        values.some((value) => INFERRED_VALUES.has(value))
    );
};

export const trustStatesForSubject = (subject = {}) => {
    const sourceRefs = sourceRefsFromTrustSubject(subject);
    const states = [];

    if (sourceRefs.length > 0) {
        states.push(hasWebCitation(sourceRefs) ? 'web-cited' : hasExplicitSourceBacked(subject) ? 'source-backed' : 'cited');
    } else if (hasExplicitSourceBacked(subject)) {
        states.push('source-backed');
    } else if (hasInference(subject)) {
        states.push('inferred');
    } else {
        states.push('uncited');
    }

    if (hasNeedsReview(subject) && !states.includes('needs_review')) {
        states.push('needs_review');
    }

    return states.map(trustStateDefinition);
};

export const primaryTrustStateForSubject = (subject = {}) =>
    trustStatesForSubject(subject)[0] || trustStateDefinition('uncited');
