from __future__ import annotations

import base64
import json
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from io import BytesIO
from pathlib import Path
from typing import Any

try:
    from fastapi import HTTPException, status
except ImportError:
    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: Any):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class status:
        HTTP_422_UNPROCESSABLE_ENTITY = 422
        HTTP_502_BAD_GATEWAY = 502
        HTTP_503_SERVICE_UNAVAILABLE = 503

from config import MissingConfigurationError, configuration_http_error, get_setting
from graph.ai_contract import append_ai_graph_prompt_contract, parse_ai_mindmap_response
from graph.schemas import GraphSchemaError


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-5.5"
DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe"
MAX_VIDEO_FRAMES = 6
VIDEO_AUDIO_SAMPLE_SECONDS = 600


def generate_web_mindmap(*, url: str, flow_id: str, model: str | None = None) -> dict[str, Any]:
    prompt = _graph_prompt(
        source_type="web",
        source_label=url,
        flow_id=flow_id,
        source_instruction=(
            "Use OpenAI web search to inspect the target URL and nearby source context. "
            "Prefer information from the provided URL. If the URL cannot be reached, "
            "create a reviewable node explaining that limitation."
        ),
    )
    return _responses_json(
        model=model,
        input_items=[_text_message(f"Target URL: {url}\n\n{prompt}")],
        tools=[{"type": "web_search"}],
    )


def generate_image_mindmap(
    *,
    file_name: str,
    mime_type: str,
    contents: bytes,
    flow_id: str,
    model: str | None = None,
) -> dict[str, Any]:
    prompt = _graph_prompt(
        source_type="image",
        source_label=file_name,
        flow_id=flow_id,
        source_instruction=(
            "Analyze the image directly. Describe observable structure, text, objects, "
            "relationships, uncertainties, and review questions."
        ),
    )
    return _responses_json(
        model=model,
        input_items=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {
                        "type": "input_image",
                        "image_url": _data_url(mime_type, contents),
                    },
                ],
            }
        ],
    )


def transcribe_audio(
    *,
    file_name: str,
    mime_type: str,
    contents: bytes,
    model: str = DEFAULT_TRANSCRIPTION_MODEL,
) -> str:
    from openai import OpenAI

    api_key = _require_openai_api_key()
    client = OpenAI(api_key=api_key)
    audio_file = (file_name, BytesIO(contents), mime_type)
    transcription = client.audio.transcriptions.create(
        model=model,
        file=audio_file,
    )
    return getattr(transcription, "text", "") or str(transcription)


def generate_audio_mindmap(
    *,
    file_name: str,
    transcript: str,
    flow_id: str,
    model: str | None = None,
) -> dict[str, Any]:
    prompt = _graph_prompt(
        source_type="audio",
        source_label=file_name,
        flow_id=flow_id,
        source_instruction=(
            "Use the transcript as the source. Preserve important claims, decisions, "
            "questions, tasks, and uncertainties."
        ),
    )
    return _responses_json(
        model=model,
        input_items=[_text_message(f"{prompt}\n\nTranscript:\n{transcript}")],
    )


def generate_video_mindmap(
    *,
    file_name: str,
    mime_type: str,
    contents: bytes,
    flow_id: str,
    model: str | None = None,
) -> dict[str, Any]:
    frames = sample_video_frames(contents, suffix=Path(file_name).suffix)
    audio_context = extract_and_transcribe_video_audio(
        file_name=file_name,
        contents=contents,
        suffix=Path(file_name).suffix,
    )
    has_transcript = bool(audio_context.get("transcript"))
    prompt = _graph_prompt(
        source_type="video",
        source_label=file_name,
        flow_id=flow_id,
        source_instruction=(
            "Analyze the sampled video frames and, when present, the local audio transcript. "
            "Use the transcript for spoken claims, decisions, and tasks. Use frames for visual "
            "structure, context, and observable UI or scene details. Mark uncertain or missing "
            "details as needs_review in node data."
        ),
    )
    transcript_note = (
        f"\n\nVideo audio transcript:\n{audio_context['transcript']}"
        if has_transcript
        else (
            "\n\nVideo audio transcript was not available locally. "
            f"Extraction status: {audio_context.get('status', 'unavailable')}. "
            "Do not invent spoken content."
        )
    )
    content = [{"type": "input_text", "text": f"{prompt}{transcript_note}"}]
    for frame in frames:
        content.append({"type": "input_image", "image_url": _data_url("image/jpeg", frame)})
    graph = _responses_json(
        model=model,
        input_items=[{"role": "user", "content": content}],
    )
    metadata = graph.setdefault("metadata", {})
    metadata["video_audio"] = {
        "status": audio_context.get("status", "unavailable"),
        "transcript": audio_context.get("transcript", ""),
        "extractor": audio_context.get("extractor", ""),
    }
    return graph


def extract_and_transcribe_video_audio(
    *,
    file_name: str,
    contents: bytes,
    suffix: str = ".mp4",
) -> dict[str, str]:
    ffmpeg_path = _resolve_ffmpeg_path()
    if not ffmpeg_path:
        return {
            "status": "ffmpeg_unavailable",
            "transcript": "",
            "extractor": "",
        }

    suffix = suffix if suffix.startswith(".") else f".{suffix}"
    with tempfile.NamedTemporaryFile(suffix=suffix or ".mp4", delete=False) as video_file:
        video_file.write(contents)
        video_path = Path(video_file.name)
    audio_path = video_path.with_suffix(".mp3")

    try:
        command = [
            ffmpeg_path,
            "-y",
            "-i",
            str(video_path),
            "-vn",
            "-t",
            str(VIDEO_AUDIO_SAMPLE_SECONDS),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "64k",
            str(audio_path),
        ]
        result = subprocess.run(
            command,
            capture_output=True,
            check=False,
            timeout=180,
        )
        if result.returncode != 0 or not audio_path.exists() or audio_path.stat().st_size == 0:
            return {
                "status": "no_audio_track",
                "transcript": "",
                "extractor": "ffmpeg",
            }

        transcript = transcribe_audio(
            file_name=f"{Path(file_name).stem}.mp3",
            mime_type="audio/mpeg",
            contents=audio_path.read_bytes(),
        )
        return {
            "status": "transcribed" if transcript.strip() else "empty_transcript",
            "transcript": transcript,
            "extractor": "ffmpeg",
        }
    except subprocess.TimeoutExpired:
        return {
            "status": "audio_extraction_timeout",
            "transcript": "",
            "extractor": "ffmpeg",
        }
    finally:
        video_path.unlink(missing_ok=True)
        audio_path.unlink(missing_ok=True)


