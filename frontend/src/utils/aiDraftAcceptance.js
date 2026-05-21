import { createWorkspaceEdge, createWorkspaceNode, getChildPosition, reflowSiblingSubtrees } from './manualNodes.js';
import {
    AI_DRAFT_SESSION_CONTRACT_VERSION,
    getAIDraftSourceStatus,
    latestAIDraftRevision,
    normalizeAIDraftEdge
} from './aiDraftSessions.js';
import {
    buildAIDraftPreviewDiff,
    filterRelationshipsForAcceptedDraftNodes,
    selectedDraftNodes,
    selectedRelationshipDraftItems
} from './aiDraftPreviewDiff.js';
import { asArray, edgeSourceId, edgeTargetId, firstText, graphAfterReplacementRemoval } from './aiDraftSessionCommon.js';
import { normalizeAIDraftScope } from './aiDraftSessionScopes.js';

const HIERARCHY_RELATIONSHIP_TYPES = new Set([
    'contains',
    'child',
    'children',
    'has_child',
    'includes',
    'part_of',
    'subtopic',
    'parent',
    ''
]);

const isHierarchyDraftEdge = (edge = {}) => {
    const relationshipType = firstText(
        edge.relationship_type,
        edge.metadata?.relationship_type,
        'contains'
    ).toLowerCase();
    return HIERARCHY_RELATIONSHIP_TYPES.has(relationshipType);
};

const normalizeHierarchyRelationshipType = (edge = {}) =>
    isHierarchyDraftEdge(edge) ? 'contains' : firstText(edge.relationship_type, edge.metadata?.relationship_type, 'contains');

export const rejectAIDraftSession = (
    session = {},
    { rejectedAt = new Date().toISOString(), rejectedBy = 'user', reason = 'Rejected by user' } = {}
) => ({
    ...session,
    status: 'discarded',
    accept_history: asArray(session.accept_history),
    metadata: {
        ...(session.metadata || {}),
        ai_draft_session_contract_version: AI_DRAFT_SESSION_CONTRACT_VERSION,
        canonical: false,
        rejected_at: rejectedAt,
        rejected_by: rejectedBy,
        rejection_reason: reason
    }
});

