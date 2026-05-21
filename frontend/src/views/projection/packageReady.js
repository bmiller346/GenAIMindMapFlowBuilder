import { getWorkspaceNodeData } from '../../utils/manualNodes.js';

const TASK_CAPABLE_TYPES = new Set([
    'task',
    'procedure',
    'workflow',
    'needs_review',
    'requirement'
]);
const RISK_TYPES = new Set(['risk', 'blocker', 'issue', 'dependency', 'needs_review']);
const DECISION_TYPES = new Set(['decision', 'question', 'approval', 'needs_review']);
export const EXECUTIVE_OUTPUT_CONTRACT_VERSION = '1';
export const TEAM_ROADMAP_CONTRACT_VERSION = '1';

const WORKSTREAM_TYPES = new Set(['workstream', 'workflow', 'procedure', 'category', 'concept']);
const MILESTONE_TYPES = new Set(['milestone', 'phase', 'checkpoint', 'release']);
const DEPENDENCY_NODE_TYPES = new Set(['dependency', 'blocker']);
const DEPENDENCY_RELATIONSHIP_TYPES = new Set([
    'depends_on',
    'dependency',
    'requires',
    'blocked_by',
    'blocks',
    'prerequisite'
]);
const FLOW_NODE_TYPES = new Set([
    'workflow',
    'procedure',
    'process',
    'task',
    'decision',
    'requirement',
    'dependency',
    'handoff',
    'milestone',
    'phase',
    'checkpoint'
]);
const FLOW_RELATIONSHIP_TYPES = new Set([
    ...DEPENDENCY_RELATIONSHIP_TYPES,
    'contains',
    'parent-child',
    'parent_child',
    'sequence',
    'next',
    'then',
    'leads-to',
    'leads_to',
    'starts-with',
    'starts_with',
    'ends-with',
    'ends_with',
    'decision-path',
    'decision_path',
    'exception',
    'handoff',
    'informs',
    'supports'
]);
const FLOW_YES_SIGNALS = new Set([
    'yes',
    'true',
    'approved',
    'approve',
    'accepted',
    'accept',
    'pass',
    'passes',
    'success',
    'successful',
    'complete',
    'completed'
]);
const FLOW_NO_SIGNALS = new Set([
    'no',
    'false',
    'rejected',
    'reject',
    'denied',
    'deny',
    'fail',
    'fails',
    'failed',
    'blocked',
    'exception',
    'else',
    'otherwise'
]);

const ENTERPRISE_ACTION_TYPES = new Set([
    ...TASK_CAPABLE_TYPES,
    'risk',
    'decision',
    'milestone'
]);

const acceptedProjection = (projection) =>
    projection && typeof projection === 'object' && projection.accepted
        ? projection
        : undefined;

const taskProjectionForNode = (node) => acceptedProjection(node?.task_projection);

const checklistProjectionForNode = (node) => acceptedProjection(node?.checklist_projection);

const projectedTaskValue = (node, key, fallback = '') => {
    const taskProjection = taskProjectionForNode(node);
    const checklistProjection = checklistProjectionForNode(node);

    return (
        node?.[key] ||
        taskProjection?.[key] ||
        checklistProjection?.[key] ||
        fallback
    );
};

const isConfirmedTaskNode = (node) =>
    TASK_CAPABLE_TYPES.has(node?.node_type) || Boolean(taskProjectionForNode(node));

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

const normalizeDelimitedValues = (value) => {
    if (Array.isArray(value)) {
        return value.map(String).map((entry) => entry.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
    return [];
};

const normalizeSignal = (value = '') =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replaceAll('_', '-')
        .replace(/\s+/g, '-');

const relationshipTypeForEdge = (edge = {}) =>
    edge.relationship_type ||
    edge.data?.relationship_type ||
    edge.data?.relationshipType ||
    edge.data?.type ||
    edge.type ||
    '';

const relationshipLabel = (value = '') =>
    String(value || '')
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());

const edgeTextSignals = (edge = {}) =>
    [
        edge.label,
        edge.condition,
        edge.branch_label,
        edge.relationship_type,
        edge.data?.label,
        edge.data?.condition,
        edge.data?.branch_label,
        edge.data?.source_signal,
        edge.metadata?.label,
        edge.metadata?.condition,
        edge.metadata?.branch_label,
        edge.metadata?.source_signal
    ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

const flowBranchKind = (edge = {}) => {
    const signals = edgeTextSignals(edge).map(normalizeSignal);
    if (signals.some((signal) => FLOW_YES_SIGNALS.has(signal))) {
        return 'yes';
    }
    if (signals.some((signal) => FLOW_NO_SIGNALS.has(signal))) {
        return 'no';
    }
    return 'default';
};

const flowBranchLabel = (edge = {}, sourceStep) => {
    const explicit = [
        edge.branch_label,
        edge.condition,
        edge.label,
        edge.data?.branch_label,
        edge.data?.condition,
        edge.data?.label,
        edge.metadata?.branch_label,
        edge.metadata?.condition,
        edge.metadata?.label
    ].find((value) => String(value || '').trim());

    if (explicit) {
        return relationshipLabel(explicit);
    }

    const branchKind = sourceStep?.flow_kind === 'decision' ? flowBranchKind(edge) : 'default';
    if (branchKind === 'yes') {
        return 'Yes';
    }
    if (branchKind === 'no') {
        return 'No';
    }
    return relationshipLabel(relationshipTypeForEdge(edge) || 'next');
};

const HIERARCHY_RELATIONSHIP_TYPES = new Set([
    '',
    'contains',
    'parent_child',
    'parent-child',
    'child',
    'section',
    'subtopic',
    'branch',
    'step',
    'smoothstep'
]);

const isHierarchyRelationship = (relationship = '') =>
    HIERARCHY_RELATIONSHIP_TYPES.has(
        String(relationship || '')
            .trim()
            .toLowerCase()
    );

const isHierarchyEdge = (edge = {}) => isHierarchyRelationship(relationshipTypeForEdge(edge));

const numericConfidence = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return null;
        }
        return value > 1 ? value / 100 : value;
    }
    const cleaned = String(value).trim().replace('%', '');
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return String(value).includes('%') || parsed > 1 ? parsed / 100 : parsed;
};

const LOW_CONFIDENCE_THRESHOLD = 0.6;

const hasSourceDocument = (sourceRef) => Boolean(sourceRef?.document_id);

const hasSourceEvidence = (sourceRef) =>
    Boolean(
        sourceRef?.document_id ||
            sourceRef?.source_type ||
            sourceRef?.query_id ||
            sourceRef?.table_name ||
            sourceRef?.database_id ||
            sourceRef?.result_hash
    );

const hasCompleteSourceRef = (sourceRef) =>
    Boolean(
        sourceRef?.document_id
            ? sourceRef?.page || sourceRef?.section || sourceRef?.quote_snippet
            : hasSourceEvidence(sourceRef) &&
                  (sourceRef?.query_id || sourceRef?.table_name || sourceRef?.result_hash)
    );

const sourceRefIssues = (sourceRef) => {
    const issues = [];

    if (!sourceRef?.document_id && !hasSourceEvidence(sourceRef)) {
        issues.push('Missing source document');
        return issues;
    }
    if (!sourceRef.document_id) {
        if (!sourceRef.query_id && !sourceRef.table_name && !sourceRef.result_hash) {
            issues.push('Missing structured data reference');
        }
        if (!sourceRef.confidence) {
            issues.push('Missing source confidence');
        }
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
    } else {
        const confidence = numericConfidence(sourceRef.confidence);
        if (confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD) {
            issues.push('Low source confidence');
        }
    }

    return issues;
};

