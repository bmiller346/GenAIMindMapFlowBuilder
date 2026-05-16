from __future__ import annotations

import ast
import fnmatch
import hashlib
import json
import re
from pathlib import Path
from typing import Any


SUPPORTED_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".md",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
}
DEFAULT_IGNORE_PARTS = {
    ".git",
    ".venv",
    "__pycache__",
    "node_modules",
    "dist",
    "build",
    "coverage",
}
SECRET_FILENAMES = {
    ".env",
    ".env.local",
    ".env.production",
    "id_rsa",
    "id_dsa",
    "id_ed25519",
    "id_ecdsa",
    ".npmrc",
    ".pypirc",
    ".netrc",
    "credentials.json",
}
SECRET_FILE_PATTERNS = {
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.crt",
    "*.cer",
    "*.kdbx",
    "service-account*.json",
    "firebase*.json",
    "secrets.*",
}
SECRET_CONTENT_PATTERNS = {
    "private_key",
    "client_secret",
    "api_key",
    "aws_secret_access_key",
    "github_token",
}
CODE_INTELLIGENCE_NODE_TYPES = {
    "repo",
    "file",
    "function",
    "class",
    "component",
    "test",
    "dependency",
    "risk",
    "gap",
}
CODE_INTELLIGENCE_RELATIONSHIP_TYPES = {
    "calls",
    "contains",
    "imports",
    "uses_dependency",
    "tested_by",
    "missing_test_for",
    "entrypoint_for",
}
CODE_INTELLIGENCE_ARTIFACT_TYPES = {
    "repo_architecture_map",
    "code_knowledge_graph",
    "weak_spot_report",
    "test_gap_report",
    "documentation_gap_report",
    "dependency_risk_report",
    "pr_impact_report",
    "refactor_roadmap",
    "developer_onboarding_map",
    "github_issue_candidates",
}


