import { buildSankeyFlowRows } from '../../utils/sankeyFlow.js';
import {
    buildGraphProjection,
    chartArtifactForNode,
    markdownListValue,
    markdownText,
    sourceRefLabel,
    structuredEvidenceForTask,
    tableArtifactForNode
} from './packageReady.js';

const chartSpecForNode = (node = {}) => chartArtifactForNode(node)?.data?.chart_spec || {};

const sankeyColumnOptionsForSpec = (chartSpec = {}) => ({
    sourceColumn: chartSpec.source_column || chartSpec.sourceColumn,
    targetColumn: chartSpec.target_column || chartSpec.targetColumn,
    valueColumn: chartSpec.value_column || chartSpec.valueColumn
});

const structuredFlowRowsForNode = (node = {}) => {
    const chartArtifact = chartArtifactForNode(node);
    const tableArtifact = tableArtifactForNode(node);
    return Array.isArray(chartArtifact?.data?.data_rows) && chartArtifact.data.data_rows.length
        ? chartArtifact.data.data_rows
        : Array.isArray(tableArtifact?.data?.rows) && tableArtifact.data.rows.length
          ? tableArtifact.data.rows
          : node.table_rows || [];
};

const rowSourceRefs = (flowRow = {}, fallbackRefs = []) => {
    const refs = [];
    (flowRow.rows || []).forEach((row) => {
        if (Array.isArray(row?.source_refs)) {
            refs.push(...row.source_refs);
        }
    });
    return refs.length ? refs : fallbackRefs;
};

const firstRepresentedRowValue = (flowRow = {}, key = '') =>
    (flowRow.rows || [])
        .map((row) => row?.[key])
        .find((value) => value !== undefined && value !== null && value !== '') || '';

export const getSankeyFlowProjection = (projection = {}) => {
    const nodes = projection.nodes || [];
    const flowNodes = [];
    const flowRows = [];

    nodes.forEach((node) => {
        const rows = structuredFlowRowsForNode(node);
        const chartSpec = chartSpecForNode(node);
        const flow = buildSankeyFlowRows(rows, sankeyColumnOptionsForSpec(chartSpec));
        if (!flow.eligible) {
            return;
        }
        const structuredEvidence = structuredEvidenceForTask(node) || {};
        const nodeFlowRows = flow.rows.map((row, index) => ({
            id: firstRepresentedRowValue(row, 'row_id') || `${node.id}:sankey:${index}`,
            evidence_node_id: node.id,
            evidence_title: node.title,
            source: row.source,
            target: row.target,
            value: row.value,
            metric_label: flow.metricLabel,
            source_column: flow.sourceColumn,
            target_column: flow.targetColumn,
            value_column: flow.valueColumn,
            represented_row_indexes: row.rowIndexes,
            represented_rows: row.rows,
            source_refs: rowSourceRefs(row, node.source_refs || []),
            evidence_item_id: firstRepresentedRowValue(row, 'evidence_item_id'),
            review_state:
                firstRepresentedRowValue(row, 'review_state') ||
                node.review_state ||
                node.status ||
                'needs_review',
            evidence_status:
                firstRepresentedRowValue(row, 'evidence_status') ||
                firstRepresentedRowValue(row, 'citation_status') ||
                (rowSourceRefs(row, node.source_refs || []).length ? 'source_backed' : 'needs_source'),
            citation_status:
                firstRepresentedRowValue(row, 'citation_status') ||
                firstRepresentedRowValue(row, 'evidence_status') ||
                (rowSourceRefs(row, node.source_refs || []).length ? 'source_backed' : 'needs_source'),
            evidence_repair_prompt: firstRepresentedRowValue(row, 'evidence_repair_prompt'),
            source_repair_prompt:
                firstRepresentedRowValue(row, 'source_repair_prompt') ||
                firstRepresentedRowValue(row, 'evidence_repair_prompt'),
            evidence_input_hint: firstRepresentedRowValue(row, 'evidence_input_hint'),
            source_input_hint:
                firstRepresentedRowValue(row, 'source_input_hint') ||
                firstRepresentedRowValue(row, 'evidence_input_hint'),
            citation_query: firstRepresentedRowValue(row, 'citation_query'),
            table_name: structuredEvidence.table_name || '',
            query_id: structuredEvidence.query_id || '',
            result_hash: structuredEvidence.result_hash || ''
        }));
        flowNodes.push({
            id: node.id,
            title: node.title,
            table_name: structuredEvidence.table_name || '',
            query_id: structuredEvidence.query_id || '',
            result_hash: structuredEvidence.result_hash || '',
            metric_label: flow.metricLabel,
            path_count: nodeFlowRows.length,
            source_backed: Boolean(structuredEvidence.source_backed),
            source_refs: node.source_refs || [],
            review_state: node.review_state || node.status || 'needs_review'
        });
        flowRows.push(...nodeFlowRows);
    });

    return {
        eligible: flowRows.length > 0,
        node_count: flowNodes.length,
        path_count: flowRows.length,
        value_total: flowRows.reduce((total, row) => total + row.value, 0),
        metric_labels: Array.from(new Set(flowRows.map((row) => row.metric_label))).filter(Boolean),
        nodes: flowNodes,
        rows: flowRows
    };
};

