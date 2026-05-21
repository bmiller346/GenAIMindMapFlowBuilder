import {
    buildGraphProjection,
    isHierarchyRelationship,
    markdownListValue,
    markdownText,
    relationshipLabel,
    sourceRefLabel
} from './packageReady.js';
import {
    KG_RELATIONSHIP_FAMILIES,
    KG_RELATIONSHIP_FAMILY_OPTIONS,
    getKgRelationshipSummary
} from '../../utils/kgRelationshipFilters.js';

export const getConnectionRows = (projection) =>
    projection.edges
        .map((edge) => {
            const source = projection.nodeLookup.get(edge.source);
            const target = projection.nodeLookup.get(edge.target);
            const relationshipType =
                edge.relationship_type ||
                edge.data?.relationship_type ||
                edge.data?.relationshipType ||
                edge.metadata?.relationship_type ||
                edge.data?.relationship ||
                edge.data?.label ||
                edge.label ||
                '';

            if (!source || !target) {
                return undefined;
            }

            return {
                id: edge.id || `${edge.source}-${edge.target}`,
                source,
                target,
                relationship:
                    relationshipLabel(relationshipType) ||
                    edge.label ||
                    edge.data?.relationship ||
                    edge.data?.label ||
                    'parent-child',
                relationship_type: relationshipType,
                connection_kind: isHierarchyRelationship(relationshipType)
                    ? 'Hierarchy'
                    : 'Cross-link',
                confidence:
                    edge.confidence ||
                    edge.data?.confidence ||
                    edge.metadata?.confidence ||
                    '',
                review_state:
                    edge.review_state ||
                    edge.data?.review_state ||
                    edge.metadata?.review_state ||
                    '',
                rationale:
                    edge.rationale ||
                    edge.data?.rationale ||
                    edge.metadata?.rationale ||
                    edge.data?.source_signal ||
                    '',
                source_signal:
                    edge.source_signal ||
                    edge.data?.source_signal ||
                    edge.metadata?.source_signal ||
                    '',
                source_refs: [
                    ...(Array.isArray(edge.source_refs) ? edge.source_refs : []),
                    ...(Array.isArray(edge.data?.source_refs) ? edge.data.source_refs : []),
                    ...(Array.isArray(edge.metadata?.source_refs) ? edge.metadata.source_refs : [])
                ],
                raw_edge: edge,
                locally_projected: true
            };
        })
        .filter(Boolean);

export const getCrossLinkConnectionRows = (projection) =>
    getConnectionRows(projection).filter((row) => row.connection_kind === 'Cross-link');

const RELATIONSHIP_FAMILY_ORDER = Object.fromEntries(
    KG_RELATIONSHIP_FAMILY_OPTIONS.map((option, index) => [option.id, index])
);

const relationshipReviewConfidence = (value) => {
    if (value === undefined || value === null || value === '') {
        return '';
    }
    const numeric = Number(String(value).replace('%', ''));
    if (!Number.isFinite(numeric)) {
        return String(value);
    }
    const normalized = String(value).includes('%') || numeric > 1 ? numeric : numeric * 100;
    return `${Math.round(normalized)}%`;
};

export const getRelationshipFamilyReviewGroups = (projection) => {
    const rows = getConnectionRows(projection)
        .map((row) => {
            const summary = getKgRelationshipSummary(row.raw_edge);
            if (
                summary.is_hierarchy ||
                summary.family === KG_RELATIONSHIP_FAMILIES.HIERARCHY
            ) {
                return null;
            }
            return {
                ...row,
                family: summary.family,
                family_label: summary.family_label,
                family_short_label: summary.family_short_label,
                relationship: summary.relationship_label || row.relationship,
                confidence: relationshipReviewConfidence(row.confidence),
                review_state: row.review_state || 'Needs review',
                source_signal: row.source_signal || 'AI inferred'
            };
        })
        .filter(Boolean)
        .sort(
            (left, right) =>
                (RELATIONSHIP_FAMILY_ORDER[left.family] ?? 99) -
                    (RELATIONSHIP_FAMILY_ORDER[right.family] ?? 99) ||
                left.source.title.localeCompare(right.source.title) ||
                left.target.title.localeCompare(right.target.title)
        );

    const groupsByFamily = rows.reduce((groups, row) => {
        if (!groups.has(row.family)) {
            groups.set(row.family, {
                id: row.family,
                label: row.family_label,
                short_label: row.family_short_label,
                rows: []
            });
        }
        groups.get(row.family).rows.push(row);
        return groups;
    }, new Map());

    return KG_RELATIONSHIP_FAMILY_OPTIONS
        .map((option) => groupsByFamily.get(option.id))
        .filter(Boolean);
};

export const buildRelationshipReviewMarkdown = ({
    projection,
    title = 'Relationship Review',
    scopeLabel = 'Workspace',
    generatedAt = new Date().toISOString()
} = {}) => {
    const safeProjection = projection?.nodeLookup
        ? projection
        : buildGraphProjection(projection?.nodes || [], projection?.edges || []);
    const groups = getRelationshipFamilyReviewGroups(safeProjection);
    const rows = groups.flatMap((group) => group.rows);
    const lines = [
        `# ${markdownText(title, 'Relationship Review')}`,
        '',
        `- Scope: ${markdownText(scopeLabel, 'Workspace')}`,
        `- Generated: ${markdownText(generatedAt)}`,
        `- Reviewable relationships: ${rows.length}`,
        ''
    ];

    if (rows.length === 0) {
        lines.push('No accepted semantic relationship edges found for this scope.');
        return lines.join('\n');
    }

    groups.forEach((group) => {
        lines.push(`## ${markdownText(group.label)} (${group.rows.length})`, '');
        group.rows.forEach((row, index) => {
            const sourceRefs = Array.isArray(row.source_refs) ? row.source_refs : [];
            lines.push(`### ${index + 1}. ${markdownText(row.source?.title)} -> ${markdownText(row.target?.title)}`);
            lines.push(`- Relationship: ${markdownListValue(row.relationship)}`);
            lines.push(`- Family: ${markdownListValue(row.family_label)}`);
            lines.push(`- Confidence: ${markdownListValue(row.confidence)}`);
            lines.push(`- Review state: ${markdownListValue(row.review_state)}`);
            lines.push(`- Source signal: ${markdownListValue(row.source_signal)}`);
            lines.push(`- Rationale: ${markdownListValue(row.rationale)}`);
            lines.push(`- Edge id: ${markdownListValue(row.id)}`);
            if (sourceRefs.length > 0) {
                lines.push('- Source refs:');
                sourceRefs.slice(0, 5).forEach((sourceRef, sourceIndex) => {
                    lines.push(`  - ${sourceRefLabel(sourceRef, sourceIndex)}`);
                });
                if (sourceRefs.length > 5) {
                    lines.push(`  - ${sourceRefs.length - 5} more source reference(s)`);
                }
            } else {
                lines.push('- Source refs: None attached');
            }
            lines.push('');
        });
    });

    return lines.join('\n').trimEnd();
};


export const getKnowledgeGraphRows = (projection) =>
    projection.nodes.map((node) => ({
        ...node,
        relationship_count: projection.edges.filter(
            (edge) => edge.source === node.id || edge.target === node.id
        ).length,
        locally_projected: true
    }));

