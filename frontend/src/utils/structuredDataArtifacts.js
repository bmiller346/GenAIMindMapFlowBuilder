const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const cloneArray = (value) => (Array.isArray(value) ? structuredClone(value).filter(Boolean) : []);

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

const REPAIR_FIELD_KEYS = [
    'source',
    'target',
    'from',
    'to',
    'value',
    'weight',
    'count',
    'amount',
    'metric',
    'metric_label',
    'stage',
    'group',
    'notes',
    'confidence',
    'review_state',
    'source_refs',
    'evidence_status',
    'citation_status',
    'source_policy',
    'citation_query',
    'evidence_input_hint',
    'source_input_hint'
];

const repairPayload = (repair = {}) => {
    if (!repair || typeof repair !== 'object') {
        return {};
    }
    const explicit =
        repair.fields ||
        repair.row_fields ||
        repair.corrected_fields ||
        repair.corrected_row ||
        repair.row ||
        repair.item;
    return explicit && typeof explicit === 'object' ? explicit : repair;
};

const repairPatchForRow = (repair = {}) => {
    const payload = repairPayload(repair);
    const patch = {};
    REPAIR_FIELD_KEYS.forEach((key) => {
        if (payload[key] !== undefined) {
            patch[key] =
                key === 'source_refs'
                    ? cloneArray(payload[key])
                    : structuredClone(payload[key]);
        }
    });
    if (repair.source_refs !== undefined && patch.source_refs === undefined) {
        patch.source_refs = cloneArray(repair.source_refs);
    }
    if (repair.review_state !== undefined && patch.review_state === undefined) {
        patch.review_state = repair.review_state;
    }
    if (patch.source_refs !== undefined) {
        const citationStatus = patch.source_refs.length ? 'source_backed' : 'needs_source';
        patch.evidence_status = payload.evidence_status || repair.evidence_status || citationStatus;
        patch.citation_status = payload.citation_status || repair.citation_status || citationStatus;
        patch.source_policy =
            payload.source_policy ||
            repair.source_policy ||
            (patch.source_refs.length ? 'cited' : 'reviewer_source_required');
    }
    if (patch.review_state === undefined && patch.source_refs !== undefined) {
        patch.review_state = patch.source_refs.length ? 'source_backed' : 'needs_review';
    }
    return patch;
};

const targetValue = (target = {}, repair = {}, key) =>
    target?.[key] ?? repair?.[key] ?? repairPayload(repair)?.[key];

const targetRowIndexes = (target = {}, repair = {}) => [
    ...(Array.isArray(target.rowIndexes) ? target.rowIndexes : []),
    ...(Array.isArray(target.represented_row_indexes) ? target.represented_row_indexes : []),
    ...(Array.isArray(repair.rowIndexes) ? repair.rowIndexes : []),
    ...(Array.isArray(repair.represented_row_indexes) ? repair.represented_row_indexes : []),
    ...(Array.isArray(repairPayload(repair).represented_row_indexes)
        ? repairPayload(repair).represented_row_indexes
        : [])
]
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0);

export const normalizeEvidenceRepairTarget = (target = {}, repair = {}) => ({
    evidence_item_id: firstText(
        targetValue(target, repair, 'evidence_item_id'),
        targetValue(target, repair, 'evidenceItemId')
    ),
    row_id: firstText(targetValue(target, repair, 'row_id'), targetValue(target, repair, 'rowId')),
    artifact_id: firstText(
        targetValue(target, repair, 'artifact_id'),
        targetValue(target, repair, 'artifactId')
    ),
    rowIndex: Number.isInteger(Number(targetValue(target, repair, 'rowIndex')))
        ? Number(targetValue(target, repair, 'rowIndex'))
        : null,
    rowIndexes: Array.from(new Set(targetRowIndexes(target, repair))),
    source: firstText(targetValue(target, repair, 'source')),
    target: firstText(targetValue(target, repair, 'target')),
    source_refs: cloneArray(targetValue(target, repair, 'source_refs')),
    review_state: firstText(targetValue(target, repair, 'review_state'))
});