def sample_video_frames(contents: bytes, *, suffix: str = ".mp4") -> list[bytes]:
    try:
        import cv2
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenCV is required for local video frame sampling.",
        ) from exc

    suffix = suffix if suffix.startswith(".") else f".{suffix}"
    with tempfile.NamedTemporaryFile(suffix=suffix or ".mp4", delete=False) as video_file:
        video_file.write(contents)
        video_path = video_file.name

    capture = None
    try:
        capture = cv2.VideoCapture(video_path)
        if not capture.isOpened():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not read local video file for frame sampling.",
            )

        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if frame_count <= 0:
            frame_indexes = [0]
        else:
            frame_indexes = sorted(
                {
                    min(frame_count - 1, max(0, int(frame_count * step / (MAX_VIDEO_FRAMES + 1))))
                    for step in range(1, MAX_VIDEO_FRAMES + 1)
                }
            )

        frames: list[bytes] = []
        for frame_index in frame_indexes:
            capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            ok, frame = capture.read()
            if not ok:
                continue
            success, encoded = cv2.imencode(".jpg", frame)
            if success:
                frames.append(encoded.tobytes())

        if not frames:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not sample any frames from the local video file.",
            )
        return frames
    finally:
        if capture is not None:
            capture.release()
        Path(video_path).unlink(missing_ok=True)


def _responses_json(
    *,
    input_items: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    api_key = _require_openai_api_key()
    payload: dict[str, Any] = {
        "model": model or get_setting("openai_default_model") or DEFAULT_MODEL,
        "input": input_items,
        "store": False,
        "text": {"format": {"type": "json_object"}},
    }
    if tools:
        payload["tools"] = tools

    try:
        data = _post_openai_json(payload, api_key)
    except HTTPException as exc:
        if tools and _uses_web_search(tools):
            fallback_tools = [
                {"type": "web_search_preview"}
                if tool.get("type") == "web_search"
                else tool
                for tool in tools
            ]
            payload["tools"] = fallback_tools
            data = _post_openai_json(payload, api_key)
        else:
            raise exc

    output_text = _extract_output_text(data)
    try:
        return parse_ai_mindmap_response(output_text)
    except GraphSchemaError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "OpenAI source graph failed schema validation.", "errors": exc.errors},
        ) from exc


def _post_openai_json(payload: dict[str, Any], api_key: str) -> dict[str, Any]:
    request = urllib.request.Request(
        OPENAI_RESPONSES_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=exc.code, detail=detail) from exc
    except urllib.error.URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"OpenAI request failed: {exc.reason}",
        ) from exc


def _extract_output_text(response: dict[str, Any]) -> str:
    if isinstance(response.get("output_text"), str):
        return response["output_text"]

    chunks: list[str] = []
    for item in response.get("output", []):
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []):
            if not isinstance(content, dict):
                continue
            text = content.get("text")
            if isinstance(text, str):
                chunks.append(text)
    if chunks:
        return "\n".join(chunks)
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="OpenAI response did not include text output.",
    )


def _graph_prompt(
    *,
    source_type: str,
    source_label: str,
    flow_id: str,
    source_instruction: str,
) -> str:
    prompt = f"""
Return only valid JSON for a React Flow mind map. JSON must have top-level
`nodes`, `edges`, and `viewport` keys.

Source type: {source_type}
Source label: {source_label}
Flow ID: {flow_id}

{source_instruction}

Rules:
- Include exactly one dataSource node for the source.
- Add response nodes for important concepts, decisions, tasks, risks, and review questions.
- Use stable string IDs.
- Every edge must reference existing node IDs.
- Response node data must include `title` and nested `data.summ`.
- Include `source_refs: []` on generated response nodes unless there is a concrete source reference.
- Mark uncertain, inferred, or uncited content with `status: "needs_review"`.
- Use node data `component_type: "{source_type}"` where relevant.
""".strip()
    return append_ai_graph_prompt_contract(prompt)


def _text_message(text: str) -> dict[str, Any]:
    return {"role": "user", "content": [{"type": "input_text", "text": text}]}


def _data_url(mime_type: str, contents: bytes) -> str:
    encoded = base64.b64encode(contents).decode("utf-8")
    return f"data:{mime_type};base64,{encoded}"


def _require_openai_api_key() -> str:
    api_key = get_setting("openai_api_key")
    if not api_key:
        raise configuration_http_error(
            MissingConfigurationError("Missing required environment variable(s): openai_api_key.")
        )
    return api_key


def _uses_web_search(tools: list[dict[str, Any]]) -> bool:
    return any(tool.get("type") == "web_search" for tool in tools)


def _resolve_ffmpeg_path() -> str:
    configured = get_setting("DOCMAP_FFMPEG_PATH")
    if configured and Path(configured).exists():
        return configured
    return shutil.which("ffmpeg") or ""