export const acceptAIDraftSession = ({
    session = {},
    nodes = [],
    edges = [],
    mode = 'append',
    selectedItemIds = [],
    acceptedAt = new Date().toISOString()
} = {}) => {
    const revision = latestAIDraftRevision(session);
    const acceptedDrafts = selectedDraftNodes({ revision, mode, selectedItemIds });
    const acceptedDraftIds = new Set(acceptedDrafts.map((draft) => draft.id));
    const acceptedRelationships = filterRelationshipsForAcceptedDraftNodes({
        revision,
        relationshipItems: selectedRelationshipDraftItems({ revision, mode, selectedItemIds }),
        acceptedNodeIds: acceptedDraftIds
    });
    const baseGraph =
        mode === 'replace'
            ? graphAfterReplacementRemoval({ nodes, edges, scope: session.scope })
            : { nodes: asArray(nodes), edges: asArray(edges), removed_node_ids: [], removed_edge_ids: [] };
    const existingIds = new Set(baseGraph.nodes.map((node) => node.id));
    const normalizedDraftEdges = asArray(revision.draft_edges).map(normalizeAIDraftEdge);
    const hierarchyDraftEdges = normalizedDraftEdges.filter(isHierarchyDraftEdge);
    const relationshipDraftEdges = normalizedDraftEdges.filter((edge) => !isHierarchyDraftEdge(edge));
    const parentIdByDraftId = new Map(
        hierarchyDraftEdges
            .filter((edge) => edge.source_node_id && edge.target_node_id)
            .map((edge) => [edge.target_node_id, edge.source_node_id])
    );
    const generatedNodes = [];
    const workingHierarchyEdges = [...baseGraph.edges];
    if (mode !== 'notes_only') {
        acceptedDrafts.forEach((draft) => {
            if (existingIds.has(draft.id)) {
                return;
            }
            const node = createAcceptedNode({
                draft,
                session,
                revision,
                nodes: [...baseGraph.nodes, ...generatedNodes],
                edges: workingHierarchyEdges,
                parentId: parentIdByDraftId.get(draft.id)
            });
            generatedNodes.push(node);
            existingIds.add(node.id);
            const parentId = parentIdByDraftId.get(draft.id) || draft.parent_id || session.scope?.node_id || '';
            if (parentId) {
                workingHierarchyEdges.push({
                    id: `draft_position_edge_${parentId}_${node.id}`,
                    source: parentId,
                    target: node.id
                });
            }
        });
    }
    const generatedIds = new Set(generatedNodes.map((node) => node.id));
    const acceptedOrExistingIds = new Set([
        ...baseGraph.nodes.map((node) => node.id),
        ...generatedIds
    ]);
    const existingEdgeKeys = new Set(baseGraph.edges.map((edge) => `${edge.source}->${edge.target}`));
    const generatedHierarchyEdges =
        mode === 'notes_only'
            ? []
            : hierarchyDraftEdges
                  .filter((edge) => generatedIds.has(edge.target_node_id))
                  .filter((edge) => acceptedOrExistingIds.has(edge.source_node_id))
                  .map((edge) => {
                      const relationshipType = normalizeHierarchyRelationshipType(edge);
                      return {
                          ...createWorkspaceEdge(edge.source_node_id, edge.target_node_id, {
                          id: edge.id,
                          animated: true
                          }),
                          relationship_type: relationshipType,
                          metadata: {
                              ...(edge.metadata || {}),
                              relationship_type: relationshipType,
                              source: firstText(edge.metadata?.source, 'ai_draft_hierarchy')
                          },
                          data: {
                              relationship_type: relationshipType,
                              source: firstText(edge.metadata?.source, 'ai_draft_hierarchy')
                          }
                      };
                  })
                  .filter((edge) => {
                      const key = `${edge.source}->${edge.target}`;
                      if (existingEdgeKeys.has(key)) {
                          return false;
                      }
                      existingEdgeKeys.add(key);
                      return true;
                  });
    const generatedRelationshipEdges =
        mode === 'notes_only'
            ? []
            : [
                  ...acceptedRelationships.map((item) => ({
                      id: item.id,
                      source_node_id: item.metadata?.source_node_id,
                      target_node_id: item.metadata?.target_node_id,
                      relationship_type: firstText(item.metadata?.relationship_type, item.relationship_type, 'related_to'),
                      source_refs: asArray(item.source_refs),
                      confidence: item.confidence,
                      status: item.status,
                      content: item.content,
                      metadata: item.metadata || {}
                  })),
                  ...relationshipDraftEdges.map((edge) => ({
                      id: edge.id,
                      source_node_id: edge.source_node_id,
                      target_node_id: edge.target_node_id,
                      relationship_type: edge.relationship_type,
                      source_refs: [],
                      metadata: edge.metadata || {}
                  }))
              ]
                  .map((item) => {
                      const metadata = item.metadata || {};
                      const relationshipType = firstText(metadata.relationship_type, item.relationship_type, 'related_to');
                      return {
                          id: firstText(metadata.relationship_edge_id, metadata.edge_id, item.id),
                          source: firstText(metadata.source_node_id, item.source_node_id),
                          target: firstText(metadata.target_node_id, item.target_node_id),
                          type: 'smoothstep',
                          animated: false,
                          relationship_type: relationshipType,
                          source_refs: asArray(item.source_refs),
                          metadata: {
                              ...metadata,
                              source: metadata.source || 'ai_draft_relationship',
                              confidence: item.confidence ?? metadata.confidence ?? '',
                              rationale: firstText(metadata.rationale, item.content),
                              review_state: firstText(item.status, metadata.review_state, 'needs_review')
                          },
                          data: {
                              relationship_type: relationshipType,
                              confidence: item.confidence ?? metadata.confidence ?? '',
                              rationale: firstText(metadata.rationale, item.content),
                              review_state: firstText(item.status, metadata.review_state, 'needs_review')
                          }
                      };
                  })
                  .filter((edge) => edge.source && edge.target)
                  .filter((edge) => acceptedOrExistingIds.has(edge.source) && acceptedOrExistingIds.has(edge.target))
                  .filter((edge) => {
                      const key = `${edge.source}->${edge.target}->${edge.relationship_type}`;
                      if (existingEdgeKeys.has(key)) {
                          return false;
                      }
                      existingEdgeKeys.add(key);
                      return true;
                  });
    const generatedEdges = [...generatedHierarchyEdges, ...generatedRelationshipEdges];
    const nextEdges = [...baseGraph.edges, ...generatedEdges];
    const normalizedScope = normalizeAIDraftScope(session.scope);
    const existingNodeIds = new Set(baseGraph.nodes.map((node) => node.id));
    const reflowedExistingSources = new Set();
    const internallyReseatedNodes = generatedHierarchyEdges.reduce((nextNodes, edge) => {
        const sourceId = edgeSourceId(edge);
        if (!sourceId || !existingNodeIds.has(sourceId) || reflowedExistingSources.has(sourceId)) {
            return nextNodes;
        }
        const parentId = edgeSourceId(nextEdges.find((candidate) => edgeTargetId(candidate) === sourceId));
        if (!parentId) {
            return nextNodes;
        }
        reflowedExistingSources.add(sourceId);
        return reflowSiblingSubtrees({
            nodes: nextNodes,
            edges: nextEdges,
            parentId,
            anchorNodeId: sourceId
        });
    }, [...baseGraph.nodes, ...generatedNodes]);
    const scopeParentId =
        ['branch', 'node'].includes(normalizedScope.type) && normalizedScope.node_id
            ? edgeSourceId(nextEdges.find((edge) => edgeTargetId(edge) === normalizedScope.node_id))
            : '';
    const reseatedNodes = scopeParentId
        ? reflowSiblingSubtrees({
              nodes: internallyReseatedNodes,
              edges: nextEdges,
              parentId: scopeParentId,
              anchorNodeId: normalizedScope.node_id
          })
        : internallyReseatedNodes;
    const nextNodes = attachDraftNotes({
        nodes: reseatedNodes,
        session,
        revision,
        mode,
        acceptedAt
    });
    const previewDiff = buildAIDraftPreviewDiff(session, {
        mode,
        selectedItemIds,
        currentNodes: nodes,
        currentEdges: edges
    });
    const undo = {
        kind: 'react_flow_snapshot',
        before_graph: {
            nodes: structuredClone(asArray(nodes)),
            edges: structuredClone(asArray(edges))
        }
    };
    const acceptedArtifacts = acceptedArtifactsForRevision({ revision, session, mode, selectedItemIds, acceptedAt });
    const acceptMetadata = {
        ai_draft_session_contract_version: AI_DRAFT_SESSION_CONTRACT_VERSION,
        undo_kind: undo.kind,
        accepted_artifact_ids: acceptedArtifacts.map((artifact) => artifact.id)
    };
    const acceptHistoryEntry = {
        session_id: session.session_id,
        revision_id: revision.revision_id,
        mode,
        selected_item_ids: asArray(selectedItemIds),
        accepted_node_ids: [...generatedIds],
        accepted_edge_ids: generatedEdges.map((edge) => edge.id),
        accepted_artifacts: acceptedArtifacts,
        preview_diff: previewDiff,
        undo,
        accepted_at: acceptedAt,
        metadata: acceptMetadata
    };
    const acceptedSession = {
        ...session,
        status: 'accepted',
        accept_history: [
            ...asArray(session.accept_history),
            acceptHistoryEntry
        ]
    };

    return {
        nodes: nextNodes,
        edges: nextEdges,
        session: acceptedSession,
        accept_result: {
            session_id: session.session_id,
            revision_id: revision.revision_id,
            mode,
            accepted_node_ids: [...generatedIds],
            accepted_edge_ids: generatedEdges.map((edge) => edge.id),
            accepted_artifacts: acceptedArtifacts,
            preview_diff: previewDiff,
            patch_operations: [
                ...baseGraph.removed_edge_ids.map((edgeId) => ({
                    op: 'remove_edge',
                    edge_id: edgeId,
                    metadata: { mode: 'replace' }
                })),
                ...baseGraph.removed_node_ids.map((nodeId) => ({
                    op: 'remove_node',
                    node_id: nodeId,
                    metadata: {
                        mode: 'replace',
                        scope_node_id: session.scope?.node_id || ''
                    }
                }))
            ],
            undo,
            metadata: acceptMetadata,
            canonical_graph_mutated: mode !== 'notes_only'
        }
    };
};

