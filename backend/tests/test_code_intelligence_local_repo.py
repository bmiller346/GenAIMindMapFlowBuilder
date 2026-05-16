import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from code_intelligence import (
    CODE_INTELLIGENCE_RELATIONSHIP_TYPES,
    CodeIntelligenceCapabilityError,
    code_intelligence_capability_contract,
    resolve_allowed_local_repo_root,
    scan_local_repo,
)


def test_scan_local_repo_builds_source_cited_code_graph(tmp_path):
    (tmp_path / "app.py").write_text(
        "\n".join(
            [
                "import json",
                "",
                "def public_handler(event):",
                "    return json.dumps(event)",
                "",
                "def _private_helper():",
                "    return True",
            ]
        ),
        encoding="utf-8",
    )
    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_app.py").write_text(
        "from app import public_handler\n\n\ndef test_public_handler():\n    assert public_handler({})\n",
        encoding="utf-8",
    )

    graph = scan_local_repo(tmp_path, repo_label="sample/repo")

    assert graph["artifact_type"] == "code_knowledge_graph"
    assert graph["metadata"]["visibility"] == "hidden_capability"
    assert graph["metadata"]["deterministic"] is True
    assert graph["metadata"]["ai_interpretation"] is False
    assert graph["metadata"]["capability_contract"]["capabilities"]["code_intelligence"]["enabled"] is False
    assert graph["source_documents"]
    assert graph["document_chunks"]

    nodes_by_title = {node["title"]: node for node in graph["nodes"]}
    assert nodes_by_title["sample/repo"]["node_type"] == "repo"
    assert nodes_by_title["sample/repo"]["metadata"]["visibility"]["default_hidden"] is True
    assert nodes_by_title["app.py"]["source_refs"][0]["line_start"] == 1
    assert nodes_by_title["app.py"]["source_refs"][0]["language"] == "python"
    assert nodes_by_title["public_handler"]["source_refs"][0]["line_start"] == 3
    assert nodes_by_title["public_handler"]["source_refs"][0]["chunk_id"].startswith("code_chk_")
    assert nodes_by_title["public_handler"]["source_refs"][0]["source_type"] == "local_code_file"
    assert any(chunk["heading"] == "public_handler" for chunk in graph["document_chunks"])

    relationships = {edge["relationship_type"] for edge in graph["edges"]}
    assert {"contains", "uses_dependency", "tested_by"} <= relationships
    assert relationships <= CODE_INTELLIGENCE_RELATIONSHIP_TYPES
    assert not graph["reports"]["test_gap_report"]


def test_scan_local_repo_ignores_generated_and_secret_files(tmp_path):
    (tmp_path / "main.py").write_text("def run():\n    return True\n", encoding="utf-8")
    (tmp_path / ".env").write_text("SECRET=do-not-ingest\n", encoding="utf-8")
    (tmp_path / ".env.production").write_text("SECRET=do-not-ingest-prod\n", encoding="utf-8")
    (tmp_path / "id_ed25519").write_text("PRIVATE=do-not-ingest-key\n", encoding="utf-8")
    (tmp_path / "deploy.key").write_text("PRIVATE=do-not-ingest-deploy\n", encoding="utf-8")
    (tmp_path / "credentials.json").write_text('{"client_secret":"do-not-ingest-json"}\n', encoding="utf-8")
    (tmp_path / "config.json").write_text('{"client_secret":"do-not-ingest-config"}\n', encoding="utf-8")
    ignored_dir = tmp_path / "node_modules"
    ignored_dir.mkdir()
    (ignored_dir / "package.js").write_text("export const secret = true;\n", encoding="utf-8")

    graph = scan_local_repo(tmp_path)

    paths = {entry["path"] for entry in graph["files"]}
    assert "main.py" in paths
    assert ".env" not in paths
    assert ".env.production" not in paths
    assert "id_ed25519" not in paths
    assert "deploy.key" not in paths
    assert "credentials.json" not in paths
    assert "config.json" not in paths
    assert "node_modules/package.js" not in paths

    serialized = str(graph)
    assert "do-not-ingest" not in serialized


