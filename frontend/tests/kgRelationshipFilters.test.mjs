import assert from 'node:assert/strict';
import test from 'node:test';
import {
    KG_RELATIONSHIP_FAMILIES,
    KG_RELATIONSHIP_FAMILY_OPTIONS,
    KG_RELATIONSHIP_MODE_OPTIONS,
    KG_RELATIONSHIP_MODES,
    filterKgSemanticEdges,
    getKgModeFamilies,
    getKgRelationshipFamily,
    getKgRelationshipFamilyOption,
    getKgRelationshipModeOption,
    getKgRelationshipSummary,
    getKgRelationshipType,
    humanizeKgRelationshipType,
    isKgHierarchyRelationship,
    normalizeKgRelationshipType,
    shouldShowKgSemanticEdge
} from '../src/utils/kgRelationshipFilters.js';

test('normalizes relationship values from common edge shapes', () => {
    assert.equal(
        normalizeKgRelationshipType('requiresApproval'),
        'requires-approval'
    );
    assert.equal(normalizeKgRelationshipType('depends_on'), 'depends-on');
    assert.equal(
        getKgRelationshipType({
            type: 'smoothstep',
            data: { relationshipType: 'blockedBy' },
            metadata: { relationship_type: 'related_to' }
        }),
        'blocked-by'
    );
    assert.equal(
        getKgRelationshipType({
            type: 'semantic',
            metadata: { relationship_type: 'measured_by' }
        }),
        'measured-by'
    );
});

test('categorizes relationship types into insight families', () => {
    assert.equal(
        getKgRelationshipFamily('creates_risk_for'),
        KG_RELATIONSHIP_FAMILIES.RISKS
    );
    assert.equal(
        getKgRelationshipFamily('depends_on'),
        KG_RELATIONSHIP_FAMILIES.DEPENDENCIES
    );
    assert.equal(
        getKgRelationshipFamily('responsible_for'),
        KG_RELATIONSHIP_FAMILIES.OWNERSHIP
    );
    assert.equal(
        getKgRelationshipFamily('measured_by'),
        KG_RELATIONSHIP_FAMILIES.METRICS
    );
    assert.equal(
        getKgRelationshipFamily('requires_review_by'),
        KG_RELATIONSHIP_FAMILIES.APPROVALS
    );
    assert.equal(
        getKgRelationshipFamily('derived_from'),
        KG_RELATIONSHIP_FAMILIES.EVIDENCE
    );
    assert.equal(
        getKgRelationshipFamily('similar_to'),
        KG_RELATIONSHIP_FAMILIES.RELATED
    );
    assert.equal(
        getKgRelationshipFamily('custom_association'),
        KG_RELATIONSHIP_FAMILIES.RELATED
    );
});

test('keeps hierarchy relationships separate from semantic family filters', () => {
    assert.equal(isKgHierarchyRelationship('contains'), true);
    assert.equal(isKgHierarchyRelationship('parent_child'), true);
    assert.equal(
        getKgRelationshipFamily({ relationship_type: 'contains' }),
        KG_RELATIONSHIP_FAMILIES.HIERARCHY
    );
    assert.equal(
        shouldShowKgSemanticEdge(
            { relationship_type: 'contains' },
            KG_RELATIONSHIP_MODES.RISKS
        ),
        true
    );
    assert.equal(
        shouldShowKgSemanticEdge(
            { relationship_type: 'contains' },
            KG_RELATIONSHIP_MODES.RISKS,
            { includeHierarchy: false }
        ),
        false
    );
});

test('filters semantic edges by selected knowledge graph mode', () => {
    const edges = [
        {
            id: 'hierarchy',
            source: 'a',
            target: 'b',
            relationship_type: 'contains'
        },
        {
            id: 'risk',
            source: 'risk',
            target: 'task',
            relationship_type: 'blocks'
        },
        {
            id: 'dependency',
            source: 'task',
            target: 'input',
            data: { relationship_type: 'depends_on' }
        },
        {
            id: 'owner',
            source: 'task',
            target: 'owner',
            metadata: { relationship_type: 'owned_by' }
        },
        {
            id: 'metric',
            source: 'task',
            target: 'metric',
            relationship_type: 'tracks'
        },
        {
            id: 'approval',
            source: 'task',
            target: 'lead',
            relationshipType: 'requiresApproval'
        },
        {
            id: 'evidence',
            source: 'claim',
            target: 'source',
            relationship_type: 'cites'
        },
        {
            id: 'related',
            source: 'claim',
            target: 'other',
            relationship_type: 'related_to'
        }
    ];

    assert.deepEqual(
        filterKgSemanticEdges(edges, KG_RELATIONSHIP_MODES.INSIGHTS).map(
            (edge) => edge.id
        ),
        [
            'hierarchy',
            'risk',
            'dependency',
            'owner',
            'metric',
            'approval',
            'evidence'
        ]
    );
    assert.deepEqual(
        filterKgSemanticEdges(edges, KG_RELATIONSHIP_MODES.EXECUTION).map(
            (edge) => edge.id
        ),
        ['hierarchy', 'risk', 'dependency', 'owner', 'metric', 'approval']
    );
    assert.deepEqual(
        filterKgSemanticEdges(edges, KG_RELATIONSHIP_MODES.EVIDENCE, {
            includeHierarchy: false
        }).map((edge) => edge.id),
        ['evidence']
    );
});

test('exposes mode and family options suitable for UI controls', () => {
    assert.deepEqual(getKgModeFamilies(KG_RELATIONSHIP_MODES.RISKS), [
        KG_RELATIONSHIP_FAMILIES.RISKS
    ]);
    assert.equal(
        getKgRelationshipModeOption(KG_RELATIONSHIP_MODES.INSIGHTS).label,
        'Insight Focus'
    );
    assert.equal(
        getKgRelationshipFamilyOption(KG_RELATIONSHIP_FAMILIES.APPROVALS)
            .shortLabel,
        'Approvals'
    );
    assert(
        KG_RELATIONSHIP_MODE_OPTIONS.some(
            (option) => option.id === KG_RELATIONSHIP_MODES.ALL
        )
    );
    assert(
        KG_RELATIONSHIP_FAMILY_OPTIONS.every(
            (option) => option.id && option.label && option.shortLabel
        )
    );
});

test('summarizes edges with labels for KG rendering', () => {
    assert.equal(humanizeKgRelationshipType('kpi_target'), 'KPI Target');

    assert.deepEqual(
        getKgRelationshipSummary({
            data: { relationship_type: 'derived_from' }
        }),
        {
            relationship_type: 'derived-from',
            relationship_label: 'Derived From',
            family: KG_RELATIONSHIP_FAMILIES.EVIDENCE,
            family_label: 'Evidence',
            family_short_label: 'Evidence',
            is_hierarchy: false
        }
    );
});
