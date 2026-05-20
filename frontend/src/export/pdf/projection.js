const HIERARCHY_RELATIONSHIPS = new Set([
    '',
    'contains',
    'parent_child',
    'parent-child',
    'child',
    'section',
    'subtopic',
    'branch',
    'step',
    'smoothstep'
]);

const TASK_TYPES = new Set(['task', 'procedure', 'workflow', 'needs_review', 'requirement']);
const REVIEW_TYPES = new Set([
    'risk',
    'blocker',
    'issue',
    'dependency',
    'question',
    'decision',
    'approval',
    'needs_review'
]);

const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const textValue = (...values) =>
    values
        .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
        .find(Boolean) || '';

const nestedDataFor = (node = {}) => {
    const data = node.data || {};
    return data.data && typeof data.data === 'object' ? data.data : {};
};

const pick = (node = {}, keys = [], fallback = '') => {
    const data = node.data || {};
    const nestedData = nestedDataFor(node);
    for (const key of keys) {
        const value = data[key] ?? nestedData[key] ?? node[key];
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }
    return fallback;
};

const normalizeTextList = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return [];
};

const normalizeArtifactSections = (value) =>
    asArray(value)
        .map((item) => {
            if (typeof item === 'string') {
                return { title: item, body: '', bullets: [] };
            }
            if (!item || typeof item !== 'object') {
                return null;
            }
            return {
                title: textValue(item.title, item.heading, item.label, item.name, item.summary, 'Untitled'),
                body: textValue(item.body, item.summary, item.description, item.text, item.content, item.rationale),
                bullets: normalizeTextList(item.bullets || item.points || item.items || item.takeaways),
                sourceRefs: asArray(item.source_refs || item.sourceRefs)
            };
        })
        .filter(Boolean);

const numericValue = (...values) => {
    for (const value of values) {
        const number = Number(value);
        if (Number.isFinite(number) && number > 0) {
            return number;
        }
    }
    return undefined;
};

export const relationshipTypeForEdge = (edge = {}) =>
    String(
        edge.relationship_type ||
            edge.relationshipType ||
            edge.data?.relationship_type ||
            edge.data?.relationshipType ||
            edge.metadata?.relationship_type ||
            edge.data?.type ||
            edge.type ||
            ''
    )
        .trim()
        .toLowerCase();

export const isHierarchyEdge = (edge = {}) =>
    HIERARCHY_RELATIONSHIPS.has(relationshipTypeForEdge(edge));

export const normalizePdfExportNode = (node = {}) => {
    const data = node.data || {};
    const nestedData = nestedDataFor(node);
    const sourceRefs = asArray(data.source_refs || nestedData.source_refs);
    const generatedArtifacts = asArray(data.generated_artifacts || nestedData.generated_artifacts);
    const taskProjection =
        data.task_projection?.accepted || nestedData.task_projection?.accepted
            ? data.task_projection || nestedData.task_projection
            : {};
    const checklistProjection =
        data.checklist_projection?.accepted || nestedData.checklist_projection?.accepted
            ? data.checklist_projection || nestedData.checklist_projection
            : {};
    const title = textValue(
        data.title,
        nestedData.title,
        data.label,
        nestedData.label,
        data.question,
        nestedData.question,
        data.content,
        nestedData.content,
        data.summary,
        nestedData.summary,
        nestedData.summ,
        node.id,
        'Untitled node'
    );
    const summary = textValue(
        data.body,
        data.summary,
        nestedData.body,
        nestedData.summary,
        nestedData.summ,
        data.answer,
        nestedData.answer
    );
    const nodeType = String(
        pick(
            node,
            ['node_type', 'component_type', 'name'],
            node.type === 'response' || node.type === 'pdfResponse'
                ? 'concept'
                : node.type || 'concept'
        )
    ).toLowerCase();
    const width = numericValue(
        node.measured?.width,
        node.width,
        node.style?.width,
        data.width,
        nestedData.width,
        150
    );
    const height = numericValue(
        node.measured?.height,
        node.height,
        node.style?.height,
        data.height,
        nestedData.height,
        58
    );

    return {
        id: String(node.id || ''),
        reactFlowType: node.type || '',
        title,
        summary,
        nodeType,
        status: String(pick(node, ['status'], data.manual ? 'needs_review' : 'ai_generated')),
        priority: textValue(pick(node, ['priority']), taskProjection.priority, checklistProjection.priority),
        owner: textValue(
            pick(node, ['owner_id', 'assignee', 'owner']),
            taskProjection.owner_id,
            checklistProjection.owner_id
        ),
        dueDate: textValue(
            pick(node, ['due_date', 'dueDate']),
            taskProjection.due_date,
            checklistProjection.due_date
        ),
        confidence: textValue(pick(node, ['confidence']), sourceRefs[0]?.confidence),
        reviewState: textValue(pick(node, ['review_state', 'reviewState'])),
        sourceRefs,
        tags: normalizeTextList(data.tags || nestedData.tags),
        entities: normalizeTextList(data.entities || nestedData.entities),
        artifactType: textValue(data.artifact_type, nestedData.artifact_type),
        generatedArtifacts,
        tableRows: asArray(data.df || nestedData.df),
        hidden:
            Boolean(node.hidden) ||
            Boolean(data.hidden) ||
            Boolean(data.hidden_from_export || nestedData.hidden_from_export),
        selected: Boolean(node.selected),
        position: {
            x: Number.isFinite(node.positionAbsolute?.x)
                ? node.positionAbsolute.x
                : Number.isFinite(node.position?.x)
                  ? node.position.x
                  : 0,
            y: Number.isFinite(node.positionAbsolute?.y)
                ? node.positionAbsolute.y
                : Number.isFinite(node.position?.y)
                  ? node.position.y
                  : 0
        },
        size: { width, height }
    };
};