def test_scan_local_repo_honors_max_files_budget(tmp_path):
    for index in range(4):
        (tmp_path / f"module_{index}.py").write_text(
            f"def run_{index}():\n    return {index}\n",
            encoding="utf-8",
        )

    graph = scan_local_repo(tmp_path, max_files=2)

    assert len(graph["files"]) == 2
    assert graph["metadata"]["scan_budget"]["max_files"] == 2
    assert graph["metadata"]["skipped_files"]["by_reason"]["max_files_reached"] == 2
    assert graph["repo"]["skipped_file_count"] == graph["metadata"]["skipped_files"]["total"]


def test_scan_local_repo_reports_missing_tests_and_docs(tmp_path):
    (tmp_path / "service.py").write_text(
        "\n".join(
            [
                "def build_payload(value):",
                "    return {'value': value}",
                "",
                "class PublicService:",
                "    def execute(self):",
                "        return build_payload('ok')",
            ]
        ),
        encoding="utf-8",
    )

    graph = scan_local_repo(tmp_path)

    test_gap_titles = {finding["title"] for finding in graph["reports"]["test_gap_report"]}
    doc_gap_summaries = [finding["summary"] for finding in graph["reports"]["documentation_gap_report"]]

    assert "Source file has no nearby test" in test_gap_titles
    assert any("build_payload" in summary for summary in doc_gap_summaries)
    assert any("PublicService" in summary for summary in doc_gap_summaries)
    assert all(finding["review_state"] == "source_backed" for finding in graph["findings"])


def test_scan_local_repo_resolves_local_imports_and_external_dependencies(tmp_path):
    (tmp_path / "app.py").write_text(
        "import json\nfrom services.worker import run_job\n\n\ndef handler():\n    return run_job()\n",
        encoding="utf-8",
    )
    services_dir = tmp_path / "services"
    services_dir.mkdir()
    (services_dir / "worker.py").write_text("def run_job():\n    return {'ok': True}\n", encoding="utf-8")

    graph = scan_local_repo(tmp_path)

    nodes_by_title = {node["title"]: node for node in graph["nodes"]}
    edges = graph["edges"]
    import_edges = [edge for edge in edges if edge["relationship_type"] == "imports"]
    dependency_edges = [edge for edge in edges if edge["relationship_type"] == "uses_dependency"]
    call_edges = [edge for edge in edges if edge["relationship_type"] == "calls"]

    assert any(
        edge["source_node_id"] == nodes_by_title["app.py"]["id"]
        and edge["target_node_id"] == nodes_by_title["services/worker.py"]["id"]
        for edge in import_edges
    )
    assert any(edge["metadata"]["import"] == "json" for edge in dependency_edges)
    assert any(
        edge["source_node_id"] == nodes_by_title["handler"]["id"]
        and edge["target_node_id"] == nodes_by_title["run_job"]["id"]
        for edge in call_edges
    )


def test_scan_local_repo_adds_missing_test_gap_node_and_edge(tmp_path):
    (tmp_path / "api.py").write_text("def route_handler():\n    return {'ok': True}\n", encoding="utf-8")

    graph = scan_local_repo(tmp_path)

    nodes_by_type = {}
    for node in graph["nodes"]:
        nodes_by_type.setdefault(node["node_type"], []).append(node)
    gap_nodes = nodes_by_type.get("gap", [])
    missing_test_edges = [
        edge for edge in graph["edges"] if edge["relationship_type"] == "missing_test_for"
    ]

    assert len(gap_nodes) == 1
    assert gap_nodes[0]["status"] == "needs_review"
    assert gap_nodes[0]["metadata"]["category"] == "missing-test"
    assert len(missing_test_edges) == 1
    assert missing_test_edges[0]["source_node_id"] == gap_nodes[0]["id"]
    assert missing_test_edges[0]["metadata"]["review_state"] == "needs_review"