def scan_local_repo(
    root: str | Path,
    *,
    repo_label: str = "",
    max_file_bytes: int = 256_000,
    large_file_line_threshold: int = 500,
) -> dict[str, Any]:
    """Build a deterministic, source-cited code graph for a local repo folder."""

    root_path = Path(root).resolve()
    if not root_path.exists() or not root_path.is_dir():
        raise ValueError(f"Repo root does not exist or is not a directory: {root_path}")

    repo_name = repo_label or root_path.name
    root_id = _node_id("repo", repo_name)
    nodes: list[dict[str, Any]] = [
        {
            "id": root_id,
            "title": repo_name,
            "node_type": "repo",
            "status": "source_backed",
            "source_refs": [],
            "metadata": _code_metadata({"root": str(root_path)}),
        }
    ]
    edges: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []
    source_documents: list[dict[str, Any]] = []
    document_chunks: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    dependency_node_ids: dict[str, str] = {}
    test_files_by_stem: dict[str, list[dict[str, Any]]] = {}
    file_entries_by_path: dict[str, dict[str, Any]] = {}
    parsed_by_file_id: dict[str, dict[str, Any]] = {}
    symbol_nodes_by_name: dict[str, list[dict[str, Any]]] = {}
    symbol_nodes_by_file_id: dict[str, list[dict[str, Any]]] = {}

    for path in _iter_supported_files(root_path, max_file_bytes=max_file_bytes):
        relative_path = path.relative_to(root_path).as_posix()
        text = path.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        sha = hashlib.sha256(text.encode("utf-8")).hexdigest()
        document_id = _source_document_id(repo_name, relative_path, sha)
        source_document = _source_document(
            document_id,
            relative_path,
            path.suffix.lower(),
            sha,
            len(text.encode("utf-8")),
        )
        source_documents.append(source_document)
        source_ref = _source_ref(repo_name, relative_path, sha, 1, max(1, len(lines)), document_id=document_id)
        file_id = _node_id("file", relative_path)
        file_node = {
            "id": file_id,
            "title": relative_path,
            "node_type": "test" if _is_test_file(relative_path) else "file",
            "status": "source_backed",
            "source_refs": [source_ref],
            "metadata": _code_metadata({
                "path": relative_path,
                "extension": path.suffix.lower(),
                "sha": sha,
                "line_count": len(lines),
            }),
        }
        nodes.append(file_node)
        edges.append(_edge(root_id, file_id, "contains"))
        file_entry = {
            "id": file_id,
            "path": relative_path,
            "extension": path.suffix.lower(),
            "line_count": len(lines),
            "sha": sha,
            "source_ref": source_ref,
            "is_test": _is_test_file(relative_path),
        }
        files.append(file_entry)
        file_entries_by_path[relative_path] = file_entry

        if file_entry["is_test"]:
            test_files_by_stem.setdefault(_test_target_stem(relative_path), []).append(file_entry)

        if len(lines) > large_file_line_threshold:
            findings.append(
                _finding(
                    "large-file",
                    "medium",
                    "Large source file",
                    f"{relative_path} has {len(lines)} lines and may mix responsibilities.",
                    [source_ref],
                    recommendation="Review for split points around routes, components, or service boundaries.",
                )
            )

        parsed = _parse_file(path, text, source_ref)
        parsed_by_file_id[file_id] = parsed
        for manifest_dependency in parsed.get("manifest_dependencies", []):
            dep_name = manifest_dependency["name"]
            dep_id = dependency_node_ids.get(dep_name)
            if dep_id is None:
                dep_id = _node_id("dependency", dep_name)
                dependency_node_ids[dep_name] = dep_id
                nodes.append(
                    {
                        "id": dep_id,
                        "title": dep_name,
                        "node_type": "dependency",
                        "status": "source_backed",
                        "source_refs": [manifest_dependency["source_ref"]],
                        "metadata": _code_metadata(
                            {
                                "dependency": dep_name,
                                "version": manifest_dependency.get("version", ""),
                                "dependency_group": manifest_dependency.get("group", ""),
                            }
                        ),
                    }
                )
            edges.append(
                _edge(
                    file_id,
                    dep_id,
                    "uses_dependency",
                    metadata={
                        "source_signal": "package_manifest",
                        "dependency_group": manifest_dependency.get("group", ""),
                        "confidence": 1.0,
                        "review_state": "reviewed",
                    },
                )
            )
        for symbol in parsed["symbols"]:
            symbol_node = {
                "id": symbol["id"],
                "title": symbol["name"],
                "node_type": symbol["node_type"],
                "status": "source_backed",
                "source_refs": [symbol["source_ref"]],
                "metadata": _code_metadata({
                    "path": relative_path,
                    "line_start": symbol["line_start"],
                    "line_end": symbol["line_end"],
                }),
            }
            nodes.append(symbol_node)
            document_chunks.append(
                _document_chunk(
                    symbol["source_ref"],
                    len(document_chunks),
                    symbol["name"],
                    symbol["node_type"],
                )
            )
            symbol_nodes_by_name.setdefault(symbol["name"], []).append(symbol_node)
            symbol_nodes_by_file_id.setdefault(file_id, []).append(symbol_node)
            edges.append(_edge(file_id, symbol["id"], "contains"))

            if symbol.get("missing_docs"):
                findings.append(
                    _finding(
                        "missing-docs",
                        "low",
                        "Public symbol lacks documentation",
                        f"{symbol['name']} in {relative_path} has no docstring or leading contract comment.",
                        [symbol["source_ref"]],
                        recommendation="Add a short contract comment if this is an entry point or shared helper.",
                    )
                )

    module_index = _build_module_index(files)
    for file_entry in files:
        parsed = parsed_by_file_id.get(file_entry["id"], {})
        for imported in parsed.get("imports", []):
            imported_name = imported["name"] if isinstance(imported, dict) else str(imported)
            target_file = _resolve_local_import(file_entry["path"], imported_name, module_index)
            if target_file and target_file["id"] != file_entry["id"]:
                edges.append(
                    _edge(
                        file_entry["id"],
                        target_file["id"],
                        "imports",
                        metadata={
                            "import": imported_name,
                            "source_signal": "deterministic_import_resolution",
                            "confidence": 1.0,
                            "review_state": "reviewed",
                        },
                    )
                )
                continue

            dep_name = _normalize_import_name(imported_name)
            dep_id = dependency_node_ids.get(dep_name)
            if dep_id is None:
                dep_id = _node_id("dependency", dep_name)
                dependency_node_ids[dep_name] = dep_id
                nodes.append(
                    {
                        "id": dep_id,
                        "title": dep_name,
                        "node_type": "dependency",
                        "status": "source_backed",
                        "source_refs": [],
                        "metadata": _code_metadata({"dependency": dep_name}),
                    }
                )
            edges.append(
                _edge(
                    file_entry["id"],
                    dep_id,
                    "uses_dependency",
                    metadata={
                        "import": imported_name,
                        "source_signal": "external_or_unresolved_import",
                        "confidence": 0.72,
                        "review_state": "reviewed",
                    },
                )
            )

        for call in parsed.get("calls", []):
            targets = symbol_nodes_by_name.get(call.get("name", ""))
            if not targets or len(targets) != 1:
                continue
            caller_id = call.get("caller_id")
            target_id = targets[0]["id"]
            if caller_id and caller_id != target_id:
                edges.append(
                    _edge(
                        caller_id,
                        target_id,
                        "calls",
                        metadata={
                            "call": call["name"],
                            "source_signal": "python_ast_call",
                            "scope": "same_repo_unique_symbol",
                            "confidence": 0.85,
                            "review_state": "reviewed",
                            "line_start": call.get("line_start"),
                        },
                    )
                )

    for file_entry in files:
        parsed = parsed_by_file_id.get(file_entry["id"], {})
        for entrypoint in parsed.get("entrypoints", []):
            entrypoint_source_id = entrypoint.get("symbol_id") or file_entry["id"]
            edges.append(
                _edge(
                    entrypoint_source_id,
                    root_id,
                    "entrypoint_for",
                    metadata={
                        "entrypoint_kind": entrypoint.get("kind", "static_pattern"),
                        "source_signal": entrypoint.get("source_signal", "static_pattern"),
                        "command": entrypoint.get("command", ""),
                        "confidence": entrypoint.get("confidence", 0.82),
                        "review_state": "reviewed",
                    },
                )
            )

    source_files = [entry for entry in files if _is_source_code(entry) and not entry["is_test"]]
    tested_symbol_ids: set[str] = set()
    for test_file in [entry for entry in files if entry["is_test"]]:
        parsed = parsed_by_file_id.get(test_file["id"], {})
        for call in parsed.get("calls", []):
            targets = [
                target
                for target in symbol_nodes_by_name.get(call.get("name", ""), [])
                if target.get("metadata", {}).get("path") != test_file["path"]
                and not _is_test_file(target.get("metadata", {}).get("path", ""))
            ]
            if len(targets) != 1 or not call.get("caller_id"):
                continue
            tested_symbol_ids.add(targets[0]["id"])
            edges.append(
                _edge(
                    targets[0]["id"],
                    call["caller_id"],
                    "tested_by",
                    metadata={
                        "source_signal": "test_call_heuristic",
                        "confidence": 0.82,
                        "review_state": "reviewed",
                        "call": call.get("name"),
                        "line_start": call.get("line_start"),
                    },
                )
            )

    for source_file in source_files:
        target_stem = Path(source_file["path"]).stem
        matching_tests = test_files_by_stem.get(target_stem) or test_files_by_stem.get(f"test_{target_stem}") or []
        if matching_tests:
            for test_file in matching_tests:
                edges.append(_edge(source_file["id"], test_file["id"], "tested_by"))
            for symbol_node in symbol_nodes_by_file_id.get(source_file["id"], []):
                if symbol_node["id"] in tested_symbol_ids or _is_private_symbol(symbol_node):
                    continue
                finding = _finding(
                    "missing-test",
                    "medium",
                    "Symbol has no obvious test",
                    (
                        f"{symbol_node['title']} in {source_file['path']} has a nearby test file, "
                        "but no test call was detected for this symbol."
                    ),
                    symbol_node["source_refs"],
                    recommendation="Add or link a focused test for this symbol's behavior.",
                )
                findings.append(finding)
                gap_node_id = _node_id("gap", finding["id"])
                nodes.append(
                    {
                        "id": gap_node_id,
                        "title": finding["title"],
                        "summary": finding["summary"],
                        "node_type": "gap",
                        "status": "needs_review",
                        "source_refs": finding["source_refs"],
                        "metadata": _code_metadata({
                            "finding_id": finding["id"],
                            "category": finding["category"],
                            "severity": finding["severity"],
                            "recommendation": finding["recommendation"],
                        }),
                    }
                )
                edges.append(
                    _edge(
                        gap_node_id,
                        symbol_node["id"],
                        "missing_test_for",
                        metadata={
                            "source_signal": "test_call_heuristic",
                            "confidence": 0.72,
                            "review_state": "needs_review",
                        },
                    )
                )
        else:
            finding = _finding(
                "missing-test",
                "medium",
                "Source file has no nearby test",
                f"{source_file['path']} has no obvious test file by path/name heuristic.",
                [source_file["source_ref"]],
                recommendation="Add or link a focused test for the main behavior in this file.",
            )
            findings.append(finding)
            gap_node_id = _node_id("gap", finding["id"])
            nodes.append(
                {
                    "id": gap_node_id,
                    "title": finding["title"],
                    "summary": finding["summary"],
                    "node_type": "gap",
                    "status": "needs_review",
                    "source_refs": finding["source_refs"],
                    "metadata": _code_metadata({
                        "finding_id": finding["id"],
                        "category": finding["category"],
                        "severity": finding["severity"],
                        "recommendation": finding["recommendation"],
                    }),
                }
            )
            edges.append(
                _edge(
                    gap_node_id,
                    source_file["id"],
                    "missing_test_for",
                    metadata={
                        "source_signal": "test_path_heuristic",
                        "confidence": 0.78,
                        "review_state": "needs_review",
                    },
                )
            )

    return {
        "artifact_type": "code_knowledge_graph",
        "title": f"{repo_name} Code Knowledge Graph",
        "status": "source_backed",
        "source_type": "local_repo",
        "repo": {"name": repo_name, "root": str(root_path), "file_count": len(files)},
        "source_documents": source_documents,
        "document_chunks": document_chunks,
        "nodes": nodes,
        "edges": edges,
        "files": files,
        "findings": findings,
        "reports": {
            "repo_architecture_map": _architecture_map(files),
            "weak_spot_report": [item for item in findings if item["category"] in {"large-file"}],
            "test_gap_report": [item for item in findings if item["category"] == "missing-test"],
            "documentation_gap_report": [item for item in findings if item["category"] == "missing-docs"],
        },
        "metadata": {
            "deterministic": True,
            "ai_interpretation": False,
            "visibility": "hidden_capability",
            "domain": "code",
            "artifact_type": "code_knowledge_graph",
            "capability_contract": _capability_contract(),
        },
    }