const acceptedArtifactsForRevision = ({ revision = {}, session = {}, mode = 'append', selectedItemIds = [], acceptedAt } = {}) => {
    if (mode === 'notes_only') {
        return [];
    }
    const artifacts = asArray(revision.generated_artifacts);
    if (mode !== 'selected') {
        return artifacts.map((artifact, index) =>
            artifactWithAcceptContext({ artifact, index, revision, session, acceptedAt })
        );
    }
    const selected = new Set(asArray(selectedItemIds));
    if (!selected.size) {
        return [];
    }
    const selectedArtifactIds = new Set();
    const selectedPackageItemIds = new Set([...selected]);
    selected.forEach((id) => {
        if (String(id).startsWith('item_')) {
            selectedPackageItemIds.add(String(id).slice(5));
        }
    });
    asArray(revision.draft_items).forEach((item) => {
        if (!selected.has(item.id)) {
            return;
        }
        const artifactId = firstText(item.metadata?.artifact_id, item.metadata?.package_id, item.artifact_id);
        if (artifactId) {
            selectedArtifactIds.add(artifactId);
        }
        [
            item.metadata?.package_item_id,
            item.metadata?.acceptance_group_id
        ].forEach((id) => {
            if (id) {
                selectedPackageItemIds.add(id);
            }
        });
        [
            item.metadata?.package_item_ids,
            item.metadata?.required_sibling_ids,
            item.metadata?.required_siblings,
            item.metadata?.dependency_item_ids,
            item.metadata?.depends_on_item_ids,
            item.metadata?.dependency_link_ids
        ].forEach((ids) => {
            asArray(ids).forEach((id) => selectedPackageItemIds.add(id));
        });
    });
    return artifacts
        .flatMap((artifact) => {
            const artifactId = firstText(artifact.id, artifact.artifact_id, artifact.data?.package_id);
            if (artifact.artifact_type === 'connected_picture_package') {
                const filtered = filterConnectedPackageArtifact(artifact, selectedPackageItemIds);
                return filtered ? [filtered] : [];
            }
            return selected.has(artifactId) || selected.has(`item_${artifactId}`) || selectedArtifactIds.has(artifactId)
                ? [artifact]
                : [];
        })
        .map((artifact, index) => artifactWithAcceptContext({ artifact, index, revision, session, acceptedAt }));
};