const sankeyReviewSummary = (rows = []) => {
    const sourceBackedRows = rows.filter(
        (row) =>
            Array.isArray(row.source_refs) &&
            row.source_refs.length > 0 &&
            !['needs_source', 'missing_source'].includes(String(row.evidence_status || '').toLowerCase())
    ).length;
    const needsSourceRows = rows.filter(
        (row) =>
            !Array.isArray(row.source_refs) ||
            row.source_refs.length === 0 ||
            ['needs_source', 'missing_source'].includes(String(row.evidence_status || '').toLowerCase())
    ).length;
    const needsReviewRows = rows.filter((row) =>
        ['needs_review', 'ai_generated', 'draft'].includes(String(row.review_state || '').toLowerCase())
    ).length;

    return {
        source_backed_rows: sourceBackedRows,
        needs_source_rows: needsSourceRows,
        needs_review_rows: needsReviewRows,
        unsupported_path_ids: rows
            .filter((row) => !Array.isArray(row.source_refs) || row.source_refs.length === 0)
            .map((row) => row.id)
    };
};

export const buildSankeyFlowExport = ({
    sankeyFlow,
    projection,
    title = 'Sankey Flow Lens',
    scopeLabel = 'Workspace',
    generatedAt = new Date().toISOString()
} = {}) => {
    const flow =
        sankeyFlow ||
        getSankeyFlowProjection(
            projection?.nodeLookup
                ? projection
                : buildGraphProjection(projection?.nodes || [], projection?.edges || [])
        );
    const rows = Array.isArray(flow?.rows) ? flow.rows : [];

    return {
        export_type: 'sankey_flow_lens',
        version: 1,
        title: markdownText(title, 'Sankey Flow Lens'),
        scope: markdownText(scopeLabel, 'Workspace'),
        generated_at: generatedAt,
        eligible: Boolean(flow?.eligible),
        node_count: flow?.node_count || 0,
        path_count: flow?.path_count || 0,
        value_total: flow?.value_total || 0,
        metric_labels: flow?.metric_labels || [],
        review_summary: sankeyReviewSummary(rows),
        nodes: (flow?.nodes || []).map((node) => ({
            id: node.id,
            title: node.title,
            table_name: node.table_name,
            query_id: node.query_id,
            result_hash: node.result_hash,
            metric_label: node.metric_label,
            path_count: node.path_count,
            review_state: node.review_state,
            source_ref_count: Array.isArray(node.source_refs) ? node.source_refs.length : 0
        })),
        rows: rows.map((row) => ({
            id: row.id,
            evidence_item_id: row.evidence_item_id,
            evidence_node_id: row.evidence_node_id,
            evidence_title: row.evidence_title,
            source: row.source,
            target: row.target,
            value: row.value,
            metric_label: row.metric_label,
            source_column: row.source_column,
            target_column: row.target_column,
            value_column: row.value_column,
            review_state: row.review_state,
            evidence_status: row.evidence_status,
            citation_status: row.citation_status,
            table_name: row.table_name,
            query_id: row.query_id,
            result_hash: row.result_hash,
            represented_row_indexes: row.represented_row_indexes,
            represented_rows: row.represented_rows,
            citation_query: row.citation_query,
            evidence_repair_prompt: row.evidence_repair_prompt,
            source_repair_prompt: row.source_repair_prompt,
            source_refs: row.source_refs || []
        }))
    };
};

