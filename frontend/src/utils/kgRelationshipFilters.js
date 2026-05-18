export const KG_RELATIONSHIP_FAMILIES = {
    HIERARCHY: 'hierarchy',
    RISKS: 'risks',
    DEPENDENCIES: 'dependencies',
    OWNERSHIP: 'ownership',
    METRICS: 'metrics',
    APPROVALS: 'approvals',
    EVIDENCE: 'evidence',
    RELATED: 'related'
};

export const KG_RELATIONSHIP_MODES = {
    ALL: 'all',
    INSIGHTS: 'insights',
    EXECUTION: 'execution',
    RISKS: KG_RELATIONSHIP_FAMILIES.RISKS,
    DEPENDENCIES: KG_RELATIONSHIP_FAMILIES.DEPENDENCIES,
    OWNERSHIP: KG_RELATIONSHIP_FAMILIES.OWNERSHIP,
    METRICS: KG_RELATIONSHIP_FAMILIES.METRICS,
    APPROVALS: KG_RELATIONSHIP_FAMILIES.APPROVALS,
    EVIDENCE: KG_RELATIONSHIP_FAMILIES.EVIDENCE,
    RELATED: KG_RELATIONSHIP_FAMILIES.RELATED
};

export const KG_RELATIONSHIP_FAMILY_OPTIONS = [
    {
        id: KG_RELATIONSHIP_FAMILIES.RISKS,
        label: 'Risks',
        shortLabel: 'Risk',
        description: 'Blockers, conflicts, threats, issues, and mitigations.'
    },
    {
        id: KG_RELATIONSHIP_FAMILIES.DEPENDENCIES,
        label: 'Dependencies',
        shortLabel: 'Depends',
        description: 'Prerequisites, required inputs, sequencing, and handoffs.'
    },
    {
        id: KG_RELATIONSHIP_FAMILIES.OWNERSHIP,
        label: 'Ownership',
        shortLabel: 'Owns',
        description: 'Owners, accountable teams, roles, and assignees.'
    },
    {
        id: KG_RELATIONSHIP_FAMILIES.METRICS,
        label: 'Metrics',
        shortLabel: 'Metrics',
        description: 'KPIs, measures, targets, outcomes, and impact.'
    },
    {
        id: KG_RELATIONSHIP_FAMILIES.APPROVALS,
        label: 'Approvals',
        shortLabel: 'Approvals',
        description:
            'Review, approval, decision, signoff, and governance gates.'
    },
    {
        id: KG_RELATIONSHIP_FAMILIES.EVIDENCE,
        label: 'Evidence',
        shortLabel: 'Evidence',
        description:
            'Sources, citations, support, validation, and derived evidence.'
    },
    {
        id: KG_RELATIONSHIP_FAMILIES.RELATED,
        label: 'Related',
        shortLabel: 'Related',
        description:
            'Associations, duplicates, overlap, similarity, and references.'
    }
];

export const KG_RELATIONSHIP_MODE_OPTIONS = [
    {
        id: KG_RELATIONSHIP_MODES.INSIGHTS,
        label: 'Insight Focus',
        shortLabel: 'Insights',
        description:
            'Show decision-useful relationships and hide loose related links.'
    },
    {
        id: KG_RELATIONSHIP_MODES.EXECUTION,
        label: 'Execution',
        shortLabel: 'Execution',
        description: 'Show dependencies, owners, approvals, risks, and metrics.'
    },
    {
        id: KG_RELATIONSHIP_MODES.RISKS,
        label: 'Risks',
        shortLabel: 'Risks',
        description: 'Show blockers, conflicts, issues, and mitigations.'
    },
    {
        id: KG_RELATIONSHIP_MODES.DEPENDENCIES,
        label: 'Dependencies',
        shortLabel: 'Depends',
        description:
            'Show required inputs, prerequisites, sequencing, and handoffs.'
    },
    {
        id: KG_RELATIONSHIP_MODES.OWNERSHIP,
        label: 'Ownership',
        shortLabel: 'Owners',
        description: 'Show owners, assignees, and accountable teams.'
    },
    {
        id: KG_RELATIONSHIP_MODES.METRICS,
        label: 'Metrics',
        shortLabel: 'Metrics',
        description: 'Show KPIs, measures, targets, and outcomes.'
    },
    {
        id: KG_RELATIONSHIP_MODES.APPROVALS,
        label: 'Approvals',
        shortLabel: 'Approvals',
        description: 'Show reviews, decisions, signoffs, and governance gates.'
    },
    {
        id: KG_RELATIONSHIP_MODES.EVIDENCE,
        label: 'Evidence',
        shortLabel: 'Evidence',
        description: 'Show source-backed, cited, supported, and derived links.'
    },
    {
        id: KG_RELATIONSHIP_MODES.RELATED,
        label: 'Related',
        shortLabel: 'Related',
        description:
            'Show general associations, overlap, duplicates, and references.'
    },
    {
        id: KG_RELATIONSHIP_MODES.ALL,
        label: 'All Relationships',
        shortLabel: 'All',
        description: 'Show every semantic relationship family.'
    }
];