const nodeConfidenceIssues = (node) => {
    const issues = [];
    const confidence = numericConfidence(node.confidence);

    if (!node.confidence) {
        issues.push('Missing confidence');
    } else if (confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD) {
        issues.push('Low confidence');
    }

    return issues;
};

const suggestedConfidenceForRepair = (node, suggestion) => {
    const suggested = numericConfidence(suggestion?.source_ref?.confidence);
    const current = numericConfidence(node.confidence || node.source_ref?.confidence);

    if (suggested !== null && suggested >= LOW_CONFIDENCE_THRESHOLD) {
        return suggestion.source_ref.confidence;
    }
    if (current !== null && current >= LOW_CONFIDENCE_THRESHOLD) {
        return node.confidence || node.source_ref?.confidence;
    }
    return 'medium';
};

export const normalizeGraphNode = (node) => {
    const workspaceData = getWorkspaceNodeData(node);
    const sourceRef = firstSourceRef(node);
    const rows = tableRows(node);
    const data = node?.data || {};
    const nestedData = getNestedData(node);
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
        business_impact: firstValue(node, ['business_impact', 'impact', 'value_score']),
        implementation_effort: firstValue(node, [
            'implementation_effort',
            'effort',
            'complexity'
        ]),
        risk_severity: firstValue(node, ['risk_severity', 'severity', 'risk_level']),
        owner_id: workspaceData.ownerId || firstValue(node, ['owner_id', 'assignee', 'owner']),
        due_date: workspaceData.dueDate || firstValue(node, ['due_date']),
        confidence:
            workspaceData.confidence ||
            firstValue(node, ['confidence'], sourceRef.confidence || ''),
        source_ref: sourceRef,
        source_refs: workspaceData.sourceRefs.length ? workspaceData.sourceRefs : sourceRefs(node),
        artifact_type:
            workspaceData.artifactType || data.artifact_type || nestedData.artifact_type || '',
        artifact_ids:
            workspaceData.artifactIds?.length
                ? workspaceData.artifactIds
                : Array.isArray(data.artifact_ids || nestedData.artifact_ids)
                  ? data.artifact_ids || nestedData.artifact_ids
                  : [],
        review_state:
            workspaceData.reviewState || data.review_state || nestedData.review_state || '',
        generated_artifacts:
            workspaceData.generatedArtifacts?.length
                ? workspaceData.generatedArtifacts
                : Array.isArray(data.generated_artifacts || nestedData.generated_artifacts)
                  ? data.generated_artifacts || nestedData.generated_artifacts
                  : [],
        artifact_metadata: workspaceData.metadata || data.metadata || nestedData.metadata || {},
        table_rows: workspaceData.df.length ? workspaceData.df : rows,
        table_columns: tableColumns(workspaceData.df.length ? workspaceData.df : rows),
        graph: workspaceData.graph || data.graph || nestedData.graph || {},
        query: workspaceData.query || data.query || nestedData.query || '',
        tags: normalizeDelimitedValues(data.tags || nestedData.tags),
        entities: normalizeDelimitedValues(data.entities || nestedData.entities),
        task_projection: data.task_projection || nestedData.task_projection,
        checklist_projection: data.checklist_projection || nestedData.checklist_projection,
        local_preview_acceptances: Array.isArray(data.local_preview_acceptances)
            ? data.local_preview_acceptances
            : [],
        monday_selection_input: data.monday_selection_input,
        monday_status_back_input: data.monday_status_back_input,
        hidden_from_export: Boolean(data.hidden_from_export || nestedData.hidden_from_export),
        is_manual: workspaceData.manual,
        display: workspaceData.display,
        react_flow_type: node?.type || ''
    };
};

const SCORE_BY_SIGNAL = {
    critical: 100,
    urgent: 100,
    high: 85,
    medium: 60,
    moderate: 60,
    low: 35,
    minimal: 20,
    none: 0
};

const EFFORT_READINESS_BY_SIGNAL = {
    low: 100,
    small: 100,
    medium: 70,
    moderate: 70,
    high: 40,
    large: 40,
    critical: 25,
    complex: 25
};

const scoreFromSignal = (value, fallback = 0) => {
    const normalized = normalizeSignal(value);
    if (Object.hasOwn(SCORE_BY_SIGNAL, normalized)) {
        return SCORE_BY_SIGNAL[normalized];
    }

    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
        return Math.max(0, Math.min(100, parsed > 1 ? parsed : parsed * 100));
    }

    return fallback;
};

const implementationReadinessScore = (node) => {
    const explicit = normalizeSignal(node.implementation_effort);
    if (Object.hasOwn(EFFORT_READINESS_BY_SIGNAL, explicit)) {
        return EFFORT_READINESS_BY_SIGNAL[explicit];
    }

    const parsed = Number(node.implementation_effort);
    if (Number.isFinite(parsed)) {
        const effortScore = Math.max(0, Math.min(100, parsed > 1 ? parsed : parsed * 100));
        return 100 - effortScore;
    }

    if (node.node_type === 'workflow' || node.node_type === 'procedure') {
        return 60;
    }
    if (node.node_type === 'risk') {
        return 55;
    }
    return 72;
};

const businessImpactScore = (node) => {
    const explicitScore = scoreFromSignal(node.business_impact, null);
    if (explicitScore !== null) {
        return explicitScore;
    }
    if (normalizeSignal(node.priority) === 'high') {
        return 85;
    }
    if (normalizeSignal(node.priority) === 'medium') {
        return 60;
    }
    if (normalizeSignal(node.priority) === 'low') {
        return 35;
    }
    if (node.node_type === 'requirement' || node.node_type === 'decision') {
        return 75;
    }
    if (node.node_type === 'task' || node.node_type === 'workflow') {
        return 65;
    }
    if (node.node_type === 'risk') {
        return 70;
    }
    return 50;
};

const riskSeverityScore = (node) => {
    const explicitScore = scoreFromSignal(node.risk_severity, null);
    if (explicitScore !== null) {
        return explicitScore;
    }
    if (node.node_type === 'risk' || node.status === 'needs_review') {
        return 75;
    }
    const confidence = numericConfidence(node.confidence);
    if (confidence !== null && confidence < 0.6) {
        return 70;
    }
    if (!node.source_refs?.some(hasSourceEvidence)) {
        return 60;
    }
    return 35;
};

const sourceCoverageScore = (node) => {
    const refs = node.source_refs || [];
    if (refs.length === 0 || !refs.some(hasSourceEvidence)) {
        return 0;
    }

    const refScores = refs.map((ref) => {
        if (!hasSourceEvidence(ref)) {
            return 0;
        }
        if (!ref?.document_id) {
            let score = 62;
            if (ref.query_id) {
                score += 12;
            }
            if (ref.result_hash) {
                score += 12;
            }
            if (ref.table_name || ref.database_id) {
                score += 8;
            }
            const confidence = numericConfidence(ref.confidence ?? node.confidence);
            if (confidence !== null) {
                score += Math.round(confidence * 8);
                if (confidence < 0.6) {
                    score -= 18;
                }
            }
            return Math.max(0, Math.min(100, score));
        }
        let score = 55;
        if (ref.page || ref.section) {
            score += 15;
        }
        if (ref.quote_snippet) {
            score += 20;
        }
        const confidence = numericConfidence(ref.confidence ?? node.confidence);
        if (confidence !== null) {
            score += Math.round(confidence * 10);
            if (confidence < 0.6) {
                score -= 18;
            }
        }
        return Math.max(0, Math.min(100, score));
    });

    return Math.round(refScores.reduce((total, score) => total + score, 0) / refScores.length);
};