def test_scan_local_repo_resolves_javascript_relative_imports(tmp_path):
    src_dir = tmp_path / "src"
    src_dir.mkdir()
    (src_dir / "App.jsx").write_text(
        "import { formatTitle } from './utils';\n\nexport const App = () => formatTitle('Home');\n",
        encoding="utf-8",
    )
    (src_dir / "utils.js").write_text(
        "export function formatTitle(value) {\n  return value.toUpperCase();\n}\n",
        encoding="utf-8",
    )

    graph = scan_local_repo(tmp_path)

    nodes_by_title = {node["title"]: node for node in graph["nodes"]}
    import_edges = [edge for edge in graph["edges"] if edge["relationship_type"] == "imports"]

    assert nodes_by_title["App"]["node_type"] == "component"
    assert nodes_by_title["formatTitle"]["node_type"] == "function"
    assert nodes_by_title["App"]["source_refs"][0]["line_start"] == 3
    assert nodes_by_title["App"]["source_refs"][0]["line_end"] == 3
    assert nodes_by_title["formatTitle"]["source_refs"][0]["line_start"] == 1
    assert nodes_by_title["formatTitle"]["source_refs"][0]["line_end"] == 3
    assert any(
        edge["source_node_id"] == nodes_by_title["src/App.jsx"]["id"]
        and edge["target_node_id"] == nodes_by_title["src/utils.js"]["id"]
        for edge in import_edges
    )


def test_scan_local_repo_links_tests_to_symbols_and_reports_untested_symbols(tmp_path):
    (tmp_path / "billing.py").write_text(
        "\n".join(
            [
                "def calculate_total(items):",
                "    return sum(items)",
                "",
                "def apply_discount(total):",
                "    return total * 0.9",
            ]
        ),
        encoding="utf-8",
    )
    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_billing.py").write_text(
        "\n".join(
            [
                "from billing import calculate_total",
                "",
                "def test_calculate_total():",
                "    assert calculate_total([2, 3]) == 5",
            ]
        ),
        encoding="utf-8",
    )

    graph = scan_local_repo(tmp_path)

    nodes_by_title = {node["title"]: node for node in graph["nodes"]}
    tested_by_edges = [edge for edge in graph["edges"] if edge["relationship_type"] == "tested_by"]
    missing_test_edges = [
        edge for edge in graph["edges"] if edge["relationship_type"] == "missing_test_for"
    ]

    assert any(
        edge["source_node_id"] == nodes_by_title["calculate_total"]["id"]
        and edge["target_node_id"] == nodes_by_title["test_calculate_total"]["id"]
        for edge in tested_by_edges
    )
    assert any(
        edge["target_node_id"] == nodes_by_title["apply_discount"]["id"]
        for edge in missing_test_edges
    )
    assert any(
        finding["category"] == "missing-test" and "apply_discount" in finding["summary"]
        for finding in graph["reports"]["test_gap_report"]
    )


def test_scan_local_repo_source_refs_include_precise_line_ranges_and_snippets(tmp_path):
    (tmp_path / "worker.py").write_text(
        "\n".join(
            [
                "class Worker:",
                "    \"\"\"Runs jobs.\"\"\"",
                "",
                "    def run(self, job):",
                "        result = self.prepare(job)",
                "        return result",
                "",
                "    def prepare(self, job):",
                "        return {'job': job}",
            ]
        ),
        encoding="utf-8",
    )

    graph = scan_local_repo(tmp_path)

    nodes_by_title = {node["title"]: node for node in graph["nodes"]}
    worker_ref = nodes_by_title["Worker"]["source_refs"][0]
    run_ref = nodes_by_title["run"]["source_refs"][0]
    prepare_ref = nodes_by_title["prepare"]["source_refs"][0]

    assert worker_ref["path"] == "worker.py"
    assert worker_ref["line_start"] == 1
    assert worker_ref["line_end"] == 9
    assert "class Worker" in worker_ref["quote_snippet"]
    assert run_ref["line_start"] == 4
    assert run_ref["line_end"] == 6
    assert "return result" in run_ref["quote_snippet"]
    assert prepare_ref["line_start"] == 8
    assert prepare_ref["line_end"] == 9
    assert prepare_ref["source_type"] == "local_code_file"
    assert prepare_ref["confidence"] == 1.0