def _iter_supported_files(root: Path, *, max_file_bytes: int) -> list[Path]:
    files: list[Path] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if any(part in DEFAULT_IGNORE_PARTS for part in path.relative_to(root).parts):
            continue
        if _is_secret_path(path.relative_to(root).as_posix()):
            continue
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        try:
            if path.stat().st_size > max_file_bytes:
                continue
            if path.suffix.lower() in {".json", ".yaml", ".yml", ".toml"} and _contains_secret_pattern(path):
                continue
        except OSError:
            continue
        files.append(path)
    return files


def _is_secret_path(path: str) -> bool:
    name = Path(path).name.lower()
    return name in SECRET_FILENAMES or any(
        fnmatch.fnmatch(name, pattern) for pattern in SECRET_FILE_PATTERNS
    )


def _contains_secret_pattern(path: Path) -> bool:
    try:
        sample = path.read_text(encoding="utf-8", errors="replace")[:16_000].lower()
    except OSError:
        return True
    return any(pattern in sample for pattern in SECRET_CONTENT_PATTERNS)


def _parse_file(path: Path, text: str, file_source_ref: dict[str, Any]) -> dict[str, Any]:
    if path.suffix.lower() == ".py":
        return _parse_python(path, text, file_source_ref)
    if path.suffix.lower() in {".js", ".jsx", ".ts", ".tsx"}:
        return _parse_javascript_like(path, text, file_source_ref)
    if path.name == "package.json":
        return _parse_package_json(text, file_source_ref)
    return {"symbols": [], "imports": [], "calls": [], "entrypoints": [], "manifest_dependencies": []}


