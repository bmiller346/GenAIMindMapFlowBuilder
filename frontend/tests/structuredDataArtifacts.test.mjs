import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyStructuredEvidenceRepair,
    getStructuredDataArtifactContext,
    structuredDataAcceptance,
    structuredDataChildData
} from '../src/utils/structuredDataArtifacts.js';

const structuredNodeData = {
    title: 'Software overlap',
    node_type: 'artifact',
    artifact_type: 'structured_data_analysis',
    artifact_ids: ['artifact-table-1'],
    source_refs: [
        {
            source_type: 'data_table',
            table_name: 'software_inventory',
            query_id: 'query-1',
            result_hash: 'abc123def456',
            row_count: 2,
            confidence: 0.91
        }
    ],
    generated_artifacts: [
        {
            id: 'artifact-query-1',
            artifact_type: 'sql_query',
            data: {
                sql: 'SELECT category, COUNT(*) FROM software_inventory GROUP BY category',
                query_id: 'query-1',
                table_name: 'software_inventory',
                result_hash: 'abc123def456'
            }
        },
        {
            id: 'artifact-table-1',
            artifact_type: 'data_table',
            data: {
                rows: [{ category: 'PDF', count: 2 }],
                columns: ['category', 'count'],
                query_id: 'query-1'
            }
        },
        {
            id: 'artifact-chart-1',
            artifact_type: 'chart',
            data: {
                chart_spec: {
                    chart_type: 'sankey',
                    source_column: 'source',
                    target_column: 'target',
                    value_column: 'count'
                },
                data_rows: [{ source: 'Policy', target: 'Finding', count: 2 }],
                query_id: 'query-1'
            }
        }
    ],
    metadata: {
        domain: 'structured_data',
        table_name: 'software_inventory',
        query_id: 'query-1',
        result_hash: 'abc123def456',
        row_count: 2
    },
    data: {
        summ: 'PDF tools overlap.',
        query: 'SELECT category, COUNT(*) FROM software_inventory GROUP BY category',
        df: [{ category: 'PDF', count: 2 }]
    }
};

test('getStructuredDataArtifactContext extracts table query provenance', () => {
    const context = getStructuredDataArtifactContext(structuredNodeData);

    assert.equal(context.hasStructuredData, true);
    assert.equal(context.tableName, 'software_inventory');
    assert.equal(context.queryId, 'query-1');
    assert.equal(context.resultHash, 'abc123def456');
    assert.equal(context.rowCount, 2);
    assert.deepEqual(context.columns, ['category', 'count']);
    assert.deepEqual(context.artifactTypes, ['sql_query', 'data_table', 'chart']);
    assert.equal(context.chartType, 'sankey');
    assert.deepEqual(context.chartRows, [{ source: 'Policy', target: 'Finding', count: 2 }]);
});

test('structuredDataAcceptance marks preview evidence as reviewed', () => {
    const accepted = structuredDataAcceptance(
        structuredNodeData,
        getStructuredDataArtifactContext(structuredNodeData)
    );

    assert.equal(accepted.status, 'reviewed');
    assert.equal(accepted.review_state, 'source_backed');
    assert.equal(accepted.local_preview_acceptances.at(-1).flow, 'structured_data_artifact');
    assert.equal(accepted.data.review_state, 'source_backed');
});

test('structuredDataChildData creates finding and task node data with source refs', () => {
    const context = getStructuredDataArtifactContext(structuredNodeData);
    const finding = structuredDataChildData({
        kind: 'finding',
        parentTitle: 'Software overlap',
        context,
        summary: 'PDF tools overlap.'
    });
    const task = structuredDataChildData({
        kind: 'task',
        parentTitle: 'Software overlap',
        context,
        evidenceNodeId: 'structured-evidence-1'
    });

    assert.equal(finding.nodeType, 'finding');
    assert.equal(finding.artifactType, 'data_insight');
    assert.deepEqual(finding.sourceRefs, structuredNodeData.source_refs);
    assert.equal(task.nodeType, 'task');
    assert.equal(task.artifactType, 'tasks');
    assert.equal(task.metadata.query_id, 'query-1');
    assert.equal(task.metadata.evidence_node_id, 'structured-evidence-1');
});