def test_scan_local_repo_parses_package_manifest_dependencies_and_entrypoints(tmp_path):
    (tmp_path / "package.json").write_text(
        """
{
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "vite": "^7.0.0"
  }
}
""".strip(),
        encoding="utf-8",
    )
    src_dir = tmp_path / "src"
    src_dir.mkdir()
    (src_dir / "main.jsx").write_text("import React from 'react';\n", encoding="utf-8")

    graph = scan_local_repo(tmp_path)

    nodes_by_title = {node["title"]: node for node in graph["nodes"]}
    uses_dependency_edges = [
        edge for edge in graph["edges"] if edge["relationship_type"] == "uses_dependency"
    ]
    entrypoint_edges = [
        edge for edge in graph["edges"] if edge["relationship_type"] == "entrypoint_for"
    ]

    assert nodes_by_title["react"]["node_type"] == "dependency"
    assert nodes_by_title["react"]["metadata"]["dependency_group"] == "dependencies"
    assert nodes_by_title["vite"]["metadata"]["dependency_group"] == "devDependencies"
    assert any(edge["metadata"]["source_signal"] == "package_manifest" for edge in uses_dependency_edges)
    assert any(edge["metadata"]["entrypoint_kind"] == "package_script" for edge in entrypoint_edges)
    assert any(
        edge["source_node_id"] == nodes_by_title["src/main.jsx"]["id"]
        and edge["metadata"]["entrypoint_kind"] == "frontend_root"
        for edge in entrypoint_edges
    )


def test_scan_local_repo_detects_python_main_entrypoint(tmp_path):
    (tmp_path / "cli.py").write_text(
        "\n".join(
            [
                "def main():",
                "    return 0",
                "",
                "if __name__ == '__main__':",
                "    main()",
            ]
        ),
        encoding="utf-8",
    )

    graph = scan_local_repo(tmp_path)

    nodes_by_title = {node["title"]: node for node in graph["nodes"]}
    entrypoint_edges = [
        edge for edge in graph["edges"] if edge["relationship_type"] == "entrypoint_for"
    ]

    assert any(
        edge["source_node_id"] == nodes_by_title["main"]["id"]
        and edge["metadata"]["entrypoint_kind"] in {"python_main", "python_main_guard"}
        for edge in entrypoint_edges
    )


def test_code_intelligence_capability_requires_enablement_and_allowlist(tmp_path, monkeypatch):
    monkeypatch.delenv("DOCMAP_ENABLE_CODE_INTELLIGENCE", raising=False)
    monkeypatch.delenv("DOCMAP_CODE_INTELLIGENCE_ROOTS", raising=False)

    contract = code_intelligence_capability_contract()
    assert contract["capabilities"]["code_intelligence"]["enabled"] is False
    assert contract["capabilities"]["code_intelligence"]["reason_code"] == "not_enabled"

    with pytest.raises(CodeIntelligenceCapabilityError):
        resolve_allowed_local_repo_root(tmp_path)

    monkeypatch.setenv("DOCMAP_ENABLE_CODE_INTELLIGENCE", "true")
    contract = code_intelligence_capability_contract()
    assert contract["capabilities"]["code_intelligence"]["enabled"] is False
    assert contract["capabilities"]["code_intelligence"]["reason_code"] == "no_allowlisted_roots"

    monkeypatch.setenv("DOCMAP_CODE_INTELLIGENCE_ROOTS", str(tmp_path))
    assert resolve_allowed_local_repo_root(tmp_path) == tmp_path.resolve()

    outside = tmp_path.parent / "outside-code-intelligence"
    outside.mkdir(exist_ok=True)
    with pytest.raises(CodeIntelligenceCapabilityError):
        resolve_allowed_local_repo_root(outside)


def test_code_intelligence_scan_endpoint_is_gated_and_scans_allowlisted_root(tmp_path, monkeypatch):
    testclient_module = pytest.importorskip("fastapi.testclient")
    import app

    (tmp_path / "main.py").write_text("def main():\n    return 0\n", encoding="utf-8")
    client = testclient_module.TestClient(app.app)

    monkeypatch.delenv("DOCMAP_ENABLE_CODE_INTELLIGENCE", raising=False)
    response = client.post("/api/code-intelligence/local-repo/scan", json={"root": str(tmp_path)})
    assert response.status_code == 403

    monkeypatch.setenv("DOCMAP_ENABLE_CODE_INTELLIGENCE", "true")
    monkeypatch.setenv("DOCMAP_CODE_INTELLIGENCE_ROOTS", str(tmp_path))
    response = client.post("/api/code-intelligence/local-repo/scan", json={"root": str(tmp_path)})
    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_type"] == "code_knowledge_graph"
    assert payload["metadata"]["visibility"] == "hidden_capability"
    assert payload["source_documents"][0]["filename"] == "main.py"
