from structured_data import build_structured_data_artifacts


def test_build_structured_data_artifacts_carries_query_table_chart_and_summary_refs():
    payload = build_structured_data_artifacts(
        source_type="csv",
        source_id="component-1",
        question="Which items are open?",
        table_name="csv_component_1",
        sql="select id, status from csv_component_1 where status = 'open'",
        rows=[
            {"id": "A-1", "status": "open"},
            {"id": "A-2", "status": "open"},
        ],
        summary="Two open items.",
        chart_json={"data": [], "layout": {"title": "Open items"}},
    )

    assert payload["node_type"] == "artifact"
    assert payload["artifact_type"] == "structured_data_analysis"
    assert payload["metadata"]["row_count"] == 2
    assert payload["metadata"]["columns"] == ["id", "status"]
    assert payload["source_refs"][0]["source_type"] == "data_table"
    assert payload["source_refs"][0]["row_ids"] == ["A-1", "A-2"]
    assert payload["source_refs"][1]["source_type"] == "sql_query"

    artifacts_by_type = {
        artifact["artifact_type"]: artifact for artifact in payload["generated_artifacts"]
    }
    assert {"sql_query", "data_table", "chart", "data_summary"} <= set(artifacts_by_type)
    assert artifacts_by_type["data_table"]["data"]["row_count"] == 2
    assert artifacts_by_type["chart"]["data"]["chart_library"] == "plotly"
    assert artifacts_by_type["data_summary"]["data"]["summary"] == "Two open items."


def test_build_structured_data_artifacts_marks_empty_unsourced_results_for_review():
    payload = build_structured_data_artifacts(
        source_type="csv",
        source_id="component-1",
        question="Show missing rows",
        rows=[],
    )

    assert payload["metadata"]["review_state"] == "needs_review"
    assert payload["source_refs"][0]["confidence"] == 0.58
    assert payload["generated_artifacts"][1]["review_state"] == "needs_review"