export const buildSankeyFlowMarkdown = ({
    sankeyFlow,
    projection,
    title = 'Sankey Flow Lens',
    scopeLabel = 'Workspace',
    generatedAt = new Date().toISOString()
} = {}) => {
    const exportData = buildSankeyFlowExport({
        sankeyFlow,
        projection,
        title,
        scopeLabel,
        generatedAt
    });
    const lines = [
        `# ${markdownText(exportData.title, 'Sankey Flow Lens')}`,
        '',
        `- Scope: ${markdownText(exportData.scope, 'Workspace')}`,
        `- Generated: ${markdownText(exportData.generated_at)}`,
        `- Eligible: ${exportData.eligible ? 'Yes' : 'No'}`,
        `- Evidence nodes: ${exportData.node_count}`,
        `- Flow paths: ${exportData.path_count}`,
        `- Total value: ${exportData.value_total}`,
        `- Metrics: ${exportData.metric_labels.length ? exportData.metric_labels.join(', ') : 'Not set'}`,
        `- Source-backed rows: ${exportData.review_summary.source_backed_rows}`,
        `- Needs source rows: ${exportData.review_summary.needs_source_rows}`,
        `- Needs review rows: ${exportData.review_summary.needs_review_rows}`,
        ''
    ];

    if (!exportData.rows.length) {
        lines.push('No accepted source/target/value paths are available for export.');
        return lines.join('\n');
    }

    lines.push('## Flow Rows', '');
    lines.push('| Source | Target | Value | Metric | Review | Evidence | Sources |');
    lines.push('| --- | --- | ---: | --- | --- | --- | --- |');
    exportData.rows.forEach((row) => {
        const refs = Array.isArray(row.source_refs) ? row.source_refs : [];
        lines.push(
            [
                markdownListValue(row.source),
                markdownListValue(row.target),
                Number.isFinite(Number(row.value)) ? Number(row.value).toLocaleString() : markdownListValue(row.value),
                markdownListValue(row.metric_label),
                markdownListValue(row.review_state),
                markdownListValue(row.evidence_status || row.citation_status),
                refs.length ? refs.map(sourceRefLabel).join('<br>') : 'Needs source'
            ].join(' | ').replace(/^/, '| ') + ' |'
        );
    });

    const unsupportedRows = exportData.rows.filter((row) => !Array.isArray(row.source_refs) || row.source_refs.length === 0);
    if (unsupportedRows.length) {
        lines.push('', '## Unsupported Or Needs-Source Paths', '');
        unsupportedRows.forEach((row, index) => {
            lines.push(`### ${index + 1}. ${markdownText(row.source)} -> ${markdownText(row.target)}`);
            lines.push(`- Row id: ${markdownListValue(row.id)}`);
            lines.push(`- Evidence node: ${markdownListValue(row.evidence_title)} (${markdownListValue(row.evidence_node_id)})`);
            lines.push(`- Review state: ${markdownListValue(row.review_state)}`);
            lines.push(`- Evidence status: ${markdownListValue(row.evidence_status)}`);
            lines.push(`- Citation query: ${markdownListValue(row.citation_query, 'Not available')}`);
            lines.push(`- Repair prompt: ${markdownListValue(row.evidence_repair_prompt || row.source_repair_prompt, 'Not available')}`);
            lines.push('');
        });
    }

    return lines.join('\n').trimEnd();
};

