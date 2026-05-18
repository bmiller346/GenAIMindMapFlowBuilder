import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyGraphFilters,
    buildGraphProjection,
    buildSourceLibraryProjection,
    createSourceLibrarySnapshot,
    WORKSPACE_BRIEF_SOURCE_ID
} from '../src/views/graphProjection.js';
import { sourceRecordFromUpload } from '../src/utils/sourceUploadRecords.js';

const sourceNode = {
    id: 'component-1',
    type: 'dataSource',
    data: {
        name: 'pdf',
        content: 'Project Plan.pdf',
        source_document_id: 'src_plan_v1',
        source_document: {
            id: 'src_plan_v1',
            filename: 'Project-Plan.pdf',
            original_filename: 'Project Plan.pdf',
            type: 'pdf',
            file_hash: 'abc123',
            size: 2048,
            version: 1
        },
        document_chunks: [
            {
                id: 'chk_1',
                document_id: 'src_plan_v1',
                text: 'Scope overview',
                page: 1
            }
        ],
        source_segments: [{ text: 'Scope overview', page: 1 }]
    }
};

const citedNode = {
    id: 'node-1',
    type: 'response',
    data: {
        title: 'Scope overview',
        source_refs: [
            {
                document_id: 'src_plan_v1',
                page: 1,
                section: 'Scope',
                quote_snippet: 'Scope overview',
                confidence: 0.91
            }
        ]
    }
};

test('buildSourceLibraryProjection derives coverage and snippets from source refs', () => {
    const projection = buildSourceLibraryProjection([sourceNode, citedNode], []);

    assert.equal(projection.sources.length, 1);
    assert.equal(projection.sources[0].id, 'src_plan_v1');
    assert.equal(projection.sources[0].title, 'Project Plan.pdf');
    assert.equal(projection.sources[0].coverage_count, 1);
    assert.equal(projection.sources[0].snippets[0].text, 'Scope overview');
    assert.equal(projection.cited_node_count, 1);
    assert.equal(projection.uncited_nodes.length, 0);
});

test('single uploaded source folds normalized citation ids onto that source', () => {
    const uploadedOnly = {
        ...sourceNode,
        data: {
            ...sourceNode.data,
            source_document_id: undefined,
            source_document: undefined
        }
    };
    const projection = buildSourceLibraryProjection([uploadedOnly, citedNode], []);

    assert.equal(projection.sources.length, 1);
    assert.equal(projection.sources[0].id, 'component-1');
    assert.equal(projection.sources[0].normalized_document_id, 'src_plan_v1');
    assert.equal(projection.sources[0].coverage_count, 1);
});

test('backend source library document object is normalized for frontend projection', () => {
    const backendLibrary = {
        documents: [
            {
                document_id: 'src_backend_doc',
                component_id: 'component-backend',
                filename: 'Backend Source.docx',
                original_filename: 'Backend Source Original.docx',
                type: 'docx',
                citation_count: 2,
                chunks: [
                    {
                        id: 'chunk-backend',
                        document_id: 'src_backend_doc',
                        snippet: 'Backend chunk text'
                    }
                ],
                source_segments: [{ snippet: 'Backend segment text' }]
            }
        ]
    };

    const projection = buildSourceLibraryProjection([], [], {}, backendLibrary);

    assert.equal(projection.sources.length, 1);
    assert.equal(projection.sources[0].id, 'src_backend_doc');
    assert.equal(projection.sources[0].title, 'Backend Source.docx');
    assert.equal(projection.sources[0].component_id, 'component-backend');
    assert.equal(projection.sources[0].chunks[0].id, 'chunk-backend');
    assert.equal(projection.sources[0].segments[0].snippet, 'Backend segment text');
});

test('source library projection can keep workspace brief beside document sources for Ask AI', () => {
    const projection = buildSourceLibraryProjection(
        [sourceNode],
        [],
        {
            configured: true,
            goal: 'Review webhook event processing'
        },
        [],
        { includeWorkspaceBriefSource: true }
    );

    assert.equal(projection.sources.length, 2);
    assert.ok(projection.sources.some((source) => source.id === 'src_plan_v1'));
    const briefSource = projection.sources.find(
        (source) => source.id === WORKSPACE_BRIEF_SOURCE_ID
    );
    assert.equal(briefSource.title, 'Review webhook event processing');
    assert.equal(briefSource.type, 'brief');
});

test('source library projection still falls back to brief-only when no documents exist', () => {
    const projection = buildSourceLibraryProjection(
        [],
        [],
        {
            configured: true,
            goal: 'Shape the workspace'
        }
    );

    assert.equal(projection.sources.length, 1);
    assert.equal(projection.sources[0].id, WORKSPACE_BRIEF_SOURCE_ID);
});

test('uploaded source records use nested source document ids and chunks', () => {
    const record = sourceRecordFromUpload(
        {
            component_id: 'component-1',
            type: 'docx',
            source_document: {
                id: 'doc-1',
                filename: 'brief.docx',
                original_filename: 'Brief.docx'
            },
            document_chunks: [{ id: 'chunk-1', text: 'Use this source.' }],
            source_segments: [{ text: 'Use this source.' }]
        },
        { name: 'Brief.docx', size: 123 },
        'workspace-1'
    );

    assert.equal(record.id, 'doc-1');
    assert.equal(record.normalized_document_id, 'doc-1');
    assert.equal(record.chunks.length, 1);
    assert.equal(record.segments.length, 1);
});