const packagePayload = (artifact = {}) =>
    artifact.data && typeof artifact.data === 'object' && (artifact.data.package_id || artifact.data.acceptance_groups)
        ? artifact.data
        : artifact;

const packageCollection = (packageData = {}, key = '') =>
    asArray(packageData[key]).filter((item) => item && typeof item === 'object');

const packageItemIds = (item = {}) =>
    new Set(
        [item.package_item_id, item.metadata?.package_item_id, item.id, item.node_id]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
    );

const packageRequiredIds = (item = {}) => {
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const ids = new Set();
    [
        item.required_sibling_ids,
        item.required_siblings,
        item.dependency_item_ids,
        item.depends_on_item_ids,
        item.dependency_link_ids,
        metadata.required_sibling_ids,
        metadata.required_siblings,
        metadata.dependency_item_ids,
        metadata.depends_on_item_ids,
        metadata.dependency_link_ids
    ].forEach((values) => asArray(values).forEach((id) => ids.add(id)));
    asArray(item.dependency_links || metadata.dependency_links).forEach((link) => {
        if (typeof link === 'string') {
            ids.add(link);
        } else if (link && typeof link === 'object') {
            [link.target_id, link.target_item_id, link.source_id, link.source_item_id]
                .filter(Boolean)
                .forEach((id) => ids.add(id));
        }
    });
    return ids;
};

