import assert from 'node:assert/strict';
import test from 'node:test';
import {
    AUTO_PAGE_SIZE_ID,
    buildPdfExportDocument,
    getPdfExportPreview,
    listPdfExportProfiles,
    projectPdfExportData
} from '../src/export/pdf/index.js';

const node = (id, title, nodeType, x, y, data = {}) => ({
    id,
    type: 'response',
    position: { x, y },
    measured: data.measured || { width: 260, height: 92 },
    data: {
        title,
        summary: `${title} summary for export review and team handoff.`,
        node_type: nodeType,
        status: data.status || 'reviewed',
        priority: data.priority || '',
        owner_id: data.owner || '',
        due_date: data.dueDate || '',
        source_refs: data.sourceRefs || [],
        ...Object.fromEntries(
            Object.entries(data).filter(([key]) => key !== 'measured')
        )
    }
});

const edge = (source, target, id = `${source}-${target}`, relationshipType = 'contains', label = '') => ({
    id,
    source,
    target,
    type: 'smoothstep',
    data: { relationship_type: relationshipType, label }
});

const nodes = [
    node('root', 'Security Review Details', 'concept', 0, 240, {
        sourceRefs: [{ document_id: 'doc-1', section: 'Overview' }]
    }),
    node('readiness', 'Model readiness and roadmap events', 'task', 330, 0, {
        owner: 'Architecture',
        dueDate: '2026-06-15',
        priority: 'high',
        sourceRefs: [{ document_id: 'doc-1', section: 'Readiness' }]
    }),
    node('auth', 'Authentication, scopes, and roles', 'risk', 330, 170, {
        status: 'needs_review',
        priority: 'critical'
    }),
    node('events', 'Supported event families', 'task', 330, 340, {
        owner: 'Platform',
        dueDate: '2026-06-30'
    }),
    node('workflow', 'Must-not-break add-in workflows', 'workflow', 700, 80),
    node('audit', 'Audit and observability', 'needs_review', 700, 250, {
        status: 'needs_review'
    }),
    node('queue', 'Event queue and dead lettering', 'task', 700, 420)
];

const edges = [
    edge('root', 'readiness'),
    edge('root', 'auth'),
    edge('root', 'events'),
    edge('readiness', 'workflow'),
    edge('auth', 'audit'),
    edge('events', 'queue'),
    edge('audit', 'auth', 'audit-blocks-auth', 'blocks', 'blocks release'),
    edge('queue', 'workflow', 'queue-supports-workflow', 'supports', 'supports workflow')
];

const baseOptions = {
    nodes,
    edges,
    flowName: 'Security Review Export',
    mapStyle: 'clean',
    workspaceBrief: {
        goal: 'Share reviewable implementation concepts with the team.',
        audience: 'Engineering review'
    }
};

test('PDF export projection derives outline, task, and review rows', () => {
    const data = projectPdfExportData(baseOptions);

    assert.equal(data.stats.nodeCount, 7);
    assert.equal(data.stats.edgeCount, 8);
    assert.ok(data.outlineRows.length >= 7);
    assert.ok(data.taskRows.length >= 3);
    assert.ok(data.reviewRows.some((row) => row.id === 'auth'));
    assert.deepEqual(data.nodes.find((item) => item.id === 'root').size, {
        width: 260,
        height: 92
    });
    assert.equal(data.edges.find((item) => item.id === 'audit-blocks-auth').relationshipType, 'blocks');
    assert.equal(data.edges.find((item) => item.id === 'audit-blocks-auth').label, 'blocks release');
});

test('PDF export projection preserves measured node dimensions for rendering', () => {
    const data = projectPdfExportData({
        nodes: [
            node('wide', 'Wide measured node', 'concept', 10, 20, {
                measured: { width: 420, height: 140 }
            })
        ],
        edges: []
    });

    assert.deepEqual(data.nodes[0].size, { width: 420, height: 140 });
});

test('PDF Studio preview resolves auto-fit and readability for every profile', () => {
    for (const profile of listPdfExportProfiles()) {
        const preview = getPdfExportPreview({
            ...baseOptions,
            profileId: profile.id,
            pageSizeId: AUTO_PAGE_SIZE_ID,
            orientation: 'landscape',
            options: {
                includeTitleBlock: profile.id !== 'vector-map',
                includeOutlinePanel: profile.id === 'map-outline',
                includeNotesPanel: profile.id === 'review-sheet'
            }
        });

        assert.equal(preview.profile.id, profile.id);
        assert.notEqual(preview.pageSize.id, AUTO_PAGE_SIZE_ID);
        assert.ok(preview.pageCount >= 1);
        assert.ok(Number.isFinite(preview.diagramScale));
        assert.ok(['good', 'ok', 'tight', 'poor'].includes(preview.readability.level));
    }
});

test('PDF renderer builds non-empty vector PDF documents for studio profiles', async () => {
    for (const profile of listPdfExportProfiles()) {
        const result = await buildPdfExportDocument({
            ...baseOptions,
            profileId: profile.id,
            pageSizeId: AUTO_PAGE_SIZE_ID,
            orientation: 'landscape',
            options: {
                includeTitleBlock: true,
                includeOutlinePanel: profile.id !== 'outline-tasks',
                includeNotesPanel: profile.id === 'review-sheet',
                projectName: 'Security Review Export',
                preparedFor: 'Engineering review',
                revision: 'Draft'
            }
        });
        const bytes = result.doc.output('arraybuffer');

        assert.equal(result.profile.id, profile.id);
        assert.ok(result.pageCount >= 1);
        assert.ok(bytes.byteLength > 4000);
        assert.match(result.filename, /\.pdf$/);
    }
});