const rowMatchesRepairTarget = (row = {}, index, target = {}, repair = {}) => {
    const normalizedTarget = normalizeEvidenceRepairTarget(target, repair);
    if (Number.isInteger(normalizedTarget.rowIndex) && normalizedTarget.rowIndex === index) {
        return true;
    }
    if (normalizedTarget.rowIndexes.includes(index)) {
        return true;
    }

    const ids = [row.row_id, row.evidence_item_id, row.id]
        .map((value) => String(value || ''))
        .filter(Boolean);
    const targetIds = [
        normalizedTarget.row_id,
        normalizedTarget.evidence_item_id,
        targetValue(target, repair, 'id')
    ]
        .map((value) => String(value || ''))
        .filter(Boolean);
    if (ids.length && targetIds.some((id) => ids.includes(id))) {
        return true;
    }

    const source = String(normalizedTarget.source || '').trim();
    const targetLabel = String(normalizedTarget.target || '').trim();
    return Boolean(
        source &&
            targetLabel &&
            String(row.source || '').trim() === source &&
            String(row.target || '').trim() === targetLabel
    );
};

const patchRows = (rows = [], target = {}, repair = {}) => {
    if (!Array.isArray(rows)) {
        return { rows, applied: false, patchedIndexes: [] };
    }
    const patch = repairPatchForRow(repair);
    if (!Object.keys(patch).length) {
        return { rows, applied: false, patchedIndexes: [] };
    }
    const patchedIndexes = [];
    const allowMultiple = normalizeEvidenceRepairTarget(target, repair).rowIndexes.length > 0;
    const nextRows = rows.map((row, index) => {
        if (!allowMultiple && patchedIndexes.length) {
            return row;
        }
        if (!rowMatchesRepairTarget(row, index, target, repair)) {
            return row;
        }
        patchedIndexes.push(index);
        return {
            ...row,
            ...patch
        };
    });
    return {
        rows: patchedIndexes.length ? nextRows : rows,
        applied: patchedIndexes.length > 0,
        patchedIndexes
    };
};

const patchArtifactRows = (artifact = {}, target = {}, repair = {}) => {
    if (!artifact || typeof artifact !== 'object') {
        return { artifact, applied: false };
    }
    const data = artifact.data && typeof artifact.data === 'object' ? artifact.data : {};
    const rowKey =
        Array.isArray(data.rows) &&
        ['data_table', 'structured_data_analysis'].includes(artifact.artifact_type)
            ? 'rows'
            : Array.isArray(data.data_rows)
              ? 'data_rows'
              : '';
    if (!rowKey) {
        return { artifact, applied: false };
    }
    const result = patchRows(data[rowKey], target, repair);
    if (!result.applied) {
        return { artifact, applied: false };
    }
    const nextData = {
        ...data,
        [rowKey]: result.rows
    };
    if (rowKey === 'rows') {
        nextData.row_count = result.rows.length;
    }
    return {
        artifact: {
            ...artifact,
            data: nextData
        },
        applied: true,
        patchedIndexes: result.patchedIndexes
    };
};

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

export const applyStructuredEvidenceRepair = (data = {}, { target = {}, repair = {} } = {}) => {
    const nestedData = data.data && typeof data.data === 'object' ? data.data : {};
    const dfResult = patchRows(data.df, target, repair);
    const nestedDfResult = patchRows(nestedData.df, target, repair);
    const artifactResults = asArray(data.generated_artifacts || nestedData.generated_artifacts).map(
        (artifact) => patchArtifactRows(artifact, target, repair)
    );
    const artifactsApplied = artifactResults.some((result) => result.applied);
    const patchedArtifacts = artifactsApplied
        ? artifactResults.map((result) => result.artifact)
        : data.generated_artifacts || nestedData.generated_artifacts;
    const applied = dfResult.applied || nestedDfResult.applied || artifactsApplied;

    if (!applied) {
        return {
            data,
            applied: false,
            patchedRowIndexes: []
        };
    }

    const patchedRowIndexes = Array.from(
        new Set([
            ...dfResult.patchedIndexes,
            ...nestedDfResult.patchedIndexes,
            ...artifactResults.flatMap((result) => result.patchedIndexes || [])
        ])
    );

    const nextNestedData = {
        ...nestedData,
        ...(nestedDfResult.applied ? { df: nestedDfResult.rows } : {}),
        generated_artifacts: patchedArtifacts
    };

    return {
        data: {
            ...data,
            ...(dfResult.applied ? { df: dfResult.rows } : {}),
            generated_artifacts: patchedArtifacts,
            data: nextNestedData
        },
        applied: true,
        patchedRowIndexes
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