def _parse_python(path: Path, text: str, file_source_ref: dict[str, Any]) -> dict[str, Any]:
    symbols: list[dict[str, Any]] = []
    imports: dict[str, dict[str, str]] = {}
    calls: list[dict[str, Any]] = []
    entrypoints: list[dict[str, Any]] = []
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return {"symbols": symbols, "imports": [], "calls": [], "entrypoints": [], "manifest_dependencies": []}

    lines = text.splitlines()
    module_has_main_guard = _python_has_main_guard(tree)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name:
                    imports[alias.name] = {"name": alias.name, "kind": "import"}
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports[node.module] = {"name": node.module, "kind": "from_import"}
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            line_start = getattr(node, "lineno", 1)
            line_end = getattr(node, "end_lineno", line_start)
            source_ref = _line_source_ref(file_source_ref, line_start, line_end, lines)
            node_type = "class" if isinstance(node, ast.ClassDef) else "function"
            symbols.append(
                {
                    "id": _node_id(node_type, f"{path.as_posix()}:{node.name}:{line_start}"),
                    "name": node.name,
                    "node_type": node_type,
                    "line_start": line_start,
                    "line_end": line_end,
                    "source_ref": source_ref,
                    "missing_docs": ast.get_docstring(node) is None and not node.name.startswith("_"),
                }
            )
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                calls.extend(_python_calls_for_symbol(node, symbols[-1]["id"]))
                if node.name == "main":
                    entrypoints.append(
                        {
                            "symbol_id": symbols[-1]["id"],
                            "kind": "python_main",
                            "source_signal": "function_name",
                            "confidence": 0.76,
                        }
                    )
    if module_has_main_guard:
        main_symbols = [symbol for symbol in symbols if symbol["name"] == "main"]
        entrypoints.append(
            {
                "symbol_id": main_symbols[0]["id"] if main_symbols else "",
                "kind": "python_main_guard",
                "source_signal": "ast_main_guard",
                "confidence": 0.92,
            }
        )
    return {
        "symbols": symbols,
        "imports": [imports[key] for key in sorted(imports)],
        "calls": calls,
        "entrypoints": entrypoints,
        "manifest_dependencies": [],
    }


