import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_WORKSPACE_TEMPLATES } from '../src/utils/demoWorkspaces.js';

test('demo workspace templates include Ask AI graph and flowchart robustness seeds', () => {
    const templatesById = new Map(DEMO_WORKSPACE_TEMPLATES.map((template) => [template.id, template]));

    assert.ok(templatesById.has('ask-ai-knowledge-graph'));
    assert.ok(templatesById.has('ask-ai-flowchart'));
    assert.ok(templatesById.has('aec-sow-deliverables'));

    const aecSnapshot = templatesById.get('aec-sow-deliverables').buildSnapshot();
    const aecRelationships = aecSnapshot.edges.map((edge) => edge.data.relationship_type);
    const aecNodeTypes = aecSnapshot.nodes.map((node) => node.data.node_type);

    assert.ok(aecSnapshot.nodes.length >= 8);
    assert.ok(aecSnapshot.workspace_brief.desired_outputs.includes('knowledge_graph'));
    assert.ok(aecSnapshot.workspace_brief.desired_outputs.includes('tasks'));
    assert.ok(aecSnapshot.workspace_brief.expected_artifacts.includes('monday.com handoff tasks'));
    assert.ok(aecNodeTypes.includes('discipline_scope'));
    assert.ok(aecNodeTypes.includes('missing_info'));
    assert.ok(aecNodeTypes.includes('handoff'));
    assert.ok(aecRelationships.includes('blocked_by'));
    assert.ok(aecRelationships.includes('depends_on'));

    const graphSnapshot = templatesById.get('ask-ai-knowledge-graph').buildSnapshot();
    const graphRelationships = graphSnapshot.edges.map((edge) => edge.data.relationship_type);

    assert.ok(graphSnapshot.nodes.length >= 8);
    assert.ok(graphRelationships.includes('conflicts_with'));
    assert.ok(graphRelationships.includes('improves'));
    assert.ok(graphSnapshot.workspace_brief.desired_outputs.includes('knowledge_graph'));

    const flowchartSnapshot = templatesById.get('ask-ai-flowchart').buildSnapshot();
    const flowchartRelationships = flowchartSnapshot.edges.map((edge) => edge.data.relationship_type);

    assert.ok(flowchartSnapshot.nodes.length >= 10);
    assert.ok(flowchartRelationships.includes('loops_to'));
    assert.ok(flowchartSnapshot.workspace_brief.desired_outputs.includes('flow_chart'));
});
