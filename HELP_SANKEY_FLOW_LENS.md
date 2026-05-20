# Help: Test The Sankey Flow Lens

## Fast Path From A New Workspace

1. Create or open a workspace.
2. On the empty canvas, choose **Guided starts**.
3. Choose the **Sankey flow lens** starter. Keep visual output set to
   **Chart**.
4. Generate the draft.
5. Review the draft before accepting it.
6. Accept the structured evidence or chart artifact.
7. Open **Outputs / Table**. The Flow lens appears when accepted rows include source, target, and value.

## What To Ask

Use query-style language that names what moves from one thing to another:

- Show source document to accepted finding flow.
- Show owner to status task flow.
- Show risk to control coverage flow.
- Show system to process dependency flow.
- Show department to deliverable effort flow.
- Turn this CSV or query result into source, target, value rows for a Sankey chart.

## Minimum Data Shape

Sankey needs three fields:

- `source`: where the path starts.
- `target`: where the path goes.
- `value`: the weight, count, effort, cost, risk score, confidence, or other metric.

Optional fields make the review better:

- `metric`
- `stage` or `group`
- `status`
- `owner`
- `confidence`
- `review_state`
- `source_refs`
- `notes`

## Test Prompt

Paste this into Ask AI when you want to test manually:

```text
Create a source-backed Sankey flow lens from this workspace or source context. Return structured rows with source, target, value, metric, stage or group, notes, confidence, review_state, and source_refs. Use a count metric when no explicit numeric value exists, and mark inferred or prompt-only paths needs_review. Also include a Plotly-compatible chart artifact with chart_type=sankey when source/target/value rows exist. Focus the answer on what is flowing from where to where, which paths carry the most weight, and which paths need review before acceptance.
```

## If Nothing Appears

The Flow lens is intentionally hidden until the accepted model has eligible rows. Check:

- Did you accept the draft or only preview it?
- Do accepted rows have source, target, and value?
- Is value numeric or countable?
- Did the chart artifact use `chart_type=sankey`?
- Are inferred paths still marked `needs_review`?

Width means the selected metric, not truth. Unsupported paths should remain reviewable.