const ownerClarityScore = (node) => {
    const requiresOwner = ENTERPRISE_ACTION_TYPES.has(node.node_type);
    if (node.owner_id && node.due_date) {
        return 100;
    }
    if (node.owner_id) {
        return requiresOwner ? 75 : 90;
    }
    if (node.due_date) {
        return requiresOwner ? 45 : 70;
    }
    return requiresOwner ? 15 : 60;
};

const readinessBand = (score) =>
    score >= 80 ? 'enterprise_ready' : score >= 60 ? 'watchlist' : 'not_ready';

const enterpriseReasons = (node, scores) => {
    const reasons = [];
    if (scores.business_impact >= 80 && scores.owner_clarity < 75) {
        reasons.push('High-impact item needs clearer ownership');
    }
    if (scores.source_coverage < 60) {
        reasons.push('Weak source coverage');
    }
    if (scores.risk_severity >= 75) {
        reasons.push('High risk severity');
    }
    if (scores.implementation_effort < 50) {
        reasons.push('High implementation effort');
    }
    if (scores.owner_clarity < 60) {
        reasons.push('Owner or due date missing');
    }
    if (node.status === 'needs_review' || node.node_type === 'needs_review') {
        reasons.push('Needs review before handoff');
    }
    return reasons;
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

export const SOURCE_SET_INTELLIGENCE_CONTRACT_VERSION = '1';

const DOCUMENT_CLASSIFICATIONS = [
    {
        id: 'standards_or_policy',
        label: 'Standards / policy',
        keywords: ['standard', 'policy', 'guideline', 'requirement', 'compliance']
    },
    {
        id: 'sop_or_workflow',
        label: 'SOP / workflow',
        keywords: ['sop', 'procedure', 'workflow', 'process', 'playbook']
    },
    {
        id: 'inventory_or_register',
        label: 'Inventory / register',
        keywords: ['inventory', 'register', 'list', 'catalog', 'matrix']
    },
    {
        id: 'training_or_onboarding',
        label: 'Training / onboarding',
        keywords: ['training', 'onboarding', 'guide', 'lesson', 'tutorial']
    },
    {
        id: 'roadmap_or_plan',
        label: 'Roadmap / plan',
        keywords: ['roadmap', 'plan', 'milestone', 'schedule', 'timeline']
    },
    {
        id: 'reference_material',
        label: 'Reference material',
        keywords: ['reference', 'manual', 'handbook', 'specification', 'spec']
    }
];

const sourceTypeLabel = (type = '') => SOURCE_TYPE_LABELS[type] || type || 'Source';

const normalizedText = (value = '') =>
    String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const stableToken = (value = '') =>
    normalizedText(value).replace(/\s+/g, '-') || 'item';

const uniqueValues = (values = []) => Array.from(new Set(values.filter(Boolean)));

const classifyDocument = (source = {}) => {
    const explicit =
        source.classification ||
        source.document_classification ||
        source.metadata?.classification ||
        source.metadata?.document_classification;
    if (explicit) {
        return {
            id: stableToken(explicit),
            label: String(explicit),
            confidence: 'explicit',
            signals: ['metadata']
        };
    }

    const text = normalizedText(
        [
            source.title,
            source.filename,
            source.original_filename,
            source.path,
            source.metadata?.path,
            source.metadata?.original_filename,
            source.type
        ].filter(Boolean).join(' ')
    );
    const match = DOCUMENT_CLASSIFICATIONS.find((classification) =>
        classification.keywords.some((keyword) => text.includes(keyword))
    );

    if (match) {
        return {
            id: match.id,
            label: match.label,
            confidence: 'inferred',
            signals: match.keywords.filter((keyword) => text.includes(keyword))
        };
    }

    return {
        id: 'unclassified',
        label: 'Unclassified',
        confidence: 'unknown',
        signals: []
    };
};

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
    title:
        source.title ||
        source.name ||
        source.filename ||
        source.original_filename ||
        source.id ||
        source.document_id ||
        'Untitled source',
    type: source.type || '',
    type_label: source.type_label || sourceTypeLabel(source.type),
    status: source.status || 'uploaded',
    node_id: source.node_id || '',
    component_id: source.component_id || '',
    flow_id: source.flow_id || '',
    file_hash: source.file_hash || source.metadata?.file_hash || '',
    path: source.path || source.relative_path || source.metadata?.path || source.metadata?.relative_path || '',
    size: source.size || source.metadata?.size || 0,
    version: source.version || source.metadata?.version || '',
    metadata: source.metadata || {},
    classification: source.classification || source.document_classification || '',
    modified_at:
        source.modified_at ||
        source.last_modified_at ||
        source.metadata?.modified_at ||
        source.metadata?.last_modified_at ||
        '',
    chunks: Array.isArray(source.chunks) ? source.chunks : [],
    segments: Array.isArray(source.segments)
        ? source.segments
        : Array.isArray(source.source_segments)
          ? source.source_segments
          : [],
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
        path:
            data.path ||
            data.relative_path ||
            data.source_document?.path ||
            data.source_document?.relative_path ||
            '',
        size: data.size || data.source_document?.size || data.file?.size || 0,
        version: data.source_document?.version || '',
        metadata: data.source_document || {},
        classification: data.source_document?.classification || '',
        modified_at:
            data.source_document?.modified_at ||
            data.source_document?.last_modified_at ||
            '',
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
    path: '',
    chunks: [],
    segments: []
});

const sourceLocationLabel = (ref = {}) =>
    [ref.page ? `p. ${ref.page}` : '', ref.section].filter(Boolean).join(' | ');

const COMPLETENESS_REVIEW_CONTRACT_VERSION = '1';
const STALE_COMPLETENESS_SIGNALS = [
    'deprecated',
    'obsolete',
    'superseded',
    'retired',
    'legacy',
    'archived',
    'outdated',
    'old standard'
];
const CONFLICT_COMPLETENESS_SIGNALS = [
    'conflict',
    'contradict',
    'duplicate',
    'overlap',
    'inconsistent',
    'superseded'
];
const REVIT_BIM_COMPLETENESS_EXPECTATIONS = [
    'Templates',
    'Families and content library',
    'Shared parameters',
    'Views and view templates',
    'Sheets and titleblocks',
    'Worksharing and model coordination',
    'Naming conventions',
    'QA/QC review process',
    'Content ownership',
    'Training and support'
];
const STANDARDS_COMPLETENESS_EXPECTATIONS = [
    'Governance and ownership',
    'Naming conventions',
    'Procedures and workflows',
    'QA/QC review process',
    'Exceptions and approvals',
    'Version and change management',
    'Training and support'
];
const COMPLETENESS_STOPWORDS = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on']);

const sourceDuplicateKey = (source = {}) =>
    source.file_hash
        ? `hash:${source.file_hash}`
        : `title:${normalizedText(source.title || source.id)}`;