test('applyStructuredEvidenceRepair patches one structured row across table views', () => {
    const nodeData = {
        ...structuredNodeData,
        source_refs: [{ source_type: 'sql_query', query_id: 'query-1' }],
        df: [
            { row_id: 'row-a', category: 'PDF', count: 2, source_refs: [] },
            { row_id: 'row-b', category: 'CAD', count: 1, source_refs: [] }
        ],
        data: {
            ...structuredNodeData.data,
            df: [
                { row_id: 'row-a', category: 'PDF', count: 2, source_refs: [] },
                { row_id: 'row-b', category: 'CAD', count: 1, source_refs: [] }
            ]
        },
        generated_artifacts: [
            structuredNodeData.generated_artifacts[0],
            {
                id: 'artifact-table-1',
                artifact_type: 'data_table',
                data: {
                    rows: [
                        { row_id: 'row-a', category: 'PDF', count: 2, source_refs: [] },
                        { row_id: 'row-b', category: 'CAD', count: 1, source_refs: [] }
                    ],
                    columns: ['category', 'count', 'source_refs'],
                    query_id: 'query-1'
                }
            },
            {
                id: 'artifact-summary-1',
                artifact_type: 'data_summary',
                data: { summary: 'Keep me exactly as-is.' }
            }
        ]
    };
    const repairedRefs = [{ document_id: 'doc-9', page: 8, quote_snippet: 'PDF inventory evidence.' }];
    const result = applyStructuredEvidenceRepair(nodeData, {
        target: { row_id: 'row-a' },
        repair: {
            fields: {
                count: 3,
                notes: 'Verified against source extract.',
                source_refs: repairedRefs,
                review_state: 'source_backed'
            }
        }
    });

    assert.equal(result.applied, true);
    assert.deepEqual(result.patchedRowIndexes, [0]);
    assert.equal(result.data.df[0].count, 3);
    assert.equal(result.data.df[1].count, 1);
    assert.deepEqual(result.data.generated_artifacts[1].data.rows[0].source_refs, repairedRefs);
    assert.equal(result.data.generated_artifacts[1].data.rows[0].citation_status, 'source_backed');
    assert.equal(result.data.generated_artifacts[1].data.rows[1], nodeData.generated_artifacts[1].data.rows[1]);
    assert.equal(result.data.generated_artifacts[0], nodeData.generated_artifacts[0]);
    assert.equal(result.data.generated_artifacts[2], nodeData.generated_artifacts[2]);
    assert.deepEqual(result.data.source_refs, nodeData.source_refs);
});

test('applyStructuredEvidenceRepair patches a single Sankey row without rebuilding chart content', () => {
    const chartSpec = {
        chart_type: 'sankey',
        source_column: 'source',
        target_column: 'target',
        value_column: 'value'
    };
    const sankeyRows = [
        {
            row_id: 'row-1-crm-reporting',
            source: 'CRM',
            target: 'Sales reporting',
            value: 2,
            metric: 'dependency',
            review_state: 'needs_review',
            source_refs: []
        },
        {
            row_id: 'row-2-erp-close',
            source: 'ERP',
            target: 'Finance close',
            value: 1,
            metric: 'dependency',
            review_state: 'source_backed',
            source_refs: [{ document_id: 'doc-keep' }]
        }
    ];
    const nodeData = {
        artifact_type: 'structured_data_analysis',
        df: sankeyRows,
        data: { df: sankeyRows },
        generated_artifacts: [
            {
                id: 'sankey-table',
                artifact_type: 'data_table',
                data: { rows: sankeyRows, row_count: 2 }
            },
            {
                id: 'sankey-chart',
                artifact_type: 'chart',
                data: {
                    chart_spec: chartSpec,
                    data_rows: sankeyRows
                }
            }
        ]
    };
    const repairedRefs = [{ document_id: 'doc-crm', section: 'A.1' }];
    const result = applyStructuredEvidenceRepair(nodeData, {
        target: { row_id: 'row-1-crm-reporting' },
        repair: {
            source: 'CRM',
            target: 'Revenue reporting',
            value: 4,
            notes: 'Renamed from accepted process inventory.',
            source_refs: repairedRefs,
            review_state: 'source_backed'
        }
    });
    const tableRows = result.data.generated_artifacts[0].data.rows;
    const chartRows = result.data.generated_artifacts[1].data.data_rows;

    assert.equal(result.applied, true);
    assert.deepEqual(result.patchedRowIndexes, [0]);
    assert.equal(tableRows[0].target, 'Revenue reporting');
    assert.equal(tableRows[0].value, 4);
    assert.equal(tableRows[0].review_state, 'source_backed');
    assert.deepEqual(chartRows[0].source_refs, repairedRefs);
    assert.deepEqual(tableRows[1], sankeyRows[1]);
    assert.deepEqual(chartRows[1], sankeyRows[1]);
    assert.equal(result.data.generated_artifacts[1].data.chart_spec, chartSpec);
});
