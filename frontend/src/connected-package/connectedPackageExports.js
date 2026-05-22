import {
    getConnectedPackageProjectionBundle,
    getPackageEvidenceReviewRows,
    getPackageFlowchartProjection,
    getPackageGraphProjection,
    getPackageOverviewProjection,
    getPackageTaskRows
} from './connectedPackageProjections.js';

const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const firstText = (...values) =>
    values.find((value) => typeof value === 'string' && value.trim()) || '';

const objectOrEmpty = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const packageDataFor = (candidate = {}) => {
    const artifact = objectOrEmpty(candidate.artifact);
    const data = objectOrEmpty(candidate.data);
    const artifactData = objectOrEmpty(artifact.data);
    if (data.package_id || asArray(data.primary_nodes).length || asArray(data.acceptance_groups).length) {
        return data;
    }
    if (
        artifactData.package_id ||
        asArray(artifactData.primary_nodes).length ||
        asArray(artifactData.acceptance_groups).length
    ) {
        return artifactData;
    }
    return objectOrEmpty(candidate);
};

const csvValue = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const mermaidId = (value = '') => {
    const normalized = String(value || 'item')
        .replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '');
    return /^[A-Za-z]/.test(normalized) ? normalized : `item_${normalized || 'node'}`;
};

const mermaidLabel = (value = '') => String(value || 'Untitled').replace(/["\r\n]/g, ' ').trim();

const sourceRefFields = (refs = []) => {
    const ref = asArray(refs)[0] || {};
    return {
        source_document: firstText(ref.document_id, ref.document_title, ref.source_id, ref.url),
        source_page: ref.page ?? '',
        source_section: firstText(ref.section),
        source_quote: firstText(ref.quote_snippet, ref.quote)
    };
};

export const getConnectedPackageJsonExport = (candidate = {}, { workspace = {} } = {}) => {
    const packageData = packageDataFor(candidate);
    const overview = getPackageOverviewProjection(candidate);
    const projections = getConnectedPackageProjectionBundle(candidate);
    return {
        export_type: 'connected_picture_package',
        export_version: '1',
        package_id: overview.package_id,
        title: overview.title,
        status: overview.status,
        workspace: {
            id: firstText(workspace.id, packageData.workspace_id),
            title: firstText(workspace.title, packageData.workspace_title)
        },
        overview,
        package: packageData,
        projections,
        source_refs: overview.source_refs,
        provenance: objectOrEmpty(candidate.provenance),
        metadata: {
            source: 'accepted_connected_picture_package',
            generated_from: 'connected_package_export_bundle',
            deferred_backend_fields: []
        }
    };
};

export const getConnectedPackageMarkdownExport = (candidate = {}, options = {}) => {
    const jsonExport = getConnectedPackageJsonExport(candidate, options);
    const overview = jsonExport.overview;
    const graph = getPackageGraphProjection(candidate);
    const evidenceRows = getPackageEvidenceReviewRows(candidate);
    const tasks = getPackageTaskRows(candidate);
    const lines = [
        `# ${overview.title || 'Connected package'}`,
        '',
        `Package ID: ${overview.package_id || ''}`,
        `Status: ${overview.status || ''}`,
        `Source coverage: ${overview.cited_item_count}/${overview.item_count} cited items`,
        `Needs review: ${overview.needs_review_count}`,
        '',
        '## Primary Nodes',
        ''
    ];

    if (graph.nodes.length) {
        graph.nodes.forEach((node) => {
            lines.push(`- **${node.title}** (${node.node_type || 'node'}) - ${node.review_state || node.status}`);
        });
    } else {
        lines.push('_No primary nodes._');
    }

    lines.push('', '## Relationships', '');
    if (graph.edges.length) {
        graph.edges.forEach((edge) => {
            lines.push(
                `- **${edge.source_title || edge.source}** -> **${edge.target_title || edge.target}**: ${
                    edge.label || edge.relationship_type || 'related'
                }`
            );
        });
    } else {
        lines.push('_No relationship edges._');
    }

    lines.push('', '## Evidence Rows', '');
    if (evidenceRows.length) {
        evidenceRows.forEach((row) => {
            const source = sourceRefFields(row.source_refs);
            lines.push(
                `- **${row.title || row.item_id}** - ${row.citation_status || row.review_state || 'review'}${
                    source.source_document ? ` (${source.source_document})` : ''
                }`
            );
            if (source.source_quote) {
                lines.push(`  ${source.source_quote}`);
            }
        });
    } else {
        lines.push('_No evidence rows._');
    }

    lines.push('', '## Handoff Tasks', '');
    if (tasks.length) {
        tasks.forEach((task) => {
            lines.push(
                `- **${task.title}** - ${task.status || task.review_state || 'review'}${
                    task.owner_id ? `, owner: ${task.owner_id}` : ''
                }${task.due_date ? `, due: ${task.due_date}` : ''}`
            );
        });
    } else {
        lines.push('_No task rows._');
    }

    return `${lines.join('\n')}\n`;
};

export const getConnectedPackageEvidenceCsvRows = (candidate = {}) => {
    const overview = getPackageOverviewProjection(candidate);
    return getPackageEvidenceReviewRows(candidate).map((row) => {
        const source = sourceRefFields(row.source_refs);
        return {
            'Package ID': overview.package_id,
            'Item ID': row.item_id || row.id,
            'Item Type': row.package_item_type || '',
            Title: row.title || '',
            'Review State': row.citation_status || row.review_state || '',
            'Needs Review': row.needs_review ? 'true' : 'false',
            'Target Item ID': row.target_item_id || '',
            'Source Item ID': row.source_item_id || '',
            'Source Document': source.source_document,
            'Source Page': source.source_page,
            'Source Section': source.source_section,
            'Source Quote': source.source_quote
        };
    });
};

export const getConnectedPackageEvidenceCsvExport = (candidate = {}) => {
    const rows = getConnectedPackageEvidenceCsvRows(candidate);
    if (!rows.length) {
        return '';
    }
    const columns = Object.keys(rows[0]);
    return `${columns.map(csvValue).join(',')}\r\n${rows
        .map((row) => columns.map((column) => csvValue(row[column])).join(','))
        .join('\r\n')}\r\n`;
};

export const getConnectedPackageMermaidExport = (candidate = {}) => {
    const flowchart = getPackageFlowchartProjection(candidate);
    const lines = ['flowchart TD'];
    const steps = flowchart.steps.length ? flowchart.steps : getPackageGraphProjection(candidate).nodes;
    const connectors = flowchart.connectors.length ? flowchart.connectors : getPackageGraphProjection(candidate).edges;

    steps.forEach((step) => {
        const id = mermaidId(step.id || step.node_id || step.item_id);
        const label = mermaidLabel(step.title || step.label || step.id);
        lines.push(`  ${id}["${label}"]`);
    });
    connectors.forEach((connector) => {
        const source = mermaidId(connector.source || connector.source_node_id);
        const target = mermaidId(connector.target || connector.target_node_id);
        const label = mermaidLabel(connector.label || connector.relationship_type);
        lines.push(label ? `  ${source} -->|${label}| ${target}` : `  ${source} --> ${target}`);
    });

    return `${lines.join('\n')}\n`;
};

const exportBatch = ({ id, integration, workspace, itemCount }) => ({
    id,
    export_batch_id: id,
    integration,
    target: integration,
    mode: 'dry_run',
    scope: 'connected_picture_package',
    workspace_id: firstText(workspace.id),
    workspace_title: firstText(workspace.title),
    item_count: itemCount,
    status: 'previewed'
});

export const getConnectedPackageHandoffCandidates = (candidate = {}, { workspace = {}, batchId = '' } = {}) => {
    const overview = getPackageOverviewProjection(candidate);
    const graph = getPackageGraphProjection(candidate);
    const tasks = getPackageTaskRows(candidate);
    const baseBatchId = batchId || `package-${overview.package_id || 'connected'}-handoff`;
    const miroBatch = exportBatch({
        id: `${baseBatchId}-miro`,
        integration: 'miro',
        workspace,
        itemCount: graph.nodes.length + graph.edges.length
    });
    const mondayBatch = exportBatch({
        id: `${baseBatchId}-monday`,
        integration: 'monday',
        workspace,
        itemCount: tasks.length
    });

    return {
        miro: {
            integration: 'miro',
            mode: 'dry_run',
            target: 'connected_picture_package_board',
            batch_id: miroBatch.id,
            export_batch: miroBatch,
            summary: {
                shape_count: graph.nodes.length,
                connector_count: graph.edges.length,
                package_id: overview.package_id
            },
            items: graph.nodes.map((node, index) => ({
                id: `shape-${node.id}`,
                node_id: node.id,
                package_item_id: node.item_id,
                title: node.title,
                node_type: node.node_type,
                review_state: node.review_state,
                source_refs: node.source_refs,
                position: { x: (index % 3) * 360, y: Math.floor(index / 3) * 160 },
                export_batch_id: miroBatch.id
            })),
            connectors: graph.edges.map((edge) => ({
                id: `connector-${edge.id}`,
                edge_id: edge.id,
                package_item_id: edge.item_id,
                source_node_id: edge.source,
                target_node_id: edge.target,
                relationship_type: edge.relationship_type,
                review_state: edge.review_state,
                source_refs: edge.source_refs,
                export_batch_id: miroBatch.id
            }))
        },
        monday: {
            integration: 'monday',
            mode: 'dry_run',
            target: {
                existing_board: false,
                existing_group: false,
                board_id: '',
                group_id: ''
            },
            batch_id: mondayBatch.id,
            export_batch: mondayBatch,
            summary: {
                item_count: tasks.length,
                will_create_board: false,
                will_create_groups: false,
                will_create_items: tasks.length,
                package_id: overview.package_id
            },
            items: tasks.map((task) => {
                const source = sourceRefFields(task.source_refs);
                return {
                    name: task.title,
                    node_id: task.id || task.item_id,
                    package_item_id: task.item_id,
                    status: task.status,
                    review_state: task.review_state,
                    priority: task.priority,
                    owner: task.owner_id,
                    due_date: task.due_date,
                    source_document: source.source_document,
                    source_page: source.source_page,
                    source_section: source.source_section,
                    source_quote: source.source_quote,
                    export_batch_id: mondayBatch.id
                };
            })
        },
        deferred_backend_fields: [
            'confirmed monday board_id/group_id',
            'live Miro board_id',
            'executed external_refs.last_pushed_at'
        ]
    };
};

export const getConnectedPackageExportBundle = (candidate = {}, options = {}) => ({
    json: getConnectedPackageJsonExport(candidate, options),
    markdown: getConnectedPackageMarkdownExport(candidate, options),
    evidence_rows: getConnectedPackageEvidenceCsvRows(candidate),
    evidence_csv: getConnectedPackageEvidenceCsvExport(candidate),
    mermaid: getConnectedPackageMermaidExport(candidate),
    handoff_candidates: getConnectedPackageHandoffCandidates(candidate, options)
});