const filterConnectedPackageArtifact = (artifact = {}, selectedPackageItemIds = new Set()) => {
    const packageData = packagePayload(artifact);
    const artifactId = firstText(artifact.id, artifact.artifact_id);
    const packageId = firstText(packageData.package_id, artifactId);
    if (
        selectedPackageItemIds.has(artifactId) ||
        selectedPackageItemIds.has(packageId) ||
        selectedPackageItemIds.has(`item_${artifactId}`) ||
        selectedPackageItemIds.has(`item_${packageId}`)
    ) {
        return artifact;
    }

    const nextSelected = new Set(selectedPackageItemIds);
    packageCollection(packageData, 'acceptance_groups').forEach((group) => {
        if (![...packageItemIds(group)].some((id) => nextSelected.has(id))) {
            return;
        }
        asArray(group.item_ids).forEach((id) => nextSelected.add(id));
        packageRequiredIds(group).forEach((id) => nextSelected.add(id));
    });

    const collections = [
        'primary_nodes',
        'relationship_edges',
        'view_lenses',
        'structured_evidence',
        'evidence_links',
        'tasks',
        'risks',
        'decisions',
        'repair_targets'
    ];
    const itemById = new Map();
    collections.forEach((key) => {
        packageCollection(packageData, key).forEach((item) => {
            packageItemIds(item).forEach((id) => itemById.set(id, item));
        });
    });
    const queue = [...nextSelected];
    while (queue.length) {
        const id = queue.pop();
        packageRequiredIds(itemById.get(id) || {}).forEach((requiredId) => {
            if (!nextSelected.has(requiredId)) {
                nextSelected.add(requiredId);
                queue.push(requiredId);
            }
        });
    }

    const nextPackage = { ...packageData };
    collections.forEach((key) => {
        nextPackage[key] = packageCollection(packageData, key).filter((item) =>
            [...packageItemIds(item)].some((id) => nextSelected.has(id))
        );
    });
    const primaryIds = new Set(nextPackage.primary_nodes.flatMap((item) => [...packageItemIds(item)]));
    nextPackage.relationship_edges = nextPackage.relationship_edges.filter((edge) =>
        edge.source_package_item_id || edge.target_package_item_id
            ? primaryIds.has(edge.source_package_item_id) && primaryIds.has(edge.target_package_item_id)
            : firstText(edge.source_node_id) && firstText(edge.target_node_id)
    );
    const edgeIds = new Set(nextPackage.relationship_edges.flatMap((item) => [...packageItemIds(item)]));
    const evidenceIds = new Set(nextPackage.structured_evidence.flatMap((item) => [...packageItemIds(item)]));
    const allowedTargets = new Set([
        ...primaryIds,
        ...edgeIds,
        ...nextPackage.tasks.flatMap((item) => [...packageItemIds(item)]),
        ...nextPackage.risks.flatMap((item) => [...packageItemIds(item)]),
        ...nextPackage.decisions.flatMap((item) => [...packageItemIds(item)]),
        ...nextPackage.repair_targets.flatMap((item) => [...packageItemIds(item)])
    ]);
    nextPackage.evidence_links = nextPackage.evidence_links.filter(
        (link) =>
            evidenceIds.has(link.source_evidence_id) &&
            (allowedTargets.has(link.target_package_item_id) || allowedTargets.has(link.target_id))
    );
    nextPackage.view_lenses = nextPackage.view_lenses
        .map((lens) => ({
            ...lens,
            node_ids: asArray(lens.node_ids).filter((id) => primaryIds.has(id)),
            edge_ids: asArray(lens.edge_ids).filter((id) => edgeIds.has(id))
        }))
        .filter((lens) => lens.node_ids.length || lens.edge_ids.length || (!asArray(lens.node_ids).length && !asArray(lens.edge_ids).length));
    nextPackage.acceptance_groups = packageCollection(packageData, 'acceptance_groups')
        .map((group) => ({
            ...group,
            item_ids: asArray(group.item_ids).filter((id) => allowedTargets.has(id) || evidenceIds.has(id))
        }))
        .filter((group) => group.item_ids.length);
    return collections.some((key) => asArray(nextPackage[key]).length)
        ? { ...artifact, data: nextPackage }
        : null;
};