export const normalizePdfExportEdge = (edge = {}) => ({
    ...edge,
    id: String(edge.id || `${edge.source || ''}-${edge.target || ''}`),
    source: String(edge.source || ''),
    target: String(edge.target || ''),
    relationshipType: relationshipTypeForEdge(edge),
    label: textValue(edge.label, edge.data?.label, edge.data?.condition, edge.metadata?.label),
    hidden: Boolean(edge.hidden)
});

export const projectVisibleGraph = ({ nodes = [], edges = [] } = {}) => {
    const normalizedNodes = asArray(nodes).map(normalizePdfExportNode).filter((node) => node.id);
    const visibleNodes = normalizedNodes.filter((node) => !node.hidden);
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
    const visibleEdges = asArray(edges)
        .map(normalizePdfExportEdge)
        .filter(
            (edge) =>
                !edge.hidden &&
                visibleNodeIds.has(edge.source) &&
                visibleNodeIds.has(edge.target)
        );

    return {
        nodes: visibleNodes,
        edges: visibleEdges,
        nodeLookup: new Map(visibleNodes.map((node) => [node.id, node]))
    };
};

export const buildHierarchyOutlineTree = ({ nodes = [], edges = [] } = {}) => {
    const graph = projectVisibleGraph({ nodes, edges });
    const childrenByParent = new Map();
    graph.edges.filter(isHierarchyEdge).forEach((edge) => {
        childrenByParent.set(edge.source, [...(childrenByParent.get(edge.source) || []), edge.target]);
    });

    const targetedIds = new Set();
    childrenByParent.forEach((childIds) => childIds.forEach((id) => targetedIds.add(id)));
    const roots = graph.nodes.filter((node) => !targetedIds.has(node.id));
    const sortedChildren = (ids = []) =>
        ids
            .map((id) => graph.nodeLookup.get(id))
            .filter(Boolean)
            .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

    const visit = (node, depth = 0, trail = new Set()) => {
        if (!node || trail.has(node.id)) {
            return null;
        }
        const nextTrail = new Set([...trail, node.id]);
        return {
            ...node,
            depth,
            children: sortedChildren(childrenByParent.get(node.id)).map((child) =>
                visit(child, depth + 1, nextTrail)
            ).filter(Boolean)
        };
    };

    const orderedRoots = roots.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    return orderedRoots.map((root) => visit(root, 0)).filter(Boolean);
};

export const flattenOutlineTree = (tree = []) => {
    const rows = [];
    const visit = (node, indexPath = []) => {
        const number = indexPath.join('.');
        rows.push({
            id: node.id,
            number,
            depth: node.depth || 0,
            title: node.title,
            summary: node.summary,
            nodeType: node.nodeType,
            status: node.status,
            sourceCount: node.sourceRefs?.length || 0
        });
        node.children.forEach((child, index) => visit(child, [...indexPath, index + 1]));
    };
    tree.forEach((root, index) => visit(root, [index + 1]));
    return rows;
};

export const projectOutlineRows = (workspaceData = {}) =>
    flattenOutlineTree(buildHierarchyOutlineTree(workspaceData));

export const projectTaskRows = (workspaceData = {}) => {
    const graph = projectVisibleGraph(workspaceData);
    return graph.nodes
        .filter((node) => TASK_TYPES.has(node.nodeType))
        .map((node) => ({
            id: node.id,
            title: node.title,
            summary: node.summary,
            status: node.status || 'needs_review',
            priority: node.priority,
            owner: node.owner,
            dueDate: node.dueDate,
            sourceCount: node.sourceRefs.length
        }));
};

