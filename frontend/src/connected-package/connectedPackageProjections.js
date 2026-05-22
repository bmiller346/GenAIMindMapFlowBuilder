const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const objectOrEmpty = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const firstText = (...values) =>
    values.find((value) => typeof value === 'string' && value.trim()) || '';

const normalizeSignal = (value = '') =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

const PROCESS_NODE_TYPES = new Set([
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

const PROCESS_RELATIONSHIPS = new Set([
    'depends_on',
    'dependency',
    'requires',
    'blocked_by',
    'blocks',
    'prerequisite',
    'sequence',
    'next',
    'then',
    'handoff',
    'leads_to',
    'contains'
]);

const TASK_STATUSES = [
    { id: 'backlog', statuses: ['needs_review', 'ai_generated', 'draft', 'todo', 'backlog'] },
    { id: 'in_progress', statuses: ['in_progress', 'reviewed'] },
    { id: 'blocked', statuses: ['blocked', 'needs_repair'] },
    { id: 'done', statuses: ['approved', 'accepted', 'done', 'complete', 'source_backed'] },
    { id: 'archived', statuses: ['rejected', 'deprecated', 'archived'] }
];

const FLOW_LENS_TYPES = new Set([
    'flow',
    'flowchart',
    'flow_chart',
    'dependency_flow',
    'process_flow',
    'workflow',
    'stages',
    'handoffs'
]);

const collectionKeys = [
    'primary_nodes',
    'relationship_edges',
    'view_lenses',
    'structured_evidence',
    'evidence_links',
    'tasks',
    'repair_targets',
    'acceptance_groups'
];

const payloadFor = (candidate = {}) => {
    if (!candidate || typeof candidate !== 'object') {
        return {};
    }
    const artifact = objectOrEmpty(candidate.artifact);
    const artifactData = objectOrEmpty(artifact.data);
    const candidateData = objectOrEmpty(candidate.data);
    const directData = objectOrEmpty(candidate);

    if (collectionKeys.some((key) => asArray(candidateData[key]).length)) {
        return candidateData;
    }
    if (collectionKeys.some((key) => asArray(artifactData[key]).length)) {
        return artifactData;
    }
    return directData;
};

export const hasConnectedPackageProjectionData = (candidate = {}) => {
    const payload = payloadFor(candidate);
    return collectionKeys.some((key) => asArray(payload[key]).length) || Boolean(payload.package_id);
};

export const getProjectionConnectedPackage = ({
    connectedPackage,
    packageCandidate,
    primaryConnectedPackage,
    getPrimaryConnectedPackage,
    ...context
} = {}) => {
    const direct = connectedPackage || packageCandidate || primaryConnectedPackage;
    if (hasConnectedPackageProjectionData(direct)) {
        return direct;
    }
    if (typeof getPrimaryConnectedPackage === 'function') {
        const selected = getPrimaryConnectedPackage(context);
        return hasConnectedPackageProjectionData(selected) ? selected : null;
    }
    return null;
};

const packageDataFor = (candidate = {}) => payloadFor(candidate);

const sourceRefKey = (ref = {}) =>
    JSON.stringify([
        ref.document_id,
        ref.source_id,
        ref.file_id,
        ref.url,
        ref.page,
        ref.section,
        ref.quote_snippet
    ]);

const uniqueSourceRefs = (refs = []) => {
    const seen = new Set();
    return refs.filter((ref) => {
        const key = sourceRefKey(ref);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const hasSourceRefs = (item = {}) => asArray(item.source_refs).length > 0;

const needsReviewFor = (item = {}) => {
    const signal = normalizeSignal(firstText(item.review_state, item.status, item.citation_status, item.evidence_status));
    return (
        !hasSourceRefs(item) ||
        ['needs_review', 'unsupported', 'uncited', 'needs_source', 'missing_source', 'needs_repair', 'draft'].includes(signal)
    );
};

const packageItem = (item = {}, fallbackId = '', type = '') => {
    const id =
        item.item_id ||
        item.id ||
        item.node_id ||
        item.edge_id ||
        item.lens_id ||
        item.target_id ||
        item.group_id ||
        fallbackId;
    const source_refs = uniqueSourceRefs(asArray(item.source_refs));
    const review_state = needsReviewFor({ ...item, source_refs })
        ? 'needs_review'
        : firstText(item.review_state, item.status, item.citation_status, item.evidence_status, 'source_backed');

    return {
        ...item,
        id,
        item_id: item.item_id || id,
        package_item_type: type,
        source_refs,
        review_state,
        needs_review: review_state === 'needs_review'
    };
};

const packageNodes = (packageData = {}) =>
    asArray(packageData.primary_nodes).map((node, index) => {
        const item = packageItem(node, `node-${index}`, 'primary_node');
        return {
            ...item,
            id: item.node_id || item.id,
            item_id: item.item_id,
            node_id: item.node_id || item.id,
            title: firstText(item.title, item.label, item.node_id, item.id, `Node ${index + 1}`),
            node_type: firstText(item.node_type, item.type, 'concept'),
            source_ref: item.source_refs[0] || {},
            locally_projected: false,
            projection_source: 'connected_package.primary_nodes'
        };
    });

const packageEdges = (packageData = {}, nodeLookup = new Map()) =>
    asArray(packageData.relationship_edges).map((edge, index) => {
        const item = packageItem(edge, `edge-${index}`, 'relationship_edge');
        const source = firstText(item.source_node_id, item.source, item.from);
        const target = firstText(item.target_node_id, item.target, item.to);
        return {
            ...item,
            id: item.edge_id || item.id,
            item_id: item.item_id,
            edge_id: item.edge_id || item.id,
            source,
            target,
            source_node_id: source,
            target_node_id: target,
            source_title: nodeLookup.get(source)?.title || source,
            target_title: nodeLookup.get(target)?.title || target,
            relationship_type: firstText(item.relationship_type, item.relationship, item.type),
            label: firstText(item.label, item.relationship_type, item.relationship, item.type, 'related'),
            locally_projected: false,
            projection_source: 'connected_package.relationship_edges'
        };
    });

const graphProjection = (projection_type, nodes, edges, extra = {}) => ({
    projection_type,
    eligible: nodes.length > 0 || edges.length > 0,
    node_count: nodes.length,
    edge_count: edges.length,
    needs_review_count: [...nodes, ...edges].filter((item) => item.needs_review).length,
    nodes,
    edges,
    ...extra
});

export const getPackageOverviewProjection = (candidate = {}) => {
    const packageData = packageDataFor(candidate);
    const nodeRows = asArray(packageData.primary_nodes);
    const edgeRows = asArray(packageData.relationship_edges);
    const evidenceRows = asArray(packageData.structured_evidence);
    const taskRows = asArray(packageData.tasks);
    const repairRows = asArray(packageData.repair_targets);
    const acceptanceRows = asArray(packageData.acceptance_groups);
    const strictRows = [
        ...nodeRows,
        ...edgeRows,
        ...evidenceRows,
        ...taskRows,
        ...repairRows,
        ...acceptanceRows
    ].map((item, index) => packageItem(item, `overview-${index}`, 'overview'));
    const citedItems = strictRows.filter((item) => item.source_refs.length > 0).length;

    return {
        package_id: firstText(packageData.package_id, candidate.package_id, candidate.id),
        title: firstText(packageData.title, candidate.title, 'Connected package'),
        status: firstText(packageData.review_state, packageData.status, candidate.status, 'needs_review'),
        item_count: strictRows.length,
        cited_item_count: citedItems,
        needs_review_count: strictRows.filter((item) => item.needs_review).length,
        unsupported_item_ids: strictRows.filter((item) => item.needs_review).map((item) => item.item_id),
        collection_counts: {
            primary_nodes: nodeRows.length,
            relationship_edges: edgeRows.length,
            view_lenses: asArray(packageData.view_lenses).length,
            structured_evidence: evidenceRows.length,
            evidence_links: asArray(packageData.evidence_links).length,
            tasks: taskRows.length,
            repair_targets: repairRows.length,
            acceptance_groups: acceptanceRows.length
        },
        source_refs: uniqueSourceRefs(strictRows.flatMap((item) => item.source_refs)),
        acceptance_groups: acceptanceRows.map((group, index) =>
            packageItem(group, `acceptance-${index}`, 'acceptance_group')
        )
    };
};

export const getPackageGraphProjection = (candidate = {}, { projectionType = 'package_graph' } = {}) => {
    const packageData = packageDataFor(candidate);
    const nodes = packageNodes(packageData);
    const nodeLookup = new Map(nodes.map((node) => [node.node_id || node.id, node]));
    return graphProjection(projectionType, nodes, packageEdges(packageData, nodeLookup));
};

export const getPackageConceptMapProjection = (candidate = {}) =>
    getPackageGraphProjection(candidate, { projectionType: 'concept_graph' });

export const getPackageRelationshipProjection = (candidate = {}) =>
    getPackageGraphProjection(candidate, { projectionType: 'relationship_graph' });

export const getPackageConnectionRows = (candidate = {}) => {
    const graph = getPackageGraphProjection(candidate);
    const nodeLookup = new Map(graph.nodes.map((node) => [node.node_id || node.id, node]));
    return graph.edges.map((edge) => ({
        ...edge,
        source: nodeLookup.get(edge.source) || { id: edge.source, title: edge.source },
        target: nodeLookup.get(edge.target) || { id: edge.target, title: edge.target },
        relationship: edge.label,
        connection_kind: edge.relationship_type === 'contains' ? 'Hierarchy' : 'Cross-link',
        raw_edge: edge
    }));
};

export const getPackageProcessProjection = (candidate = {}) => {
    const graph = getPackageGraphProjection(candidate, { projectionType: 'process_graph' });
    const processNodeIds = new Set(
        graph.nodes
            .filter((node) => PROCESS_NODE_TYPES.has(normalizeSignal(node.node_type)))
            .map((node) => node.id)
    );
    const edges = graph.edges.filter((edge) =>
        PROCESS_RELATIONSHIPS.has(normalizeSignal(edge.relationship_type))
    );
    edges.forEach((edge) => {
        processNodeIds.add(edge.source);
        processNodeIds.add(edge.target);
    });
    const nodes = graph.nodes.filter((node) => processNodeIds.has(node.id));
    return graphProjection('process_graph', nodes, edges);
};

export const getPackageFlowchartProjection = (candidate = {}) => {
    const lensProjection = getPackageFlowchartLensProjection(candidate);
    if (lensProjection.steps.length || lensProjection.connectors.length) {
        return lensProjection;
    }
    const process = getPackageProcessProjection(candidate);
    const stepLookup = new Map(process.nodes.map((node, index) => [
        node.id,
        {
            ...node,
            order: index + 1,
            flow_kind: normalizeSignal(node.node_type) === 'decision' ? 'decision' : 'step',
            source_backed: node.source_refs.length > 0
        }
    ]));
    const connectors = process.edges.map((edge) => ({
        id: edge.id,
        item_id: edge.item_id,
        source: edge.source,
        target: edge.target,
        source_title: stepLookup.get(edge.source)?.title || edge.source,
        target_title: stepLookup.get(edge.target)?.title || edge.target,
        relationship_type: edge.relationship_type,
        label: edge.label,
        source_refs: edge.source_refs,
        review_state: edge.review_state,
        needs_review: edge.needs_review
    }));
    const steps = [...stepLookup.values()].map((step) => ({
        ...step,
        incoming_count: connectors.filter((connector) => connector.target === step.id).length,
        outgoing_count: connectors.filter((connector) => connector.source === step.id).length,
        shape: step.flow_kind === 'decision' ? 'decision' : 'process'
    }));
    return {
        steps,
        connectors,
        decisions: steps.filter((step) => step.flow_kind === 'decision'),
        blockers: steps.filter((step) => normalizeSignal(step.node_type) === 'dependency'),
        metadata: {
            step_count: steps.length,
            connector_count: connectors.length,
            source_backed_count: steps.filter((step) => step.source_backed).length
        }
    };
};

export const getPackageFlowchartLensProjection = (candidate = {}) => {
    const packageData = packageDataFor(candidate);
    const flowLens = asArray(packageData.view_lenses).find((item) =>
        FLOW_LENS_TYPES.has(
            normalizeSignal(firstText(item.lens_type, item.type, item.chart_type, item.title))
        )
    );
    if (!flowLens) {
        return {
            steps: [],
            connectors: [],
            decisions: [],
            blockers: [],
            metadata: {
                step_count: 0,
                connector_count: 0,
                decision_count: 0,
                source_backed_count: 0,
                lens_source: ''
            }
        };
    }

    const lensItem = packageItem(flowLens, 'flowchart-lens', 'view_lens');
    const lensStepRows =
        asArray(lensItem.steps).length
            ? asArray(lensItem.steps)
            : asArray(lensItem.nodes).length
              ? asArray(lensItem.nodes)
              : asArray(lensItem.stages);
    const lensConnectorRows =
        asArray(lensItem.connectors).length
            ? asArray(lensItem.connectors)
            : asArray(lensItem.edges).length
              ? asArray(lensItem.edges)
              : asArray(lensItem.relationships);
    const packageGraph = getPackageGraphProjection(candidate, { projectionType: 'flow_lens_graph' });
    const primaryNodeLookup = new Map(packageGraph.nodes.map((node) => [node.id, node]));
    const packageEdgeLookup = new Map(packageGraph.edges.map((edge) => [edge.id, edge]));
    const referencedEdgeIds = new Set(asArray(lensItem.edge_ids || lensItem.relationship_edge_ids));
    const referencedNodeIds = new Set(asArray(lensItem.node_ids || lensItem.step_ids));

    const stepRows = lensStepRows.length
        ? lensStepRows
        : referencedNodeIds.size
          ? packageGraph.nodes.filter((node) => referencedNodeIds.has(node.id) || referencedNodeIds.has(node.item_id))
          : packageGraph.nodes;
    const steps = stepRows.map((row, index) => {
        const item = packageItem(
            {
                ...primaryNodeLookup.get(firstText(row.node_id, row.id, row.item_id)),
                ...row,
                source_refs: asArray(row.source_refs).length ? row.source_refs : lensItem.source_refs
            },
            `${lensItem.item_id}:step-${index}`,
            'view_lens_step'
        );
        const id = firstText(item.node_id, item.step_id, item.id, item.item_id);
        const flowKind = normalizeSignal(firstText(item.flow_kind, item.node_type, item.type, item.kind));
        return {
            ...item,
            id,
            item_id: item.item_id,
            node_id: firstText(item.node_id, id),
            order: Number(item.order) || index + 1,
            title: firstText(item.title, item.label, item.name, id, `Step ${index + 1}`),
            node_type: firstText(item.node_type, item.type, item.kind, 'process'),
            flow_kind: flowKind === 'decision' ? 'decision' : flowKind || 'step',
            source_backed: item.source_refs.length > 0,
            needs_review: item.needs_review,
            review_state: item.review_state,
            shape: flowKind === 'decision' ? 'decision' : 'process',
            projection_source: 'connected_package.view_lenses'
        };
    });
    const stepLookup = new Map(steps.map((step) => [step.id, step]));
    const explicitConnectors = lensConnectorRows.map((row, index) => {
        const item = packageItem(
            {
                ...packageEdgeLookup.get(firstText(row.edge_id, row.id, row.item_id)),
                ...row,
                source_refs: asArray(row.source_refs).length ? row.source_refs : lensItem.source_refs
            },
            `${lensItem.item_id}:connector-${index}`,
            'view_lens_connector'
        );
        return {
            ...item,
            id: firstText(item.edge_id, item.id, item.item_id, `${lensItem.item_id}:connector-${index}`),
            source: firstText(item.source_node_id, item.source, item.from),
            target: firstText(item.target_node_id, item.target, item.to),
            relationship_type: firstText(item.relationship_type, item.relationship, item.type, 'next'),
            label: firstText(item.label, item.relationship_type, item.relationship, item.type, 'Next'),
            branch_kind: normalizeSignal(firstText(item.branch_kind, item.branch, item.condition)),
            condition: firstText(item.condition, item.metadata?.condition),
            exception_path:
                normalizeSignal(firstText(item.relationship_type, item.type)) === 'exception' ||
                item.exception_path === true
        };
    });
    const packageConnectors = packageGraph.edges
        .filter((edge) => {
            if (referencedEdgeIds.size) {
                return referencedEdgeIds.has(edge.id) || referencedEdgeIds.has(edge.item_id);
            }
            return stepLookup.has(edge.source) && stepLookup.has(edge.target);
        })
        .map((edge) => ({
            ...edge,
            source: edge.source,
            target: edge.target,
            relationship_type: edge.relationship_type || 'next',
            label: edge.label || edge.relationship_type || 'Next'
        }));
    const seenConnectorIds = new Set();
    const connectors = [...explicitConnectors, ...packageConnectors]
        .filter((connector) => connector.source && connector.target)
        .filter((connector) => {
            const key = connector.id || `${connector.source}:${connector.target}:${connector.label}`;
            if (seenConnectorIds.has(key)) return false;
            seenConnectorIds.add(key);
            return true;
        })
        .map((connector, index) => {
            const sourceStep = stepLookup.get(connector.source);
            const targetStep = stepLookup.get(connector.target);
            return {
                ...connector,
                id: connector.id || `${connector.source}-${connector.target}-${index}`,
                source_title: sourceStep?.title || connector.source_title || connector.source,
                target_title: targetStep?.title || connector.target_title || connector.target,
                source_flow_kind: sourceStep?.flow_kind || '',
                target_flow_kind: targetStep?.flow_kind || '',
                branch_kind: connector.branch_kind || (sourceStep?.flow_kind === 'decision' ? 'yes' : 'default'),
                projection_source: 'connected_package.view_lenses'
            };
        });
    const stepsWithCounts = steps.map((step) => {
        const incoming = connectors.filter((connector) => connector.target === step.id);
        const outgoing = connectors.filter((connector) => connector.source === step.id);
        return {
            ...step,
            incoming_count: incoming.length,
            outgoing_count: outgoing.length,
            shape: step.flow_kind === 'decision' ? 'decision' : !incoming.length || !outgoing.length ? 'terminator' : step.shape
        };
    });

    return {
        steps: stepsWithCounts,
        connectors,
        decisions: stepsWithCounts.filter((step) => step.flow_kind === 'decision'),
        blockers: stepsWithCounts.filter((step) => normalizeSignal(step.node_type) === 'dependency'),
        metadata: {
            step_count: stepsWithCounts.length,
            connector_count: connectors.length,
            decision_count: stepsWithCounts.filter((step) => step.flow_kind === 'decision').length,
            source_backed_count: stepsWithCounts.filter((step) => step.source_backed).length,
            lens_source: lensItem.item_id
        }
    };
};

export const getPackageTableRows = (candidate = {}) => {
    const packageData = packageDataFor(candidate);
    const rows = [
        ...asArray(packageData.primary_nodes).map((item, index) =>
            packageItem(item, `node-${index}`, 'primary_node')
        ),
        ...asArray(packageData.relationship_edges).map((item, index) =>
            packageItem(item, `edge-${index}`, 'relationship_edge')
        ),
        ...asArray(packageData.structured_evidence).map((item, index) =>
            packageItem(item, `evidence-${index}`, 'structured_evidence')
        ),
        ...asArray(packageData.view_lenses).map((item, index) =>
            packageItem(item, `lens-${index}`, 'view_lens')
        ),
        ...asArray(packageData.tasks).map((item, index) => packageItem(item, `task-${index}`, 'task')),
        ...asArray(packageData.repair_targets).map((item, index) =>
            packageItem(item, `repair-${index}`, 'repair_target')
        ),
        ...asArray(packageData.acceptance_groups).map((item, index) =>
            packageItem(item, `acceptance-${index}`, 'acceptance_group')
        )
    ];

    return rows.map((row) => ({
        ...row,
        title: firstText(row.title, row.label, row.issue, row.relationship_type, row.target_item_id, row.item_id),
        source_ref_count: row.source_refs.length
    }));
};

const lensRowsFor = (lens = {}) =>
    asArray(lens.rows).length
        ? asArray(lens.rows)
        : asArray(lens.data_rows).length
          ? asArray(lens.data_rows)
          : asArray(lens.sankey_rows);

const numericValue = (value, fallback = 1) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export const getPackageSankeyLensProjection = (candidate = {}) => {
    const packageData = packageDataFor(candidate);
    const lens = asArray(packageData.view_lenses).find((item) =>
        ['sankey', 'flow', 'chart_flow', 'flow_chart'].includes(
            normalizeSignal(firstText(item.lens_type, item.type, item.chart_type, item.title))
        )
    );

    if (!lens) {
        return {
            eligible: false,
            lens_count: asArray(packageData.view_lenses).length,
            node_count: 0,
            path_count: 0,
            value_total: 0,
            metric_labels: [],
            nodes: [],
            rows: []
        };
    }

    const lensItem = packageItem(lens, 'sankey-lens', 'view_lens');
    const rows = lensRowsFor(lensItem).map((row, index) => {
        const item = packageItem(
            {
                ...row,
                source_refs: asArray(row.source_refs).length ? row.source_refs : lensItem.source_refs
            },
            `${lensItem.item_id}:row-${index}`,
            'view_lens_row'
        );
        return {
            ...item,
            id: item.id,
            evidence_item_id: firstText(item.evidence_item_id, item.item_id),
            evidence_node_id: lensItem.lens_id || lensItem.id,
            evidence_title: firstText(lensItem.title, 'Sankey flow lens'),
            lens_id: lensItem.lens_id || lensItem.id,
            lens_item_id: lensItem.item_id,
            source: firstText(item.source, item.from, item.source_label),
            target: firstText(item.target, item.to, item.target_label),
            value: numericValue(item.value, 1),
            metric_label: firstText(item.metric_label, lensItem.metric_label, lensItem.value_label),
            source_column: firstText(lensItem.source_column, lensItem.sourceColumn, 'source'),
            target_column: firstText(lensItem.target_column, lensItem.targetColumn, 'target'),
            value_column: firstText(lensItem.value_column, lensItem.valueColumn, 'value'),
            represented_row_indexes: [index],
            represented_rows: [row],
            review_state: item.review_state,
            evidence_status: item.source_refs.length ? 'source_backed' : 'needs_source',
            citation_status: item.source_refs.length ? 'source_backed' : 'needs_source',
            table_name: firstText(lensItem.table_name, lensItem.metadata?.table_name),
            query_id: firstText(lensItem.query_id, lensItem.metadata?.query_id),
            result_hash: firstText(lensItem.result_hash, lensItem.metadata?.result_hash),
            evidence_repair_prompt: firstText(item.evidence_repair_prompt, item.source_repair_prompt),
            source_repair_prompt: firstText(item.source_repair_prompt, item.evidence_repair_prompt),
            citation_query: firstText(item.citation_query, lensItem.citation_query)
        };
    });

    return {
        eligible: rows.length > 0,
        lens_count: 1,
        node_count: 1,
        path_count: rows.length,
        value_total: rows.reduce((total, row) => total + row.value, 0),
        metric_labels: Array.from(new Set(rows.map((row) => row.metric_label))).filter(Boolean),
        nodes: [
            {
                ...lensItem,
                id: lensItem.lens_id || lensItem.id,
                title: firstText(lensItem.title, 'Sankey flow lens'),
                path_count: rows.length,
                source_backed: lensItem.source_refs.length > 0,
                review_state: lensItem.review_state
            }
        ],
        rows
    };
};

export const getPackageEvidenceReviewRows = (candidate = {}) => {
    const packageData = packageDataFor(candidate);
    const evidenceLinks = asArray(packageData.evidence_links).map((link, index) =>
        packageItem(link, `evidence-link-${index}`, 'evidence_link')
    );
    return [
        ...asArray(packageData.structured_evidence).map((item, index) =>
            packageItem(item, `evidence-${index}`, 'structured_evidence')
        ),
        ...evidenceLinks
    ].map((row) => ({
        ...row,
        title: firstText(row.title, row.label, row.evidence_type, row.item_id),
        target_item_id: row.target_item_id || row.target_id || '',
        source_item_id: row.source_item_id || row.source_id || '',
        citation_status: row.source_refs.length ? 'source_backed' : 'needs_source'
    }));
};

export const getPackageTaskRows = (candidate = {}) =>
    asArray(packageDataFor(candidate).tasks).map((task, index) => {
        const row = packageItem(task, `task-${index}`, 'task');
        return {
            ...row,
            title: firstText(row.title, row.label, row.task, row.item_id),
            status: firstText(row.review_state, row.status, 'needs_review'),
            priority: firstText(row.priority, row.metadata?.priority, 'medium'),
            owner_id: firstText(row.owner_id, row.owner, row.assignee),
            due_date: firstText(row.due_date, row.deadline)
        };
    });

export const getPackageKanbanColumns = (candidate = {}) => {
    const tasks = getPackageTaskRows(candidate);
    return TASK_STATUSES.map((column) => ({
        id: column.id,
        items: tasks.filter((task) => column.statuses.includes(normalizeSignal(task.status || task.review_state)))
    }));
};

export const getPackageRepairTargets = (candidate = {}) =>
    asArray(packageDataFor(candidate).repair_targets).map((target, index) => {
        const row = packageItem(target, `repair-${index}`, 'repair_target');
        return {
            ...row,
            id: row.target_id || row.id,
            target_id: row.target_id || row.id,
            target_item_id: row.target_item_id || row.item_id,
            target_type: firstText(row.target_type, row.type),
            title: firstText(row.title, row.issue, row.repair_action, row.target_item_id),
            reason: firstText(row.reason, row.issue, row.repair_action),
            repair_action: firstText(row.repair_action, row.action, row.reason)
        };
    });

export const getConnectedPackageProjectionBundle = (candidate = {}) => ({
    overview: getPackageOverviewProjection(candidate),
    graph: getPackageGraphProjection(candidate),
    concept_map: getPackageConceptMapProjection(candidate),
    relationships: getPackageRelationshipProjection(candidate),
    connections: getPackageConnectionRows(candidate),
    process: getPackageProcessProjection(candidate),
    flowchart: getPackageFlowchartProjection(candidate),
    table_rows: getPackageTableRows(candidate),
    sankey: getPackageSankeyLensProjection(candidate),
    evidence_review: getPackageEvidenceReviewRows(candidate),
    task_rows: getPackageTaskRows(candidate),
    kanban: getPackageKanbanColumns(candidate),
    repair_targets: getPackageRepairTargets(candidate)
});

export const withPackageProjectionFallback = ({
    packageCandidate,
    packageProjector,
    fallbackProjector,
    fallbackArgs = []
} = {}) => {
    if (hasConnectedPackageProjectionData(packageCandidate) && typeof packageProjector === 'function') {
        return packageProjector(packageCandidate);
    }
    return typeof fallbackProjector === 'function' ? fallbackProjector(...fallbackArgs) : undefined;
};
