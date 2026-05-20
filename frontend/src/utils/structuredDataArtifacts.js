const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const firstText = (...values) =>
    values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .find(Boolean) || '';

const artifactTypes = (artifacts = []) =>
    asArray(artifacts)
        .map((artifact) => artifact?.artifact_type)
        .filter(Boolean);

const metadataValue = (metadata = {}, sourceRefs = [], key) =>
    metadata?.[key] ?? sourceRefs.find((ref) => ref?.[key] !== undefined)?.[key] ?? '';

export const getStructuredDataArtifactContext = (data = {}) => {
    const nestedData = data.data && typeof data.data === 'object' ? data.data : {};
    const metadata = data.metadata || nestedData.metadata || {};
    const sourceRefs = asArray(data.source_refs || nestedData.source_refs);
    const generatedArtifacts = asArray(data.generated_artifacts || nestedData.generated_artifacts);
    const rows = asArray(data.df || nestedData.df);
    const columns = Array.from(
        rows.reduce((seen, row) => {
            Object.keys(row || {}).forEach((key) => seen.add(key));
            return seen;
        }, new Set())
    );
    const tableArtifact = generatedArtifacts.find((artifact) => artifact?.artifact_type === 'data_table');
    const chartArtifact = generatedArtifacts.find((artifact) => artifact?.artifact_type === 'chart');
    const queryArtifact = generatedArtifacts.find((artifact) => artifact?.artifact_type === 'sql_query');
    const summaryArtifact = generatedArtifacts.find((artifact) => artifact?.artifact_type === 'data_summary');
    const query = firstText(
        data.query,
        nestedData.query,
        queryArtifact?.data?.sql,
        tableArtifact?.data?.query
    );
    const sourceType = firstText(
        metadata.source_type,
        sourceRefs.find((ref) => ref?.source_type)?.source_type
    );
    const tableName = firstText(
        metadata.table_name,
        tableArtifact?.data?.table_name,
        queryArtifact?.data?.table_name,
        sourceRefs.find((ref) => ref?.table_name)?.table_name
    );
    const queryId = firstText(
        metadata.query_id,
        tableArtifact?.data?.query_id,
        queryArtifact?.data?.query_id,
        sourceRefs.find((ref) => ref?.query_id)?.query_id
    );
    const resultHash = firstText(
        metadata.result_hash,
        tableArtifact?.data?.result_hash,
        queryArtifact?.data?.result_hash,
        sourceRefs.find((ref) => ref?.result_hash)?.result_hash
    );
    const metadataRowCount = metadataValue(metadata, sourceRefs, 'row_count');
    const rowCount =
        metadataRowCount !== '' && Number.isFinite(Number(metadataRowCount))
            ? Number(metadataRowCount)
            : rows.length || Number(tableArtifact?.data?.row_count || 0);
    const hasStructuredData =
        data.artifact_type === 'structured_data_analysis' ||
        nestedData.artifact_type === 'structured_data_analysis' ||
        ['data_table', 'sql_query', 'data_summary', 'chart'].some((type) =>
            generatedArtifacts.some((artifact) => artifact?.artifact_type === type)
        ) ||
        sourceRefs.some((ref) =>
            ['data_table', 'sql_query'].includes(String(ref?.source_type || ''))
        );

    return {
        hasStructuredData,
        sourceType,
        tableName,
        queryId,
        resultHash,
        rowCount,
        columns: columns.length ? columns : asArray(tableArtifact?.data?.columns),
        query,
        sourceRefs,
        generatedArtifacts,
        artifactIds: asArray(data.artifact_ids || nestedData.artifact_ids),
        artifactTypes: artifactTypes(generatedArtifacts),
        metadata,
        tableArtifact,
        chartArtifact,
        chartSpec: chartArtifact?.data?.chart_spec || {},
        chartType:
            chartArtifact?.data?.chart_spec?.chart_type ||
            chartArtifact?.data?.chart_spec?.type ||
            chartArtifact?.data?.chart_spec?.data?.[0]?.type ||
            '',
        chartRows: asArray(chartArtifact?.data?.data_rows || tableArtifact?.data?.rows || rows),
        queryArtifact,
        summaryArtifact,
        accepted: asArray(data.local_preview_acceptances).some(
            (acceptance) => acceptance?.flow === 'structured_data_artifact' && acceptance.accepted
        )
    };
};

export const structuredDataAcceptance = (data = {}, context = getStructuredDataArtifactContext(data)) => ({
    ...data,
    status: 'reviewed',
    review_state: 'source_backed',
    local_preview_acceptances: [
        ...asArray(data.local_preview_acceptances),
        {
            accepted: true,
            flow: 'structured_data_artifact',
            accepted_at: new Date().toISOString(),
            query_id: context.queryId,
            table_name: context.tableName,
            artifact_types: context.artifactTypes
        }
    ],
    data: {
        ...(data.data || {}),
        status: 'reviewed',
        review_state: 'source_backed'
    }
});

export const structuredDataChildData = ({
    kind = 'finding',
    parentTitle = 'Structured evidence',
    context = {},
    summary = '',
    evidenceNodeId = ''
} = {}) => {
    const titlePrefix = kind === 'task' ? 'Review evidence from' : 'Finding from';
    const title = `${titlePrefix} ${context.tableName || parentTitle}`;
    const body =
        summary ||
        (kind === 'task'
            ? `Review the structured data result from ${context.tableName || 'this table'} and decide what follow-up is needed.`
            : `Source-backed finding from ${context.tableName || 'structured data'} query result.`);

    return {
        title,
        body,
        nodeType: kind === 'task' ? 'task' : 'finding',
        status: 'needs_review',
        sourceRefs: context.sourceRefs || [],
        artifactType: kind === 'task' ? 'tasks' : 'data_insight',
        artifactIds: context.artifactIds || [],
        generatedArtifacts: context.generatedArtifacts || [],
        reviewState: 'source_backed',
        metadata: {
            ...(context.metadata || {}),
            domain: 'structured_data',
            accepted_from: 'structured_data_preview',
            preview_kind: kind,
            evidence_node_id: evidenceNodeId,
            query_id: context.queryId,
            table_name: context.tableName,
            result_hash: context.resultHash
        }
    };
};