const reviewReasonsForNode = (node) => {
    const reasons = [];
    if (node.status === 'needs_review' || node.nodeType === 'needs_review') {
        reasons.push('Needs review');
    }
    if (REVIEW_TYPES.has(node.nodeType)) {
        reasons.push(node.nodeType.replaceAll('_', ' '));
    }
    if (!node.summary && node.nodeType !== 'reference') {
        reasons.push('Missing summary');
    }
    if (!node.sourceRefs.length && node.reactFlowType !== 'question') {
        reasons.push('Missing source');
    }
    if (!node.confidence) {
        reasons.push('Missing confidence');
    }
    return Array.from(new Set(reasons));
};

export const projectReviewRows = (workspaceData = {}) => {
    const graph = projectVisibleGraph(workspaceData);
    return graph.nodes
        .map((node) => ({
            id: node.id,
            title: node.title,
            summary: node.summary,
            status: node.status,
            nodeType: node.nodeType,
            owner: node.owner,
            dueDate: node.dueDate,
            confidence: node.confidence,
            sourceCount: node.sourceRefs.length,
            reasons: reviewReasonsForNode(node)
        }))
        .filter((row) => row.reasons.length > 0);
};

export const normalizePdfExportArtifact = (artifact = {}, index = 0) => {
    const data = artifact.data && typeof artifact.data === 'object' ? artifact.data : artifact;
    const artifactType = textValue(data.artifact_type, data.artifactType, artifact.artifact_type, artifact.artifactType);
    const title = textValue(
        data.headline,
        data.title,
        data.label,
        artifact.title,
        artifact.label,
        `Artifact ${index + 1}`
    );
    return {
        id: textValue(data.id, data.artifact_id, artifact.id, `artifact-${index + 1}`),
        artifactType,
        title,
        label: textValue(data.label, artifact.label, artifactType),
        dek: textValue(data.dek, data.subhead, data.subtitle, data.summary),
        lede: textValue(data.lede, data.lead, data.intro, data.opening),
        issueLabel: textValue(data.issue_label, data.issueLabel, data.issue, data.date_label),
        cadence: textValue(data.cadence, data.frequency),
        audience: textValue(data.audience, data.metadata?.audience),
        openingNote: textValue(data.opening_note, data.openingNote, data.editor_note, data.intro, data.body),
        body: textValue(data.body, data.content, data.text, data.narrative),
        reviewState: textValue(data.review_state, data.reviewState, data.status, data.metadata?.review_state),
        confidence: textValue(data.confidence, data.metadata?.confidence),
        highlights: normalizeArtifactSections(data.highlights),
        sections: normalizeArtifactSections(data.sections || data.issue_sections || data.body_sections),
        upcoming: normalizeArtifactSections(data.upcoming),
        risks: normalizeArtifactSections(data.risks || data.risk_items),
        decisions: normalizeArtifactSections(data.decisions_needed || data.required_decisions),
        visualBlocks: normalizeArtifactSections(data.visual_blocks || data.visualBlocks),
        sourceBackedAppendix: normalizeArtifactSections(
            data.source_backed_appendix ||
                data.source_appendix ||
                data.appendix ||
                data.source_backed_facts ||
                data.verified_facts
        ),
        assumptions: normalizeTextList(data.assumptions || data.editor_notes),
        sourceRefs: asArray(data.source_refs || data.sourceRefs)
    };
};

export const projectAcceptedArtifacts = (artifacts = []) =>
    asArray(artifacts)
        .map(normalizePdfExportArtifact)
        .filter((artifact) => artifact.artifactType);

export const projectPdfExportData = ({
    nodes = [],
    edges = [],
    flowName = '',
    mapStyle = '',
    workspaceBrief = {},
    acceptedArtifacts = []
} = {}) => {
    const graph = projectVisibleGraph({ nodes, edges });
    const outlineTree = buildHierarchyOutlineTree({ nodes, edges });
    const outlineRows = flattenOutlineTree(outlineTree);
    const taskRows = projectTaskRows({ nodes, edges });
    const reviewRows = projectReviewRows({ nodes, edges });
    const artifacts = projectAcceptedArtifacts(acceptedArtifacts);
    const newsletterArtifacts = artifacts.filter((artifact) => artifact.artifactType === 'newsletter');

    return {
        flowName: flowName || workspaceBrief?.goal || 'Mind map export',
        mapStyle: String(mapStyle || ''),
        workspaceBrief: workspaceBrief || {},
        acceptedArtifacts: artifacts,
        newsletterArtifacts,
        nodes: graph.nodes,
        edges: graph.edges,
        nodeLookup: graph.nodeLookup,
        outlineTree,
        outlineRows,
        taskRows,
        reviewRows,
        stats: {
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
            taskCount: taskRows.length,
            reviewCount: reviewRows.length,
            artifactCount: artifacts.length,
            newsletterCount: newsletterArtifacts.length,
            sourceBackedCount: graph.nodes.filter((node) => node.sourceRefs.length > 0).length
        }
    };
};