const HIERARCHY_RELATIONSHIP_TYPES = new Set([
    '',
    'contains',
    'parent-child',
    'parent_child',
    'child',
    'section',
    'subtopic',
    'branch',
    'step',
    'smoothstep'
]);

const RELATIONSHIP_FAMILY_ALIASES = {
    [KG_RELATIONSHIP_FAMILIES.RISKS]: [
        'risk',
        'risks',
        'creates-risk-for',
        'creates-risk',
        'risk-for',
        'threatens',
        'blocker',
        'blocks',
        'blocked-by',
        'conflicts-with',
        'conflicts',
        'contradicts',
        'contradicted-by',
        'issue',
        'mitigates',
        'mitigated-by',
        'constraint'
    ],
    [KG_RELATIONSHIP_FAMILIES.DEPENDENCIES]: [
        'depends-on',
        'depends',
        'dependency',
        'requires',
        'required-by',
        'prerequisite',
        'precedes',
        'follows',
        'next',
        'sequence',
        'then',
        'handoff',
        'input-to',
        'output-of',
        'enables',
        'implements'
    ],
    [KG_RELATIONSHIP_FAMILIES.OWNERSHIP]: [
        'owned-by',
        'owns',
        'owner',
        'accountable-to',
        'accountable',
        'responsible-for',
        'responsible',
        'assigned-to',
        'assignee',
        'team',
        'team-owner',
        'stakeholder',
        'sponsor'
    ],
    [KG_RELATIONSHIP_FAMILIES.METRICS]: [
        'metric',
        'measured-by',
        'measures',
        'kpi',
        'target',
        'goal',
        'objective',
        'outcome',
        'impact',
        'score',
        'threshold',
        'indicator',
        'tracks'
    ],
    [KG_RELATIONSHIP_FAMILIES.APPROVALS]: [
        'approval',
        'approved-by',
        'approves',
        'requires-approval',
        'requires-review-by',
        'reviewed-by',
        'review',
        'signoff',
        'sign-off',
        'decision',
        'decides',
        'governed-by',
        'policy',
        'control',
        'gate'
    ],
    [KG_RELATIONSHIP_FAMILIES.EVIDENCE]: [
        'evidence',
        'evidenced-by',
        'source',
        'sourced-from',
        'source-for',
        'citation',
        'cites',
        'cited-by',
        'derived-from',
        'supports',
        'supported-by',
        'validates',
        'validated-by',
        'proves',
        'informs'
    ],
    [KG_RELATIONSHIP_FAMILIES.RELATED]: [
        'related-to',
        'related',
        'references',
        'reference',
        'associated-with',
        'linked-to',
        'connects-to',
        'similar-to',
        'duplicates',
        'duplicate-of',
        'overlaps',
        'overlap',
        'same-as',
        'part-of'
    ]
};

const FAMILY_BY_ALIAS = Object.entries(RELATIONSHIP_FAMILY_ALIASES).reduce(
    (lookup, [family, aliases]) => {
        aliases.forEach((alias) => lookup.set(alias, family));
        return lookup;
    },
    new Map()
);

const KG_MODE_FAMILIES = {
    [KG_RELATIONSHIP_MODES.ALL]: Object.values(KG_RELATIONSHIP_FAMILIES).filter(
        (family) => family !== KG_RELATIONSHIP_FAMILIES.HIERARCHY
    ),
    [KG_RELATIONSHIP_MODES.INSIGHTS]: [
        KG_RELATIONSHIP_FAMILIES.RISKS,
        KG_RELATIONSHIP_FAMILIES.DEPENDENCIES,
        KG_RELATIONSHIP_FAMILIES.OWNERSHIP,
        KG_RELATIONSHIP_FAMILIES.METRICS,
        KG_RELATIONSHIP_FAMILIES.APPROVALS,
        KG_RELATIONSHIP_FAMILIES.EVIDENCE
    ],
    [KG_RELATIONSHIP_MODES.EXECUTION]: [
        KG_RELATIONSHIP_FAMILIES.RISKS,
        KG_RELATIONSHIP_FAMILIES.DEPENDENCIES,
        KG_RELATIONSHIP_FAMILIES.OWNERSHIP,
        KG_RELATIONSHIP_FAMILIES.METRICS,
        KG_RELATIONSHIP_FAMILIES.APPROVALS
    ],
    [KG_RELATIONSHIP_MODES.RISKS]: [KG_RELATIONSHIP_FAMILIES.RISKS],
    [KG_RELATIONSHIP_MODES.DEPENDENCIES]: [
        KG_RELATIONSHIP_FAMILIES.DEPENDENCIES
    ],
    [KG_RELATIONSHIP_MODES.OWNERSHIP]: [KG_RELATIONSHIP_FAMILIES.OWNERSHIP],
    [KG_RELATIONSHIP_MODES.METRICS]: [KG_RELATIONSHIP_FAMILIES.METRICS],
    [KG_RELATIONSHIP_MODES.APPROVALS]: [KG_RELATIONSHIP_FAMILIES.APPROVALS],
    [KG_RELATIONSHIP_MODES.EVIDENCE]: [KG_RELATIONSHIP_FAMILIES.EVIDENCE],
    [KG_RELATIONSHIP_MODES.RELATED]: [KG_RELATIONSHIP_FAMILIES.RELATED]
};