const staleSignalsForSource = (source = {}) => {
    const text = normalizedText(
        [
            source.title,
            source.path,
            source.status,
            source.version,
            source.metadata?.status,
            source.metadata?.version
        ].filter(Boolean).join(' ')
    );
    const signals = [];

    if (/\b(old|archive|archived|deprecated|obsolete|superseded|stale)\b/.test(text)) {
        signals.push('name_or_status_suggests_stale');
    }
    if (source.metadata?.superseded_by || source.metadata?.replaced_by) {
        signals.push('metadata_superseded');
    }

    return signals;
};

const expectedArtifactsFromBrief = (workspaceBrief = {}) => {
    const explicit = Array.isArray(workspaceBrief.expected_artifacts)
        ? workspaceBrief.expected_artifacts
        : [];
    const outputExpectations = {
        source_coverage_report: ['source coverage report'],
        completeness_review: ['completeness review'],
        source_set_review: ['source-set review'],
        missing_info_report: ['missing information report'],
        team_roadmap: ['team roadmap'],
        tasks: ['task list'],
        checklist: ['checklist']
    };

    return uniqueValues([
        ...explicit,
        ...(workspaceBrief.desired_outputs || []).flatMap(
            (output) => outputExpectations[output] || []
        )
    ]);
};

const sourceMatchesExpectedArtifact = (source = {}, artifact = '') => {
    const artifactText = normalizedText(artifact);
    if (!artifactText) {
        return true;
    }
    const genericTokens = new Set(['source', 'set', 'review', 'report', 'artifact']);
    const sourceText = normalizedText(
        [source.title, source.path, source.classification, source.type_label].join(' ')
    );
    return artifactText
        .split(/\s+/)
        .filter((token) => token.length > 2 && !genericTokens.has(token))
        .some((token) => sourceText.includes(token));
};

const topicKeyForNode = (node = {}) =>
    stableToken(node.node_type && node.node_type !== 'concept' ? node.node_type : node.title);

const topicLabelForNode = (node = {}) =>
    node.node_type && node.node_type !== 'concept'
        ? relationshipLabel(node.node_type)
        : node.title || 'Untitled topic';

const buildSourceSetReview = ({ sources, workspaceBrief = {}, uncitedNodes = [] }) => {
    const duplicateGroups = Array.from(
        sources.reduce((groups, source) => {
            const key = sourceDuplicateKey(source);
            const group = groups.get(key) || [];
            group.push(source);
            groups.set(key, group);
            return groups;
        }, new Map())
    )
        .map(([key, group]) => ({
            id: stableToken(key),
            reason: key.startsWith('hash:') ? 'matching_file_hash' : 'matching_title',
            source_ids: group.map((source) => source.id),
            titles: group.map((source) => source.title)
        }))
        .filter((group) => group.source_ids.length > 1);
    const duplicateSourceIds = new Set(duplicateGroups.flatMap((group) => group.source_ids));
    const classifiedSources = sources.map((source) => {
        const classification = classifyDocument(source);
        return { source, classification };
    });
    const topicMap = new Map();

    sources.forEach((source) => {
        (source.citing_nodes || []).forEach((node) => {
            const key = topicKeyForNode(node);
            const entry =
                topicMap.get(key) || {
                    id: key,
                    topic: topicLabelForNode(node),
                    source_ids: new Set(),
                    cited_node_ids: new Set(),
                    evidence_count: 0
                };
            entry.source_ids.add(source.id);
            entry.cited_node_ids.add(node.id);
            entry.evidence_count += 1;
            topicMap.set(key, entry);
        });
    });

    const missingExpectedArtifacts = expectedArtifactsFromBrief(workspaceBrief)
        .filter((artifact) => !sources.some((source) => sourceMatchesExpectedArtifact(source, artifact)))
        .map((artifact) => ({
            id: stableToken(artifact),
            artifact,
            status: 'missing_or_not_loaded',
            review_state: 'needs_review'
        }));

    return {
        contract_version: SOURCE_SET_INTELLIGENCE_CONTRACT_VERSION,
        source_set: {
            id: 'workspace-source-set',
            label: 'Loaded source set',
            scope_type: 'loaded_sources',
            upload_mode: 'individual_sources',
            native_folder_upload: false,
            source_count: sources.length
        },
        file_inventory: sources.map((source) => {
            const classification = classifyDocument(source);
            return {
                source_id: source.id,
                title: source.title,
                type: source.type,
                type_label: source.type_label,
                path: source.path || '',
                size: source.size || 0,
                file_hash: source.file_hash || '',
                status: source.status,
                classification: classification.id,
                classification_label: classification.label,
                coverage_count: source.coverage_count || 0,
                chunk_count: source.chunk_count || 0,
                duplicate_group_id: duplicateSourceIds.has(source.id)
                    ? duplicateGroups.find((group) => group.source_ids.includes(source.id))?.id || ''
                    : '',
                stale_signals: staleSignalsForSource(source)
            };
        }),
        document_classification: classifiedSources.map(({ source, classification }) => ({
            source_id: source.id,
            classification: classification.id,
            label: classification.label,
            confidence: classification.confidence,
            signals: classification.signals
        })),
        topic_coverage: Array.from(topicMap.values()).map((topic) => ({
            id: topic.id,
            topic: topic.topic,
            source_ids: Array.from(topic.source_ids).sort(),
            cited_node_ids: Array.from(topic.cited_node_ids).sort(),
            evidence_count: topic.evidence_count,
            coverage_status: topic.evidence_count > 1 ? 'documented' : 'thin'
        })),
        stale_sources: sources
            .map((source) => ({
                source_id: source.id,
                title: source.title,
                signals: staleSignalsForSource(source)
            }))
            .filter((source) => source.signals.length > 0),
        duplicate_sources: duplicateGroups,
        missing_expected_artifacts: missingExpectedArtifacts,
        review_flags: [
            ...(uncitedNodes.length
                ? [
                      {
                          code: 'uncited_graph_nodes',
                          severity: uncitedNodes.length > 3 ? 'high' : 'medium',
                          count: uncitedNodes.length
                      }
                  ]
                : []),
            ...(missingExpectedArtifacts.length
                ? [
                      {
                          code: 'missing_expected_artifacts',
                          severity: 'medium',
                          count: missingExpectedArtifacts.length
                      }
                  ]
                : [])
        ]
    };
};

export const WORKSPACE_BRIEF_SOURCE_ID = 'brief-only';

const hasWorkspaceBriefSourceContext = (brief = {}) =>
    Boolean(
        brief?.configured ||
            String(brief?.goal || '').trim() ||
            String(brief?.audience || '').trim() ||
            String(brief?.domain_context || '').trim() ||
            String(brief?.review_rules || '').trim() ||
            (Array.isArray(brief?.desired_outputs) &&
                brief.desired_outputs.some((output) => output !== 'mind_map'))
    );

const workspaceBriefSourceRecord = (workspaceBrief = {}) => ({
    id: WORKSPACE_BRIEF_SOURCE_ID,
    title: workspaceBrief.goal || 'Workspace brief',
    type: 'brief',
    type_label: 'Brief',
    status: 'brief only',
    metadata: workspaceBrief,
    chunks: [],
    segments: []
});