def _parse_javascript_like(path: Path, text: str, file_source_ref: dict[str, Any]) -> dict[str, Any]:
    lines = text.splitlines()
    imports = set(re.findall(r"^[ \t]*import\s+(?:.+?\s+from\s+)?['\"]([^'\"]+)['\"]", text, re.MULTILINE))
    imports.update(re.findall(r"require\(['\"]([^'\"]+)['\"]\)", text))
    symbols: list[dict[str, Any]] = []
    symbol_pattern = re.compile(
        r"^[ \t]*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|"
        r"^[ \t]*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>",
        re.MULTILINE,
    )
    for match in symbol_pattern.finditer(text):
        name = next(group for group in match.groups() if group)
        line_start = text.count("\n", 0, match.start()) + 1
        line_end = _brace_block_end_line(text, match.start(), line_start)
        source_ref = _line_source_ref(file_source_ref, line_start, line_end, lines)
        node_type = "component" if name[:1].isupper() else "function"
        symbols.append(
            {
                "id": _node_id(node_type, f"{path.as_posix()}:{name}:{line_start}"),
                "name": name,
                "node_type": node_type,
                "line_start": line_start,
                "line_end": line_end,
                "source_ref": source_ref,
                "missing_docs": False,
            }
        )
    entrypoints = []
    if path.name.lower() in {"main.js", "main.jsx", "main.ts", "main.tsx", "index.js", "index.jsx", "index.ts", "index.tsx"}:
        entrypoints.append(
            {
                "kind": "frontend_root",
                "source_signal": "filename_convention",
                "confidence": 0.82,
            }
        )
    return {
        "symbols": symbols,
        "imports": [{"name": item, "kind": "import"} for item in sorted(imports)],
        "calls": [],
        "entrypoints": entrypoints,
        "manifest_dependencies": [],
    }


def _parse_package_json(text: str, file_source_ref: dict[str, Any]) -> dict[str, Any]:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return {"symbols": [], "imports": [], "calls": [], "entrypoints": [], "manifest_dependencies": []}

    dependencies: list[dict[str, Any]] = []
    for group in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        values = payload.get(group, {})
        if not isinstance(values, dict):
            continue
        for name, version in sorted(values.items()):
            dependencies.append(
                {
                    "name": str(name),
                    "version": str(version),
                    "group": group,
                    "source_ref": file_source_ref,
                }
            )

    entrypoints: list[dict[str, Any]] = []
    scripts = payload.get("scripts", {})
    if isinstance(scripts, dict):
        for script_name in ("dev", "start", "serve", "build"):
            command = scripts.get(script_name)
            if isinstance(command, str) and command.strip():
                entrypoints.append(
                    {
                        "kind": "package_script",
                        "source_signal": "package_json_script",
                        "command": f"npm run {script_name}",
                        "confidence": 0.86,
                    }
                )
    return {
        "symbols": [],
        "imports": [],
        "calls": [],
        "entrypoints": entrypoints,
        "manifest_dependencies": dependencies,
    }


