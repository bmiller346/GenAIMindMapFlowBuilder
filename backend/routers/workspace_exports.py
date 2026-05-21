from typing import Any, Callable

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from pymongo.errors import PyMongoError

from documents.ingestion import DocumentIngestionError
from export.ai_draft_artifacts import artifact_export_data, select_latest_ai_draft_artifact
from export.csv_tasks import export_task_rows
from export.markdown import (
    export_executive_output_markdown,
    export_executive_summary_markdown,
)
from export.workspace_graph import (
    artifact_to_news_article_markdown,
    artifact_to_newsletter_markdown,
    build_workspace_graph,
    graph_to_completeness_markdown,
    graph_to_completeness_review,
    graph_to_executive_markdown,
    graph_to_markdown,
    graph_to_mermaid,
    graph_to_mmd_json,
    graph_to_news_article_markdown,
    graph_to_newsletter_markdown,
    graph_to_opml,
    graph_to_task_rows,
    graph_to_team_roadmap,
    graph_to_team_roadmap_markdown,
)
from graph.schemas import GraphSchemaError


def create_workspace_export_router(
    *,
    get_workspace_graph_or_404: Callable[[str], dict],
    get_workspace_branch_or_404: Callable[[str, str], dict],
    get_upload_flow_or_400: Callable[[str], dict],
    list_ai_draft_sessions_for_workspace: Callable[[str], list[dict]],
    prepare_source_set_uploads: Callable[..., dict],
    ingestion_http_error: Callable[[Exception], HTTPException],
    source_set_component_metadata: Callable[[dict, str], dict],
    uploaded_source_payload: Callable[[Any, dict], dict],
    get_source_components: Callable[[str], list[dict]],
    component_collection: Any,
    generate_source_reconciliation_preview: Callable[..., dict],
) -> APIRouter:
    router = APIRouter()

    def latest_ai_draft_artifact(flow_id: str, artifact_types: set[str]) -> dict[str, Any] | None:
        return select_latest_ai_draft_artifact(
            list_ai_draft_sessions_for_workspace(flow_id),
            artifact_types,
        )

    @router.get("/api/workspaces/{flow_id}/exports/json")
    def export_workspace_json(flow_id: str):
        return get_workspace_graph_or_404(flow_id)

    @router.get("/api/workspaces/{flow_id}/sources")
    def get_workspace_sources(flow_id: str):
        return get_workspace_graph_or_404(flow_id)["source_library"]

    @router.post("/api/workspaces/{flow_id}/sources/source-set")
    def upload_workspace_source_set(
        flow_id: str,
        files: list[UploadFile] = File(...),
        relative_paths: list[str] | None = Form(None),
        source_set_id: str | None = Form(None),
        source_set_label: str | None = Form(None),
    ):
        flow = get_upload_flow_or_400(flow_id)
        try:
            prepared = prepare_source_set_uploads(
                files,
                flow_id=flow_id,
                relative_paths=relative_paths,
                source_set_id=source_set_id,
                source_set_label=source_set_label,
            )
        except DocumentIngestionError as exc:
            raise ingestion_http_error(exc) from exc

        uploaded_sources = []
        source_components = []
        try:
            for source_context in prepared["sources"]:
                component_metadata = source_set_component_metadata(source_context, flow_id)
                component_id = component_collection.insert_one(component_metadata).inserted_id
                saved_component = {**component_metadata, "_id": component_id}
                source_components.append(saved_component)
                uploaded_sources.append(uploaded_source_payload(component_id, source_context))
        except PyMongoError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Source-set upload could not save document metadata. "
                    "Check MongoDB and try the folder upload again."
                ),
            ) from exc

        existing_components = get_source_components(flow_id)
        existing_ids = {str(component.get("_id")) for component in existing_components}
        all_source_components = [
            *existing_components,
            *[
                component
                for component in source_components
                if str(component.get("_id")) not in existing_ids
            ],
        ]
        source_library = build_workspace_graph(
            flow,
            source_components=all_source_components,
        )["source_library"]

        return {
            "uploaded_sources": uploaded_sources,
            "skipped_sources": prepared.get("skipped_sources", []),
            "source_set": {
                **prepared["source_set"],
                "source_count": len(uploaded_sources),
                "skipped_count": len(prepared.get("skipped_sources", [])),
            },
            "source_library": source_library,
        }

    @router.get("/api/workspaces/{flow_id}/completeness-review")
    def get_workspace_completeness_review(flow_id: str):
        graph = get_workspace_graph_or_404(flow_id)
        return graph.get("views", {}).get("completeness_review") or graph_to_completeness_review(graph)

    @router.get("/api/workspaces/{flow_id}/team-roadmap")
    def get_workspace_team_roadmap(flow_id: str):
        graph = get_workspace_graph_or_404(flow_id)
        return graph_to_team_roadmap(graph)

    @router.post("/api/workspaces/{flow_id}/sources/{source_id}/reconcile/preview")
    def preview_source_reconciliation(flow_id: str, source_id: str, request: dict[str, Any] | None = None):
        graph = get_workspace_graph_or_404(flow_id)
        scope = request.get("scope") if isinstance(request, dict) else None
        try:
            return generate_source_reconciliation_preview(
                graph,
                source_id=source_id,
                scope=scope if isinstance(scope, dict) else {"type": "source", "source_id": source_id},
            )
        except GraphSchemaError as exc:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Source reconciliation preview failed schema validation.",
                    "errors": exc.errors,
                },
            ) from exc

    @router.get("/api/workspaces/{flow_id}/exports/markdown")
    def export_workspace_markdown(flow_id: str):
        graph = get_workspace_graph_or_404(flow_id)
        return Response(content=graph_to_markdown(graph), media_type="text/markdown")

    @router.get("/api/workspaces/{flow_id}/exports/completeness-review.md")
    def export_workspace_completeness_review_markdown(flow_id: str):
        graph = get_workspace_graph_or_404(flow_id)
        return Response(content=graph_to_completeness_markdown(graph), media_type="text/markdown")

    @router.get("/api/workspaces/{flow_id}/exports/executive.md")
    @router.get("/api/workspaces/{flow_id}/exports/executive-output.md")
    def export_workspace_executive_markdown(flow_id: str):
        artifact = latest_ai_draft_artifact(flow_id, {"executive_summary", "executive_output"})
        if artifact and artifact.get("artifact_type") == "executive_summary":
            content = export_executive_summary_markdown(artifact_export_data(artifact))
        elif artifact and artifact.get("artifact_type") == "executive_output":
            content = export_executive_output_markdown(artifact_export_data(artifact))
        else:
            graph = get_workspace_graph_or_404(flow_id)
            content = graph_to_executive_markdown(graph)
        return Response(content=content, media_type="text/markdown")

    @router.get("/api/workspaces/{flow_id}/exports/article.md")
    @router.get("/api/workspaces/{flow_id}/exports/news-article.md")
    def export_workspace_news_article_markdown(flow_id: str):
        artifact = latest_ai_draft_artifact(flow_id, {"news_article"})
        if artifact:
            content = artifact_to_news_article_markdown(artifact)
        else:
            graph = get_workspace_graph_or_404(flow_id)
            content = graph_to_news_article_markdown(graph)
        return Response(content=content, media_type="text/markdown")

    @router.get("/api/workspaces/{flow_id}/exports/newsletter.md")
    def export_workspace_newsletter_markdown(flow_id: str):
        artifact = latest_ai_draft_artifact(flow_id, {"newsletter"})
        if artifact:
            content = artifact_to_newsletter_markdown(artifact)
        else:
            graph = get_workspace_graph_or_404(flow_id)
            content = graph_to_newsletter_markdown(graph)
        return Response(content=content, media_type="text/markdown")

    @router.get("/api/workspaces/{flow_id}/exports/team-roadmap.md")
    def export_workspace_team_roadmap_markdown(flow_id: str):
        graph = get_workspace_graph_or_404(flow_id)
        return Response(content=graph_to_team_roadmap_markdown(graph), media_type="text/markdown")

    @router.get("/api/workspaces/{flow_id}/exports/csv")
    def export_workspace_csv(flow_id: str):
        graph = get_workspace_graph_or_404(flow_id)
        rows = graph_to_task_rows(graph)
        return Response(
            content=export_task_rows(rows),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{flow_id}-tasks.csv"'},
        )

    @router.get("/api/workspaces/{flow_id}/exports/opml")
    def export_workspace_opml(flow_id: str):
        graph = get_workspace_graph_or_404(flow_id)
        return Response(content=graph_to_opml(graph), media_type="application/xml")

    @router.get("/api/workspaces/{flow_id}/exports/mmd-json")
    def export_workspace_mmd_json(flow_id: str):
        graph = get_workspace_graph_or_404(flow_id)
        return graph_to_mmd_json(graph)

    @router.get("/api/workspaces/{flow_id}/exports/mermaid")
    def export_workspace_mermaid(flow_id: str):
        graph = get_workspace_graph_or_404(flow_id)
        return Response(content=graph_to_mermaid(graph), media_type="text/plain")

    @router.get("/api/workspaces/{flow_id}/branches/{node_id}/exports/json")
    def export_branch_json(flow_id: str, node_id: str):
        return get_workspace_branch_or_404(flow_id, node_id)

    return router
