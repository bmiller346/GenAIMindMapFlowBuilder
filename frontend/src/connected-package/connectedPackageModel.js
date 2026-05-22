import { mockConnectedPackagePreview } from './mockConnectedPackagePreview.js';

export const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

export const firstText = (...values) =>
    values.find((value) => typeof value === 'string' && value.trim()) || '';

export const humanize = (value = '') =>
    String(value || '')
        .replaceAll('_', ' ')
        .replaceAll('-', ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\w/, (letter) => letter.toUpperCase());

export const percent = (value, fallback = 0) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
};

export const readinessTone = (value = '') => {
    const normalized = String(value || '').toLowerCase();
    if (['ready', 'source_backed', 'accepted', 'complete'].includes(normalized)) {
        return 'ready';
    }
    if (['blocked', 'needs_repair', 'missing', 'error'].includes(normalized)) {
        return 'blocked';
    }
    return 'warning';
};

const objectOrEmpty = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const itemOwner = (item = {}) =>
    firstText(
        item.owner,
        item.owner_id,
        item.assignee,
        item.assignee_id,
        item.metadata?.owner,
        item.metadata?.owner_id,
        item.metadata?.assignee,
        item.metadata?.assignee_id
    );

const itemTitle = (item = {}, fallback = 'Package item') =>
    firstText(item.title, item.label, item.issue, item.id, item.item_id, item.node_id, item.edge_id, fallback);

const itemHasPlaceholderWeight = (item = {}) => {
    const metadata = objectOrEmpty(item.metadata);
    const valueSource = firstText(item.value_source, item.weight_source, metadata.value_source, metadata.weight_source)
        .toLowerCase();
    return (
        item.placeholder_weight === true ||
        item.placeholder_value === true ||
        metadata.placeholder_weight === true ||
        metadata.placeholder_value === true ||
        valueSource === 'placeholder' ||
        valueSource === 'estimated_placeholder' ||
        item.weight === 'placeholder' ||
        item.value === 'placeholder'
    );
};

const itemSourceRefs = (item = {}) => asArray(item.source_refs);

const readinessIssue = ({ code, label, severity = 'warning', item, count = 1 } = {}) => ({
    code,
    label,
    severity,
    count,
    item_id: item?.item_id || item?.id || item?.node_id || item?.edge_id || item?.target_id || '',
    title: item ? itemTitle(item) : label
});

export const assessConnectedPackageReadiness = (packageData = {}) => {
    const collections = {
        primary_nodes: asArray(packageData.primary_nodes),
        relationship_edges: asArray(packageData.relationship_edges),
        structured_evidence: asArray(packageData.structured_evidence),
        evidence_links: asArray(packageData.evidence_links),
        tasks: asArray(packageData.tasks),
        risks: asArray(packageData.risks),
        decisions: asArray(packageData.decisions),
        repair_targets: asArray(packageData.repair_targets),
        acceptance_groups: asArray(packageData.acceptance_groups),
        view_lenses: asArray(packageData.view_lenses)
    };
    const evidenceRequired =
        packageData.evidence_meta?.citation_required === true ||
        packageData.source_coverage?.citation_required === true ||
        packageData.metadata?.citation_policy === 'required' ||
        packageData.citation_policy === 'required';
    const reviewItems = [
        ...collections.primary_nodes,
        ...collections.relationship_edges,
        ...collections.structured_evidence,
        ...collections.evidence_links,
        ...collections.tasks,
        ...collections.risks,
        ...collections.decisions
    ];
    const uncitedItems = reviewItems.filter((item) => itemSourceRefs(item).length === 0);
    const repairTargets = collections.repair_targets.filter((target) => {
        const status = firstText(target.status, target.review_state).toLowerCase();
        return !['resolved', 'repaired', 'accepted', 'complete'].includes(status);
    });
    const ownerItems = [
        ...collections.tasks,
        ...collections.risks,
        ...collections.decisions,
        ...repairTargets,
        ...collections.primary_nodes.filter((item) =>
            ['task', 'risk', 'decision', 'owner_action', 'handoff'].includes(
                firstText(item.node_type, item.type, item.metadata?.node_type).toLowerCase()
            )
        )
    ];
    const missingOwnerItems = ownerItems.filter((item) => !itemOwner(item));
    const placeholderWeightItems = [
        ...collections.relationship_edges,
        ...collections.view_lenses,
        ...collections.view_lenses.flatMap((lens) => asArray(lens.rows || lens.sankey_rows || lens.data_rows))
    ].filter(itemHasPlaceholderWeight);
    const issues = [
        ...uncitedItems.map((item) =>
            readinessIssue({
                code: evidenceRequired ? 'missing_required_citation' : 'uncited_package_item',
                label: evidenceRequired ? 'Missing required citation' : 'Uncited package item',
                severity: evidenceRequired ? 'blocked' : 'warning',
                item
            })
        ),
        ...repairTargets.map((item) =>
            readinessIssue({
                code: 'open_repair_target',
                label: 'Open repair target',
                severity: 'blocked',
                item
            })
        ),
        ...missingOwnerItems.map((item) =>
            readinessIssue({
                code: 'missing_owner',
                label: 'Missing owner',
                severity: 'blocked',
                item
            })
        ),
        ...placeholderWeightItems.map((item) =>
            readinessIssue({
                code: 'placeholder_weight',
                label: 'Placeholder weight',
                severity: 'blocked',
                item
            })
        )
    ];
    const blocked = issues.filter((issue) => issue.severity === 'blocked');
    const counts = issues.reduce(
        (next, issue) => ({
            ...next,
            [issue.code]: Number(next[issue.code] || 0) + 1
        }),
        {}
    );
    return {
        is_ready: blocked.length === 0,
        bulk_accept_blocked: blocked.length > 0,
        total_issues: issues.length,
        blocker_count: blocked.length,
        warning_count: issues.length - blocked.length,
        issues,
        counts
    };
};