def _python_has_main_guard(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if not isinstance(node, ast.If):
            continue
        compare = node.test
        if not isinstance(compare, ast.Compare):
            continue
        left = compare.left
        comparators = compare.comparators
        if (
            isinstance(left, ast.Name)
            and left.id == "__name__"
            and comparators
            and isinstance(comparators[0], ast.Constant)
            and comparators[0].value == "__main__"
        ):
            return True
    return False


def _brace_block_end_line(text: str, start_index: int, fallback_line: int) -> int:
    brace_start = text.find("{", start_index)
    if brace_start == -1:
        return fallback_line
    depth = 0
    for index in range(brace_start, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text.count("\n", 0, index) + 1
    return fallback_line


def _python_calls_for_symbol(node: ast.FunctionDef | ast.AsyncFunctionDef, caller_id: str) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    for child in ast.walk(node):
        if not isinstance(child, ast.Call):
            continue
        call_name = _python_call_name(child.func)
        if not call_name:
            continue
        calls.append(
            {
                "caller_id": caller_id,
                "name": call_name,
                "line_start": getattr(child, "lineno", None),
            }
        )
    return calls


def _python_call_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return ""


def _architecture_map(files: list[dict[str, Any]]) -> dict[str, Any]:
    buckets: dict[str, list[str]] = {}
    for entry in files:
        top_level = entry["path"].split("/", 1)[0]
        buckets.setdefault(top_level, []).append(entry["path"])
    return {
        "sections": [
            {"name": name, "file_count": len(paths), "files": paths[:20]}
            for name, paths in sorted(buckets.items())
        ]
    }


def _finding(
    category: str,
    severity: str,
    title: str,
    summary: str,
    source_refs: list[dict[str, Any]],
    *,
    recommendation: str,
) -> dict[str, Any]:
    return {
        "id": _node_id("finding", f"{category}:{summary}"),
        "category": category,
        "severity": severity,
        "title": title,
        "summary": summary,
        "source_refs": source_refs,
        "recommendation": recommendation,
        "review_state": "source_backed" if source_refs else "needs_review",
        "confidence": 0.78 if source_refs else 0.45,
    }


def _source_document_id(repo_name: str, path: str, sha: str) -> str:
    return f"local_repo:{repo_name}:{path}:{sha[:12]}"


def _source_document(
    document_id: str,
    path: str,
    extension: str,
    sha: str,
    size: int,
) -> dict[str, Any]:
    source_type = extension.lstrip(".") or "file"
    return {
        "id": document_id,
        "filename": path,
        "original_filename": path,
        "type": source_type,
        "file_hash": sha,
        "size": size,
        "version": 1,
        "status": "indexed",
        "metadata": _code_metadata(
            {
                "path": path,
                "language": _language_for_extension(extension),
                "source_type": "local_code_file",
            }
        ),
    }


def _document_chunk(
    source_ref: dict[str, Any],
    index: int,
    symbol_name: str,
    symbol_kind: str,
) -> dict[str, Any]:
    text = str(source_ref.get("quote_snippet", ""))
    return {
        "id": source_ref["chunk_id"],
        "document_id": source_ref["document_id"],
        "index": index,
        "text": text,
        "page": None,
        "heading": symbol_name,
        "start_char": 0,
        "end_char": len(text),
        "metadata": _code_metadata(
            {
                "path": source_ref.get("path", ""),
                "language": source_ref.get("language", ""),
                "line_start": source_ref.get("line_start"),
                "line_end": source_ref.get("line_end"),
                "symbol_name": symbol_name,
                "symbol_kind": symbol_kind,
            }
        ),
    }


def _source_ref(
    repo_name: str,
    path: str,
    sha: str,
    line_start: int,
    line_end: int,
    *,
    document_id: str = "",
) -> dict[str, Any]:
    document_id = document_id or _source_document_id(repo_name, path, sha)
    return {
        "document_id": document_id,
        "chunk_id": _chunk_id(document_id, line_start, line_end),
        "section": path,
        "quote_snippet": "",
        "confidence": 1.0,
        "repo": repo_name,
        "path": path,
        "sha": sha,
        "language": _language_for_extension(Path(path).suffix.lower()),
        "line_start": line_start,
        "line_end": line_end,
        "source_type": "local_code_file",
    }


def _line_source_ref(
    file_source_ref: dict[str, Any],
    line_start: int,
    line_end: int,
    lines: list[str],
) -> dict[str, Any]:
    snippet = "\n".join(lines[max(0, line_start - 1) : max(line_start, line_end)])
    source_ref = dict(file_source_ref)
    source_ref["line_start"] = line_start
    source_ref["line_end"] = line_end
    source_ref["chunk_id"] = _chunk_id(source_ref["document_id"], line_start, line_end)
    source_ref["quote_snippet"] = snippet[:500]
    return source_ref


def _chunk_id(document_id: str, line_start: int, line_end: int) -> str:
    digest = hashlib.sha256(f"{document_id}:L{line_start}-L{line_end}".encode("utf-8")).hexdigest()
    return f"code_chk_{digest[:20]}"


def _language_for_extension(extension: str) -> str:
    return {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "jsx",
        ".ts": "typescript",
        ".tsx": "tsx",
        ".md": "markdown",
        ".json": "json",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".toml": "toml",
    }.get(extension.lower(), extension.lower().lstrip(".") or "text")


def _edge(
    source_id: str,
    target_id: str,
    relationship_type: str,
    *,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": _node_id("edge", f"{source_id}:{relationship_type}:{target_id}"),
        "source_node_id": source_id,
        "target_node_id": target_id,
        "relationship_type": relationship_type,
        "metadata": _code_metadata(metadata or {}),
    }


def _code_metadata(values: dict[str, Any]) -> dict[str, Any]:
    return {
        **values,
        "domain": "code",
        "artifact_type": "code_knowledge_graph",
        "visibility": {
            "required_capabilities": ["docmap:developerMode", "code_intelligence"],
            "default_hidden": True,
        },
    }


def _capability_contract() -> dict[str, Any]:
    return {
        "contract_versions": {
            "capability_visibility": "1",
            "code_graph_relationship": "1",
        },
        "capabilities": {
            "docmap:developerMode": {
                "enabled": False,
                "source": "server_entitlement",
                "reason_code": "not_entitled",
            },
            "code_intelligence": {
                "enabled": False,
                "requires": ["docmap:developerMode"],
                "relationship_visibility": "hidden",
            },
        },
    }


def _node_id(kind: str, value: str) -> str:
    digest = hashlib.sha256(f"{kind}:{value}".encode("utf-8")).hexdigest()
    return f"{kind}_{digest[:16]}"


def _is_test_file(path: str) -> bool:
    normalized = path.replace("\\", "/").lower()
    name = Path(normalized).name
    return "/tests/" in f"/{normalized}" or name.startswith("test_") or name.endswith(".test.js") or name.endswith(".test.ts")


def _test_target_stem(path: str) -> str:
    stem = Path(path).stem
    if stem.startswith("test_"):
        return stem.removeprefix("test_")
    if stem.endswith(".test"):
        return stem.removesuffix(".test")
    return stem


def _is_source_code(entry: dict[str, Any]) -> bool:
    return entry["extension"] in {".py", ".js", ".jsx", ".ts", ".tsx"}


def _is_private_symbol(symbol_node: dict[str, Any]) -> bool:
    title = str(symbol_node.get("title", ""))
    return title.startswith("_")


def _build_module_index(files: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for entry in files:
        path = entry["path"]
        suffix = entry["extension"]
        stem_path = path[: -len(suffix)] if suffix else path
        module_name = stem_path.replace("/", ".")
        index[module_name] = entry
        if path.endswith("/__init__.py"):
            index[path.removesuffix("/__init__.py").replace("/", ".")] = entry
        if suffix in {".js", ".jsx", ".ts", ".tsx"}:
            index[stem_path] = entry
    return index


def _resolve_local_import(
    importer_path: str,
    imported: str,
    module_index: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    if imported in module_index:
        return module_index[imported]
    if imported.startswith("."):
        importer_dir = Path(importer_path).parent.as_posix()
        relative = Path(importer_dir, imported).as_posix()
        relative = re.sub(r"/\./", "/", relative).removeprefix("./")
        candidates = [
            relative,
            relative.replace("/", "."),
            f"{relative}/index",
            f"{relative}.js",
            f"{relative}.jsx",
            f"{relative}.ts",
            f"{relative}.tsx",
        ]
        for candidate in candidates:
            if candidate in module_index:
                return module_index[candidate]
    return None


def _normalize_import_name(imported: str) -> str:
    if imported.startswith("."):
        return imported
    return imported.split("/", 1)[0]
