import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from structured_data import build_structured_data_artifacts
from ai_helpers import normalize_requested_artifact_types, validate_generated_artifacts


def test_build_structured_data_artifacts_preserves_query_table_and_chart_refs():
    payload = build_structured_data_artifacts(
        source_type="sql",
        source_id="component-1",
        question="Which tools overlap?",
        table_name="software_inventory",
        sql="SELECT tool, licenses FROM software_inventory",
        rows=[{"tool": "Bluebeam", "licenses": 12}],
        summary="Bluebeam appears in the inventory.",
        chart_json='{"data":[{"type":"bar"}],"layout":{"title":"Licenses"}}',
    )

    assert payload["node_type"] == "artifact"
    assert payload["artifact_type"] == "structured_data_analysis"
    assert payload["review_state"] == "source_backed"
    assert payload["metadata"]["domain"] == "structured_data"
    assert payload["metadata"]["row_count"] == 1
    assert payload["metadata"]["columns"] == ["tool", "licenses"]
    assert payload["artifact_ids"]

    source_types = {ref["source_type"] for ref in payload["source_refs"]}
    assert source_types == {"data_table", "sql_query"}
    assert all(ref["query_id"] == payload["metadata"]["query_id"] for ref in payload["source_refs"])

    artifacts_by_type = {artifact["artifact_type"]: artifact for artifact in payload["generated_artifacts"]}
    assert {"sql_query", "data_table", "chart", "data_summary"} <= set(artifacts_by_type)
    assert artifacts_by_type["data_table"]["data"]["rows"] == [
        {"tool": "Bluebeam", "licenses": 12}
    ]
    assert artifacts_by_type["chart"]["data"]["chart_spec"]["data"][0]["type"] == "bar"
    assert artifacts_by_type["chart"]["data"]["data_rows"] == [
        {"tool": "Bluebeam", "licenses": 12}
    ]
    validated = validate_generated_artifacts(
        payload["generated_artifacts"],
        scope={},
        model_provider="deterministic",
        model="structured-data",
        ai_role="data_table_interpreter",
        prompt_profile="structured_data",
        input_source_refs=payload["source_refs"],
    )
    assert [artifact["artifact_type"] for artifact in validated] == [
        "sql_query",
        "data_table",
        "chart",
        "data_summary",
    ]


def test_structured_data_artifact_types_are_registered_for_ai_outputs():
    assert normalize_requested_artifact_types(
        ["sql_query", "data_table", "data_summary", "data_insight"]
    ) == ["sql_query", "data_table", "data_summary", "data_insight"]
