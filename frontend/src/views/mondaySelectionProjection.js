const MONDAY_CAPABLE_TYPES = new Set([
    'task',
    'procedure',
    'workflow',
    'needs_review',
    'requirement'
]);

const getNestedData = (node) => {
    const data = node?.data || {};
    return data.data && typeof data.data === 'object' ? data.data : {};
};

const firstValue = (node, keys, fallback = '') => {
    const data = node?.data || {};
    const nestedData = getNestedData(node);

    for (const key of keys) {
        const value = data[key] ?? nestedData[key];
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return fallback;
};

const getSourceRefs = (node) => {
    const data = node?.data || {};
    const nestedData = getNestedData(node);
    const refs = data.source_refs ?? nestedData.source_refs;

    return Array.isArray(refs) ? refs.filter(Boolean) : [];
};

const getLocalAcceptances = (node) => {
    const acceptances = node?.data?.local_preview_acceptances;

    return Array.isArray(acceptances)
        ? acceptances.filter((acceptance) => acceptance?.accepted)
        : [];
};

const latestAcceptanceByFlow = (acceptances) =>
    acceptances.reduce((flows, acceptance) => {
        flows[acceptance.flow] = acceptance;
        return flows;
    }, {});

const hasAcceptedFlow = (flows, flow) => Boolean(flows[flow]?.accepted);

const selectionReason = (nodeType, flows) => {
    const reasons = [];

    if (hasAcceptedFlow(flows, 'branch_to_task')) {
        reasons.push('accepted task preview');
    }
    if (MONDAY_CAPABLE_TYPES.has(nodeType)) {
        reasons.push('task-capable node');
    }
    if (hasAcceptedFlow(flows, 'branch_to_checklist')) {
        reasons.push('accepted checklist metadata');
    }
    if (hasAcceptedFlow(flows, 'source_reference_repair')) {
        reasons.push('accepted source repair');
    }

    return reasons;
};

const parentByChildFromEdges = (edges) =>
    edges.reduce((parents, edge) => {
        if (edge.source && edge.target && !parents.has(edge.target)) {
            parents.set(edge.target, edge.source);
        }
        return parents;
    }, new Map());

const titleByIdFromNodes = (nodes) =>
    nodes.reduce((titles, node) => {
        titles.set(
            node.id,
            firstValue(
                node,
                ['title', 'question', 'content', 'prompt', 'answer', 'summ'],
                node.type || node.id
            )
        );
        return titles;
    }, new Map());

const hierarchyForNode = (node, parentByChild, titleById, rootIds) => {
    const path = [];
    let currentId = node.id;
    let parentId = parentByChild.get(node.id) || '';

    while (currentId) {
        path.unshift({
            node_id: currentId,
            title: titleById.get(currentId) || currentId
        });
        currentId = parentByChild.get(currentId);
    }

    const branchRoot = path.find((entry) => rootIds.has(entry.node_id)) || path[0];
    const groupCandidate =
        path.find((entry) => entry.node_id !== branchRoot?.node_id) || branchRoot;

    return {
        parent_node_id: parentId,
        branch_root_node_id: branchRoot?.node_id || node.id,
        branch_root_title: branchRoot?.title || titleById.get(node.id) || node.id,
        group_key: groupCandidate?.node_id || node.id,
        group_title: groupCandidate?.title || titleById.get(node.id) || node.id,
        hierarchy_path: path
    };
};

const templateHintsForRow = ({ nodeType, flows, sourceRef, reasons }) => ({
    board_template: 'autodesk_building_block_review',
    item_kind: hasAcceptedFlow(flows, 'branch_to_checklist') ? 'checklist_item' : 'task',
    group_strategy: 'first_branch_child',
    requires_review:
        hasAcceptedFlow(flows, 'missing_information_review') ||
        hasAcceptedFlow(flows, 'sme_review_questions') ||
        !sourceRef.document_id ||
        nodeType === 'needs_review',
    source_status: sourceRef.document_id ? 'source_attached' : 'source_missing',
    selection_reasons: reasons
});

export const buildMondaySelectionInput = (nodes, projection) => {
    const branchIds = projection.branchIds || new Set(nodes.map((node) => node.id));
    const parentByChild = parentByChildFromEdges(projection.edges || []);
    const titleById = titleByIdFromNodes(nodes);
    const rootIds = new Set((projection.roots || []).map((root) => root.id));

    return nodes
        .filter((node) => branchIds.has(node.id))
        .map((node) => {
            const nodeType = firstValue(
                node,
                ['node_type', 'component_type', 'name'],
                node.type || 'concept'
            );
            const acceptances = getLocalAcceptances(node);
            const flows = latestAcceptanceByFlow(acceptances);
            const reasons = selectionReason(nodeType, flows);
            const sourceRefs = getSourceRefs(node);
            const sourceRef = sourceRefs[0] || {};
            const title = firstValue(
                node,
                ['title', 'question', 'content', 'prompt', 'answer', 'summ'],
                node.type || 'Untitled Node'
            );
            const status = firstValue(node, ['status'], 'ai_generated');
            const confidence =
                firstValue(node, ['confidence']) || sourceRef.confidence || '';
            const included =
                hasAcceptedFlow(flows, 'branch_to_task') ||
                (MONDAY_CAPABLE_TYPES.has(nodeType) && acceptances.length > 0);
            const hierarchy = hierarchyForNode(node, parentByChild, titleById, rootIds);
            const template_hints = templateHintsForRow({
                nodeType,
                flows,
                sourceRef,
                reasons
            });

            return {
                id: node.id,
                title,
                status,
                priority: firstValue(node, ['priority']),
                owner_id: firstValue(node, ['owner_id', 'assignee', 'owner']),
                due_date: firstValue(node, ['due_date']),
                confidence,
                node_type: nodeType,
                source_refs: sourceRefs,
                local_preview_acceptances: acceptances,
                accepted_flows: Object.keys(flows),
                checklist_projection: node.data?.checklist_projection || null,
                source_ref_repair: node.data?.source_ref_repair || null,
                sme_review_questions: node.data?.sme_review_questions || null,
                selection_reason: reasons,
                ...hierarchy,
                template_hints,
                included,
                monday_item_input: {
                    name: title,
                    node_id: node.id,
                    parent_node_id: hierarchy.parent_node_id,
                    branch_root_node_id: hierarchy.branch_root_node_id,
                    group_key: hierarchy.group_key,
                    group_title: hierarchy.group_title,
                    hierarchy_path: hierarchy.hierarchy_path,
                    status,
                    review_state: status,
                    priority: firstValue(node, ['priority']),
                    owner: firstValue(node, ['owner_id', 'assignee', 'owner']),
                    due_date: firstValue(node, ['due_date']),
                    confidence,
                    source_document: sourceRef.document_id || '',
                    source_page: sourceRef.page || '',
                    source_section: sourceRef.section || '',
                    source_quote: sourceRef.quote_snippet || '',
                    node_type: nodeType,
                    template_hints,
                    local_preview_acceptances: acceptances,
                    checklist_projection: node.data?.checklist_projection || null,
                    source_ref_repair: node.data?.source_ref_repair || null
                }
            };
        })
        .filter((row) => row.included || row.local_preview_acceptances.length > 0);
};

export const buildMondaySelectionManifest = ({
    projection,
    rows,
    selectedIds,
    selectedAt,
    selectedBranchId
}) => {
    const selectedRows = rows.filter((row) => selectedIds.has(row.id));
    const selectedRoot = selectedBranchId
        ? projection.nodes.find((node) => node.id === selectedBranchId)
        : undefined;
    const groupMap = selectedRows.reduce((groups, row) => {
        const group = groups.get(row.group_key) || {
            group_key: row.group_key,
            title: row.group_title,
            item_node_ids: []
        };
        group.item_node_ids.push(row.id);
        groups.set(row.group_key, group);
        return groups;
    }, new Map());

    return {
        selection_id: `monday-selection-${selectedAt.replace(/[^0-9a-z]/gi, '')}`,
        target: 'monday',
        source: 'accepted_local_preview_metadata',
        selected_at: selectedAt,
        scope: selectedBranchId ? 'branch' : 'workspace',
        root_node_id: selectedBranchId || '',
        root_title: selectedRoot?.title || 'Whole graph',
        item_count: selectedRows.length,
        selected_node_ids: selectedRows.map((row) => row.id),
        groups: Array.from(groupMap.values()),
        items: selectedRows.map((row) => row.monday_item_input)
    };
};