test('source library projection exposes source-set review intelligence', () => {
    const stalePolicySource = {
        id: 'component-old-policy',
        type: 'dataSource',
        data: {
            name: 'md',
            content: 'Old BIM Policy.md',
            source_document_id: 'src_policy_old',
            source_document: {
                id: 'src_policy_old',
                filename: 'Old-BIM-Policy.md',
                type: 'md',
                file_hash: 'policy-hash',
                path: 'standards/old/Old-BIM-Policy.md'
            }
        }
    };
    const duplicatePolicySource = {
        id: 'component-policy-copy',
        type: 'dataSource',
        data: {
            name: 'md',
            content: 'BIM Policy Copy.md',
            source_document_id: 'src_policy_copy',
            source_document: {
                id: 'src_policy_copy',
                filename: 'BIM-Policy-Copy.md',
                type: 'md',
                file_hash: 'policy-hash'
            }
        }
    };
    const projection = buildSourceLibraryProjection(
        [stalePolicySource, duplicatePolicySource, citedNode],
        [],
        {
            configured: true,
            desired_outputs: ['source_set_review'],
            expected_artifacts: ['SOP or workflow']
        }
    );

    assert.equal(projection.source_set_review.contract_version, '1');
    assert.equal(projection.source_sets[0].native_folder_upload, false);
    assert.equal(projection.source_set_review.file_inventory.length, 3);
    assert.equal(
        projection.source_set_review.document_classification.find(
            (entry) => entry.source_id === 'src_policy_old'
        ).classification,
        'standards_or_policy'
    );
    assert.equal(projection.source_set_review.duplicate_sources.length, 1);
    assert.equal(projection.source_set_review.stale_sources[0].source_id, 'src_policy_old');
    assert.deepEqual(
        projection.source_set_review.missing_expected_artifacts.map((entry) => entry.artifact),
        ['SOP or workflow', 'source-set review']
    );
});

test('projection reports uncited nodes and incomplete refs', () => {
    const uncitedNode = {
        id: 'node-2',
        type: 'response',
        data: { title: 'Unverified assumption' }
    };
    const incompleteNode = {
        id: 'node-3',
        type: 'response',
        data: {
            title: 'Partial citation',
            source_refs: [{ document_id: 'src_plan_v1' }]
        }
    };
    const projection = buildSourceLibraryProjection(
        [sourceNode, citedNode, uncitedNode, incompleteNode],
        []
    );

    assert.equal(projection.uncited_nodes.map((node) => node.id).join(','), 'node-2');
    assert.equal(projection.incomplete_refs.length, 1);
    assert.deepEqual(projection.incomplete_refs[0].issues, [
        'Missing source location',
        'Missing source quote',
        'Missing source confidence'
    ]);
});

test('createSourceLibrarySnapshot strips live relationship fields', () => {
    const snapshot = createSourceLibrarySnapshot({
        nodes: [sourceNode, citedNode],
        edges: [],
        workspaceBrief: {},
        sourceLibrary: []
    });

    assert.equal(snapshot.length, 1);
    assert.equal(snapshot[0].id, 'src_plan_v1');
    assert.equal(snapshot[0].status, 'parsed');
    assert.equal(snapshot[0].chunks.length, 1);
    assert.equal(Object.hasOwn(snapshot[0], 'citing_nodes'), false);
    assert.equal(Object.hasOwn(snapshot[0], 'coverage_count'), false);
});

test('buildGraphProjection preserves manual table rows for local views', () => {
    const manualTableNode = {
        id: 'manual-table-1',
        type: 'response',
        data: {
            title: 'Manual table',
            node_type: 'reference',
            status: 'needs_review',
            manual: true,
            data: {
                summ: 'Manual table',
                df: [{ Name: 'Ada', Role: 'Reviewer' }]
            }
        }
    };

    const projection = buildGraphProjection([manualTableNode], []);
    const projectedNode = projection.nodes[0];

    assert.equal(projectedNode.is_manual, true);
    assert.deepEqual(projectedNode.table_columns, ['Name', 'Role']);
    assert.deepEqual(projectedNode.table_rows, [{ Name: 'Ada', Role: 'Reviewer' }]);
});

test('buildGraphProjection keeps structured data artifact provenance with visual nodes', () => {
    const artifact = {
        id: 'artifact-chart-1',
        artifact_type: 'chart',
        title: 'License count by tool',
        data: { chart_library: 'plotly', query_id: 'query-1' },
        source_refs: [{ source_type: 'sql_query', query_id: 'query-1' }],
        review_state: 'source_backed'
    };
    const structuredDataNode = {
        id: 'structured-data-1',
        type: 'response',
        data: {
            title: 'License evidence',
            node_type: 'artifact',
            artifact_type: 'structured_data_analysis',
            artifact_ids: ['artifact-chart-1'],
            review_state: 'source_backed',
            generated_artifacts: [artifact],
            source_refs: [{ source_type: 'sql_query', query_id: 'query-1' }],
            metadata: { domain: 'structured_data', query_id: 'query-1' },
            data: {
                summ: 'License evidence',
                df: [{ Tool: 'Bluebeam', Licenses: 12 }],
                query: 'SELECT Tool, Licenses FROM software_inventory'
            }
        }
    };

    const projection = buildGraphProjection([structuredDataNode], []);
    const projectedNode = projection.nodes[0];

    assert.equal(projectedNode.node_type, 'artifact');
    assert.equal(projectedNode.artifact_type, 'structured_data_analysis');
    assert.deepEqual(projectedNode.artifact_ids, ['artifact-chart-1']);
    assert.deepEqual(projectedNode.generated_artifacts, [artifact]);
    assert.deepEqual(projectedNode.source_refs, [{ source_type: 'sql_query', query_id: 'query-1' }]);
    assert.deepEqual(projectedNode.artifact_metadata, {
        domain: 'structured_data',
        query_id: 'query-1'
    });

    assert.equal(applyGraphFilters(projection, ['source-backed']).nodes.length, 1);
    assert.equal(applyGraphFilters(projection, ['missing-source']).nodes.length, 0);
});