const artifactWithAcceptContext = ({ artifact = {}, index = 0, revision = {}, session = {}, acceptedAt }) => {
    const artifactType = firstText(artifact.artifact_type, artifact.type, 'artifact');
    const artifactId = firstText(artifact.id, artifact.artifact_id, artifact.data?.package_id, `${artifactType}-${index + 1}`);
    return {
        ...structuredClone(artifact),
        id: artifactId,
        artifact_type: artifactType,
        metadata: {
            ...(artifact.metadata || {}),
            ai_draft_session_id: session.session_id,
            ai_draft_revision_id: revision.revision_id,
            ai_draft_intent: session.intent,
            ai_draft_role: session.role,
            accepted_at: acceptedAt,
            accepted_by: 'user'
        },
        provenance: {
            ...(artifact.provenance || {}),
            ai_draft_session_id: session.session_id,
            ai_draft_revision_id: revision.revision_id,
            accepted_at: acceptedAt,
            accepted_by: 'user'
        }
    };
};

const createAcceptedNode = ({ draft, session, revision, nodes, edges, parentId }) => {
    const preferredParentId = parentId || draft.parent_id || session.scope?.node_id || '';
    const resolvedParentId = nodes.some((node) => node.id === preferredParentId)
        ? preferredParentId
        : session.scope?.node_id || '';
    const sourceRefs = asArray(draft.source_refs);
    const sourceStatus = getAIDraftSourceStatus(draft);
    const position = resolvedParentId ? getChildPosition(nodes, edges, resolvedParentId) : undefined;
    const assumption =
        draft.assumption ?? draft.metadata?.assumption ?? draft.metadata?.assumptions ?? false;
    const confidence = draft.confidence ?? draft.metadata?.confidence ?? '';
    const duplicate = draft.duplicate ?? draft.metadata?.duplicate ?? draft.metadata?.duplicate_of ?? '';
    const conflict = draft.conflict ?? draft.metadata?.conflict ?? draft.metadata?.conflicts ?? '';
    const status =
        draft.node_type !== 'reference' && sourceRefs.length === 0
            ? 'needs_review'
            : draft.status || 'ai_generated';

    const node = createWorkspaceNode({
        id: draft.id,
        title: draft.title,
        body: draft.summary || draft.body,
        nodeType: draft.node_type,
        status,
        df: draft.df,
        graph: draft.graph,
        query: draft.query,
        sourceRefs,
        artifactType: draft.artifact_type,
        artifactIds: draft.artifact_ids,
        reviewState: draft.review_state,
        generatedArtifacts: draft.generated_artifacts,
        position: position || { x: nodes.length * 320, y: nodes.length * 120 },
        metadata: {
            ...(draft.metadata || {}),
            source_status: sourceStatus.id,
            source_required: sourceStatus.source_required,
            reviewable_unsourced: sourceStatus.reviewable && sourceRefs.length === 0
        },
        display: draft.display || {}
    });
    const provenance = {
            ...(draft.metadata || {}),
            source: 'ai_draft_session',
            source_status: sourceStatus.id,
            source_status_label: sourceStatus.label,
            source_required: sourceStatus.source_required,
            reviewable_unsourced: sourceStatus.reviewable && sourceRefs.length === 0,
            ai_draft_session_id: session.session_id,
            ai_draft_revision_id: revision.revision_id,
            ai_draft_intent: session.intent,
            ai_draft_role: session.role
    };
    return {
        ...node,
        data: {
            ...node.data,
            assumption,
            confidence,
            duplicate,
            conflict,
            metadata: provenance,
            ai_draft_session_id: session.session_id,
            ai_draft_revision_id: revision.revision_id,
            data: {
                ...node.data.data,
                assumption,
                confidence,
                duplicate,
                conflict,
                metadata: provenance
            }
        }
    };
};

const attachDraftNotes = ({ nodes = [], session = {}, revision = {}, mode, acceptedAt }) => {
    const annotations = asArray(revision.draft_annotations);
    if (annotations.length === 0 && mode !== 'notes_only') {
        return nodes;
    }
    const targetId = session.scope?.node_id || nodes[0]?.id;
    return nodes.map((node) =>
        node.id === targetId
            ? {
                  ...node,
                  data: {
                      ...(node.data || {}),
                      ai_draft_outputs: [
                          ...asArray(node.data?.ai_draft_outputs),
                          {
                              session_id: session.session_id,
                              revision_id: revision.revision_id,
                              mode,
                              accepted_at: acceptedAt,
                              outputs: annotations
                          }
                      ]
                  }
              }
            : node
    );
};