export const buildSourceLibraryProjection = (
    nodes,
    edges,
    workspaceBrief = {},
    persistedSources = [],
    options = {}
) => {
    const projection = buildGraphProjection(nodes, edges);
    const sourceMap = new Map();
    const uploadedSources = nodes.filter((node) => node.type === 'dataSource').map(sourceRecordFromNode);
    const citingNodesBySource = new Map();
    const snippetsBySource = new Map();
    const incompleteRefs = [];
    const uncitedNodes = [];

    const persistedSourceList = Array.isArray(persistedSources)
        ? persistedSources
        : Array.isArray(persistedSources?.documents)
          ? persistedSources.documents
          : [];

    persistedSourceList.map(normalizePersistedSource).forEach((source) => {
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

    const shouldIncludeBriefSource = options.includeWorkspaceBriefSource
        ? hasWorkspaceBriefSourceContext(workspaceBrief)
        : sourceMap.size === 0 && workspaceBrief?.configured;
    if (shouldIncludeBriefSource) {
        sourceMap.set(
            WORKSPACE_BRIEF_SOURCE_ID,
            mergeSourceRecord(
                sourceMap.get(WORKSPACE_BRIEF_SOURCE_ID),
                workspaceBriefSourceRecord(workspaceBrief)
            )
        );
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
    const sourceSetReview = buildSourceSetReview({
        sources,
        workspaceBrief,
        uncitedNodes
    });

    return {
        sources,
        source_sets: [sourceSetReview.source_set],
        source_set_review: sourceSetReview,
        uncited_nodes: uncitedNodes,
        incomplete_refs: incompleteRefs,
        total_graph_nodes: projection.nodes.filter((node) => node.react_flow_type !== 'dataSource').length,
        cited_node_count: projection.nodes.filter(
            (node) => node.react_flow_type !== 'dataSource' && node.source_refs?.some((ref) => ref?.document_id)
        ).length
    };
};

const completenessTokens = (value = '') =>
    new Set(String(value || '').toLowerCase().match(/[a-z0-9]+/g) || []);

const completenessKey = (value = '') =>
    [...completenessTokens(value)]
        .filter((token) => !COMPLETENESS_STOPWORDS.has(token))
        .join('-');

const normalizeCompletenessExpectations = (values, source) => {
    if (!Array.isArray(values)) {
        return [];
    }

    return values
        .map((value, index) => {
            if (typeof value === 'string') {
                return {
                    id: `expected-${stableToken(value || String(index))}`,
                    title: value.trim(),
                    description: '',
                    priority: '',
                    aliases: [],
                    expectation_sources: [source]
                };
            }
            if (value && typeof value === 'object') {
                const title = String(
                    value.title || value.name || value.label || value.area || ''
                ).trim();
                return {
                    id: `expected-${stableToken(title || String(index))}`,
                    title,
                    description: value.description || value.rationale || '',
                    priority: value.priority || '',
                    aliases: Array.isArray(value.aliases) ? value.aliases.map(String) : [],
                    expectation_sources: [source]
                };
            }
            return undefined;
        })
        .filter((item) => item?.title);
};

const profileCompletenessExpectations = (profile = {}) => {
    if (!profile || typeof profile !== 'object') {
        return [];
    }
    const expectations = [];
    ['expected_coverage', 'coverage_areas', 'required_sections', 'expectations'].forEach((key) => {
        expectations.push(
            ...normalizeCompletenessExpectations(profile[key], `domain_profile.${key}`)
        );
    });
    if (profile.completeness_review && typeof profile.completeness_review === 'object') {
        ['expected_coverage', 'coverage_areas', 'required_sections'].forEach((key) => {
            expectations.push(
                ...normalizeCompletenessExpectations(
                    profile.completeness_review[key],
                    `domain_profile.completeness_review.${key}`
                )
            );
        });
    }
    return expectations;
};

const reviewRuleCompletenessExpectations = (reviewRules = '') => {
    if (!reviewRules || typeof reviewRules !== 'string') {
        return [];
    }
    return normalizeCompletenessExpectations(
        reviewRules
            .split(/\r?\n/)
            .map((line) => line.replace(/^[-*0-9.\s]+/, '').trim())
            .filter((line) => line.length >= 4 && line.length <= 80),
        'workspace_brief.review_rules'
    );
};

const dedupeCompletenessExpectations = (expectations = []) => {
    const deduped = new Map();
    expectations.forEach((expectation) => {
        const key = completenessKey(expectation.title);
        if (!key) {
            return;
        }
        if (!deduped.has(key)) {
            deduped.set(key, expectation);
            return;
        }
        const existing = deduped.get(key);
        existing.aliases = uniqueValues([...(existing.aliases || []), ...(expectation.aliases || [])]);
        existing.expectation_sources = uniqueValues([
            ...(existing.expectation_sources || []),
            ...(expectation.expectation_sources || [])
        ]);
    });
    return Array.from(deduped.values());
};

const completenessExpectations = ({
    projection,
    workspaceBrief = {},
    domainProfile = {},
    expectedCoverage = []
}) => {
    const explicit = [
        ...normalizeCompletenessExpectations(expectedCoverage, 'explicit_expected_coverage'),
        ...profileCompletenessExpectations(domainProfile),
        ...normalizeCompletenessExpectations(workspaceBrief.expected_coverage, 'workspace_brief'),
        ...normalizeCompletenessExpectations(workspaceBrief.coverage_areas, 'workspace_brief'),
        ...reviewRuleCompletenessExpectations(workspaceBrief.review_rules)
    ];
    if (explicit.length > 0) {
        return dedupeCompletenessExpectations(explicit);
    }

    const domainText = normalizedText(
        [workspaceBrief.domain_context, workspaceBrief.goal, workspaceBrief.review_rules].join(' ')
    );
    if (/\b(revit|bim|building information model)\b/.test(domainText)) {
        return normalizeCompletenessExpectations(
            REVIT_BIM_COMPLETENESS_EXPECTATIONS,
            'revit_bim_fallback'
        );
    }
    if (/\b(standard|standards|compliance)\b/.test(domainText)) {
        return normalizeCompletenessExpectations(
            STANDARDS_COMPLETENESS_EXPECTATIONS,
            'standards_fallback'
        );
    }
    return normalizeCompletenessExpectations(
        projection.roots
            .filter((node) => node.react_flow_type !== 'dataSource')
            .slice(0, 12)
            .map((node) => node.title),
        'graph_root_nodes'
    );
};

const completenessMatchesText = (tokens, text = '') => {
    const textTokens = completenessTokens(text);
    if ([...tokens].some((token) => textTokens.has(token))) {
        return true;
    }
    const joined = [...textTokens].join(' ');
    return [...tokens].some((token) => token.length >= 7 && joined.includes(token));
};

const sourceEvidenceForCompleteness = (sourceProjection) =>
    sourceProjection.sources.flatMap((source) => {
        const snippets = [
            ...(Array.isArray(source.snippets) ? source.snippets : []),
            ...(Array.isArray(source.chunks)
                ? source.chunks.map((chunk) => ({
                      text: chunk.snippet || chunk.text || '',
                      location: chunk.page ? `p. ${chunk.page}` : '',
                      source_ref: {
                          document_id: source.id,
                          chunk_id: chunk.id || chunk.chunk_id || '',
                          page: chunk.page,
                          section: chunk.heading || '',
                          quote_snippet: chunk.snippet || chunk.text || ''
                      }
                  }))
                : []),
            ...(Array.isArray(source.segments)
                ? source.segments.map((segment) => ({
                      text: segment.snippet || segment.text || '',
                      location: segment.page ? `p. ${segment.page}` : '',
                      source_ref: {
                          document_id: source.id,
                          page: segment.page,
                          section: segment.heading || '',
                          quote_snippet: segment.snippet || segment.text || ''
                      }
                  }))
                : [])
        ];
        return snippets
            .filter((snippet) => snippet.text)
            .map((snippet) => ({
                document_id: source.id,
                filename: source.title,
                text: [source.title, snippet.location, snippet.text].filter(Boolean).join(' '),
                source_ref: {
                    document_id: source.id,
                    document_title: source.title,
                    ...(snippet.source_ref || {}),
                    quote_snippet: snippet.text
                }
            }));
    });

const completenessAreaItem = (expectation, projection, sourceProjection) => {
    const tokens = new Set([
        ...[...completenessTokens(expectation.title)].filter(
            (token) => token.length > 2 && !COMPLETENESS_STOPWORDS.has(token)
        ),
        ...(expectation.aliases || []).flatMap((alias) =>
            [...completenessTokens(alias)].filter(
                (token) => token.length > 2 && !COMPLETENESS_STOPWORDS.has(token)
            )
        )
    ]);
    const matchedNodes = projection.nodes.filter(
        (node) =>
            node.react_flow_type !== 'dataSource' &&
            completenessMatchesText(tokens, `${node.title || ''} ${node.summary || ''}`)
    );
    const matchedSources = sourceEvidenceForCompleteness(sourceProjection).filter((source) =>
        completenessMatchesText(tokens, source.text)
    );
    const sourceRefs = matchedNodes
        .flatMap((node) =>
            (node.source_refs || [])
                .filter((ref) => ref?.document_id)
                .map((ref) => ({
                    ...ref,
                    node_id: node.id,
                    document_title:
                        sourceProjection.sources.find((source) => source.id === ref.document_id)
                            ?.title || ''
                }))
        )
        .slice(0, 6);
    const completeRefs = sourceRefs.filter((ref) => ref.document_id && (ref.page || ref.section));
    let confidence = matchedNodes.length || matchedSources.length ? 0.2 : 0;
    if (matchedSources.length) confidence += 0.25;
    if (matchedNodes.length) confidence += 0.2;
    if (completeRefs.length) confidence += 0.25;
    const refConfidence = completeRefs
        .map((ref) => numericConfidence(ref.confidence))
        .filter((value) => value !== null);
    if (refConfidence.length) {
        confidence += Math.min(
            0.1,
            (refConfidence.reduce((total, value) => total + value, 0) / refConfidence.length) *
                0.1
        );
    }
    confidence = Math.max(0, Math.min(1, confidence));
    const coverageStatus =
        completeRefs.length && confidence >= 0.72
            ? 'covered'
            : matchedNodes.length || matchedSources.length || sourceRefs.length
              ? 'partial'
              : 'missing';

    return {
        id: expectation.id,
        title: expectation.title,
        description: expectation.description || '',
        coverage_status: coverageStatus,
        priority: expectation.priority || '',
        confidence: Number(confidence.toFixed(2)),
        source_refs: sourceRefs,
        matched_node_ids: matchedNodes.slice(0, 6).map((node) => node.id),
        matched_documents: Array.from(
            new Map(
                matchedSources.map((source) => [
                    source.document_id,
                    { document_id: source.document_id, title: source.filename }
                ])
            ).values()
        ).slice(0, 6),
        rationale:
            coverageStatus === 'covered'
                ? 'Graph nodes and precise source references cover this expected area.'
                : coverageStatus === 'partial'
                  ? 'Some graph or source-library evidence exists, but coverage needs SME confirmation.'
                  : 'No graph or source-library evidence matched this expected area.',
        needs_review: coverageStatus !== 'covered',
        metadata: {
            expectation_sources: expectation.expectation_sources || [],
            aliases: expectation.aliases || []
        }
    };
};

const duplicateConflictCompletenessCandidates = (projection, sourceProjection) => {
    const candidates = [];
    const nodeGroups = projection.nodes
        .filter((node) => node.react_flow_type !== 'dataSource')
        .reduce((groups, node) => {
            const key = completenessKey(node.title);
            if (!key) return groups;
            groups.set(key, [...(groups.get(key) || []), node]);
            return groups;
        }, new Map());
    nodeGroups.forEach((group, key) => {
        if (group.length < 2) return;
        candidates.push({
            id: `duplicate-node-${key}`,
            title: group[0].title,
            candidate_type: 'duplicate_node',
            severity: 'medium',
            matched_node_ids: group.map((node) => node.id),
            source_refs: group.flatMap((node) => node.source_refs || []).filter((ref) => ref?.document_id),
            rationale: `${group.length} graph nodes use the same normalized title.`,
            needs_review: true
        });
    });

    const sourceGroups = sourceProjection.sources.reduce((groups, source) => {
        const key = source.file_hash || completenessKey(source.title);
        if (!key) return groups;
        groups.set(key, [...(groups.get(key) || []), source]);
        return groups;
    }, new Map());
    sourceGroups.forEach((group, key) => {
        if (group.length < 2) return;
        candidates.push({
            id: `duplicate-source-${String(key).slice(0, 72)}`,
            title: group[0].title,
            candidate_type: 'duplicate_source',
            severity: 'medium',
            matched_documents: group.map((source) => source.id),
            source_refs: group.map((source) => ({
                document_id: source.id,
                document_title: source.title
            })),
            rationale: `${group.length} source records appear to represent the same file or filename.`,
            needs_review: true
        });
    });

    sourceEvidenceForCompleteness(sourceProjection).forEach((source) => {
        const text = normalizedText(source.text);
        if (!CONFLICT_COMPLETENESS_SIGNALS.some((signal) => text.includes(signal))) return;
        candidates.push({
            id: `conflict-${stableToken(`${source.document_id}-${source.text.slice(0, 40)}`)}`,
            title: source.filename,
            candidate_type: 'conflict_signal',
            severity: 'high',
            source_refs: [source.source_ref],
            matched_documents: [source.document_id],
            rationale: 'Source text contains overlap, duplicate, superseded, or conflict language.',
            needs_review: true
        });
    });
    return candidates.slice(0, 20);
};

const staleCompletenessCandidates = (projection, sourceProjection) => {
    const candidates = [];
    projection.nodes
        .filter((node) => node.react_flow_type !== 'dataSource')
        .forEach((node) => {
            const text = normalizedText(`${node.title || ''} ${node.summary || ''}`);
            if (!STALE_COMPLETENESS_SIGNALS.some((signal) => text.includes(signal))) return;
            candidates.push({
                id: `stale-node-${node.id}`,
                title: node.title,
                candidate_type: 'stale_node',
                severity: 'medium',
                matched_node_ids: [node.id],
                source_refs: (node.source_refs || []).filter((ref) => ref?.document_id),
                rationale: 'Graph node includes stale or deprecated language.',
                needs_review: true
            });
        });
    sourceProjection.sources.forEach((source) => {
        const sourceOnlyProjection = { sources: [source] };
        const text = normalizedText(
            [
                source.title,
                source.status,
                ...sourceEvidenceForCompleteness(sourceOnlyProjection).map((item) => item.text)
            ].join(' ')
        );
        if (!STALE_COMPLETENESS_SIGNALS.some((signal) => text.includes(signal))) return;
        candidates.push({
            id: `stale-source-${stableToken(source.id || source.title)}`,
            title: source.title,
            candidate_type: 'stale_source',
            severity: 'medium',
            matched_documents: [source.id],
            source_refs: [{ document_id: source.id, document_title: source.title }],
            rationale: 'Source metadata or text includes stale or deprecated language.',
            needs_review: true
        });
    });
    return candidates.slice(0, 20);
};

const completenessQuestion = (item, question, reason) => ({
    id: `question-${reason}-${stableToken(item.id || item.title)}`,
    question,
    target_area_id: item.id || '',
    target_title: item.title || '',
    reason,
    priority: item.priority || item.severity || 'medium',
    source_refs: item.source_refs || []
});

const completenessRoadmapItem = (order, item, action, priority) => ({
    id: `roadmap-${order}-${stableToken(item.id || item.title)}`,
    order,
    title: item.title || 'Completeness item',
    action,
    priority: item.priority || item.severity || priority,
    status: 'needs_review',
    area_id: item.id || '',
    checklist: [
        'Confirm the expected coverage area with an SME.',
        'Attach source document, page, section, and quote evidence.',
        'Mark the area reviewed after conflicts and stale guidance are resolved.'
    ],
    source_refs: item.source_refs || []
});

export const buildCompletenessReviewProjection = ({
    nodes = [],
    edges = [],
    workspaceBrief = {},
    sourceLibrary = [],
    domainProfile = {},
    expectedCoverage = [],
    title = 'Completeness Review'
} = {}) => {
    const projection = buildGraphProjection(nodes, edges);
    const sourceProjection = buildSourceLibraryProjection(nodes, edges, workspaceBrief, sourceLibrary);
    const expectations = completenessExpectations({
        projection,
        workspaceBrief,
        domainProfile,
        expectedCoverage
    });
    const areaItems = expectations.map((expectation) =>
        completenessAreaItem(expectation, projection, sourceProjection)
    );
    const covered = areaItems.filter((item) => item.coverage_status === 'covered');
    const partial = areaItems.filter((item) => item.coverage_status === 'partial');
    const missing = areaItems.filter((item) => item.coverage_status === 'missing');
    const duplicateConflicting = duplicateConflictCompletenessCandidates(projection, sourceProjection);
    const staleDeprecated = staleCompletenessCandidates(projection, sourceProjection);
    const roadmapInputs = [
        ...duplicateConflicting.slice(0, 5).map((item) => ({
            item,
            action: 'Resolve conflicting or duplicate guidance',
            priority: 'high'
        })),
        ...staleDeprecated.slice(0, 5).map((item) => ({
            item,
            action: 'Review stale or deprecated guidance',
            priority: 'high'
        })),
        ...missing.slice(0, 8).map((item) => ({
            item,
            action: 'Create or attach missing source coverage',
            priority: 'medium'
        })),
        ...partial.slice(0, 8).map((item) => ({
            item,
            action: 'Strengthen partial coverage with precise citations',
            priority: 'medium'
        }))
    ];
    const recommendedRoadmap = roadmapInputs
        .slice(0, 25)
        .map(({ item, action, priority }, index) =>
            completenessRoadmapItem(index + 1, item, action, priority)
        );
    const smeQuestions = [
        ...missing.slice(0, 8).map((item) =>
            completenessQuestion(
                item,
                `Should "${item.title}" be part of the expected standard, and who owns the source of truth?`,
                'missing_area'
            )
        ),
        ...partial.slice(0, 8).map((item) =>
            completenessQuestion(
                item,
                `What source, page, or section completes coverage for "${item.title}"?`,
                'partial_area'
            )
        ),
        ...duplicateConflicting.slice(0, 5).map((item) =>
            completenessQuestion(
                item,
                `Which item is authoritative for "${item.title}", and should duplicates be merged or retired?`,
                'duplicate_or_conflict'
            )
        ),
        ...staleDeprecated.slice(0, 5).map((item) =>
            completenessQuestion(
                item,
                `Is "${item.title}" current guidance, or should it be updated or deprecated?`,
                'stale_or_deprecated'
            )
        )
    ].slice(0, 20);

    return {
        contract_version: COMPLETENESS_REVIEW_CONTRACT_VERSION,
        title,
        summary: `${expectations.length} expected area${expectations.length === 1 ? '' : 's'}, ${covered.length} covered, ${partial.length} partial, ${missing.length} missing, ${duplicateConflicting.length} duplicate/conflicting candidate${duplicateConflicting.length === 1 ? '' : 's'}, and ${staleDeprecated.length} stale/deprecated candidate${staleDeprecated.length === 1 ? '' : 's'}.`,
        covered_areas: covered,
        missing_areas: missing,
        partial_areas: partial,
        duplicate_conflicting_areas: duplicateConflicting,
        stale_deprecated_candidates: staleDeprecated,
        sme_questions: smeQuestions,
        recommended_roadmap: recommendedRoadmap,
        checklist_suggestions: recommendedRoadmap.map((item, index) => ({
            id: `checklist-${item.id || index}`,
            label: item.title,
            note: item.action,
            priority: item.priority,
            review_required: true,
            source_refs: item.source_refs || []
        })),
        metadata: {
            expected_area_count: expectations.length,
            source_document_count: sourceProjection.sources.length,
            source_backed_area_count:
                covered.length + partial.filter((item) => item.source_refs?.length).length,
            expectation_sources: uniqueValues(
                expectations.flatMap((item) => item.expectation_sources || [])
            ).sort(),
            projection_source: 'workspace_graph_source_library'
        }
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
    const hierarchyEdges = edges.filter(isHierarchyEdge);

    hierarchyEdges.forEach((edge) => {
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
    const visibleHierarchyEdges = visibleEdges.filter(isHierarchyEdge);
    const visibleTargetedIds = new Set(visibleHierarchyEdges.map((edge) => edge.target));
    const roots = visibleNodes.filter((node) => !visibleTargetedIds.has(node.id));
    const selectedRoot = branchId ? nodeLookup.get(branchId) : undefined;

    return {
        nodes: visibleNodes,
        edges: visibleEdges.map((edge) => ({
            ...edge,
            relationship_type: relationshipTypeForEdge(edge)
        })),
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

const activeFilterIds = (filters = []) => {
    if (Array.isArray(filters)) {
        return filters.filter(Boolean);
    }
    if (filters && typeof filters === 'object') {
        return Object.entries(filters)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([id]) => id);
    }
    return [];
};

const nodeMatchesFilter = (node, filterId) => {
    if (filterId === 'source-backed') {
        return node.source_refs?.some(hasSourceEvidence);
    }
    if (filterId === 'needs-review') {
        return node.status === 'needs_review' || node.node_type === 'needs_review';
    }
    if (filterId === 'manual') {
        return node.is_manual;
    }
    if (filterId === 'ai-generated') {
        return !node.is_manual && node.status !== 'approved' && node.status !== 'reviewed';
    }
    if (filterId === 'tasks-only') {
        return TASK_CAPABLE_TYPES.has(node.node_type);
    }
    if (filterId === 'unassigned') {
        return TASK_CAPABLE_TYPES.has(node.node_type) && !node.owner_id;
    }
    if (filterId === 'missing-due-date') {
        return TASK_CAPABLE_TYPES.has(node.node_type) && !node.due_date;
    }
    if (filterId === 'missing-source') {
        return node.react_flow_type !== 'dataSource' && !node.source_refs?.some(hasSourceEvidence);
    }
    if (filterId === 'low-confidence') {
        const confidence = Number(node.confidence);
        return node.confidence !== '' && Number.isFinite(confidence) && confidence < 0.6;
    }
    if (filterId === 'hidden-from-export') {
        return node.hidden_from_export;
    }

    return true;
};

const rootsForFilteredGraph = (nodes, edges) => {
    const targetedIds = new Set(edges.filter(isHierarchyEdge).map((edge) => edge.target));
    return nodes.filter((node) => !targetedIds.has(node.id));
};

export const applyGraphFilters = (projection, filters = []) => {
    const filtersToApply = activeFilterIds(filters);
    if (filtersToApply.length === 0) {
        return projection;
    }

    const visibleIds = new Set(
        projection.nodes
            .filter((node) => filtersToApply.every((filterId) => nodeMatchesFilter(node, filterId)))
            .map((node) => node.id)
    );
    const nodes = projection.nodes.filter((node) => visibleIds.has(node.id));
    const edges = projection.edges.filter(
        (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)
    );
    const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
    const childrenByParent = edges.filter(isHierarchyEdge).reduce((children, edge) => {
        const nextChildren = children.get(edge.source) || [];
        nextChildren.push(edge.target);
        children.set(edge.source, nextChildren);
        return children;
    }, new Map());

    return {
        ...projection,
        nodes,
        edges,
        roots: rootsForFilteredGraph(nodes, edges),
        nodeLookup,
        childrenByParent,
        branchIds: visibleIds,
        appliedFilters: filtersToApply
    };
};

export const buildFilteredGraphProjection = (nodes, edges, { branchId, filters } = {}) =>
    applyGraphFilters(buildGraphProjection(nodes, edges, branchId), filters);


const markdownText = (value, fallback = 'Not set') => {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    return String(value).replace(/\s+/g, ' ').trim() || fallback;
};

const markdownListValue = (value, fallback = 'Not set') =>
    markdownText(value, fallback).replace(/\|/g, '\\|');

const sourceRefLabel = (sourceRef = {}, index = 0) => {
    const title =
        sourceRef.title ||
        sourceRef.document_title ||
        sourceRef.filename ||
        sourceRef.document_id ||
        sourceRef.source_id ||
        sourceRef.chunk_id ||
        `Source ${index + 1}`;
    const location = [
        sourceRef.page ? `p. ${sourceRef.page}` : '',
        sourceRef.section || sourceRef.heading || ''
    ]
        .filter(Boolean)
        .join(', ');
    const snippet =
        sourceRef.quote_snippet ||
        sourceRef.snippet ||
        sourceRef.text ||
        sourceRef.summary ||
        '';

    return [markdownText(title), location, snippet ? `"${markdownText(snippet)}"` : '']
        .filter(Boolean)
        .join(' - ');
};

const firstSourceEvidenceValue = (refs = [], key) =>
    refs.find((ref) => ref?.[key] !== undefined && ref?.[key] !== null && ref?.[key] !== '')?.[key] ?? '';

const sqlArtifactForNode = (node = {}) =>
    (node.generated_artifacts || []).find((artifact) => artifact?.artifact_type === 'sql_query');

const tableArtifactForNode = (node = {}) =>
    (node.generated_artifacts || []).find((artifact) => artifact?.artifact_type === 'data_table');

const chartArtifactForNode = (node = {}) =>
    (node.generated_artifacts || []).find((artifact) => artifact?.artifact_type === 'chart');

const hasSourceSupport = (node = {}) =>
    node.source_refs?.some(hasSourceEvidence) || hasSourceEvidence(node.source_ref);

const structuredEvidenceForTask = (node = {}) => {
    const refs = node.source_refs || [];
    const metadata = node.artifact_metadata || {};
    const hasStructuredEvidence =
        metadata.domain === 'structured_data' ||
        ['data_table', 'sql_query'].includes(String(node.artifact_type || '')) ||
        refs.some((ref) => ['data_table', 'sql_query'].includes(String(ref?.source_type || ''))) ||
        (node.generated_artifacts || []).some((artifact) =>
            ['data_table', 'sql_query', 'chart', 'data_summary'].includes(String(artifact?.artifact_type || ''))
        );

    if (!hasStructuredEvidence) {
        return null;
    }

    const tableArtifact = tableArtifactForNode(node);
    const sqlArtifact = sqlArtifactForNode(node);
    const rowCountValue =
        metadata.row_count ??
        tableArtifact?.data?.row_count ??
        firstSourceEvidenceValue(refs, 'row_count') ??
        '';
    const rowCount = Number.isFinite(Number(rowCountValue)) ? Number(rowCountValue) : 0;
    const tableName =
        metadata.table_name ||
        tableArtifact?.data?.table_name ||
        sqlArtifact?.data?.table_name ||
        firstSourceEvidenceValue(refs, 'table_name') ||
        '';
    const queryId =
        metadata.query_id ||
        tableArtifact?.data?.query_id ||
        sqlArtifact?.data?.query_id ||
        firstSourceEvidenceValue(refs, 'query_id') ||
        '';
    const resultHash =
        metadata.result_hash ||
        tableArtifact?.data?.result_hash ||
        sqlArtifact?.data?.result_hash ||
        firstSourceEvidenceValue(refs, 'result_hash') ||
        '';
    const query = node.query || sqlArtifact?.data?.sql || firstSourceEvidenceValue(refs, 'query') || '';

    return {
        source_backed: refs.some(hasSourceEvidence),
        table_name: tableName,
        query_id: queryId,
        result_hash: resultHash,
        row_count: rowCount,
        query,
        evidence_node_id: metadata.evidence_node_id || '',
        artifact_types: (node.generated_artifacts || [])
            .map((artifact) => artifact?.artifact_type)
            .filter(Boolean)
    };
};

export {
    DECISION_TYPES,
    DEPENDENCY_NODE_TYPES,
    DEPENDENCY_RELATIONSHIP_TYPES,
    ENTERPRISE_ACTION_TYPES,
    FLOW_NODE_TYPES,
    FLOW_RELATIONSHIP_TYPES,
    FLOW_NO_SIGNALS,
    FLOW_YES_SIGNALS,
    MILESTONE_TYPES,
    RISK_TYPES,
    TASK_CAPABLE_TYPES,
    WORKSTREAM_TYPES,
    businessImpactScore,
    chartArtifactForNode,
    checklistProjectionForNode,
    enterpriseReasons,
    firstSourceEvidenceValue,
    flowBranchKind,
    flowBranchLabel,
    hasCompleteSourceRef,
    hasSourceDocument,
    hasSourceEvidence,
    hasSourceSupport,
    implementationReadinessScore,
    isConfirmedTaskNode,
    isHierarchyEdge,
    isHierarchyRelationship,
    markdownListValue,
    markdownText,
    normalizeSignal,
    numericConfidence,
    nodeConfidenceIssues,
    ownerClarityScore,
    projectedTaskValue,
    readinessBand,
    relationshipLabel,
    relationshipTypeForEdge,
    riskSeverityScore,
    scoreFromSignal,
    sourceCoverageScore,
    sourceRefIssues,
    sourceRefLabel,
    sqlArtifactForNode,
    structuredEvidenceForTask,
    suggestedConfidenceForRepair,
    tableArtifactForNode,
    taskProjectionForNode,
    uniqueValues
};
