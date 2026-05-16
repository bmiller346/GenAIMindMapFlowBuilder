import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
    assert.deepEqual(context.artifactTypes, ['sql_query', 'data_table']);
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
        context
    });

    assert.equal(finding.nodeType, 'finding');
    assert.equal(finding.artifactType, 'data_insight');
    assert.deepEqual(finding.sourceRefs, structuredNodeData.source_refs);
    assert.equal(task.nodeType, 'task');
    assert.equal(task.artifactType, 'tasks');
    assert.equal(task.metadata.query_id, 'query-1');
});