export const normalizeKgRelationshipType = (value = '') =>
    String(value || '')
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[_\s/]+/g, '-')
        .replace(/[^a-z0-9-]+/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

export const getKgRelationshipType = (edge = {}) =>
    normalizeKgRelationshipType(
        edge.relationship_type ||
            edge.relationshipType ||
            edge.data?.relationship_type ||
            edge.data?.relationshipType ||
            edge.metadata?.relationship_type ||
            edge.metadata?.relationshipType ||
            edge.data?.type ||
            edge.type ||
            ''
    );

export const humanizeKgRelationshipType = (value = '') => {
    const normalized = normalizeKgRelationshipType(value);
    if (!normalized) {
        return 'Contains';
    }
    return normalized
        .split('-')
        .filter(Boolean)
        .map((word) =>
            word === 'kpi'
                ? 'KPI'
                : word.charAt(0).toUpperCase() + word.slice(1)
        )
        .join(' ');
};

export const isKgHierarchyRelationship = (relationshipType = '') =>
    HIERARCHY_RELATIONSHIP_TYPES.has(
        normalizeKgRelationshipType(relationshipType)
    );

const matchRelationshipFamilyByText = (relationshipType) => {
    if (!relationshipType) {
        return KG_RELATIONSHIP_FAMILIES.HIERARCHY;
    }
    if (isKgHierarchyRelationship(relationshipType)) {
        return KG_RELATIONSHIP_FAMILIES.HIERARCHY;
    }
    if (FAMILY_BY_ALIAS.has(relationshipType)) {
        return FAMILY_BY_ALIAS.get(relationshipType);
    }

    for (const [family, aliases] of Object.entries(
        RELATIONSHIP_FAMILY_ALIASES
    )) {
        if (aliases.some((alias) => relationshipType.includes(alias))) {
            return family;
        }
    }

    return KG_RELATIONSHIP_FAMILIES.RELATED;
};

export const getKgRelationshipFamily = (relationshipOrEdge = '') => {
    const relationshipType =
        relationshipOrEdge && typeof relationshipOrEdge === 'object'
            ? getKgRelationshipType(relationshipOrEdge)
            : normalizeKgRelationshipType(relationshipOrEdge);

    return matchRelationshipFamilyByText(relationshipType);
};

export const getKgRelationshipFamilyOption = (
    family = KG_RELATIONSHIP_FAMILIES.RELATED
) =>
    KG_RELATIONSHIP_FAMILY_OPTIONS.find((option) => option.id === family) || {
        id: KG_RELATIONSHIP_FAMILIES.RELATED,
        label: 'Related',
        shortLabel: 'Related',
        description: 'General relationships and associations.'
    };

export const getKgRelationshipModeOption = (
    mode = KG_RELATIONSHIP_MODES.INSIGHTS
) =>
    KG_RELATIONSHIP_MODE_OPTIONS.find((option) => option.id === mode) ||
    KG_RELATIONSHIP_MODE_OPTIONS[0];

export const getKgModeFamilies = (mode = KG_RELATIONSHIP_MODES.INSIGHTS) =>
    KG_MODE_FAMILIES[mode] || KG_MODE_FAMILIES[KG_RELATIONSHIP_MODES.INSIGHTS];

export const shouldShowKgSemanticEdge = (
    edge = {},
    mode = KG_RELATIONSHIP_MODES.INSIGHTS,
    { includeHierarchy = true } = {}
) => {
    const family = getKgRelationshipFamily(edge);
    if (family === KG_RELATIONSHIP_FAMILIES.HIERARCHY) {
        return includeHierarchy;
    }

    return getKgModeFamilies(mode).includes(family);
};

export const getKgRelationshipSummary = (edge = {}) => {
    const relationshipType = getKgRelationshipType(edge);
    const family = getKgRelationshipFamily(edge);
    const option = getKgRelationshipFamilyOption(family);

    return {
        relationship_type: relationshipType || 'contains',
        relationship_label: humanizeKgRelationshipType(relationshipType),
        family,
        family_label:
            family === KG_RELATIONSHIP_FAMILIES.HIERARCHY
                ? 'Hierarchy'
                : option.label,
        family_short_label:
            family === KG_RELATIONSHIP_FAMILIES.HIERARCHY
                ? 'Structure'
                : option.shortLabel,
        is_hierarchy: family === KG_RELATIONSHIP_FAMILIES.HIERARCHY
    };
};

export const filterKgSemanticEdges = (
    edges = [],
    mode = KG_RELATIONSHIP_MODES.INSIGHTS,
    options = {}
) =>
    (Array.isArray(edges) ? edges : []).filter((edge) =>
        shouldShowKgSemanticEdge(edge, mode, options)
    );