const uniqueByJson = (items = []) => {
    const seen = new Set();
    return asArray(items).filter((item) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const withItemIdentity = (item = {}, fallbackId = '') => ({
    ...item,
    id: item.id || item.item_id || item.node_id || item.edge_id || fallbackId,
    item_id: item.item_id || item.id || item.node_id || item.edge_id || fallbackId,
    source_refs: asArray(item.source_refs),
    dependency_ids: asArray(item.dependency_ids || item.depends_on || item.dependencies),
    review_state: item.review_state || item.status || ''
});

const sourceRefsFromPackage = (packageData = {}) =>
    uniqueByJson([
        ...asArray(packageData.source_refs),
        ...asArray(packageData.primary_nodes).flatMap((item) => asArray(item.source_refs)),
        ...asArray(packageData.relationship_edges).flatMap((item) => asArray(item.source_refs)),
        ...asArray(packageData.view_lenses).flatMap((item) => asArray(item.source_refs)),
        ...asArray(packageData.structured_evidence).flatMap((item) => asArray(item.source_refs)),
        ...asArray(packageData.evidence_links).flatMap((item) => asArray(item.source_refs)),
        ...asArray(packageData.tasks).flatMap((item) => asArray(item.source_refs)),
        ...asArray(packageData.risks).flatMap((item) => asArray(item.source_refs)),
        ...asArray(packageData.decisions).flatMap((item) => asArray(item.source_refs)),
        ...asArray(packageData.repair_targets).flatMap((item) => asArray(item.source_refs)),
        ...asArray(packageData.acceptance_groups).flatMap((item) => asArray(item.source_refs))
    ]);

const packageEvidenceMeta = (artifact = {}) => {
    const provenance = objectOrEmpty(artifact.provenance);
    const metadata = objectOrEmpty(artifact.metadata);
    const evidenceMode = firstText(metadata.evidence_mode, provenance.evidence_mode);
    const citationPolicy = firstText(metadata.citation_policy, provenance.citation_policy);
    const modelProvider = firstText(provenance.model_provider, metadata.model_provider);
    return {
        evidence_mode: evidenceMode,
        citation_policy: citationPolicy,
        model_provider: modelProvider,
        web_evidence_requested:
            ['web_sources', 'current_sources', 'external_sources'].includes(evidenceMode) ||
            modelProvider.toLowerCase().includes('responses'),
        citation_required: citationPolicy === 'required'
    };
};

const normalizeCanonicalFields = (packageData = {}, artifact = {}) => {
    const primary_nodes = asArray(packageData.primary_nodes).map((node, index) =>
        withItemIdentity(
            {
                ...node,
                node_id: node.node_id || node.id || node.item_id || `node-${index}`,
                title: firstText(node.title, node.label, node.node_id, node.id, `Node ${index + 1}`),
                status: node.status || node.review_state || ''
            },
            `node-${index}`
        )
    );
    const relationship_edges = asArray(packageData.relationship_edges).map((edge, index) =>
        withItemIdentity(
            {
                ...edge,
                edge_id: edge.edge_id || edge.id || edge.item_id || `edge-${index}`,
                source_node_id: edge.source_node_id || edge.source || edge.from || '',
                target_node_id: edge.target_node_id || edge.target || edge.to || '',
                relationship_type: edge.relationship_type || edge.relationship || edge.type || '',
                status: edge.status || edge.review_state || ''
            },
            `edge-${index}`
        )
    );
    const structured_evidence = asArray(packageData.structured_evidence).map((item, index) =>
        withItemIdentity(
            {
                ...item,
                title: firstText(item.title, item.label, item.evidence_type, item.id, `Evidence ${index + 1}`),
                status: item.status || item.review_state || ''
            },
            `evidence-${index}`
        )
    );
    const evidence_links = asArray(packageData.evidence_links).map((item, index) =>
        withItemIdentity(item, `evidence-link-${index}`)
    );
    const tasks = asArray(packageData.tasks).map((item, index) => withItemIdentity(item, `task-${index}`));
    const risks = asArray(packageData.risks).map((item, index) => withItemIdentity(item, `risk-${index}`));
    const decisions = asArray(packageData.decisions).map((item, index) =>
        withItemIdentity(item, `decision-${index}`)
    );
    const repair_targets = asArray(packageData.repair_targets).map((target, index) =>
        withItemIdentity(
            {
                ...target,
                target_id: target.target_id || target.id || target.item_id || `repair-${index}`,
                target_item_id: target.target_item_id || target.target_id || target.item_id || target.id || '',
                target_type: target.target_type || target.type || '',
                status: target.status || target.review_state || ''
            },
            `repair-${index}`
        )
    );
    const acceptance_groups = asArray(packageData.acceptance_groups).map((group, index) =>
        withItemIdentity(
            {
                ...group,
                group_id: group.group_id || group.id || group.item_id || `group-${index}`,
                item_ids: asArray(group.item_ids || group.items),
                status: group.status || group.review_state || ''
            },
            `group-${index}`
        )
    );
    const view_lenses = asArray(packageData.view_lenses).map((lens, index) =>
        withItemIdentity(
            {
                ...lens,
                lens_id: lens.lens_id || lens.id || lens.item_id || `lens-${index}`,
                lens_type: lens.lens_type || lens.type || lens.title || ''
            },
            `lens-${index}`
        )
    );

    return {
        package_id: firstText(packageData.package_id, packageData.id, artifact.id, 'connected-package-preview'),
        title: firstText(artifact.title, packageData.title, packageData.package_id, 'Connected package'),
        summary: firstText(
            artifact.summary,
            packageData.summary,
            'Connected package generated from the draft contract.'
        ),
        status: firstText(artifact.status, packageData.status, packageData.review_state, 'preview_only'),
        primary_nodes,
        relationship_edges,
        view_lenses,
        structured_evidence,
        evidence_links,
        tasks,
        risks,
        decisions,
        repair_targets,
        acceptance_groups,
        source_refs: sourceRefsFromPackage(packageData),
        readiness: asArray(packageData.readiness).map((item, index) => withItemIdentity(item, `readiness-${index}`)),
        source_coverage: objectOrEmpty(packageData.source_coverage),
        review: asArray(packageData.review || packageData.review_notes || packageData.assumptions).map((item, index) =>
            typeof item === 'string'
                ? { id: `assumption-${index}`, item_id: `assumption-${index}`, label: item, tone: 'warning' }
                : withItemIdentity(item, `review-${index}`)
        )
    };
};

const strictPackageToPreview = (packageData = {}, artifact = {}) => {
    const canonical = normalizeCanonicalFields(packageData, artifact);
    const nodes = canonical.primary_nodes;
    const edges = canonical.relationship_edges;
    const evidence = canonical.structured_evidence;
    const repairs = canonical.repair_targets;
    const tasks = canonical.tasks;
    const sourceRefs = canonical.source_refs;
    const evidenceMeta = packageEvidenceMeta(artifact);
    const readinessGate = assessConnectedPackageReadiness({
        ...canonical,
        evidence_meta: evidenceMeta,
        metadata: {
            ...(packageData.metadata || {}),
            ...(artifact.metadata || {})
        }
    });
    const totalItems =
        nodes.length +
        edges.length +
        evidence.length +
        repairs.length +
        tasks.length +
        canonical.risks.length +
        canonical.decisions.length;
    const citedItems = [
        ...nodes,
        ...edges,
        ...evidence,
        ...repairs,
        ...tasks,
        ...canonical.risks,
        ...canonical.decisions
    ].filter((item) => asArray(item.source_refs).length > 0).length;
    const sourceCoverage = {
        total_items: totalItems,
        cited_items: citedItems,
        uncited_items: Math.max(0, totalItems - citedItems),
        required_repairs: repairs.length,
        sources: sourceRefs.length
            ? [
                  {
                      id: sourceRefs[0].document_id || sourceRefs[0].url || 'source',
                      title: sourceRefs[0].title || sourceRefs[0].document_title || sourceRefs[0].document_id || sourceRefs[0].url || 'Source',
                      coverage: totalItems ? citedItems / totalItems : 0,
                      cited_items: citedItems
                  }
              ]
            : []
    };

    return {
        ...canonical,
        graph: {
            nodes: nodes.map((node) => ({
                id: node.node_id || node.id,
                item_id: node.item_id,
                label: node.title || node.node_id || node.id,
                group: node.node_type || 'Package',
                readiness: node.review_state || node.status,
                source_refs: node.source_refs,
                dependency_ids: node.dependency_ids
            })),
            edges: edges.map((edge) => ({
                id: edge.edge_id || edge.id,
                item_id: edge.item_id,
                source: edge.source_node_id,
                target: edge.target_node_id,
                relationship: edge.relationship_type,
                confidence: edge.confidence || 0,
                status: edge.review_state,
                source_refs: edge.source_refs,
                dependency_ids: edge.dependency_ids
            }))
        },
        connections: edges.map((edge) => ({
            id: edge.edge_id || edge.id,
            item_id: edge.item_id,
            from: edge.source_node_id,
            to: edge.target_node_id,
            relationship: edge.relationship_type,
            confidence: edge.confidence || 0,
            review_state: edge.review_state,
            evidence_count: asArray(edge.source_refs).length,
            source_refs: edge.source_refs,
            dependency_ids: edge.dependency_ids
        })),
        flow: {
            lenses: canonical.view_lenses.length
                ? canonical.view_lenses.map((lens) => lens.title || humanize(lens.lens_type))
                : asArray(packageData.view_lenses).map((lens) => lens.title || humanize(lens.lens_type)),
            stages: nodes.map((node) => ({
                id: node.node_id || node.id,
                item_id: node.item_id,
                label: node.title,
                value: 1,
                status: node.review_state || node.status
            })),
            sankey_rows: edges.map((edge) => ({
                source: edge.source_node_id,
                target: edge.target_node_id,
                value: edge.value || 1
            }))
        },
        table: {
            columns: ['item', 'type', 'review state', 'sources'],
            rows: [
                ...nodes.map((node) => [
                    node.title,
                    node.node_type || 'node',
                    node.review_state || node.status || 'review',
                    asArray(node.source_refs).length
                ]),
                ...evidence.map((item) => [
                    item.title,
                    item.evidence_type || 'evidence',
                    item.review_state || 'review',
                    asArray(item.source_refs).length
                ])
            ]
        },
        charts: [
            { id: 'source-coverage', label: 'Source coverage', value: totalItems ? (citedItems / totalItems) * 100 : 0, tone: citedItems ? 'ready' : 'warning' },
            { id: 'repair-targets', label: 'Repair targets', value: repairs.length * 10, tone: repairs.length ? 'warning' : 'ready' }
        ],
        evidence: evidence.map((item) => ({
            id: item.id,
            item_id: item.item_id,
            title: item.title,
            source: asArray(item.source_refs)[0]?.title || asArray(item.source_refs)[0]?.document_title || asArray(item.source_refs)[0]?.document_id || 'No source yet',
            coverage: item.review_state || 'needs_review',
            status: item.review_state || item.status,
            source_refs: item.source_refs,
            dependency_ids: item.dependency_ids
        })),
        tasks: [
            ...tasks,
            ...canonical.risks.map((risk) => ({
                ...risk,
                status: risk.review_state || risk.status,
                owner: 'Reviewer'
            }))
        ],
        repair_targets: repairs.map((target) => ({
            ...target,
            id: target.target_id || target.id,
            item_id: target.item_id,
            label: target.issue || target.title || target.id,
            reason: target.repair_action || target.issue,
            owner: target.metadata?.owner || target.owner || 'Reviewer',
            priority: target.metadata?.priority || target.priority || 'review',
            target_type: target.target_type,
            review_state: target.review_state || target.status,
            source_refs: target.source_refs
        })),
        acceptance_groups: canonical.acceptance_groups.map((group) => ({
            ...group,
            id: group.group_id || group.id,
            label: group.title || group.label || group.id,
            summary: group.description || group.summary,
            status: group.review_state || group.status,
            item_count: asArray(group.item_ids).length || group.item_count || 0,
            accepted_count: group.accepted_count || 0,
            source_refs: group.source_refs
        })),
        readiness: canonical.readiness.length
            ? canonical.readiness
            : [
                  {
                      id: 'source-coverage',
                      label: 'Source coverage',
                      state: citedItems > 0 ? 'ready' : 'needs_review'
                  },
                  {
                      id: 'repair-targets',
                      label: 'Repair targets',
                      state: repairs.length ? 'needs_repair' : 'ready'
                  }
              ],
        source_coverage: Object.keys(canonical.source_coverage).length ? canonical.source_coverage : sourceCoverage,
        evidence_meta: evidenceMeta,
        readiness_gate: readinessGate,
        review: canonical.review
    };
};

const looksLikeStrictPackage = (value = {}) =>
    Boolean(
        value &&
            typeof value === 'object' &&
            (Array.isArray(value.primary_nodes) ||
                Array.isArray(value.relationship_edges) ||
                Array.isArray(value.structured_evidence) ||
                Array.isArray(value.evidence_links) ||
                Array.isArray(value.repair_targets))
    );

const normalizePreviewPackage = (candidate = {}) => {
    const canonical = normalizeCanonicalFields(candidate);
    const readinessGate = candidate.readiness_gate || assessConnectedPackageReadiness({
        ...canonical,
        source_coverage: objectOrEmpty(candidate.source_coverage || canonical.source_coverage),
        evidence_meta: objectOrEmpty(candidate.evidence_meta),
        metadata: objectOrEmpty(candidate.metadata)
    });
    return {
        ...mockConnectedPackagePreview,
        ...canonical,
        ...candidate,
        source_coverage: {
            ...mockConnectedPackagePreview.source_coverage,
            ...objectOrEmpty(candidate.source_coverage || canonical.source_coverage)
        },
        readiness_gate: readinessGate,
        source: 'backend_or_session'
    };
};

const connectedPackageFromArtifact = (artifact = {}) => {
    const data = objectOrEmpty(artifact.data);
    const packageData = data.connected_package || data.package || data.package_preview || data;
    return looksLikeStrictPackage(packageData) ? strictPackageToPreview(packageData, artifact) : null;
};

export const normalizePackage = ({ packagePreview, session = {}, revision = {} } = {}) => {
    const metadata = {
        ...(session.metadata || {}),
        ...(revision.metadata || {})
    };
    const connectedArtifact = asArray(revision.generated_artifacts).find(
        (artifact) => artifact?.artifact_type === 'connected_picture_package'
    );
    const artifactPackage = connectedArtifact ? connectedPackageFromArtifact(connectedArtifact) : null;
    const rawCandidate =
        packagePreview ||
        revision.connected_package_preview ||
        revision.connected_package ||
        revision.package_preview ||
        metadata.connected_package_preview ||
        metadata.connected_package ||
        metadata.package_preview ||
        artifactPackage ||
        null;
    const candidate =
        rawCandidate === artifactPackage
            ? rawCandidate
            : looksLikeStrictPackage(rawCandidate)
              ? strictPackageToPreview(rawCandidate)
              : rawCandidate;

    if (candidate && typeof candidate === 'object') {
        return normalizePreviewPackage(candidate);
    }

    const draftNodes = asArray(revision.draft_nodes);
    const draftItems = asArray(revision.draft_items);
    const draftEdges = asArray(revision.draft_edges);
    const sourceRefs = [
        ...draftNodes.flatMap((node) => asArray(node.source_refs)),
        ...draftItems.flatMap((item) => asArray(item.source_refs))
    ];
    const uncitedCount = [...draftNodes, ...draftItems].filter((item) => asArray(item.source_refs).length === 0).length;
    const citedCount = Math.max(draftNodes.length + draftItems.length - uncitedCount, sourceRefs.length ? 1 : 0);
    const packageTitle = firstText(
        metadata.connected_package_title,
        metadata.package_title,
        revision.title,
        revision.prompt,
        mockConnectedPackagePreview.title
    );

    return {
        ...mockConnectedPackagePreview,
        title: packageTitle,
        summary:
            draftNodes.length || draftItems.length || draftEdges.length
                ? 'Preview-only connected package assembled from the current draft revision and local mock package artifacts.'
                : mockConnectedPackagePreview.summary,
        source: 'mock',
        source_coverage: {
            ...mockConnectedPackagePreview.source_coverage,
            total_items: Math.max(draftNodes.length + draftItems.length, mockConnectedPackagePreview.source_coverage.total_items),
            cited_items: Math.max(citedCount, mockConnectedPackagePreview.source_coverage.cited_items),
            uncited_items: Math.max(uncitedCount, mockConnectedPackagePreview.source_coverage.uncited_items),
            required_repairs: Math.max(uncitedCount, mockConnectedPackagePreview.source_coverage.required_repairs)
        }
    };
};
