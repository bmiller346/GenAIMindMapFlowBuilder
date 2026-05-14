from fastapi import FastAPI, HTTPException, UploadFile, status, File, Depends, Form, Query, Response
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from bson import ObjectId
import boto3
from typing import Any, List
from Models.model import CSVNodeQueryRequest, CSVNodeQueryResponse, Flow
from Models.model import PDFNodeQueryRequest
from Models.model import PDFNodeQueryResponse
from Models.model import TXTNodeQueryRequest
from Models.model import TXTNodeQueryResponse
from Models.model import MDNodeQueryRequest
from Models.model import MDNodeQueryResponse
from Models.model import HTMLNodeQueryRequest
from Models.model import HTMLNodeQueryResponse
from Models.model import DOCXNodeQueryRequest
from Models.model import DOCXNodeQueryResponse
from Models.model import PPTXNodeQueryRequest
from Models.model import PPTXNodeQueryResponse
from Models.model import ImgNodeQueryRequest
from Models.model import ImgNodeQueryResponse
from Models.model import AudioNodeQueryRequest
from Models.model import AudioNodeQueryResponse
from Models.model import YoutubeNodeQueryRequest
from Models.model import YoutubeNodeQueryResponse
from Models.model import VideoNodeQueryRequest
from Models.model import VideoNodeQueryResponse
from Models.model import WebNodeQueryRequest
from Models.model import WebNodeQueryResponse
from Models.model import SQLComponentRequest
from Models.model import SQLComponentResponse
from Models.model import SQLNodeQueryRequest
from Models.model import SQLNodeQueryResponse
from Models.model import ComponentFollowUpQueryRequest
from Models.model import ComponentFollowUpQueryResponse
from Models.model import MultipleQuestionAnswerQueryRequest
from Models.model import MultipleQuestionAnswerQueryResponse
from Models.model import FlowSummarizeRequest
from Models.model import FlowSummarizeResponse
from pymongo.mongo_client import MongoClient
from botocore.exceptions import ClientError
from hashlib import sha256
from io import BytesIO
from trp import Document
import time
import pandas as pd
from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai.embeddings import OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain_community.document_loaders import UnstructuredMarkdownLoader
import chromadb
from uuid import uuid4
from langchain_core.documents import Document as LangDocument
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
import datetime
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import sqlite3
from vanna.openai import OpenAI_Chat
from vanna.chromadb import ChromaDB_VectorStore
from typing import List
from crawl4ai import *
import os
import base64
import openai
import pypdfium2 as pdfium
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
from langchain.chains.combine_documents.stuff import StuffDocumentsChain
from langchain.chains.combine_documents.reduce import ReduceDocumentsChain
from langchain.chains import MapReduceDocumentsChain
import json
from unstructured.partition.pdf import partition_pdf
import camelot
import re
from unstructured.documents.elements import (
    Text,
    Title,
    NarrativeText,
    ListItem,
    Header,
)
import google.generativeai as genai
import vertexai
from vertexai.generative_models import GenerativeModel, Part
from google.oauth2 import service_account
import io
import markdown
from bs4 import BeautifulSoup
from docx import Document
from pathlib import Path
from pptx import Presentation
import tiktoken
import traceback
from dotenv import load_dotenv
from config import (
    MissingConfigurationError,
    configuration_http_error,
    get_setting,
    require_settings,
    reset_request_settings,
    set_request_settings,
)
from export.csv_tasks import export_task_rows
from export.workspace_graph import (
    build_workspace_graph,
    graph_to_markdown,
    graph_to_mermaid,
    graph_to_mmd_json,
    graph_to_opml,
    graph_to_task_rows,
    select_branch,
)
from integrations.miro.client import MiroClient
from integrations.miro.exporter import (
    export_branch_to_miro_payload,
    export_sme_review_board_payload,
)
from integrations.miro.native_mindmap import export_native_mindmap_payload
from integrations.miro.persistence import (
    apply_miro_external_refs_to_flow_json,
    miro_item_refs_from_result,
)
from integrations.monday.client import MondayClient
from integrations.monday.exporter import (
    export_tasks_to_monday_payload,
    select_monday_task_nodes,
)
from integrations.monday.persistence import (
    apply_monday_external_refs_to_flow_json,
    apply_monday_status_projection_to_flow_json,
    monday_item_refs_from_result,
    monday_refs_from_flow_json,
    monday_status_projections_from_result,
)
from documents.ingestion import (
    ALLOWED_DOCUMENT_EXTENSIONS,
    build_ai_intake_source_document,
    chunk_source_segments,
    DocumentIngestionError,
    file_sha256,
    ingest_supported_document,
    sanitize_filename,
    source_document_from_upload,
    validate_ai_intake_bytes,
    validate_upload_bytes,
)
from documents.source_refs import attach_source_refs_to_mindmap
from ai_helpers import generate_helper_preview, generate_source_librarian_preview
from graph.ai_contract import (
    append_ai_graph_prompt_contract,
    parse_ai_mindmap_response,
    validate_ai_mindmap_contract,
)
from graph.schemas import GraphSchemaError
from openai_sources import (
    generate_audio_mindmap,
    generate_image_mindmap,
    generate_video_mindmap,
    generate_web_mindmap,
    transcribe_audio,
)

load_dotenv()
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")

mongo_db_url = os.getenv("mongo_db_url")
openai_api_key_str = os.getenv("openai_api_key")
gemini_api_key_str = os.getenv("gemini_api_key")
gcp_project_id_str = os.getenv("gcp_project_id")
aws_access_key_id_str = os.getenv("aws_access_key_id")
aws_secret_access_key_str = os.getenv("aws_secret_access_key")
bucket_name = os.getenv("bucket_name")
gcp_service_account_file = os.getenv(
    "gcp_service_account_file", "./ai-interview-poc-2b5cf8540f16.json"
)
OPENAI_DEFAULT_MODEL = os.getenv("openai_default_model", "gpt-5.5")
OPENAI_REASONING_MODEL = os.getenv("openai_reasoning_model", "gpt-5.4")
OPENAI_EMBEDDING_MODEL = os.getenv(
    "openai_embedding_model", "text-embedding-3-large"
)

credentials = None
model_vertexai = None
if gcp_project_id_str and Path(gcp_service_account_file).exists():
    credentials = service_account.Credentials.from_service_account_file(
        gcp_service_account_file
    )
    vertexai.init(
        project=gcp_project_id_str, credentials=credentials, location="us-central1"
    )
    model_vertexai = GenerativeModel("gemini-2.0-flash")

genai.configure(api_key=gemini_api_key_str)

model = genai.GenerativeModel("gemini-2.0-flash")

connection = sqlite3.connect("sqlite_data.db")

GPT_4O_MAX_TOKENS = 128000

UPLOAD_DIR = "uploaded_pdfs"

openai.api_key = openai_api_key_str

operation_progress: dict[str, dict] = {}


def update_operation_progress(
    operation_id: str | None,
    *,
    phase: str,
    message: str,
    progress: int,
    detail: str = "",
    status_value: str = "running",
) -> None:
    if not operation_id:
        return

    operation_progress[operation_id] = {
        "operation_id": operation_id,
        "phase": phase,
        "message": message,
        "detail": detail,
        "progress": max(0, min(100, progress)),
        "status": status_value,
        "updated_at": utc_timestamp(),
    }

class SQLBot(ChromaDB_VectorStore, OpenAI_Chat):
    def __init__(self, config=None):
        ChromaDB_VectorStore.__init__(self, config=config)
        OpenAI_Chat.__init__(self, config=config)


class CSVBot(ChromaDB_VectorStore, OpenAI_Chat):
    def __init__(self, config=None):
        ChromaDB_VectorStore.__init__(self, config=config)
        OpenAI_Chat.__init__(self, config=config)


class LazyVannaBot:
    def __init__(self, bot_class, path: str, sqlite_path: str, train_sql_schema: bool = False):
        self.bot_class = bot_class
        self.path = path
        self.sqlite_path = sqlite_path
        self.train_sql_schema = train_sql_schema
        self._bot = None
        self._api_key = None

    def _get_bot(self):
        api_key = get_setting("openai_api_key")
        if not api_key:
            raise MissingConfigurationError(
                "Missing required environment variable(s): openai_api_key."
            )

        if self._bot is not None and self._api_key == api_key:
            return self._bot

        bot = self.bot_class(
            config={
                "api_key": api_key,
                "model": OPENAI_DEFAULT_MODEL,
                "temperature": 0,
                "path": self.path,
                "client": "persistent",
                "n_results": 1,
            }
        )
        bot.connect_to_sqlite(self.sqlite_path)

        if self.train_sql_schema:
            df_ddl = bot.run_sql("SELECT type, sql FROM sqlite_master WHERE sql IS NOT NULL")
            for ddl in df_ddl["sql"].to_list():
                bot.train(ddl=ddl)

        self._bot = bot
        self._api_key = api_key
        return bot

    def __getattr__(self, name):
        return getattr(self._get_bot(), name)


sqlBot = LazyVannaBot(SQLBot, "./SQLVectorStore", "sqlite_data.db", train_sql_schema=True)
csvBot = LazyVannaBot(CSVBot, "./CSVVectorStore", "csv_data.db")

app = FastAPI()

origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/operations/{operation_id}")
def get_operation_progress(operation_id: str):
    progress = operation_progress.get(operation_id)
    if not progress:
        return {
            "operation_id": operation_id,
            "phase": "queued",
            "message": "Waiting for backend to begin.",
            "detail": "",
            "progress": 5,
            "status": "queued",
            "updated_at": utc_timestamp(),
        }
    return progress


@app.middleware("http")
async def apply_local_user_settings(request, call_next):
    request_settings = {
        "openai_api_key": request.headers.get("x-docmap-openai-api-key") or "",
        "miro_api_token": request.headers.get("x-docmap-miro-api-token") or "",
        "monday_api_token": request.headers.get("x-docmap-monday-api-token") or "",
    }
    token = set_request_settings(
        {key: value for key, value in request_settings.items() if value}
    )
    previous_openai_key = openai.api_key
    if request_settings["openai_api_key"]:
        openai.api_key = request_settings["openai_api_key"]
    try:
        return await call_next(request)
    finally:
        openai.api_key = previous_openai_key
        reset_request_settings(token)


client = MongoClient(mongo_db_url, serverSelectionTimeoutMS=2000)

try:
    client.admin.command("ping")
    print("Pinged your deployment. You successfully connected to MongoDB!")
except Exception as e:
    print(e)

db = client["MindMap"]
flow_collection = db["flows"]
component_collection = db["components"]
node_collection = db["nodes"]
LOCAL_FLOW_STORE_PATH = Path(
    os.getenv("DOCMAP_LOCAL_FLOW_STORE", "docmap_flows.json")
)


def local_flow_store_path() -> Path:
    return Path(__file__).resolve().parent / LOCAL_FLOW_STORE_PATH


def load_local_flows() -> list[dict]:
    path = local_flow_store_path()
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def save_local_flows(flows: list[dict]) -> None:
    path = local_flow_store_path()
    path.write_text(json.dumps(flows, indent=2, default=str), encoding="utf-8")


def normalize_flow_record(flow: dict) -> dict:
    return {
        "flow_id": str(flow.get("_id") or flow.get("flow_id")),
        "flow_name": flow.get("flow_name") or "Untitled workspace",
        "flow_json": flow.get("flow_json") or "",
        "summary": flow.get("summary") or "",
        "flow_type": flow.get("flow_type") or "manual",
    }


def local_create_flow(flow_data: dict) -> dict:
    flows = load_local_flows()
    flow = {
        "_id": str(ObjectId()),
        **flow_data,
    }
    flows.append(flow)
    save_local_flows(flows)
    return flow


def local_find_flow(flow_id: str) -> dict | None:
    for flow in load_local_flows():
        if str(flow.get("_id") or flow.get("flow_id")) == flow_id:
            return flow
    return None


def local_update_flow(flow_id: str, updates: dict) -> bool:
    flows = load_local_flows()
    updated = False
    for flow in flows:
        if str(flow.get("_id") or flow.get("flow_id")) == flow_id:
            flow.update(updates)
            updated = True
            break
    if updated:
        save_local_flows(flows)
    return updated


def local_delete_flow(flow_id: str) -> bool:
    flows = load_local_flows()
    next_flows = [
        flow for flow in flows
        if str(flow.get("_id") or flow.get("flow_id")) != flow_id
    ]
    if len(next_flows) == len(flows):
        return False
    save_local_flows(next_flows)
    return True

# AWS S3 setup
s3_client = boto3.client(
    "s3",
    aws_access_key_id=aws_access_key_id_str,
    aws_secret_access_key=aws_secret_access_key_str,
    region_name="ap-south-1",
)


persistent_client = chromadb.PersistentClient()


class LazyOpenAIEmbeddings:
    def __init__(self):
        self._client = None
        self._api_key = None

    def _get_client(self):
        api_key = get_setting("openai_api_key")
        if not api_key:
            raise MissingConfigurationError(
                "Missing required environment variable(s): openai_api_key."
            )
        if self._client is None or self._api_key != api_key:
            self._client = OpenAIEmbeddings(
                model=OPENAI_EMBEDDING_MODEL, api_key=api_key
            )
            self._api_key = api_key
        return self._client

    def __getattr__(self, name):
        return getattr(self._get_client(), name)


class LazyChromaStore:
    def __init__(self):
        self._store = None
        self._api_key = None

    def _get_store(self):
        api_key = get_setting("openai_api_key")
        if not api_key:
            raise MissingConfigurationError(
                "Missing required environment variable(s): openai_api_key."
            )
        if self._store is None or self._api_key != api_key:
            self._store = Chroma(
                client=persistent_client,
                collection_name="pdfs",
                embedding_function=OpenAIEmbeddings(
                    model=OPENAI_EMBEDDING_MODEL, api_key=api_key
                ),
            )
            self._api_key = api_key
        return self._store

    def __getattr__(self, name):
        return getattr(self._get_store(), name)


class LazySemanticChunker:
    def __init__(self):
        self._chunker = None
        self._api_key = None

    def _get_chunker(self):
        api_key = get_setting("openai_api_key")
        if not api_key:
            raise MissingConfigurationError(
                "Missing required environment variable(s): openai_api_key."
            )
        if self._chunker is None or self._api_key != api_key:
            self._chunker = SemanticChunker(
                OpenAIEmbeddings(model=OPENAI_EMBEDDING_MODEL, api_key=api_key)
            )
            self._api_key = api_key
        return self._chunker

    def __getattr__(self, name):
        return getattr(self._get_chunker(), name)


class LazyChatOpenAI:
    def __init__(self):
        self._llm = None
        self._api_key = None

    def _get_llm(self):
        api_key = get_setting("openai_api_key")
        if not api_key:
            raise MissingConfigurationError(
                "Missing required environment variable(s): openai_api_key."
            )
        if self._llm is None or self._api_key != api_key:
            self._llm = ChatOpenAI(model=OPENAI_REASONING_MODEL, api_key=api_key)
            self._api_key = api_key
        return self._llm

    def __getattr__(self, name):
        return getattr(self._get_llm(), name)

    def __ror__(self, other):
        return other | self._get_llm()


embedding_function = LazyOpenAIEmbeddings()
vector_store_from_client = LazyChromaStore()
PDFCollection = persistent_client.get_or_create_collection("pdfs")
text_splitter = LazySemanticChunker()
llm = LazyChatOpenAI()


def read_upload_bytes(file: UploadFile) -> bytes:
    file.file.seek(0)
    file_bytes = file.file.read()
    file.file.seek(0)
    return file_bytes


def prepare_source_upload(file: UploadFile, flow_id: str, expected_extension: str | None = None) -> dict:
    file_bytes = read_upload_bytes(file)
    upload = validate_upload_bytes(file.filename, file_bytes)

    if expected_extension and upload["extension"] != expected_extension:
        raise DocumentIngestionError(f"Only {expected_extension.upper()} files are allowed.")

    existing_component = component_collection.find_one(
        {"file_hash": upload["file_hash"], "flow_id": ObjectId(flow_id)}
    )
    if existing_component:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="File already exists in the workspace.",
        )

    existing_versions = component_collection.count_documents(
        {
            "flow_id": ObjectId(flow_id),
            "source_document.filename": upload["filename"],
        }
    )
    return ingest_supported_document(
        upload["filename"],
        file_bytes,
        version=existing_versions + 1,
    )


def prepare_ai_intake_upload(file: UploadFile, flow_id: str) -> dict:
    file_bytes = read_upload_bytes(file)
    upload = validate_ai_intake_bytes(file.filename, file_bytes)

    if upload["extension"] in ALLOWED_DOCUMENT_EXTENSIONS:
        return prepare_source_upload(file, flow_id)

    existing_component = component_collection.find_one(
        {"file_hash": upload["file_hash"], "flow_id": ObjectId(flow_id)}
    )
    if existing_component:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="File already exists in the workspace.",
        )

    existing_versions = component_collection.count_documents(
        {
            "flow_id": ObjectId(flow_id),
            "source_document.filename": upload["filename"],
        }
    )
    source_document = build_ai_intake_source_document(
        upload["filename"],
        file_bytes,
        version=existing_versions + 1,
    )
    return {
        "upload": upload,
        "file_bytes": file_bytes,
        "source_document": source_document,
        "source_segments": [],
        "document_chunks": [],
    }


def binary_source_context(
    *,
    filename: str,
    file_bytes: bytes,
    source_type: str,
    flow_id: str,
) -> dict:
    sanitized_filename = sanitize_filename(filename)
    file_hash = file_sha256(file_bytes)
    existing_versions = component_collection.count_documents(
        {
            "flow_id": ObjectId(flow_id),
            "source_document.filename": sanitized_filename,
        }
    )
    upload = {
        "filename": sanitized_filename,
        "original_filename": filename or sanitized_filename,
        "extension": source_type,
        "size": len(file_bytes),
        "file_hash": file_hash,
    }
    source_document = source_document_from_upload(upload, version=existing_versions + 1)
    return {
        "upload": upload,
        "file_bytes": file_bytes,
        "source_document": source_document,
        "source_segments": [],
        "document_chunks": [],
    }


def virtual_source_context(*, label: str, source_type: str, flow_id: str) -> dict:
    file_bytes = label.encode("utf-8")
    return binary_source_context(
        filename=f"{source_type}-{file_sha256(file_bytes)[:12]}.{source_type}.txt",
        file_bytes=file_bytes,
        source_type=source_type,
        flow_id=flow_id,
    )


def source_metadata_fields(source_context: dict) -> dict:
    source_document = source_context["source_document"]
    return {
        "name": source_document["filename"],
        "original_name": source_document["original_filename"],
        "file_hash": source_document["file_hash"],
        "source_document_id": source_document["id"],
        "source_document": source_document,
        "source_segments": source_context.get("source_segments", []),
        "document_chunks": source_context["document_chunks"],
    }


def ingestion_http_error(error: DocumentIngestionError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


def source_segments_from_page_records(records: list[dict]) -> list[dict]:
    segments = []
    cursor_by_page: dict[int, int] = {}

    for record in records:
        text = record.get("content") or record.get("data") or ""
        if not text:
            continue

        page = record.get("page_number")
        cursor = cursor_by_page.get(page, 0)
        segments.append(
            {
                "text": text,
                "page": page,
                "heading": None,
                "start_char": cursor,
                "end_char": cursor + len(text),
            }
        )
        cursor_by_page[page] = cursor + len(text) + 2

    return segments


def ground_mindmap_with_source_refs(response_json: dict, source_context: dict) -> dict:
    response_json = validate_ai_mindmap_contract(response_json)
    return attach_source_refs_to_mindmap(
        response_json,
        source_context["source_document"],
        source_context["document_chunks"],
    )


def parse_ai_mindmap_or_422(raw_response: str | dict) -> dict:
    try:
        return parse_ai_mindmap_response(raw_response)
    except GraphSchemaError as exc:
        raise HTTPException(
            status_code=422,
            detail={"message": "AI graph output failed schema validation.", "errors": exc.errors},
        ) from exc


def workspace_brief_has_context(workspace_brief: dict | None) -> bool:
    if not workspace_brief:
        return False

    if workspace_brief.get("configured") is True:
        return True

    desired_outputs = workspace_brief.get("desired_outputs") or []
    non_default_outputs = [output for output in desired_outputs if output != "mind_map"]

    return any(
        [
            str(workspace_brief.get("goal") or "").strip(),
            str(workspace_brief.get("audience") or "").strip(),
            str(workspace_brief.get("domain_context") or "").strip(),
            str(workspace_brief.get("review_rules") or "").strip(),
            non_default_outputs,
        ]
    )


def query_with_workspace_brief(query: str, workspace_brief: dict | None) -> str:
    if not workspace_brief_has_context(workspace_brief):
        return query

    brief_lines = [
        "Use this structured workspace brief while answering.",
        f"Goal: {workspace_brief.get('goal') or 'Not specified'}",
        f"Audience: {workspace_brief.get('audience') or 'Not specified'}",
        f"Domain context: {workspace_brief.get('domain_context') or 'Not specified'}",
        f"Desired outputs: {', '.join(workspace_brief.get('desired_outputs') or []) or 'Not specified'}",
        f"Source mode: {workspace_brief.get('source_mode') or 'source_plus_context'}",
        f"Assumptions allowed: {bool(workspace_brief.get('assumptions_allowed'))}",
        f"Preset: {workspace_brief.get('preset') or 'custom'}",
        f"Output style: {workspace_brief.get('output_style') or 'technical_reference_map'}",
        f"Preferred node types: {', '.join(workspace_brief.get('node_types') or []) or 'Not specified'}",
        f"Review policy: {', '.join(workspace_brief.get('review_policy') or []) or 'Not specified'}",
        f"Review rules: {workspace_brief.get('review_rules') or 'Not specified'}",
        "",
        "When the brief adds context beyond the source, keep the answer explicit about what is source-backed versus assumption-based.",
        "Respect review policy by marking uncited, low-confidence, or assumption-based nodes as reviewable when requested.",
        "",
        f"User question: {query}",
    ]
    return "\n".join(brief_lines)


def calculate_file_hash(file):
    hasher = sha256()

    if isinstance(file, bytes):
        file = BytesIO(file)

    while chunk := file.read(8192):
        hasher.update(chunk)

    file.seek(0)
    return hasher.hexdigest()


def validate_dataframe(df):
    try:
        if not isinstance(df, list) and not all(isinstance(item, dict) for item in df):
            return []
        else:
            return df

    except ValueError:
        return []


def upload_to_s3(file_bytes, bucket, key):
    try:
        require_settings("aws_access_key_id", "aws_secret_access_key", "bucket_name")
    except MissingConfigurationError as exc:
        raise configuration_http_error(exc) from exc

    try:
        s3_client.put_object(Bucket=bucket, Key=key, Body=file_bytes)
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"S3 Upload Error: {str(e)}")


def extract_text_and_tables(key):
    try:
        require_settings("aws_access_key_id", "aws_secret_access_key", "bucket_name")
    except MissingConfigurationError as exc:
        raise configuration_http_error(exc) from exc

    client = boto3.client(
        "textract",
        aws_access_key_id=aws_access_key_id_str,
        aws_secret_access_key=aws_secret_access_key_str,
        region_name="ap-south-1",
    )

    response = client.start_document_analysis(
        DocumentLocation={"S3Object": {"Bucket": bucket_name, "Name": key}},
        FeatureTypes=["TABLES", "FORMS"],
    )

    print(response)

    job_id = response["JobId"]
    print("job_id")
    while True:
        response = client.get_document_analysis(JobId=job_id)
        status = response["JobStatus"]
        if status in ["SUCCEEDED", "FAILED"]:
            break
        time.sleep(5)

    if status == "FAILED":
        raise Exception("Document analysis failed")

    all_blocks = response["Blocks"]
    next_token = response.get("NextToken", None)
    print(all_blocks)

    while next_token:
        response = client.get_document_analysis(JobId=job_id, NextToken=next_token)
        all_blocks.extend(response["Blocks"])
        next_token = response.get("NextToken", None)

    response["Blocks"] = all_blocks

    doc = Document(response)
    lines = [line.text for page in doc.pages for line in page.lines if line.text]
    tables = []
    key_values = {}

    for page in doc.pages:
        for table in page.tables:
            table_data = []
            for row in table.rows:
                row_data = [cell.text if cell.text else "" for cell in row.cells]
                table_data.append(row_data)
            df = pd.DataFrame(table_data)
            tables.append(df)

        for field in page.form.fields:
            key = field.key.text if field.key and field.key.text else ""
            value = field.value.text if field.value and field.value.text else ""
            key_values[key] = value

    date = next((line for line in lines if "Date" in line), None)
    return lines, tables, key_values, date


def sanitize_path(path):
    """Sanitize the path to remove any invalid characters."""
    return re.sub(r"[^\w\s-]", "_", path).strip()


def camelot_pdf_processing(flow_id, file, flow_type):
    try:
        source_context = prepare_source_upload(file, flow_id, expected_extension="pdf")
        source_document = source_context["source_document"]
        file_bytes = source_context["file_bytes"]
        sanitized_flow_id = sanitize_path(flow_id)
        sanitized_filename = source_document["filename"]

        flow_dir = os.path.join(UPLOAD_DIR, sanitized_flow_id)

        # Ensure the directory exists
        os.makedirs(flow_dir, exist_ok=True)

        # Create the full file path
        file_path = os.path.join(flow_dir, sanitized_filename)

        print(file_path)

        # Save the uploaded file
        with open(file_path, "wb") as f:
            f.write(file_bytes)

        print(f"File saved at: {file_path}")

        print(file_bytes)

        file_hash = source_document["file_hash"]
        print(file_hash)

        # Now, upload the file to S3
        folder = f"uploads/{flow_id}/"
        s3_key = folder + sanitized_filename

        # Pass the local file path to upload_to_s3
        upload_to_s3(file_bytes, bucket_name, s3_key)
        print("File uploaded to S3")

        ocr_config = {
            "languages": ["eng"],
            "strategy": "fast",
        }
        elements = partition_pdf(filename=file_path, **ocr_config)

        content_data = []

        # Extract content (text, title, etc.) from the PDF
        for element in elements:
            if isinstance(element, (Text, Title, NarrativeText, ListItem, Header)):
                content_data.append(
                    {"data": element.text, "page_number": element.metadata.page_number}
                )

        tables = camelot.read_pdf(
            file_path,
            pages="all",
            flavor="stream",
            edge_tol=900,
            row_tol=6,
            strip_text="\n",
        )

        print(f"Total tables found: {len(tables)}")

        result_tbl_list = []

        # Extract tables from the PDF
        for i, table in enumerate(tables):
            page_number = (
                table.page
            )  # Get the page number from which the table was extracted
            print(f"Table {i + 1} extracted from page: {page_number}\n")
            print(table.df)
            result_tbl_list.append(
                {"data": table.df.to_string(index=False), "page_number": table.page}
            )

        # Combine content_data and result_tbl_list based on the page number
        combined_data = []

        for content_item in content_data:
            page_number = content_item["page_number"]
            # Check if a matching table exists for the current page number
            matching_table = next(
                (
                    table
                    for table in result_tbl_list
                    if table["page_number"] == page_number
                ),
                None,
            )

            # Store content along with the page number and table (if exists)
            if matching_table:
                combined_content = (
                    f"{content_item['data']}\n\nTable:\n{matching_table['data']}"
                )
                combined_data.append(
                    {"page_number": page_number, "content": combined_content}
                )
            else:
                combined_data.append(
                    {"page_number": page_number, "content": content_item["data"]}
                )

        print("-==============-")

        # Print the final combined data
        print(combined_data)

        combined_data_str = json.dumps(combined_data, indent=4)
        source_context["source_segments"] = source_segments_from_page_records(combined_data)
        source_context["document_chunks"] = chunk_source_segments(
            source_context["source_segments"], source_document["id"]
        )

        chunks = do_semantic_chunking(combined_data_str)
        print(chunks)

        summary = process_pdf_summary(chunks)
        
        if flow_type == "manual":

            component_metadata = {
                "flow_id": ObjectId(flow_id),
                "size": len(file_bytes),
                "s3_path": s3_key,
                "type": "pdf",
                "processing_type": "custom",
                "summary": summary,
                **source_metadata_fields(source_context),
            }

            component_id = component_collection.insert_one(component_metadata).inserted_id
            EmbeddingsDocuments = []
            for i in range(len(chunks)):
                metadata = {
                    "component_id": str(component_id),
                    "file_name": source_document["filename"],
                    "flow_id": flow_id,
                    "source_document_id": source_document["id"],
                }
                EmbeddingsDocuments.append(
                    LangDocument(page_content=chunks[i].page_content, metadata=metadata)
                )
            uuids = [str(uuid4()) for _ in range(len(EmbeddingsDocuments))]

            vector_store_from_client.add_documents(documents=EmbeddingsDocuments, ids=uuids)
            return {"component_id": str(component_id), "type": "pdf"}
        
        else:
                    
            template = """You are tasked with generating a JSON mind map for given summary of the pdf document and that should be compatible with React Flow for rendering a flow diagram. The mind map should adhere to the following rules:

                1. **Node Types:**
                - There will always be one `dataSource` node, which serves as the root of the flow.
                - There will be a maximum of 5 `response` nodes.

                2. **Node Relationships:**
                - The `dataSource` node should be connected to all `response` nodes.
                - `response` nodes may also connect to each other if it improves the logical flow or visualization.

                3. **Node Properties:**
                - Each node should have:
                    - `id` (unique identifier of 12 or 24 digit unique uuid or nanoid)
                    - `type` (`dataSource` or `response`)
                    - `position` (coordinates in the form {{ "x": <number>, "y": <number> }} for layout)
                    - `measured` (an object defining width and height):
                        {{
                            "width": <number>,
                            "height": <number>
                        }}
                    - `targetPosition` (position of the target connection, default to `"left"`)
                    - `sourcePosition` (position of the source connection, default to `"right"`)
                    - `selected` (boolean, default to `false`)
                    - `deletable` (boolean, default to `true` for `response` and `false` for `dataSource`)

                4. **Node Data Format:**
                - `dataSource` Node:
                    - `data` contains the following properties:
                        {{
                            "prompt": "<data source description>",
                            "name": "pdf", !!!DOESN"T CHANGES 
                            "content": "<file name or content>",
                            "flow_id": "{flow_id}",
                            "file": "{filename}"  // Empty object or file metadata
                        }}

                - `response` Node:
                    - `data` contains nested properties:
                        {{
                            "id": "<unique identifier of 12 or 24 digit unique uuid or nanoid>",
                            "type": "MDNode | WebNode | MultipleQA | other",
                            "data": {{
                                "question": "<question text, if applicable>",
                                "summ": "<summary or answer>",
                                "df": [],
                                "graph": "",
                                "flow_id": "{flow_id}",
                                "component_id": "<component reference ID - unique identifier of 12 or 24 digit unique uuid or nanoid>",
                                "component_type": "pdf"
                            }}
                        }}

                5. **Connections:**
                - Connections between nodes should be represented by edges, with the following format:
                    - `id` (unique identifier for the edge)
                    - `source` (ID of the source node)
                    - `target` (ID of the target node)
                    - `type` (optional, defaults to `default`)
                    - 'animated' !!WILL ALWAYS BE TRUE

                6. **Viewport Configuration:**
                - Include a `viewport` object that specifies:
                    - `x` (horizontal position of the viewport)
                    - `y` (vertical position of the viewport)
                    - `zoom` (zoom level for initial rendering)
                    
                Here is the PDF summary for which you need to generate the mind map:
                {summary_pdf}

                ### Additional Considerations:
                - Ensure that the node positions are distributed properly to avoid overlap.
                - If fewer than 5 `response` nodes are required, adjust accordingly.
                - Prioritize connecting `response` nodes where it adds logical structure to the flow.

                ### IMPORTANT:
                - **RETURN ONLY THE VALID JSON OBJECT AND NO ADDITIONAL COMMENTS**.
                - Do **not** include any explanations, text, or additional information.
                - Maintain the format with double curly braces `{{` and `}}` as shown in the format.
                """

            template = append_ai_graph_prompt_contract(template)
            prompt = PromptTemplate.from_template(template)

            lm_chain = prompt | llm
            
            answer = lm_chain.invoke(
                    {"summary_pdf": summary, "flow_id": flow_id, "filename": source_document["filename"]}
            )

            responseList = answer.content

            print(responseList)

            response_json = parse_ai_mindmap_or_422(responseList)
            
            print(response_json)

            response_json = ground_mindmap_with_source_refs(response_json, source_context)
            
            component_metadata = {
                "flow_id": ObjectId(flow_id),
                "type": "pdf",
                "processing_type": "gpt",
                "mindmap_json": response_json,
                **source_metadata_fields(source_context),
            }

            component_id = component_collection.insert_one(component_metadata).inserted_id

            return {
                "component_id": str(component_id),
                "type": "pdf",
                "mindmap_json": response_json,
                "flow_type": "automatic"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=e)


def extract_text_from_upload(file: UploadFile) -> str:
    file.file.seek(0)
    content = file.file.read()
    extension = file.filename.split(".")[-1].lower()

    if extension == "txt":
        return content.decode("utf-8", errors="ignore")

    elif extension == "md":
        html = markdown.markdown(content.decode("utf-8", errors="ignore"))
        return BeautifulSoup(html, "html.parser").get_text()

    elif extension == "html":
        return BeautifulSoup(content, "html.parser").get_text()

    elif extension == "docx":
        doc = Document(io.BytesIO(content))
        return "\n".join([p.text for p in doc.paragraphs])

    elif extension == "pptx":
        prs = Presentation(io.BytesIO(content))
        text = []
        for slide in prs.slides:
            for shape in slide.shapes:
                if hasattr(shape, "text"):
                    text.append(shape.text)
        return "\n".join(text)

    else:
        raise ValueError(f"Unsupported file type: {extension}")


def is_within_gpt4o_token_limit(file: UploadFile) -> bool:
    try:
        text = extract_text_from_upload(file)
        encoding = tiktoken.get_encoding("cl100k_base")
        token_count = len(encoding.encode(text))
        print("token_count : ", token_count)
        return token_count <= GPT_4O_MAX_TOKENS
    except Exception as e:
        print(f"Error checking token count: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Malformed or unreadable document: {str(e)}",
        ) from e


def process_pdf_summary(chunks):
    map_template = """Write a concise summary of the following content:
                    {content}
                    Summary:
                    """
    map_prompt = PromptTemplate.from_template(map_template)
    map_chain = LLMChain(prompt=map_prompt, llm=llm)

    reduce_template = """The following is a set of summaries:
                        {doc_summaries}
                        Summarize the above summaries with all the key details.
                        Summary:"""
    reduce_prompt = PromptTemplate.from_template(reduce_template)
    reduce_chain = LLMChain(prompt=reduce_prompt, llm=llm)

    stuff_chain = StuffDocumentsChain(
        llm_chain=reduce_chain, document_variable_name="doc_summaries"
    )

    reduce_documents_chain = ReduceDocumentsChain(
        combine_documents_chain=stuff_chain,
    )

    map_reduce_chain = MapReduceDocumentsChain(
        llm_chain=map_chain,
        document_variable_name="content",
        reduce_documents_chain=reduce_documents_chain,
    )

    small_chunks = chunks[:24]

    summary = map_reduce_chain.run(small_chunks)
    print(summary)
    return summary


def use_aws_textract(file, flow_id, flow_type):
    source_context = prepare_source_upload(file, flow_id, expected_extension="pdf")
    source_document = source_context["source_document"]
    file_bytes = source_context["file_bytes"]
    file_hash = source_document["file_hash"]
    print(file_hash)
    file_name = source_document["filename"]
    folder = f"uploads/{flow_id}/"
    s3_key = folder + file_name
    upload_to_s3(file_bytes, bucket_name, s3_key)
    print("uploaded")
    data_for_chunking = "Data : "
    try:
        lines, tables, key_values, date = extract_text_and_tables(s3_key)
        for i, table in enumerate(tables):
            print(f"Table {i+1}:\n")
            print(table.to_string() + "\n\n")
            data_for_chunking = data_for_chunking + f"Table {i+1}:\n"
            data_for_chunking = data_for_chunking + table.to_string() + "\n\n"
        print("Extracted Key-Value Pairs:\n")
        for key, value in key_values.items():
            print(f"{key}: {value}\n")
            data_for_chunking = data_for_chunking + f"{key}: {value}\n"
        if date:
            print(f"Date: {date}\n")
            data_for_chunking = data_for_chunking + f"Date: {date}\n"
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=f"Text extraction error: {str(e)}")
    source_context["source_segments"] = [
        {
            "text": data_for_chunking,
            "page": None,
            "heading": "Textract output",
            "start_char": 0,
            "end_char": len(data_for_chunking),
        }
    ]
    source_context["document_chunks"] = chunk_source_segments(
        source_context["source_segments"], source_document["id"]
    )
    chunks = do_semantic_chunking(data_for_chunking)
    print(chunks)

    summary = process_pdf_summary(chunks)
    
    if flow_type == "manual":
        
        component_metadata = {
            "flow_id": ObjectId(flow_id),
            "size": len(file_bytes),
            "s3_path": s3_key,
            "type": "pdf",
            "processing_type": "aws",
            "summary": summary,
            **source_metadata_fields(source_context),
        }

        component_id = component_collection.insert_one(component_metadata).inserted_id
        EmbeddingsDocuments = []
        for i in range(len(chunks)):
            metadata = {
                "component_id": str(component_id),
                "file_name": source_document["filename"],
                "flow_id": flow_id,
                "source_document_id": source_document["id"],
            }
            EmbeddingsDocuments.append(
                LangDocument(page_content=chunks[i].page_content, metadata=metadata)
            )
        uuids = [str(uuid4()) for _ in range(len(EmbeddingsDocuments))]

        vector_store_from_client.add_documents(documents=EmbeddingsDocuments, ids=uuids)
        return {"component_id": str(component_id), "type": "pdf"}
    
    else:
        
        template = """You are tasked with generating a JSON mind map for given summary of the pdf document and that should be compatible with React Flow for rendering a flow diagram. The mind map should adhere to the following rules:

                1. **Node Types:**
                - There will always be one `dataSource` node, which serves as the root of the flow.
                - There will be a maximum of 5 `response` nodes.

                2. **Node Relationships:**
                - The `dataSource` node should be connected to all `response` nodes.
                - `response` nodes may also connect to each other if it improves the logical flow or visualization.

                3. **Node Properties:**
                - Each node should have:
                    - `id` (unique identifier of 12 or 24 digit unique uuid or nanoid)
                    - `type` (`dataSource` or `response`)
                    - `position` (coordinates in the form {{ "x": <number>, "y": <number> }} for layout)
                    - `measured` (an object defining width and height):
                        {{
                            "width": <number>,
                            "height": <number>
                        }}
                    - `targetPosition` (position of the target connection, default to `"left"`)
                    - `sourcePosition` (position of the source connection, default to `"right"`)
                    - `selected` (boolean, default to `false`)
                    - `deletable` (boolean, default to `true` for `response` and `false` for `dataSource`)

                4. **Node Data Format:**
                - `dataSource` Node:
                    - `data` contains the following properties:
                        {{
                            "prompt": "<data source description>",
                            "name": "pdf", !!!DOESN"T CHANGES 
                            "content": "<file name or content>",
                            "flow_id": "{flow_id}",
                            "file": "{filename}"  // Empty object or file metadata
                        }}

                - `response` Node:
                    - `data` contains nested properties:
                        {{
                            "id": "<unique identifier of 12 or 24 digit unique uuid or nanoid>",
                            "type": "MDNode | WebNode | MultipleQA | other",
                            "data": {{
                                "question": "<question text, if applicable>",
                                "summ": "<summary or answer>",
                                "df": [],
                                "graph": "",
                                "flow_id": "{flow_id}",
                                "component_id": "<component reference ID - unique identifier of 12 or 24 digit unique uuid or nanoid>",
                                "component_type": "pdf"
                            }}
                        }}

                5. **Connections:**
                - Connections between nodes should be represented by edges, with the following format:
                    - `id` (unique identifier for the edge)
                    - `source` (ID of the source node)
                    - `target` (ID of the target node)
                    - `type` (optional, defaults to `default`)
                    - 'animated' !!WILL ALWAYS BE TRUE

                6. **Viewport Configuration:**
                - Include a `viewport` object that specifies:
                    - `x` (horizontal position of the viewport)
                    - `y` (vertical position of the viewport)
                    - `zoom` (zoom level for initial rendering)
                    
                Here is the PDF summary for which you need to generate the mind map:
                {summary_pdf}

                ### Additional Considerations:
                - Ensure that the node positions are distributed properly to avoid overlap.
                - If fewer than 5 `response` nodes are required, adjust accordingly.
                - Prioritize connecting `response` nodes where it adds logical structure to the flow.

                ### IMPORTANT:
                - **RETURN ONLY THE VALID JSON OBJECT AND NO ADDITIONAL COMMENTS**.
                - Do **not** include any explanations, text, or additional information.
                - Maintain the format with double curly braces `{{` and `}}` as shown in the format.
                """

        template = append_ai_graph_prompt_contract(template)
        prompt = PromptTemplate.from_template(template)

        lm_chain = prompt | llm
        
        answer = lm_chain.invoke(
            {"summary_pdf": summary, "flow_id": flow_id, "filename": source_document["filename"]}
        )

        responseList = answer.content

        print(responseList)

        response_json = parse_ai_mindmap_or_422(responseList)
        
        print(response_json)

        response_json = ground_mindmap_with_source_refs(response_json, source_context)
        
        component_metadata = {
            "flow_id": ObjectId(flow_id),
            "type": "pdf",
            "processing_type": "gpt",
            "mindmap_json": response_json,
            **source_metadata_fields(source_context),
        }

        component_id = component_collection.insert_one(component_metadata).inserted_id

        return {
            "component_id": str(component_id),
            "type": "pdf",
            "mindmap_json": response_json,
            "flow_type": "automatic"
        }


def do_semantic_chunking(docs):
    documents = text_splitter.create_documents([docs])
    print("Number of chunks created: ", len(documents))
    for i in range(len(documents)):
        print()
        print(f"CHUNK : {i+1}")
        print(documents[i].page_content)
    return documents


def get_relevant_passage(query: str, flow_id: str, component_id: str, n_results: int):
    results = vector_store_from_client.similarity_search(
        query=query,
        k=2,
        filter={"$and": [{"component_id": component_id}, {"flow_id": flow_id}]},
    )
    return [doc.page_content for doc in results]


def fetch_question_answer_from_node_collection(parent_id: str, flow_id: str):
    try:
        record = node_collection.find_one(
            {
                "_id": ObjectId(parent_id),
                "flow_id": ObjectId(flow_id),
                "is_delete": "false",
            }
        )

        print("Fetched record:", record)

        if not record:
            return None, None

        print("Question value:", record.get("question"))

        question = record.get("question", None)
        answer = None

        if record["type"] == "pdf":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])
            df_string = " | ".join([str(item) for item in df_list])

            answer += " DataFrame: " + df_string

        elif record["type"] == "txt":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])
            df_string = " | ".join([str(item) for item in df_list])

            answer += " DataFrame: " + df_string

        elif record["type"] == "md":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])
            df_string = " | ".join([str(item) for item in df_list])

            answer += " DataFrame: " + df_string

        elif record["type"] == "html":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])
            df_string = " | ".join([str(item) for item in df_list])

            answer += " DataFrame: " + df_string

        elif record["type"] == "docx":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])
            df_string = " | ".join([str(item) for item in df_list])

            answer += " DataFrame: " + df_string

        elif record["type"] == "pptx":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])
            df_string = " | ".join([str(item) for item in df_list])

            answer += " DataFrame: " + df_string

        elif record["type"] == "image":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])

            df_string = " | ".join([str(item) for item in df_list])

            answer += " DataFrame: " + df_string

        elif record["type"] == "audio":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])
            df_string = " | ".join([str(item) for item in df_list])

            answer += " DataFrame: " + df_string

        elif record["type"] == "youtube":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])
            df_string = " | ".join([str(item) for item in df_list])

            answer += " DataFrame: " + df_string

        elif record["type"] == "video":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])
            df_string = " | ".join([str(item) for item in df_list])

            answer += " DataFrame: " + df_string

        elif record["type"] == "sql":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])
            df_string = " | ".join([str(item) for item in df_list])

            answer += " DataFrame: " + df_string

        elif record["type"] == "csv":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])
            df_string = " | ".join([str(item) for item in df_list])
            
            answer += " DataFrame: " + df_string

        elif record["type"] == "web":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])
            df_string = " | ".join([str(item) for item in df_list])
            
            answer += " DataFrame: " + df_string

        elif record["type"] == "MultipleQA":
            answer = "Answer: " + str(record.get("summ", "Answer not found."))
            df_list = record.get("df", [])
            df_string = " | ".join([str(item) for item in df_list])
            
            answer += " DataFrame: " + df_string

        print("Answer:", answer)

        return question, answer
    except Exception as e:
        traceback.print_exc()
        print(f"Error: {e}")
        return None, None


@app.post("/create-flow/")
def create_flow(flow: dict):
    try:
        flow_type = flow.get("flow_type") or "manual"
        flow_data = {
            "flow_name": flow.get("flow_name") or "New Flow",
            "flow_json": flow.get("flow_json") or "",
            "summary": flow.get("summary") or "",
            "flow_type": flow_type,
        }
        try:
            flow_id = flow_collection.insert_one(flow_data).inserted_id
        except PyMongoError:
            flow_id = local_create_flow(flow_data)["_id"]
        return {"flow_id": str(flow_id), "flow_type": flow_type}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating flow: {str(e)}")


@app.delete("/delete-flow/{flow_id}")
def delete_flow(flow_id: str):
    try:
        if not ObjectId.is_valid(flow_id):
            if local_delete_flow(flow_id):
                return {"status": "success"}
            raise HTTPException(status_code=404, detail="Flow not found")

        flow_object_id = ObjectId(flow_id)

        try:
            components = component_collection.find({"flow_id": flow_object_id})
            for component in components:
                component_id = component["_id"]
                node_collection.delete_many({"component_id": component_id})
            component_collection.delete_many({"flow_id": flow_object_id})

            result = flow_collection.delete_one({"_id": flow_object_id})
            if result.deleted_count == 0:
                local_delete_flow(flow_id)
        except PyMongoError:
            local_delete_flow(flow_id)

        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting flow: {str(e)}")


@app.get("/flows/", response_model=List[Flow])
def list_flows():
    try:
        flows = flow_collection.find()
        mongo_flows = [normalize_flow_record(flow) for flow in flows]
        local_flows = [normalize_flow_record(flow) for flow in load_local_flows()]
        mongo_ids = {flow["flow_id"] for flow in mongo_flows}
        return mongo_flows + [
            flow for flow in local_flows if flow["flow_id"] not in mongo_ids
        ]
    except PyMongoError:
        return [normalize_flow_record(flow) for flow in load_local_flows()]


@app.get("/flows/{flow_id}", response_model=Flow)
def get_flow(flow_id: str):
    flow = get_workspace_flow_or_404(flow_id)
    return normalize_flow_record(flow)


@app.put("/flow-update/")
def update_flow(update_data: Flow):
    try:
        print(update_data)
        updates = {
            "flow_name": update_data.flow_name,
            "flow_json": update_data.flow_json,
            "flow_type": update_data.flow_type,
            "summary": update_data.summary,
        }
        result = None
        if ObjectId.is_valid(update_data.flow_id):
            try:
                result = flow_collection.update_one(
                    {"_id": ObjectId(update_data.flow_id)},
                    {"$set": updates},
                )
            except PyMongoError:
                result = None
        print(result)

        if result is None or result.matched_count == 0:
            if local_update_flow(update_data.flow_id, updates):
                return {
                    "flow_id": str(update_data.flow_id),
                    "message": "Flow updated successfully",
                }
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Flow not found"
            )

        return {
            "flow_id": str(update_data.flow_id),
            "message": "Flow updated successfully",
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred: {str(e)}",
        )


def get_workspace_graph_or_404(flow_id: str) -> dict:
    flow = get_workspace_flow_or_404(flow_id)
    return build_workspace_graph(flow, source_components=get_source_components(flow_id))


def get_source_components(flow_id: str) -> list[dict]:
    if not ObjectId.is_valid(flow_id):
        return []

    try:
        return list(
            component_collection.find(
                {
                    "flow_id": ObjectId(flow_id),
                    "$or": [
                        {"source_document": {"$exists": True}},
                        {"source_document_id": {"$exists": True}},
                        {"document_chunks": {"$exists": True}},
                    ],
                }
            )
        )
    except PyMongoError:
        return []


def get_workspace_flow_or_404(flow_id: str) -> dict:
    flow = None
    if ObjectId.is_valid(flow_id):
        try:
            flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
        except PyMongoError:
            flow = None

    if not flow:
        flow = local_find_flow(flow_id)

    if not flow:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    return flow


def get_upload_flow_or_400(flow_id: str) -> dict:
    if not flow_id or flow_id == "undefined" or not ObjectId.is_valid(flow_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Create or open a workspace before uploading a source document.",
        )

    try:
        flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
    except PyMongoError as exc:
        if local_find_flow(flow_id):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Source uploads need MongoDB so document metadata and source references can be saved. "
                    "Start MongoDB, then reopen or create a workspace and try the DOCX upload again."
                ),
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MongoDB is unavailable. Start MongoDB, then try the source upload again.",
        ) from exc

    if not flow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")

    return flow


def get_workspace_branch_or_404(flow_id: str, node_id: str) -> dict:
    graph = get_workspace_graph_or_404(flow_id)

    if not any(node["id"] == node_id for node in graph["nodes"]):
        raise HTTPException(status_code=404, detail="Branch root node not found.")

    return select_branch(graph, node_id)


def monday_task_nodes_from_graph(graph: dict) -> list[dict]:
    return select_monday_task_nodes(graph)


def utc_timestamp() -> str:
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


@app.get("/api/workspaces/{flow_id}/exports/json")
def export_workspace_json(flow_id: str):
    return get_workspace_graph_or_404(flow_id)


@app.get("/api/workspaces/{flow_id}/sources")
def get_workspace_sources(flow_id: str):
    return get_workspace_graph_or_404(flow_id)["source_library"]


@app.get("/api/workspaces/{flow_id}/exports/markdown")
def export_workspace_markdown(flow_id: str):
    graph = get_workspace_graph_or_404(flow_id)
    return Response(
        content=graph_to_markdown(graph),
        media_type="text/markdown",
    )


@app.get("/api/workspaces/{flow_id}/exports/csv")
def export_workspace_csv(flow_id: str):
    graph = get_workspace_graph_or_404(flow_id)
    rows = graph_to_task_rows(graph)
    return Response(
        content=export_task_rows(rows),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{flow_id}-tasks.csv"'
        },
    )


@app.get("/api/workspaces/{flow_id}/exports/opml")
def export_workspace_opml(flow_id: str):
    graph = get_workspace_graph_or_404(flow_id)
    return Response(
        content=graph_to_opml(graph),
        media_type="application/xml",
    )


@app.get("/api/workspaces/{flow_id}/exports/mmd-json")
def export_workspace_mmd_json(flow_id: str):
    graph = get_workspace_graph_or_404(flow_id)
    return graph_to_mmd_json(graph)


@app.get("/api/workspaces/{flow_id}/exports/mermaid")
def export_workspace_mermaid(flow_id: str):
    graph = get_workspace_graph_or_404(flow_id)
    return Response(
        content=graph_to_mermaid(graph),
        media_type="text/plain",
    )


@app.get("/api/workspaces/{flow_id}/branches/{node_id}/exports/json")
def export_branch_json(flow_id: str, node_id: str):
    return get_workspace_branch_or_404(flow_id, node_id)


@app.post("/api/workspaces/{flow_id}/ai/helpers/{helper_id}/preview")
def preview_ai_helper(
    flow_id: str,
    helper_id: str,
    request: dict[str, Any] | None = None,
):
    request = request or {}
    helper_id = helper_id.replace("-", "_")
    action = request.get("action") or ""
    scope = request.get("scope") if isinstance(request.get("scope"), dict) else {}
    if request.get("branch_node_id") and not scope:
        scope = {"type": "branch", "node_id": request["branch_node_id"]}
    if not scope:
        scope = {"type": "workspace"}

    if scope.get("type") == "branch" and scope.get("node_id"):
        graph = get_workspace_branch_or_404(flow_id, scope["node_id"])
    else:
        graph = get_workspace_graph_or_404(flow_id)

    try:
        return generate_helper_preview(
            helper_id,
            action,
            graph,
            scope=scope,
            use_ai=bool(request.get("use_ai", True)),
            allow_deterministic_fallback=bool(
                request.get("allow_deterministic_fallback", True)
            ),
            model=request.get("model"),
        )
    except MissingConfigurationError as exc:
        raise configuration_http_error(exc) from exc
    except GraphSchemaError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "AI helper preview failed schema validation.",
                "errors": exc.errors,
            },
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/workspaces/{flow_id}/ai/source-librarian/preview")
def preview_source_librarian(flow_id: str, request: dict[str, Any] | None = None):
    request = request or {}
    action = request.get("action") or "source_repair"
    scope = request.get("scope") if isinstance(request.get("scope"), dict) else {}
    if request.get("branch_node_id") and not scope:
        scope = {"type": "branch", "node_id": request["branch_node_id"]}
    if not scope:
        scope = {"type": "workspace"}

    if scope.get("type") == "branch" and scope.get("node_id"):
        graph = get_workspace_branch_or_404(flow_id, scope["node_id"])
    else:
        graph = get_workspace_graph_or_404(flow_id)

    try:
        return generate_source_librarian_preview(
            graph,
            action=action,
            scope=scope,
            use_ai=bool(request.get("use_ai", True)),
            allow_deterministic_fallback=bool(
                request.get("allow_deterministic_fallback", True)
            ),
            model=request.get("model"),
        )
    except MissingConfigurationError as exc:
        raise configuration_http_error(exc) from exc
    except GraphSchemaError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "AI helper preview failed schema validation.",
                "errors": exc.errors,
            },
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/workspaces/{flow_id}/ai/reviewer/preview")
def preview_reviewer(flow_id: str, request: dict[str, Any] | None = None):
    request = request or {}
    action = request.get("action") or "missing_information"
    scope = request.get("scope") if isinstance(request.get("scope"), dict) else {}
    if request.get("branch_node_id") and not scope:
        scope = {"type": "branch", "node_id": request["branch_node_id"]}
    if not scope:
        scope = {"type": "workspace"}

    if scope.get("type") == "branch" and scope.get("node_id"):
        graph = get_workspace_branch_or_404(flow_id, scope["node_id"])
    else:
        graph = get_workspace_graph_or_404(flow_id)

    try:
        return generate_helper_preview(
            "reviewer",
            action,
            graph,
            scope=scope,
            use_ai=bool(request.get("use_ai", True)),
            allow_deterministic_fallback=bool(
                request.get("allow_deterministic_fallback", True)
            ),
            model=request.get("model"),
        )
    except MissingConfigurationError as exc:
        raise configuration_http_error(exc) from exc
    except GraphSchemaError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "AI helper preview failed schema validation.",
                "errors": exc.errors,
            },
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/workspaces/{flow_id}/ai/project-planner/preview")
def preview_project_planner(flow_id: str, request: dict[str, Any] | None = None):
    request = request or {}
    action = request.get("action") or "task_projection"
    scope = request.get("scope") if isinstance(request.get("scope"), dict) else {}
    if request.get("branch_node_id") and not scope:
        scope = {"type": "branch", "node_id": request["branch_node_id"]}
    if not scope:
        scope = {"type": "workspace"}

    if scope.get("type") == "branch" and scope.get("node_id"):
        graph = get_workspace_branch_or_404(flow_id, scope["node_id"])
    else:
        graph = get_workspace_graph_or_404(flow_id)

    try:
        return generate_helper_preview(
            "project_planner",
            action,
            graph,
            scope=scope,
            use_ai=bool(request.get("use_ai", True)),
            allow_deterministic_fallback=bool(
                request.get("allow_deterministic_fallback", True)
            ),
            model=request.get("model"),
        )
    except MissingConfigurationError as exc:
        raise configuration_http_error(exc) from exc
    except GraphSchemaError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "AI helper preview failed schema validation.",
                "errors": exc.errors,
            },
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/workspaces/{flow_id}/ai/integration-operator/preview")
def preview_integration_operator(flow_id: str, request: dict[str, Any] | None = None):
    request = request or {}
    action = request.get("action") or "handoff_readiness"
    scope = request.get("scope") if isinstance(request.get("scope"), dict) else {}
    if request.get("branch_node_id") and not scope:
        scope = {"type": "branch", "node_id": request["branch_node_id"]}
    if not scope:
        scope = {"type": "workspace"}

    if scope.get("type") == "branch" and scope.get("node_id"):
        graph = get_workspace_branch_or_404(flow_id, scope["node_id"])
    else:
        graph = get_workspace_graph_or_404(flow_id)

    try:
        return generate_helper_preview(
            "integration_operator",
            action,
            graph,
            scope=scope,
            use_ai=bool(request.get("use_ai", True)),
            allow_deterministic_fallback=bool(
                request.get("allow_deterministic_fallback", True)
            ),
            model=request.get("model"),
        )
    except MissingConfigurationError as exc:
        raise configuration_http_error(exc) from exc
    except GraphSchemaError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "AI helper preview failed schema validation.",
                "errors": exc.errors,
            },
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/workspaces/{flow_id}/export/miro")
def preview_workspace_miro_export(flow_id: str):
    graph = get_workspace_graph_or_404(flow_id)
    return export_branch_to_miro_payload(
        graph["nodes"],
        graph["edges"],
        graph["workspace"],
        target="workspace_board_preview",
    )


@app.post("/api/workspaces/{flow_id}/export/miro/board")
def export_workspace_to_miro_board(
    flow_id: str,
    board_id: str = Query(...),
    dry_run: bool = Query(True),
):
    if not dry_run:
        try:
            require_settings("miro_api_token")
        except MissingConfigurationError as exc:
            raise configuration_http_error(exc)

    flow = get_workspace_flow_or_404(flow_id)
    graph = build_workspace_graph(flow)
    payload = export_branch_to_miro_payload(
        graph["nodes"],
        graph["edges"],
        graph["workspace"],
        target="workspace_board",
    )
    client = MiroClient(
        token=get_setting("miro_api_token") or "",
        base_url=get_setting("miro_api_base_url") or "https://api.miro.com/v2",
    )
    result = client.export_frame_payload(board_id, payload, dry_run=dry_run)

    if dry_run:
        return result

    pushed_at = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    refs_by_node_id = miro_item_refs_from_result(board_id, result, pushed_at)
    updated_flow_json = apply_miro_external_refs_to_flow_json(
        flow.get("flow_json", ""),
        refs_by_node_id,
    )
    flow_collection.update_one(
        {"_id": ObjectId(flow_id)},
        {"$set": {"flow_json": updated_flow_json}},
    )

    return {
        **result,
        "external_refs": refs_by_node_id,
        "persisted": bool(refs_by_node_id),
    }


@app.post("/api/workspaces/{flow_id}/export/miro/sme-review")
def export_workspace_to_miro_sme_review_board(
    flow_id: str,
    board_id: str = Query(...),
    dry_run: bool = Query(True),
):
    if not dry_run:
        try:
            require_settings("miro_api_token")
        except MissingConfigurationError as exc:
            raise configuration_http_error(exc)

    flow = get_workspace_flow_or_404(flow_id)
    graph = build_workspace_graph(flow)
    payload = export_sme_review_board_payload(graph)
    client = MiroClient(
        token=get_setting("miro_api_token") or "",
        base_url=get_setting("miro_api_base_url") or "https://api.miro.com/v2",
    )
    result = client.export_frame_payload(board_id, payload, dry_run=dry_run)

    if dry_run:
        return result

    pushed_at = utc_timestamp()
    refs_by_node_id = miro_item_refs_from_result(board_id, result, pushed_at)
    updated_flow_json = apply_miro_external_refs_to_flow_json(
        flow.get("flow_json", ""),
        refs_by_node_id,
    )
    flow_collection.update_one(
        {"_id": ObjectId(flow_id)},
        {"$set": {"flow_json": updated_flow_json}},
    )

    return {
        **result,
        "external_refs": refs_by_node_id,
        "persisted": bool(refs_by_node_id),
    }


@app.post("/api/workspaces/{flow_id}/export/miro/native-mindmap")
def preview_workspace_miro_native_mindmap_export(
    flow_id: str,
    board_id: str = Query(...),
):
    graph = get_workspace_graph_or_404(flow_id)
    payload = export_native_mindmap_payload(graph)
    client = MiroClient(
        token=os.getenv("miro_api_token", ""),
        base_url=os.getenv("miro_api_base_url", "https://api.miro.com/v2"),
    )
    return client.export_native_mindmap_payload(board_id, payload, dry_run=True)


@app.post("/api/workspaces/{flow_id}/branches/{node_id}/export/miro")
def preview_branch_miro_export(flow_id: str, node_id: str):
    branch = get_workspace_branch_or_404(flow_id, node_id)
    return export_branch_to_miro_payload(
        branch["nodes"],
        branch["edges"],
        branch["workspace"],
        target="selected_branch_frame",
    )


@app.post("/api/workspaces/{flow_id}/branches/{node_id}/export/miro/frame")
def export_branch_to_miro_frame(
    flow_id: str,
    node_id: str,
    board_id: str = Query(...),
    dry_run: bool = Query(True),
):
    if not dry_run:
        try:
            require_settings("miro_api_token")
        except MissingConfigurationError as exc:
            raise configuration_http_error(exc)

    flow = get_workspace_flow_or_404(flow_id)
    graph = build_workspace_graph(flow)
    if not any(node["id"] == node_id for node in graph["nodes"]):
        raise HTTPException(status_code=404, detail="Branch root node not found.")

    branch = select_branch(graph, node_id)
    payload = export_branch_to_miro_payload(
        branch["nodes"],
        branch["edges"],
        branch["workspace"],
        target="selected_branch_frame",
    )
    client = MiroClient(
        token=get_setting("miro_api_token") or "",
        base_url=get_setting("miro_api_base_url") or "https://api.miro.com/v2",
    )
    result = client.export_frame_payload(board_id, payload, dry_run=dry_run)

    if dry_run:
        return result

    pushed_at = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    refs_by_node_id = miro_item_refs_from_result(board_id, result, pushed_at)
    updated_flow_json = apply_miro_external_refs_to_flow_json(
        flow.get("flow_json", ""),
        refs_by_node_id,
    )
    flow_collection.update_one(
        {"_id": ObjectId(flow_id)},
        {"$set": {"flow_json": updated_flow_json}},
    )

    return {
        **result,
        "external_refs": refs_by_node_id,
        "persisted": bool(refs_by_node_id),
    }


@app.post("/api/workspaces/{flow_id}/export/monday")
def preview_workspace_monday_export(
    flow_id: str,
    confirmed: bool = Query(False),
    board_id: str = Query(""),
    group_id: str = Query(""),
    template_id: str = Query(""),
):
    graph = get_workspace_graph_or_404(flow_id)
    return export_tasks_to_monday_payload(
        monday_task_nodes_from_graph(graph),
        graph["workspace"],
        confirmed=confirmed,
        board_id=board_id,
        group_id=group_id,
        scope="workspace",
        created_at=utc_timestamp(),
        template_id=template_id,
    )


@app.post("/api/integrations/monday/preflight/existing-group")
def preflight_monday_existing_group(
    board_id: str = Query(...),
    group_id: str = Query(...),
    dry_run: bool = Query(True),
    template_id: str = Query(""),
):
    if not dry_run:
        try:
            require_settings("monday_api_token")
        except MissingConfigurationError as exc:
            raise configuration_http_error(exc)

    client = MondayClient(
        token=get_setting("monday_api_token") or "",
        base_url=get_setting("monday_api_base_url") or "https://api.monday.com/v2",
    )
    return client.preflight_existing_group(
        board_id,
        group_id,
        template_id=template_id,
        dry_run=dry_run,
    )


@app.post("/api/workspaces/{flow_id}/export/monday/existing-group")
def export_workspace_to_monday_existing_group(
    flow_id: str,
    board_id: str = Query(...),
    group_id: str = Query(...),
    dry_run: bool = Query(True),
    confirmed: bool = Query(False),
    template_id: str = Query(""),
):
    if not dry_run and not confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirm the monday export before creating items.",
        )
    if not dry_run:
        try:
            require_settings("monday_api_token")
        except MissingConfigurationError as exc:
            raise configuration_http_error(exc)

    flow = get_workspace_flow_or_404(flow_id)
    graph = build_workspace_graph(flow)
    payload = export_tasks_to_monday_payload(
        monday_task_nodes_from_graph(graph),
        graph["workspace"],
        confirmed=confirmed,
        board_id=board_id,
        group_id=group_id,
        scope="workspace",
        created_at=utc_timestamp(),
        template_id=template_id,
    )
    client = MondayClient(
        token=get_setting("monday_api_token") or "",
        base_url=get_setting("monday_api_base_url") or "https://api.monday.com/v2",
    )
    preflight_result = None
    if not dry_run:
        preflight_result = client.preflight_existing_group(
            board_id,
            group_id,
            template_id=template_id,
            dry_run=False,
        )
        if not preflight_result.get("preflight", {}).get("ok"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "monday target preflight failed.",
                    "preflight": preflight_result.get("preflight", {}),
                },
            )
    result = client.export_existing_group_items(payload, dry_run=dry_run)

    if dry_run:
        return result

    pushed_at = utc_timestamp()
    refs_by_node_id = monday_item_refs_from_result(
        board_id,
        group_id,
        result,
        pushed_at,
    )
    updated_flow_json = apply_monday_external_refs_to_flow_json(
        flow.get("flow_json", ""),
        refs_by_node_id,
    )
    flow_collection.update_one(
        {"_id": ObjectId(flow_id)},
        {"$set": {"flow_json": updated_flow_json}},
    )

    return {
        **result,
        "preflight": preflight_result.get("preflight", {}) if preflight_result else {},
        "external_refs": refs_by_node_id,
        "persisted": bool(refs_by_node_id),
    }


@app.post("/api/workspaces/{flow_id}/branches/{node_id}/export/monday")
def preview_branch_monday_export(
    flow_id: str,
    node_id: str,
    confirmed: bool = Query(False),
    board_id: str = Query(""),
    group_id: str = Query(""),
    template_id: str = Query(""),
):
    branch = get_workspace_branch_or_404(flow_id, node_id)
    return export_tasks_to_monday_payload(
        monday_task_nodes_from_graph(branch),
        branch["workspace"],
        confirmed=confirmed,
        board_id=board_id,
        group_id=group_id,
        scope="branch",
        root_node_id=node_id,
        created_at=utc_timestamp(),
        template_id=template_id,
    )


@app.post("/api/workspaces/{flow_id}/branches/{node_id}/export/monday/existing-group")
def export_branch_to_monday_existing_group(
    flow_id: str,
    node_id: str,
    board_id: str = Query(...),
    group_id: str = Query(...),
    dry_run: bool = Query(True),
    confirmed: bool = Query(False),
    template_id: str = Query(""),
):
    if not dry_run and not confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirm the monday export before creating items.",
        )
    if not dry_run:
        try:
            require_settings("monday_api_token")
        except MissingConfigurationError as exc:
            raise configuration_http_error(exc)

    flow = get_workspace_flow_or_404(flow_id)
    graph = build_workspace_graph(flow)
    if not any(node["id"] == node_id for node in graph["nodes"]):
        raise HTTPException(status_code=404, detail="Branch root node not found.")

    branch = select_branch(graph, node_id)
    payload = export_tasks_to_monday_payload(
        monday_task_nodes_from_graph(branch),
        branch["workspace"],
        confirmed=confirmed,
        board_id=board_id,
        group_id=group_id,
        scope="branch",
        root_node_id=node_id,
        created_at=utc_timestamp(),
        template_id=template_id,
    )
    client = MondayClient(
        token=get_setting("monday_api_token") or "",
        base_url=get_setting("monday_api_base_url") or "https://api.monday.com/v2",
    )
    preflight_result = None
    if not dry_run:
        preflight_result = client.preflight_existing_group(
            board_id,
            group_id,
            template_id=template_id,
            dry_run=False,
        )
        if not preflight_result.get("preflight", {}).get("ok"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "monday target preflight failed.",
                    "preflight": preflight_result.get("preflight", {}),
                },
            )
    result = client.export_existing_group_items(payload, dry_run=dry_run)

    if dry_run:
        return result

    pushed_at = utc_timestamp()
    refs_by_node_id = monday_item_refs_from_result(
        board_id,
        group_id,
        result,
        pushed_at,
    )
    updated_flow_json = apply_monday_external_refs_to_flow_json(
        flow.get("flow_json", ""),
        refs_by_node_id,
    )
    flow_collection.update_one(
        {"_id": ObjectId(flow_id)},
        {"$set": {"flow_json": updated_flow_json}},
    )

    return {
        **result,
        "preflight": preflight_result.get("preflight", {}) if preflight_result else {},
        "external_refs": refs_by_node_id,
        "persisted": bool(refs_by_node_id),
    }


@app.post("/api/workspaces/{flow_id}/sync/monday/status")
def pull_monday_status_to_workspace(
    flow_id: str,
    dry_run: bool = Query(True),
    apply: bool = Query(False),
):
    if not dry_run:
        try:
            require_settings("monday_api_token")
        except MissingConfigurationError as exc:
            raise configuration_http_error(exc)

    flow = get_workspace_flow_or_404(flow_id)
    refs_by_node_id = monday_refs_from_flow_json(flow.get("flow_json", ""))
    client = MondayClient(
        token=get_setting("monday_api_token") or "",
        base_url=get_setting("monday_api_base_url") or "https://api.monday.com/v2",
    )
    result = client.pull_item_statuses(refs_by_node_id, dry_run=dry_run)

    if dry_run:
        return {
            **result,
            "tracked_node_count": len(refs_by_node_id),
        }

    pulled_at = utc_timestamp()
    status_projections = monday_status_projections_from_result(
        result,
        refs_by_node_id,
        pulled_at,
    )
    if apply:
        updated_flow_json = apply_monday_status_projection_to_flow_json(
            flow.get("flow_json", ""),
            status_projections,
        )
        flow_collection.update_one(
            {"_id": ObjectId(flow_id)},
            {"$set": {"flow_json": updated_flow_json}},
        )

    return {
        **result,
        "status_projections": status_projections,
        "status_updates": status_projections,
        "applied": apply and bool(status_projections),
        "applied_as": "external_status_projection",
    }


def get_summary_from_openai(
    file: UploadFile,
    flow_id: str,
    flow_type: str,
    operation_id: str | None = None,
):
    try:
        update_operation_progress(
            operation_id,
            phase="checking_settings",
            message="Checking AI settings",
            detail="Verifying OpenAI configuration before upload.",
            progress=18,
        )
        require_settings("openai_api_key")
    except MissingConfigurationError as exc:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Missing AI settings",
            detail=str(exc),
            progress=100,
            status_value="failed",
        )
        raise configuration_http_error(exc) from exc

    update_operation_progress(
        operation_id,
        phase="extracting",
        message="Reading source document",
        detail="Validating the source and preparing document metadata.",
        progress=28,
    )
    source_context = prepare_ai_intake_upload(file, flow_id)
    source_document = source_context["source_document"]
    file_bytes = source_context["file_bytes"]
    file_extension = source_document["type"]

    if len(file_bytes) == 0:
        raise ValueError("The uploaded file is actually empty!")

    update_operation_progress(
        operation_id,
        phase="uploading_to_ai",
        message="Uploading source to AI workspace",
        detail="Creating an AI file-search workspace for the source.",
        progress=42,
    )
    assistant = openai.beta.assistants.create(
        name="Summarize agent",
        instructions="Your task is to only summarize the document",
        model=OPENAI_DEFAULT_MODEL,
        tools=[{"type": "file_search"}],
    )
    vector_store = openai.beta.vector_stores.create(name=f"{file_extension}_{flow_id}")

    assistant = openai.beta.assistants.update(
        assistant_id=assistant.id,
        tool_resources={"file_search": {"vector_store_ids": [vector_store.id]}},
    )

    if file_extension == "pdf":
        mime_type = "application/pdf"
        messages_file = openai.files.create(
            file=(source_document["filename"], file_bytes, mime_type), purpose="assistants"
        )
    elif file_extension == "csv":
        mime_type = "application/json"
        df = pd.read_csv(BytesIO(file_bytes))
        json_data = df.to_dict(orient="records")
        json_str = json.dumps(json_data)
        messages_file = openai.files.create(
            file=("data.json", json_str, mime_type), purpose="assistants"
        )
    elif file_extension == "txt":
        mime_type = "text/plain"
        messages_file = openai.files.create(
            file=(source_document["filename"], file_bytes, mime_type), purpose="assistants"
        )
    elif file_extension == "docx":
        mime_type = (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        messages_file = openai.files.create(
            file=(source_document["filename"], file_bytes, mime_type), purpose="assistants"
        )
    elif file_extension == "html":
        mime_type = "text/html"
        messages_file = openai.files.create(
            file=(source_document["filename"], file_bytes, mime_type), purpose="assistants"
        )
    elif file_extension == "md":
        mime_type = "text/markdown"
        messages_file = openai.files.create(
            file=(source_document["filename"], file_bytes, mime_type), purpose="assistants"
        )
    elif file_extension == "pptx":
        mime_type = (
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        )
        messages_file = openai.files.create(
            file=(source_document["filename"], file_bytes, mime_type), purpose="assistants"
        )
    else:
        raise ValueError("Unsupported file type")

    update_operation_progress(
        operation_id,
        phase="ai_reading",
        message="AI is reading the source",
        detail="The model is summarizing the uploaded document.",
        progress=62,
    )
    # Create thread for summarization task
    thread = openai.beta.threads.create(
        messages=[
            {
                "role": "user",
                "content": "Generate a concise summary of the following document",
                "attachments": [
                    {"file_id": messages_file.id, "tools": [{"type": "file_search"}]}
                ],
            }
        ]
    )

    # Run the assistant and fetch the results
    run = openai.beta.threads.runs.create_and_poll(
        thread_id=thread.id, assistant_id=assistant.id
    )

    update_operation_progress(
        operation_id,
        phase="saving",
        message="Saving source metadata",
        detail="Persisting the source component and summary.",
        progress=86,
    )
    print(thread)
    print(run)
    
    messages = list(
        openai.beta.threads.messages.list(thread_id=thread.id, run_id=run.id)
    )
    print(messages)
    message_content = messages[0].content[0].text
    annotations = message_content.annotations

    # Annotate the summary content if necessary
    for index, annotation in enumerate(annotations):
        message_content.value = message_content.value.replace(
            annotation.text, f"[{index}]"
        )

    # Insert metadata into the database
    component_metadata = {
        "flow_id": ObjectId(flow_id),
        "file_id": messages_file.id,
        "assistant_id": assistant.id,
        "vector_store_id": vector_store.id,
        "size": len(file_bytes),
        "type": file_extension,
        "processing_type": "gpt",
        "summary": message_content.value,
        **source_metadata_fields(source_context),
    }

    # Store the document in MongoDB
    component_id = component_collection.insert_one(component_metadata).inserted_id

    update_operation_progress(
        operation_id,
        phase="complete",
        message="Source summary is ready",
        detail="The source component was saved to the workspace.",
        progress=100,
        status_value="completed",
    )
    # Return the component ID with the type
    return {"component_id": str(component_id), "type": file_extension, flow_type: flow_type}

def openai_mindmap_generator(
    file: UploadFile,
    flow_id: str,
    flow_type: str,
    operation_id: str | None = None,
):
    try:
        update_operation_progress(
            operation_id,
            phase="checking_settings",
            message="Checking AI settings",
            detail="Verifying OpenAI configuration before deriving the workspace.",
            progress=18,
        )
        require_settings("openai_api_key")
    except MissingConfigurationError as exc:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Missing AI settings",
            detail=str(exc),
            progress=100,
            status_value="failed",
        )
        raise configuration_http_error(exc) from exc

    update_operation_progress(
        operation_id,
        phase="extracting",
        message="Reading source document",
        detail="Validating the source and preparing document metadata.",
        progress=28,
    )
    source_context = prepare_ai_intake_upload(file, flow_id)
    source_document = source_context["source_document"]
    file_bytes = source_context["file_bytes"]
    file_extension = source_document["type"]

    if len(file_bytes) == 0:
        raise ValueError("The uploaded file is actually empty!")

    update_operation_progress(
        operation_id,
        phase="uploading_to_ai",
        message="Uploading source to AI workspace",
        detail="Creating an AI file-search workspace for mind map derivation.",
        progress=42,
    )
    assistant = openai.beta.assistants.create(
        name="MindMap Builder",
        instructions="Your task is to create the mindmap of the document",
        model=OPENAI_DEFAULT_MODEL,
        tools=[{"type": "file_search"}],
    )
    vector_store = openai.beta.vector_stores.create(name=f"{file_extension}_mindmap_{flow_id}")

    assistant = openai.beta.assistants.update(
        assistant_id=assistant.id,
        tool_resources={"file_search": {"vector_store_ids": [vector_store.id]}},
    )

    if file_extension == "pdf":
        mime_type = "application/pdf"
        messages_file = openai.files.create(
            file=(source_document["filename"], file_bytes, mime_type), purpose="assistants"
        )
    elif file_extension == "csv":
        mime_type = "application/json"
        df = pd.read_csv(BytesIO(file_bytes))
        json_data = df.to_dict(orient="records")
        json_str = json.dumps(json_data)
        messages_file = openai.files.create(
            file=("data.json", json_str, mime_type), purpose="assistants"
        )
    elif file_extension == "txt":
        mime_type = "text/plain"
        messages_file = openai.files.create(
            file=(source_document["filename"], file_bytes, mime_type), purpose="assistants"
        )
    elif file_extension == "docx":
        mime_type = (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        messages_file = openai.files.create(
            file=(source_document["filename"], file_bytes, mime_type), purpose="assistants"
        )
    elif file_extension == "html":
        mime_type = "text/html"
        messages_file = openai.files.create(
            file=(source_document["filename"], file_bytes, mime_type), purpose="assistants"
        )
    elif file_extension == "md":
        mime_type = "text/markdown"
        messages_file = openai.files.create(
            file=(source_document["filename"], file_bytes, mime_type), purpose="assistants"
        )
    elif file_extension == "pptx":
        mime_type = (
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        )
        messages_file = openai.files.create(
            file=(source_document["filename"], file_bytes, mime_type), purpose="assistants"
        )
    else:
        raise ValueError("Unsupported file type")
    print("======================================", file_extension)
    update_operation_progress(
        operation_id,
        phase="ai_deriving",
        message="AI is deriving workspace nodes",
        detail="The model is generating a React Flow compatible mind map.",
        progress=64,
    )
    thread = openai.beta.threads.create(
        messages=[
            {
                "role": "user",
                "content" : f"""
                You are tasked with generating a JSON mind map that is compatible with React Flow for rendering a flow diagram which should cover all the details and important aspects of the component for which multiple nodes can be required. The mind map should adhere to the following rules:

                1. **Node Types:**
                - There will always be one `dataSource` node, which serves as the root of the flow.
                - There will be `question` node which will be connected to the subsequent `response` node.
                - The `question` node can be connected to data sources or other `response` nodes.
                - There will be `response` for the above question
                
                2. **Node Relationships:**
                - `response` nodes may also connect to each other if it improves the logical flow or visualization.
                - `question` node will always have a `response` node
                - `dataSource` node will always be connected to a question node

                3. **Node Properties:**
                - Each node should have:
                    - `id` (unique identifier of 12 or 24 digit unique uuid or nanoid)
                    - `type` (`dataSource` or `response`)
                    - `position` (coordinates in the form {{ "x": <number>, "y": <number> }} for layout)
                    - `measured` (an object defining width and height):
                        {{
                            "width": <number>,
                            "height": <number>
                        }}
                    - `targetPosition` (position of the target connection, default to `"left"`)
                    - `sourcePosition` (position of the source connection, default to `"right"`)
                    - `selected` (boolean, default to `false`)
                    - `deletable` (boolean, default to `true` for `response` and `false` for `dataSource`)

                4. **Node Data Format:**
                - `dataSource` Node:
                    - `data` contains the following properties:
                        {{
                            "prompt": "<data source description>",
                            "name": "{file_extension}", !!!DOESN"T CHANGES 
                            "content": "<file name or content>",
                            "flow_id": "{flow_id}",
                            "file": "{source_document["filename"]}"  // Empty object or file metadata
                        }}
                5. **Question Data Format:**
                - `question` Node:
                    - `data` contains the following properties:
                        {{
                            "question": "<the question asked for the response>",
                            "component_id": "<component reference ID - unique identifier of 12 or 24 digit unique uuid or nanoid>",
                            "component_type" : "{file_extension}",
                        }}
                6. **RESPONSE NODE FORMAT**
                - `response` Node:
                    - `data` contains nested properties:
                        {{
                            "id": "<unique identifier of 12 or 24 digit unique uuid or nanoid>",
                            "type": "response" !!DOESN'T CHANGE,
                            "data": {{
                                "question": "<question text, if applicable>",
                                "summ": "<!!give me a detailed answer for the above question>",
                                "df": [],
                                "graph": "",
                                "flow_id": "{flow_id}",
                                "component_id": "<component reference ID - unique identifier of 12 or 24 digit unique uuid or nanoid>",
                                "component_type": "{file_extension}"
                            }}
                        }}

                7. **Connections:**
                - Connections between nodes should be represented by edges, with the following format:
                    - `id` (unique identifier for the edge)
                    - `source` (ID of the source node)
                    - `target` (ID of the target node)
                    - `type` (optional, defaults to `default`)
                    - 'animated' !!WILL ALWAYS BE TRUE

                8. **Viewport Configuration:**
                - Include a `viewport` object that specifies:
                    - `x` (horizontal position of the viewport)
                    - `y` (vertical position of the viewport)
                    - `zoom` (zoom level for initial rendering)

                ### Additional Considerations:
                - Ensure that the node positions are distributed properly to avoid overlap.
                - Prioritize connecting `response` nodes where it adds logical structure to the flow.

                ### IMPORTANT:
                - **RETURN ONLY THE VALID JSON OBJECT AND NO ADDITIONAL COMMENTS**.
                - Do **not** include any explanations, text, or additional information.
                - Maintain the format with double curly braces `{{` and `}}` as shown in the format.
                {append_ai_graph_prompt_contract("")}
                """,     

                "attachments": [
                    {"file_id": messages_file.id, "tools": [{"type": "file_search"}]}
                ],
            }
        ]
    )

    # Run the assistant and fetch the results
    run = openai.beta.threads.runs.create_and_poll(
        thread_id=thread.id, assistant_id=assistant.id
    )

    messages = list(
        openai.beta.threads.messages.list(thread_id=thread.id, run_id=run.id)
    )
    message_content = messages[0].content[0].text
    annotations = message_content.annotations

    # Annotate the summary content if necessary
    for index, annotation in enumerate(annotations):
        message_content.value = message_content.value.replace(
            annotation.text, f"[{index}]"
        )

    print(message_content.value)

    update_operation_progress(
        operation_id,
        phase="grounding",
        message="Grounding generated nodes",
        detail="Checking graph shape and attaching source references where possible.",
        progress=82,
    )
    response_json = parse_ai_mindmap_or_422(message_content.value)
    response_json = ground_mindmap_with_source_refs(response_json, source_context)

    component_metadata = {
        "flow_id": ObjectId(flow_id),
        "file_id": messages_file.id,
        "assistant_id": assistant.id,
        "vector_store_id": vector_store.id,
        "size": len(file_bytes),
        "type": file_extension,
        "processing_type": "gpt",
        "mindmap_json": response_json,
        **source_metadata_fields(source_context),
    }

    component_id = component_collection.insert_one(component_metadata).inserted_id
    flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
    update_operation_progress(
        operation_id,
        phase="complete",
        message="Workspace structure is ready",
        detail="The generated mind map was saved to the workspace.",
        progress=100,
        status_value="completed",
    )
    return {
        "flow_id": flow_id,
        "flow_name": flow["flow_name"],
        "component_id": str(component_id),
        "type": file_extension,
        "mindmap_json": response_json,
        "flow_type": flow_type
    }

    
def one_shot_openai(query, vector_store_id, file_id, assistant_id):
    try:
        template = f"""
        You are an AI assistant tasked with answering the user’s question based on the provided conversation history. Return the results in **JSON format** with the structure below:  

        #### **Response Format:**  
        {{
        "summ": "Your summarized response here...",
        "df": an array of JSON objects,
        "graph": "json_string_representation_of_plotly_graph"
        }}

        ### **Instructions:**
        1. Answer the question using the conversation history.
        2. Extract relevant tabular data into a JSON object compatible with Ag-Grid. If no table exists, return empty JSON object.
        3. If a dataframe is available, generate a relevant **Plotly graph**. Return it as a **valid JSON string** that can be parsed in React.js.
        4. If no graph is possible, return an empty string `""`.
        5. ** The graph's background will be black, so adjust the theme accordingly**.

        NOTE -- "Make sure you need to return only json as response only & please don't add any comments"
        NOTE -- "Make sure you need only need the answer for which context of data is available if not available return empty json as per format"

        **Here is the question:** {query}  

        ### **Example Output:**  
        If the conversation history contains a table and a relevant graph, return:  

        ```json
        {{
        "summ": "Based on the conversation, the key points discussed were...",
        "df": [
            {{
            "column1": "value1",
            "column2": "value2",
            "column3": "value3"
            }},
            {{
            "column1": "value1",
            "column2": "value2",
            "column3": "value3"
            }}
        ],
        "graph": "{{\"data\": [{{\"x\": [\"2024-02-01\", \"2024-02-02\"], \"y\": [100, 150], \"type\": \"line\"}}], \"layout\": {{\"title\": \"Sample Graph\"}}"
        }}
        """

        print(file_id)
        print(assistant_id)
        print(template)
        thread = openai.beta.threads.create(
            messages=[
                {
                    "role": "user",
                    "content": template,
                    "attachments": [
                        {"file_id": file_id, "tools": [{"type": "file_search"}]}
                    ],
                }
            ]
        )
        run = openai.beta.threads.runs.create_and_poll(
            thread_id=thread.id, assistant_id=assistant_id
        )

        messages = list(
            openai.beta.threads.messages.list(thread_id=thread.id, run_id=run.id)
        )
        message_content = messages[0].content[0].text
        print(message_content)
        annotations = message_content.annotations
        for index, annotation in enumerate(annotations):
            message_content.value = message_content.value.replace(
                annotation.text, f"[{index}]"
            )
            message_content.value = (
                message_content.value.replace("```json", "").replace("```", "").strip()
            )
            message_content.value = message_content.value.replace("\n", "")
        response = message_content.value.replace("```json", "").replace("```", "").strip().replace("\n", "") 
        print(response)
        return response
    except Exception as e:
        print(e.with_traceback())
        raise HTTPException(status_code=500)


def get_page_len(file: UploadFile):
    try:
        f_bytes = read_upload_bytes(file)
        reader = pdfium.PdfDocument(f_bytes)
        return len(reader) > 100
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Malformed PDF file: {str(exc)}",
        ) from exc


@app.post("/component-create-pdf")
def create_pdf_component(
    file: UploadFile,
    flow_id: str = Form(...),
    processing_type: str = Form(...),
    operation_id: str | None = Form(None),
):
    update_operation_progress(
        operation_id,
        phase="validating",
        message="Validating PDF upload",
        detail=file.filename or "",
        progress=12,
    )
    flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
    try:
        upload = validate_upload_bytes(file.filename, read_upload_bytes(file))
    except DocumentIngestionError as exc:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="PDF validation failed",
            detail=str(exc),
            progress=100,
            status_value="failed",
        )
        raise ingestion_http_error(exc) from exc

    if upload["extension"] == "pdf":
        print(get_page_len(file))
        check_page_length = get_page_len(file)
        if processing_type == "gpt" and not check_page_length and flow["flow_type"] == 'manual':
            return get_summary_from_openai(file, flow_id=flow_id, flow_type='manual', operation_id=operation_id)
        elif processing_type == "aws" and flow["flow_type"] == 'manual':
            update_operation_progress(
                operation_id,
                phase="extracting",
                message="Extracting PDF with AWS Textract",
                detail="Large PDF extraction can take a few minutes.",
                progress=35,
            )
            result = use_aws_textract(file, flow_id=flow_id, flow_type='manual')
            update_operation_progress(
                operation_id,
                phase="complete",
                message="PDF source is ready",
                detail="The source component was saved to the workspace.",
                progress=100,
                status_value="completed",
            )
            return result
        elif processing_type == "custom" and flow["flow_type"] == 'manual':
            update_operation_progress(
                operation_id,
                phase="extracting",
                message="Extracting PDF tables and text",
                detail="DocMap is parsing pages and tables before saving the source.",
                progress=35,
            )
            result = camelot_pdf_processing(flow_id, file, 'manual')
            update_operation_progress(
                operation_id,
                phase="complete",
                message="PDF source is ready",
                detail="The source component was saved to the workspace.",
                progress=100,
                status_value="completed",
            )
            return result
        elif processing_type == "gpt" and not check_page_length and flow["flow_type"] == 'automatic':
            return openai_mindmap_generator(file, flow_id=flow_id, flow_type='automatic', operation_id=operation_id)
        elif processing_type == "aws" and flow["flow_type"] == 'automatic':
            update_operation_progress(
                operation_id,
                phase="extracting",
                message="Extracting PDF with AWS Textract",
                detail="Large PDF extraction can take a few minutes.",
                progress=35,
            )
            result = use_aws_textract(file, flow_id=flow_id, flow_type='automatic')
            update_operation_progress(
                operation_id,
                phase="complete",
                message="Generated PDF workspace is ready",
                detail="The derived mind map was saved to the workspace.",
                progress=100,
                status_value="completed",
            )
            return result
        elif processing_type == "custom" and flow["flow_type"] == 'automatic':
            update_operation_progress(
                operation_id,
                phase="extracting",
                message="Extracting PDF tables and text",
                detail="DocMap is parsing pages and tables before deriving nodes.",
                progress=35,
            )
            result = camelot_pdf_processing(flow_id, file, 'automatic')
            update_operation_progress(
                operation_id,
                phase="complete",
                message="Generated PDF workspace is ready",
                detail="The derived mind map was saved to the workspace.",
                progress=100,
                status_value="completed",
            )
            return result
        else:
            traceback.print_exc()
            update_operation_progress(
                operation_id,
                phase="failed",
                message="PDF exceeds selected processing limits",
                detail="Try AWS or custom PDF processing for larger files.",
                progress=100,
                status_value="failed",
            )
            return HTTPException(status_code=404, detail="Exceeded Page limit for GPT.")
    else:
        traceback.print_exc()
        update_operation_progress(
            operation_id,
            phase="failed",
            message="PDF validation failed",
            detail="Only PDF files are allowed.",
            progress=100,
            status_value="failed",
        )
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

@app.post("/component-create-img")
async def create_img_component(
    flow_id: str = Form(...),
    file: UploadFile = File(...),
    operation_id: str | None = Form(None),
):
    try:
        update_operation_progress(
            operation_id,
            phase="validating",
            message="Validating image upload",
            detail=file.filename or "",
            progress=12,
        )
        flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
        MAX_IMAGE_SIZE_MB = 16
        ALLOWED_MIME_TYPES = {
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
        }

        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400, detail=f"Unsupported file type: {file.content_type}"
            )

        contents = await file.read()

        size_in_mb = len(contents) / (1024 * 1024)
        if size_in_mb > MAX_IMAGE_SIZE_MB:
            raise HTTPException(status_code=400, detail="Image exceeds 16MB size limit")

        image_base64 = base64.b64encode(contents).decode("utf-8")
        source_context = binary_source_context(
            filename=file.filename,
            file_bytes=contents,
            source_type="image",
            flow_id=flow_id,
        )
        
        if flow["flow_type"] == 'manual':

            component_metadata = {
                "flow_id": ObjectId(flow_id),
                "name": file.filename,
                "mime_type": file.content_type,
                "type": "image",
                "base64_image": image_base64,
                "processing_type": "openai",
                "instructions": "",
                "persona_name": "DocMap reviewer",
                **source_metadata_fields(source_context),
            }

            component_id = component_collection.insert_one(component_metadata).inserted_id
            update_operation_progress(
                operation_id,
                phase="complete",
                message="Image source is ready",
                detail="The image component was saved to the workspace.",
                progress=100,
                status_value="completed",
            )

            return {
                "message": "Image component created successfully",
                "component_id": str(component_id),
                "type": "image",
            }
        
        update_operation_progress(
            operation_id,
            phase="ai_deriving",
            message="AI is reading the image",
            detail="Deriving reviewable workspace nodes from the image.",
            progress=62,
        )
        response_json = generate_image_mindmap(
            file_name=file.filename,
            mime_type=file.content_type,
            contents=contents,
            flow_id=flow_id,
            model=OPENAI_DEFAULT_MODEL,
        )
        
        response_json = ground_mindmap_with_source_refs(response_json, source_context)
        print(response_json)
        
        component_metadata = {
            "flow_id": ObjectId(flow_id),
            "name": file.filename,
            "type": "image",
            "processing_type": "openai",
            "instructions": "",
            "persona_name": "DocMap reviewer",
            "mindmap_json": response_json,
            **source_metadata_fields(source_context),
        }

        component_id = component_collection.insert_one(component_metadata).inserted_id
        update_operation_progress(
            operation_id,
            phase="complete",
            message="Generated image workspace is ready",
            detail="The derived mind map was saved to the workspace.",
            progress=100,
            status_value="completed",
        )

        return {
            "flow_id" : ObjectId(flow_id),
            "flow_name": flow["flow_name"],
            "component_id": str(component_id),
            "type": "image",
            "mindmap_json": response_json,
            "flow_type": "automatic"
        }  

    except HTTPException as exc:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Image upload failed",
            detail=str(exc.detail),
            progress=100,
            status_value="failed",
        )
        raise
    except Exception as e:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Image upload failed",
            detail=str(e),
            progress=100,
            status_value="failed",
        )
        print(f"Error in /component-create-img endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/component-create-audio")
async def create_audio_component(
    flow_id: str = Form(...),
    file: UploadFile = File(...),
    operation_id: str | None = Form(None),
):
    try:
        update_operation_progress(
            operation_id,
            phase="validating",
            message="Validating audio upload",
            detail=file.filename or "",
            progress=12,
        )
        flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
        MAX_AUDIO_SIZE_MB = 16
        ALLOWED_MIME_TYPES = {
            "audio/wav",
            "audio/mp3",
            "audio/aiff",
            "audio/aac",
            "audio/ogg",
            "audio/flac",
            "audio/mpeg",
        }

        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported audio file type: {file.content_type}",
            )

        contents = await file.read()
        size_in_mb = len(contents) / (1024 * 1024)

        if size_in_mb > MAX_AUDIO_SIZE_MB:
            raise HTTPException(status_code=400, detail="Audio exceeds 16MB size limit")

        audio_base64 = base64.b64encode(contents).decode("utf-8")
        source_context = binary_source_context(
            filename=file.filename,
            file_bytes=contents,
            source_type="audio",
            flow_id=flow_id,
        )
        
        if flow["flow_type"] == 'manual':

            component_metadata = {
                "flow_id": ObjectId(flow_id),
                "name": file.filename,
                "mime_type": file.content_type,
                "type": "audio",
                "base64_audio": audio_base64,
                "processing_type": "openai",
                "instructions": "",
                "persona_name": "DocMap reviewer",
                **source_metadata_fields(source_context),
            }

            component_id = component_collection.insert_one(component_metadata).inserted_id
            update_operation_progress(
                operation_id,
                phase="complete",
                message="Audio source is ready",
                detail="The audio component was saved to the workspace.",
                progress=100,
                status_value="completed",
            )

            return {
                "message": "Audio component created successfully",
                "component_id": str(component_id),
                "type": "audio",
            }
            
        update_operation_progress(
            operation_id,
            phase="transcribing",
            message="Transcribing audio",
            detail="AI is converting the audio to text.",
            progress=52,
        )
        transcript = transcribe_audio(
            file_name=file.filename,
            mime_type=file.content_type,
            contents=contents,
        )
        update_operation_progress(
            operation_id,
            phase="ai_deriving",
            message="AI is deriving workspace nodes",
            detail="Building a mind map from the transcript.",
            progress=72,
        )
        response_json = generate_audio_mindmap(
            file_name=file.filename,
            transcript=transcript,
            flow_id=flow_id,
            model=OPENAI_DEFAULT_MODEL,
        )
        response_json = ground_mindmap_with_source_refs(response_json, source_context)
        print(response_json)
        
        component_metadata = {
            "flow_id": ObjectId(flow_id),
            "name": file.filename,
            "type": "audio",
            "processing_type": "openai",
            "instructions": "",
            "persona_name": "DocMap reviewer",
            "transcript": transcript,
            "mindmap_json": response_json,
            **source_metadata_fields(source_context),
        }

        component_id = component_collection.insert_one(component_metadata).inserted_id
        update_operation_progress(
            operation_id,
            phase="complete",
            message="Generated audio workspace is ready",
            detail="The derived mind map was saved to the workspace.",
            progress=100,
            status_value="completed",
        )

        return {
            "flow_id" : flow_id,
            "flow_name": flow["flow_name"],
            "component_id": str(component_id),
            "type": "audio",
            "mindmap_json": response_json,
            "flow_type": "automatic"
        }

    except HTTPException as exc:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Audio upload failed",
            detail=str(exc.detail),
            progress=100,
            status_value="failed",
        )
        raise
    except Exception as e:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Audio upload failed",
            detail=str(e),
            progress=100,
            status_value="failed",
        )
        print(f"Error in /component-create-audio endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/component-create-youtube")
def create_youtube_component(
    flow_id: str = Form(...),
    youtube_url: str = Form(...),
    operation_id: str | None = Form(None),
):
    try:
        update_operation_progress(
            operation_id,
            phase="validating",
            message="Preparing YouTube source",
            detail=youtube_url,
            progress=12,
        )
        flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
        
        print(youtube_url)
        source_context = virtual_source_context(
            label=youtube_url,
            source_type="youtube",
            flow_id=flow_id,
        )
        
        if flow["flow_type"] == 'manual':
            component_metadata = {
                "flow_id": ObjectId(flow_id),
                "youtube_url": youtube_url,
                "type": "youtube",
                "processing_type": "gemini",
                "instructions": "",
                "persona_name": "DocMap reviewer",
                **source_metadata_fields(source_context),
            }

            component_id = component_collection.insert_one(component_metadata).inserted_id
            update_operation_progress(
                operation_id,
                phase="complete",
                message="YouTube source is ready",
                detail="The YouTube source was saved to the workspace.",
                progress=100,
                status_value="completed",
            )

            return {
                "message": "Youtube component created successfully",
                "component_id": str(component_id),
                "type": "youtube",
            }
            
        else:
            mime_type = "video/*"
            
            template = f"""
                You are tasked with generating a JSON mind map for give youtube URL and should be compatible with React Flow for rendering a flow diagram which should cover all the details and important aspects of the component for which multiple nodes can be required. The mind map should adhere to the following rules:

                1. **Node Types:**
                - There will always be one `dataSource` node, which serves as the root of the flow.
                - There will be `question` node which will be connected to the subsequent `response` node.
                - The `question` node can be connected to data sources or other `response` nodes.
                - There will be `response` for the above question
                
                2. **Node Relationships:**
                - `response` nodes may also connect to each other if it improves the logical flow or visualization.
                - `question` node will always have a `response` node
                - `dataSource` node will always be connected to a question node

                3. **Node Properties:**
                - Each node should have:
                    - `id` (unique identifier of 12 or 24 digit unique uuid or nanoid)
                    - `type` (`dataSource` or `response`)
                    - `position` (coordinates in the form {{ "x": <number>, "y": <number> }} for layout)
                    - `measured` (an object defining width and height):
                        {{
                            "width": <number>,
                            "height": <number>
                        }}
                    - `targetPosition` (position of the target connection, default to `"left"`)
                    - `sourcePosition` (position of the source connection, default to `"right"`)
                    - `selected` (boolean, default to `false`)
                    - `deletable` (boolean, default to `true` for `response` and `false` for `dataSource`)

                4. **Node Data Format:**
                - `dataSource` Node:
                    - `data` contains the following properties:
                        {{
                            "prompt": "<data source description>",
                            "name": "youtube", !!!DOESN"T CHANGES 
                            "content": "<file name or content>",
                            "flow_id": "{flow_id}",
                            "file": "{youtube_url}"  // Empty object or file metadata
                        }}
                5. **Question Data Format:**
                - `question` Node:
                    - `data` contains the following properties:
                        {{
                            "question": "<the question asked for the response>",
                            "component_id": "<component reference ID - unique identifier of 12 or 24 digit unique uuid or nanoid>",
                            "component_type" : "youtube",
                        }}
                6. **RESPONSE NODE FORMAT**
                - `response` Node:
                    - `data` contains nested properties:
                        {{
                            "id": "<unique identifier of 12 or 24 digit unique uuid or nanoid>",
                            "type": "response" !!DOESN'T CHANGE,
                            "data": {{
                                "question": "<question text, if applicable>",
                                "summ": "<!!give me a detailed answer for the above question>",
                                "df": [],
                                "graph": "",
                                "flow_id": "{flow_id}",
                                "component_id": "<component reference ID - unique identifier of 12 or 24 digit unique uuid or nanoid>",
                                "component_type": "youtube"
                            }}
                        }}

                7. **Connections:**
                - Connections between nodes should be represented by edges, with the following format:
                    - `id` (unique identifier for the edge)
                    - `source` (ID of the source node)
                    - `target` (ID of the target node)
                    - `type` (optional, defaults to `default`)
                    - 'animated' !!WILL ALWAYS BE TRUE

                8. **Viewport Configuration:**
                - Include a `viewport` object that specifies:
                    - `x` (horizontal position of the viewport)
                    - `y` (vertical position of the viewport)
                    - `zoom` (zoom level for initial rendering)

                ### Additional Considerations:
                - Ensure that the node positions are distributed properly to avoid overlap.
                - Prioritize connecting `response` nodes where it adds logical structure to the flow.

                ### IMPORTANT:
                - **RETURN ONLY THE VALID JSON OBJECT AND NO ADDITIONAL COMMENTS**.
                - Do **not** include any explanations, text, or additional information.
                - Maintain the format with double curly braces `{{` and `}}` as shown in the format.
                """

        update_operation_progress(
            operation_id,
            phase="ai_deriving",
            message="AI is reading the YouTube source",
            detail="Deriving reviewable workspace nodes from the video URL.",
            progress=64,
        )
        response = model_vertexai.generate_content(
            contents=[template, Part.from_uri(youtube_url, mime_type)]
        )

        response_json = parse_ai_mindmap_or_422(response.text)
        response_json = ground_mindmap_with_source_refs(response_json, source_context)
        
        print(response_json)
        
        component_metadata = {
            "flow_id": ObjectId(flow_id),
            "youtube_url": youtube_url,
            "type": "youtube",
            "processing_type": "gemini",
            "instructions": "",
            "persona_name": "DocMap reviewer",
            "mindmap_json": response_json,
            **source_metadata_fields(source_context),
        }

        component_id = component_collection.insert_one(component_metadata).inserted_id
        update_operation_progress(
            operation_id,
            phase="complete",
            message="Generated YouTube workspace is ready",
            detail="The derived mind map was saved to the workspace.",
            progress=100,
            status_value="completed",
        )

        return {
            "flow_id" : flow_id,
            "flow_name": flow["flow_name"],
            "component_id": str(component_id),
            "type": "youtube",
            "mindmap_json": response_json,
            "flow_type": "automatic"
        }
            

    except HTTPException as exc:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="YouTube source failed",
            detail=str(exc.detail),
            progress=100,
            status_value="failed",
        )
        raise
    except Exception as e:
        traceback.print_exc()
        update_operation_progress(
            operation_id,
            phase="failed",
            message="YouTube source failed",
            detail=str(e),
            progress=100,
            status_value="failed",
        )
        print(f"Error in /component-create-youtube endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/component-create-video")
async def create_video_component(
    flow_id: str = Form(...),
    file: UploadFile = File(...),
    operation_id: str | None = Form(None),
):
    try:
        update_operation_progress(
            operation_id,
            phase="validating",
            message="Validating video upload",
            detail=file.filename or "",
            progress=12,
        )
        flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
        MAX_VIDEO_SIZE_MB = 16
        ALLOWED_MIME_TYPES = {
            "video/x-flv",
            "video/quicktime",
            "video/mpeg",
            "video/mpegs",
            "video/mpgs",
            "video/mpg",
            "video/mp4",
            "video/webm",
            "video/wmv",
            "video/3gpp",
        }

        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported video file type: {file.content_type}",
            )

        contents = await file.read()
        size_in_mb = len(contents) / (1024 * 1024)

        if size_in_mb > MAX_VIDEO_SIZE_MB:
            raise HTTPException(status_code=400, detail="Video exceeds 16MB size limit")

        video_base64 = base64.b64encode(contents).decode("utf-8")
        source_context = binary_source_context(
            filename=file.filename,
            file_bytes=contents,
            source_type="video",
            flow_id=flow_id,
        )
        
        if flow["flow_type"] == 'manual':

            component_metadata = {
                "flow_id": ObjectId(flow_id),
                "name": file.filename,
                "mime_type": file.content_type,
                "type": "video",
                "base64_video": video_base64,
                "processing_type": "openai_local_frames",
                "instructions": "",
                "persona_name": "DocMap reviewer",
                **source_metadata_fields(source_context),
            }

            component_id = component_collection.insert_one(component_metadata).inserted_id
            update_operation_progress(
                operation_id,
                phase="complete",
                message="Video source is ready",
                detail="The video component was saved to the workspace.",
                progress=100,
                status_value="completed",
            )

            return {
                "message": "Video component created successfully",
                "component_id": str(component_id),
                "type": "video",
            }
            
        update_operation_progress(
            operation_id,
            phase="ai_deriving",
            message="AI is sampling and reading video",
            detail="Deriving reviewable workspace nodes from video frames and audio.",
            progress=64,
        )
        response_json = generate_video_mindmap(
            file_name=file.filename,
            mime_type=file.content_type,
            contents=contents,
            flow_id=flow_id,
            model=OPENAI_DEFAULT_MODEL,
        )
        
        response_json = ground_mindmap_with_source_refs(response_json, source_context)
        print(response_json)
                
        component_metadata = {
            "flow_id": ObjectId(flow_id),
            "name": file.filename,
            "type": "video",
            "processing_type": "openai_local_video",
            "instructions": "",
            "persona_name": "DocMap reviewer",
            "audio_status": response_json.get("metadata", {})
            .get("video_audio", {})
            .get("status", ""),
            "transcript": response_json.get("metadata", {})
            .get("video_audio", {})
            .get("transcript", ""),
            "mindmap_json": response_json,
            **source_metadata_fields(source_context),
        }

        component_id = component_collection.insert_one(component_metadata).inserted_id
        update_operation_progress(
            operation_id,
            phase="complete",
            message="Generated video workspace is ready",
            detail="The derived mind map was saved to the workspace.",
            progress=100,
            status_value="completed",
        )

        return {
            "flow_id" : flow_id,
            "flow_name": flow["flow_name"],
            "component_id": str(component_id),
            "type": "video",
            "mindmap_json": response_json,
            "flow_type": "automatic"
        }
            
    except HTTPException as exc:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Video upload failed",
            detail=str(exc.detail),
            progress=100,
            status_value="failed",
        )
        raise
    except Exception as e:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Video upload failed",
            detail=str(e),
            progress=100,
            status_value="failed",
        )
        print(f"Error in /component-create-video endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/component-create-txt")
def create_txt_component(
    file: UploadFile,
    flow_id: str = Form(...),
    operation_id: str | None = Form(None),
):
    update_operation_progress(
        operation_id,
        phase="validating",
        message="Validating text upload",
        detail=file.filename or "",
        progress=12,
    )
    flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
    try:
        upload = validate_upload_bytes(file.filename, read_upload_bytes(file))
    except DocumentIngestionError as exc:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Text validation failed",
            detail=str(exc),
            progress=100,
            status_value="failed",
        )
        raise ingestion_http_error(exc) from exc

    if upload["extension"] == "txt":
        check_page_length = is_within_gpt4o_token_limit(file)
        if check_page_length and flow["flow_type"] == 'manual':
            return get_summary_from_openai(file, flow_id=flow_id, flow_type=flow["flow_type"], operation_id=operation_id)
        elif check_page_length and flow["flow_type"] == 'automatic':
            return openai_mindmap_generator(file, flow_id=flow_id, flow_type=flow["flow_type"], operation_id=operation_id)
        else:
            traceback.print_exc()
            update_operation_progress(
                operation_id,
                phase="failed",
                message="Text source exceeds AI token limit",
                detail="Split the file into smaller sources and try again.",
                progress=100,
                status_value="failed",
            )
            return HTTPException(status_code=404, detail="Exceeded Page limit for GPT.")
    else:
        traceback.print_exc()
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Text validation failed",
            detail="Only TXT files are allowed.",
            progress=100,
            status_value="failed",
        )
        raise HTTPException(status_code=400, detail="Only TXT files are allowed.")


@app.post("/component-create-md")
def create_md_component(
    file: UploadFile,
    flow_id: str = Form(...),
    operation_id: str | None = Form(None),
):
    update_operation_progress(
        operation_id,
        phase="validating",
        message="Validating Markdown upload",
        detail=file.filename or "",
        progress=12,
    )
    flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
    try:
        upload = validate_upload_bytes(file.filename, read_upload_bytes(file))
    except DocumentIngestionError as exc:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Markdown validation failed",
            detail=str(exc),
            progress=100,
            status_value="failed",
        )
        raise ingestion_http_error(exc) from exc

    if upload["extension"] == "md":
        check_page_length = is_within_gpt4o_token_limit(file)
        if check_page_length and flow["flow_type"] == 'manual':
            return get_summary_from_openai(file, flow_id=flow_id, flow_type=flow["flow_type"], operation_id=operation_id)
        elif check_page_length and flow["flow_type"] == 'automatic':
            return openai_mindmap_generator(file, flow_id=flow_id, flow_type=flow["flow_type"], operation_id=operation_id)
        else:
            traceback.print_exc()
            update_operation_progress(
                operation_id,
                phase="failed",
                message="Markdown source exceeds AI token limit",
                detail="Split the file into smaller sources and try again.",
                progress=100,
                status_value="failed",
            )
            return HTTPException(status_code=404, detail="Exceeded Page limit for GPT.")
    else:
        traceback.print_exc()
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Markdown validation failed",
            detail="Only Markdown files are allowed.",
            progress=100,
            status_value="failed",
        )
        raise HTTPException(status_code=400, detail="Only MarkDown files are allowed.")


@app.post("/component-create-pptx")
def create_pptx_component(
    file: UploadFile,
    flow_id: str = Form(...),
    operation_id: str | None = Form(None),
):
    update_operation_progress(
        operation_id,
        phase="validating",
        message="Validating PPTX upload",
        detail=file.filename or "",
        progress=12,
    )
    flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
    try:
        upload = validate_ai_intake_bytes(file.filename, read_upload_bytes(file))
    except DocumentIngestionError as exc:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="PPTX validation failed",
            detail=str(exc),
            progress=100,
            status_value="failed",
        )
        raise ingestion_http_error(exc) from exc

    if upload["extension"] == "pptx":
        check_page_length = is_within_gpt4o_token_limit(file)
        if check_page_length and flow["flow_type"] == 'manual':
            return get_summary_from_openai(file, flow_id=flow_id, flow_type=flow["flow_type"], operation_id=operation_id)
        elif check_page_length and flow["flow_type"] == 'automatic':
            return openai_mindmap_generator(file, flow_id=flow_id, flow_type=flow["flow_type"], operation_id=operation_id)
        else:
            traceback.print_exc()
            update_operation_progress(
                operation_id,
                phase="failed",
                message="PPTX source exceeds AI token limit",
                detail="Split the deck into smaller sources and try again.",
                progress=100,
                status_value="failed",
            )
            return HTTPException(status_code=404, detail="Exceeded Page limit for GPT.")
    else:
        traceback.print_exc()
        update_operation_progress(
            operation_id,
            phase="failed",
            message="PPTX validation failed",
            detail="Only PPTX files are allowed.",
            progress=100,
            status_value="failed",
        )
        raise HTTPException(status_code=400, detail="Only PPTX files are allowed.")


@app.post("/component-create-html")
def create_html_component(
    file: UploadFile,
    flow_id: str = Form(...),
    operation_id: str | None = Form(None),
):
    update_operation_progress(
        operation_id,
        phase="validating",
        message="Validating HTML upload",
        detail=file.filename or "",
        progress=12,
    )
    flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
    try:
        upload = validate_ai_intake_bytes(file.filename, read_upload_bytes(file))
    except DocumentIngestionError as exc:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="HTML validation failed",
            detail=str(exc),
            progress=100,
            status_value="failed",
        )
        raise ingestion_http_error(exc) from exc

    if upload["extension"] == "html":
        check_page_length = is_within_gpt4o_token_limit(file)
        if check_page_length and flow["flow_type"] == 'manual':
            return get_summary_from_openai(file, flow_id=flow_id, flow_type=flow["flow_type"], operation_id=operation_id)
        elif check_page_length and flow["flow_type"] == 'automatic':
            return openai_mindmap_generator(file, flow_id=flow_id, flow_type=flow["flow_type"], operation_id=operation_id)
        else:
            traceback.print_exc()
            update_operation_progress(
                operation_id,
                phase="failed",
                message="HTML source exceeds AI token limit",
                detail="Split the file into smaller sources and try again.",
                progress=100,
                status_value="failed",
            )
            return HTTPException(status_code=404, detail="Exceeded Page limit for GPT.")
    else:
        traceback.print_exc()
        update_operation_progress(
            operation_id,
            phase="failed",
            message="HTML validation failed",
            detail="Only HTML files are allowed.",
            progress=100,
            status_value="failed",
        )
        raise HTTPException(status_code=400, detail="Only HTML files are allowed.")


@app.post("/component-create-docx")
def create_docx_component(
    file: UploadFile,
    flow_id: str = Form(...),
    operation_id: str | None = Form(None),
):
    update_operation_progress(
        operation_id,
        phase="validating",
        message="Validating DOCX upload",
        detail=file.filename or "",
        progress=12,
    )
    flow = get_upload_flow_or_400(flow_id)
    try:
        upload = validate_upload_bytes(file.filename, read_upload_bytes(file))
    except DocumentIngestionError as exc:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="DOCX validation failed",
            detail=str(exc),
            progress=100,
            status_value="failed",
        )
        raise ingestion_http_error(exc) from exc

    if upload["extension"] == "docx":
        check_page_length = is_within_gpt4o_token_limit(file)
        if check_page_length and flow["flow_type"] == 'manual':
            return get_summary_from_openai(file, flow_id=flow_id, flow_type=flow["flow_type"], operation_id=operation_id)
        elif check_page_length and flow["flow_type"] == 'automatic':
            return openai_mindmap_generator(file, flow_id=flow_id, flow_type=flow["flow_type"], operation_id=operation_id)
        else:
            traceback.print_exc()
            update_operation_progress(
                operation_id,
                phase="failed",
                message="DOCX source exceeds AI token limit",
                detail="Split the file into smaller sources and try again.",
                progress=100,
                status_value="failed",
            )
            raise HTTPException(status_code=404, detail="Exceeded Page limit for GPT.")
    else:
        traceback.print_exc()
        update_operation_progress(
            operation_id,
            phase="failed",
            message="DOCX validation failed",
            detail="Only DOCX files are allowed.",
            progress=100,
            status_value="failed",
        )
        raise HTTPException(status_code=400, detail="Only DOCX files are allowed.")


@app.post("/component-create-csv")
def create_csv_component(
    file: UploadFile = File(...),
    flow_id: str = Form(...),
    header_row: int = Form(...),
    operation_id: str | None = Form(None),
):
    try:
        update_operation_progress(
            operation_id,
            phase="validating",
            message="Preparing CSV source",
            detail=file.filename,
            progress=10,
        )
        flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
        if flow["flow_type"] != 'manual':
            raise HTTPException(status_code=400, detail="Only Manual Mindmap is supported for CSV.")
        if not (file.filename or "").lower().endswith(".csv"):
            raise HTTPException(status_code=400, detail="Only CSV files are allowed.")

        file_bytes = file.file.read()
        update_operation_progress(
            operation_id,
            phase="extracting",
            message="Reading CSV table",
            detail="Checking duplicates and source metadata.",
            progress=25,
        )
        file_hash = calculate_file_hash(file_bytes)
        source_context = binary_source_context(
            filename=file.filename,
            file_bytes=file_bytes,
            source_type="csv",
            flow_id=flow_id,
        )

        existing_component = component_collection.find_one(
            {"file_hash": file_hash, "flow_id": ObjectId(flow_id)}
        )
        if existing_component:
            raise HTTPException(
                status_code=400, detail="File already exists in the system."
            )

        unique_table_name = f"tbl_{uuid4().hex[:8]}"

        file_name = file.filename
        folder = f"uploads/{flow_id}/"
        s3_key = folder + file_name
        upload_to_s3(file_bytes, bucket_name, s3_key)
        print("uploaded")
        update_operation_progress(
            operation_id,
            phase="importing",
            message="Importing CSV into the query engine",
            detail="Creating a temporary table and reading headers.",
            progress=48,
        )

        sql_con = sqlite3.connect("csv_data.db")
        buffer = BytesIO(file_bytes)
        df = pd.read_csv(
            buffer, skiprows=header_row, encoding="utf-8", encoding_errors="ignore"
        )
        print(df)
        buffer.close()
        file.file.close()
        print("CSV into SQLite")

        df.to_sql(name=unique_table_name, con=sql_con, if_exists="replace", index=False)
        sql_con.close()
        csvBot.connect_to_sqlite("csv_data.db")
        update_operation_progress(
            operation_id,
            phase="ai_reading",
            message="AI is reading the CSV schema",
            detail=f"{len(df.columns)} columns were detected.",
            progress=68,
        )

        df_ddl = csvBot.run_sql(
            f"SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '{unique_table_name}'"
        )

        for ddl in df_ddl["sql"].to_list():
            csvBot.train(ddl=ddl)
        update_operation_progress(
            operation_id,
            phase="ai_deriving",
            message="AI is preparing CSV query context",
            detail="Training data source metadata for follow-up questions.",
            progress=84,
        )

        training_data = csvBot.get_training_data()
        print(training_data)

        component_metadata = {
            "flow_id": ObjectId(flow_id),
            "name": file.filename,
            "table_name": unique_table_name,
            "file_hash": file_hash,
            "size": len(file_bytes),
            "type": "csv",
            "s3_path": s3_key,
            "created_at": datetime.datetime.utcnow(),
            **source_metadata_fields(source_context),
        }
        component_id = component_collection.insert_one(component_metadata).inserted_id
        update_operation_progress(
            operation_id,
            phase="complete",
            message="CSV source ready",
            detail=file.filename,
            progress=100,
            status_value="completed",
        )
        return {
            "component_id": str(component_id),
            "type": "csv",
            "message": "Component created successfully",
        }

    except HTTPException as e:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="CSV source could not be added",
            detail=str(e.detail),
            progress=100,
            status_value="failed",
        )
        raise e
    except Exception as e:
        print(f"Error in /component-create-csv endpoint: {e}")
        update_operation_progress(
            operation_id,
            phase="failed",
            message="CSV source could not be added",
            detail=str(e),
            progress=100,
            status_value="failed",
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/component-create-crawl")
async def create_web_crawler(
    flow_id: str = Form(...),
    web_url: str = Form(...),
    operation_id: str | None = Form(None),
):
    try:
        update_operation_progress(
            operation_id,
            phase="validating",
            message="Preparing web source",
            detail=web_url,
            progress=12,
        )
        flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
        flow_type = flow["flow_type"]
        source_context = virtual_source_context(
            label=web_url,
            source_type="web",
            flow_id=flow_id,
        )
        if flow_type == "manual":
            component_metadata = {
                "flow_id": ObjectId(flow_id),
                "web_url": web_url,
                "type": "web",
                "processing_type": "openai_web_search",
                **source_metadata_fields(source_context),
            }
            component_id = component_collection.insert_one(component_metadata).inserted_id
            update_operation_progress(
                operation_id,
                phase="complete",
                message="Web source is ready",
                detail="The web source was saved to the workspace.",
                progress=100,
                status_value="completed",
            )
            return {
                "component_id": str(component_id),
                "type": "web",
                "message": "Web component created successfully",
            }

        update_operation_progress(
            operation_id,
            phase="ai_deriving",
            message="AI is reading the web page",
            detail="Deriving reviewable workspace nodes from the URL.",
            progress=64,
        )
        response_json = generate_web_mindmap(
            url=web_url,
            flow_id=flow_id,
            model=OPENAI_DEFAULT_MODEL,
        )
        response_json = ground_mindmap_with_source_refs(response_json, source_context)

        component_metadata = {
            "flow_id": ObjectId(flow_id),
            "web_url": web_url,
            "type": "web",
            "processing_type": "openai_web_search",
            "mindmap_json": response_json,
            **source_metadata_fields(source_context),
        }

        component_id = component_collection.insert_one(component_metadata).inserted_id
        update_operation_progress(
            operation_id,
            phase="complete",
            message="Generated web workspace is ready",
            detail="The derived mind map was saved to the workspace.",
            progress=100,
            status_value="completed",
        )

        return {
            "component_id": str(component_id),
            "type": "web",
            "mindmap_json": response_json,
            "flow_type": flow_type,
        }

        unique_id = str(uuid4())

        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url=web_url)

        response = result.markdown

        file_bytes = response.encode("utf-8")

        mime_type = "text/markdown"
        
        if flow_type == "manual":
            assistant = openai.beta.assistants.create(
                name="Summarize agent",
                instructions="Your task is to only summarize the document",
                model=OPENAI_DEFAULT_MODEL,
                tools=[{"type": "file_search"}],
            )
            vector_store = openai.beta.vector_stores.create(name=f"web_{flow_id}")

            assistant = openai.beta.assistants.update(
                assistant_id=assistant.id,
                tool_resources={"file_search": {"vector_store_ids": [vector_store.id]}},
            )

            
            messages_file = openai.files.create(
                file=(f"website_{unique_id}.md", file_bytes, mime_type),
                purpose="assistants",
            )

            thread = openai.beta.threads.create(
                messages=[
                {
                    "role": "user",
                    "content": "Generate a concise summary of the following document",
                    "attachments": [
                        {
                            "file_id": messages_file.id,
                            "tools": [{"type": "file_search"}],
                        }
                    ],
                }
                ]
            )

            run = openai.beta.threads.runs.create_and_poll(
                thread_id=thread.id, assistant_id=assistant.id
            )

            messages = list(
                openai.beta.threads.messages.list(thread_id=thread.id, run_id=run.id)
            )
            
            print(messages)
            message_content = messages[0].content[0].text
            annotations = message_content.annotations

            for index, annotation in enumerate(annotations):
                message_content.value = message_content.value.replace(annotation.text, f"[{index}]")

            component_metadata = {
                "flow_id": ObjectId(flow_id),
                "file_id": messages_file.id,
                "assistant_id": assistant.id,
                "vector_store_id": vector_store.id,
                "size": len(file_bytes),
                "type": "web",
                "web_url": web_url,
                "processing_type": "gpt",
                "summary": message_content.value,
            }

            component_id = component_collection.insert_one(component_metadata).inserted_id

            return {
                "component_id": str(component_id),
                "type": "web",
                "message": "Component created successfully",
            }
            
        else:
            assistant = openai.beta.assistants.create(
            name="MindMap Builder",
            instructions="Your task is to create the mindmap of the document",
            model=OPENAI_DEFAULT_MODEL,
            tools=[{"type": "file_search"}],
            )
            vector_store = openai.beta.vector_stores.create(name=f"web_mindmap_{flow_id}")

            assistant = openai.beta.assistants.update(
            assistant_id=assistant.id,
            tool_resources={"file_search": {"vector_store_ids": [vector_store.id]}},
            )

            messages_file = openai.files.create(
                file=(f"website_mindmap_{unique_id}.md", file_bytes, mime_type), purpose="assistants"
            )

            thread = openai.beta.threads.create(
            
            messages=[
            {
                "role": "user",
                "content" : f"""
                You are tasked with generating a JSON mind map that is compatible with React Flow for rendering a flow diagram which should cover all the details and important aspects of the component for which multiple nodes can be required. The mind map should adhere to the following rules:

                1. **Node Types:**
                - There will always be one `dataSource` node, which serves as the root of the flow.
                - There will be `question` node which will be connected to the subsequent `response` node.
                - The `question` node can be connected to data sources or other `response` nodes.
                - There will be `response` for the above question
                
                2. **Node Relationships:**
                - `response` nodes may also connect to each other if it improves the logical flow or visualization.
                - `question` node will always have a `response` node
                - `dataSource` node will always be connected to a question node

                3. **Node Properties:**
                - Each node should have:
                    - `id` (unique identifier of 12 or 24 digit unique uuid or nanoid)
                    - `type` (`dataSource` or `response`)
                    - `position` (coordinates in the form {{ "x": <number>, "y": <number> }} for layout)
                    - `measured` (an object defining width and height):
                        {{
                            "width": <number>,
                            "height": <number>
                        }}
                    - `targetPosition` (position of the target connection, default to `"left"`)
                    - `sourcePosition` (position of the source connection, default to `"right"`)
                    - `selected` (boolean, default to `false`)
                    - `deletable` (boolean, default to `true` for `response` and `false` for `dataSource`)

                4. **Node Data Format:**
                - `dataSource` Node:
                    - `data` contains the following properties:
                        {{
                            "prompt": "<data source description>",
                            "name": "{web_url}", !!!DOESN"T CHANGES 
                            "content": "<file name or content>",
                            "flow_id": "{flow_id}",
                            "file": "{web_url}"  // Empty object or file metadata
                        }}
                5. **Question Data Format:**
                - `question` Node:
                    - `data` contains the following properties:
                        {{
                            "question": "<the question asked for the response>",
                            "component_id": "<component reference ID - unique identifier of 12 or 24 digit unique uuid or nanoid>",
                            "component_type" : "web",
                        }}
                6. **RESPONSE NODE FORMAT**
                - `response` Node:
                    - `data` contains nested properties:
                        {{
                            "id": "<unique identifier of 12 or 24 digit unique uuid or nanoid>",
                            "type": "response" !!DOESN'T CHANGE,
                            "data": {{
                                "question": "<question text, if applicable>",
                                "summ": "<!!give me a detailed answer for the above question>",
                                "df": [],
                                "graph": "",
                                "flow_id": "{flow_id}",
                                "component_id": "<component reference ID - unique identifier of 12 or 24 digit unique uuid or nanoid>",
                                "component_type": "web"
                            }}
                        }}

                7. **Connections:**
                - Connections between nodes should be represented by edges, with the following format:
                    - `id` (unique identifier for the edge)
                    - `source` (ID of the source node)
                    - `target` (ID of the target node)
                    - `type` (optional, defaults to `default`)
                    - 'animated' !!WILL ALWAYS BE TRUE

                8. **Viewport Configuration:**
                - Include a `viewport` object that specifies:
                    - `x` (horizontal position of the viewport)
                    - `y` (vertical position of the viewport)
                    - `zoom` (zoom level for initial rendering)

                ### Additional Considerations:
                - Ensure that the node positions are distributed properly to avoid overlap.
                - Prioritize connecting `response` nodes where it adds logical structure to the flow.

                ### IMPORTANT:
                - **RETURN ONLY THE VALID JSON OBJECT AND NO ADDITIONAL COMMENTS**.
                - Do **not** include any explanations, text, or additional information.
                - Maintain the format with double curly braces `{{` and `}}` as shown in the format.
                """,   

                "attachments": [
                    {"file_id": messages_file.id, "tools": [{"type": "file_search"}]}
                ],
            }
            ]
        )

        run = openai.beta.threads.runs.create_and_poll(thread_id=thread.id, assistant_id=assistant.id)

        messages = list(openai.beta.threads.messages.list(thread_id=thread.id, run_id=run.id))
        
        message_content = messages[0].content[0].text
        annotations = message_content.annotations

        for index, annotation in enumerate(annotations):
            message_content.value = message_content.value.replace(annotation.text, f"[{index}]")

        response_json = parse_ai_mindmap_or_422(message_content.value)
        print(response_json)

        component_metadata = {
            "flow_id": ObjectId(flow_id),
            "web_url": web_url,
            "file_id": messages_file.id,
            "assistant_id": assistant.id,
            "vector_store_id": vector_store.id,
            "size": len(file_bytes),
            "type": "web",
            "processing_type": "gpt",
            "mindmap_json": response_json,
        }

        component_id = component_collection.insert_one(component_metadata).inserted_id
        update_operation_progress(
            operation_id,
            phase="complete",
            message="Generated web workspace is ready",
            detail="The derived mind map was saved to the workspace.",
            progress=100,
            status_value="completed",
        )

        return {
            "component_id": str(component_id),
            "type": "web",
            "mindmap_json": response_json,
            "flow_type": flow_type
        }

    except HTTPException as exc:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Web source failed",
            detail=str(exc.detail),
            progress=100,
            status_value="failed",
        )
        raise
    except Exception as e:
        update_operation_progress(
            operation_id,
            phase="failed",
            message="Web source failed",
            detail=str(e),
            progress=100,
            status_value="failed",
        )
        print(f"Error in /component-create-crawl endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/pdf-component-qa", response_model=List[PDFNodeQueryResponse])
def PDF_QA(request: PDFNodeQueryRequest):
    try:
        record = component_collection.find_one(
            {
                "flow_id": ObjectId(request.flow_id),
                "_id": ObjectId(request.component_id),
                "type": "pdf",
            }
        )

        if not record or "processing_type" not in record:
            raise HTTPException(
                status_code=404,
                detail="processing_type not found for the given flow_id and component_id",
            )

        processing_type = record["processing_type"]

        if processing_type == "gpt":
            vector_store_id = record["vector_store_id"]
            file_id = record["file_id"]
            assistant_id = record["assistant_id"]
            response = one_shot_openai(
                query_with_workspace_brief(request.query, request.workspace_brief),
                vector_store_id,
                file_id,
                assistant_id,
            )
            response_json = json.loads(response)
            print(response_json)

            node_data = {
                "_id": ObjectId(request.node_id),
                "flow_id": ObjectId(request.flow_id),
                "component_id": ObjectId(request.component_id),
                "question": request.query,
                "summ": response_json.get("summ", ""),
                "df": validate_dataframe(response_json.get("df", [])),
                "graph": response_json.get("graph", ""),
                "type": "pdf",
                "is_delete": "false",
                "timestamp": datetime.datetime.utcnow(),
            }

            node_id_response = node_collection.insert_one(node_data)
            
            print(node_id_response)
            
            question_entries = []

            question_entries.append(
                PDFNodeQueryResponse(
                    data={
                        "question": request.query,
                        "summ": response_json.get("summ", ""),
                        "df": validate_dataframe(response_json.get("df", [])),
                        "graph": response_json.get("graph", ""),
                        "flow_id": request.flow_id,
                        "component_id": request.component_id,
                        "component_type": "pdf",
                    },
                    id=request.node_id,
                    type="PDFNode",
                )
            )

            if request.request_type == "question":
                empty_question_entry = PDFNodeQueryResponse(
                    id=str(ObjectId()),
                    data={
                        "question": "",
                        "flow_id": request.flow_id,
                        "component_id": request.component_id,
                        "component_type": "pdf",
                    },
                    type="question",
                )

                question_entries.append(empty_question_entry)
                print(question_entries)
            return question_entries

        else:
            passages = get_relevant_passage(
                request.query, request.flow_id, request.component_id, 2
            )
            if not passages:
                raise HTTPException(
                    status_code=404, detail="No relevant passages found for the query."
                )

            relevant_passage = " ".join(passages)

            instructions = record["instructions"]

            template = """
                You are an AI assistant tasked with answering the user’s question based on the provided passages and the given persona. Return the results in **JSON format** with the structure below:  

                #### **Response Format:**  
                {{
                "summ": "Your summarized response here...",
                "df": an array of JSON objects,
                "graph": "json_string_representation_of_plotly_graph"
                }}

                ### **Instructions:**
                1. Answer the question using the passage.
                2. Extract relevant tabular data into a JSON object compatible with Ag-Grid. If no table exists, return empty JSON object.
                3. If a dataframe is available, generate a relevant **Plotly graph**. Return it as a **valid JSON string** that can be parsed in React.js.
                4. If no graph is possible, return an empty string `""`.
                5. ** The graph's background will be black, so adjust the theme accordingly**.

                NOTE -- "Make sure you need to return only json as response only & please don't add any comments"
                NOTE -- "Make sure you need only need the answer for which context of data is available if not available return empty json as per format"


                **Here is the question:** {query}  
                **Here is the persona:** {instructions}
                **Here is the passage: {escaped_passage}

                ### **Example Output:**  
                If the passage contains a table and a relevant graph, return:  

                ```json
                {{
                "summ": "Based on the passage, the key points discussed were...",
                "df": [
                    {{
                    "column1": "value1",
                    "column2": "value2",
                    "column3": "value3"
                    }},
                    {{
                    "column1": "value1",
                    "column2": "value2",
                    "column3": "value3"
                    }}
                ],
                "graph": "{{\"data\": [{{\"x\": [\"2024-02-01\", \"2024-02-02\"], \"y\": [100, 150], \"type\": \"line\"}}], \"layout\": {{\"title\": \"Sample Graph\"}}"
                }}
                }}
                """

            prompt = PromptTemplate.from_template(template)

            print(prompt)

            llm_chain = prompt | llm
            augmented_query = query_with_workspace_brief(
                request.query, request.workspace_brief
            )
            answer = llm_chain.invoke(
                {
                    "instructions": instructions,
                    "query": augmented_query,
                    "escaped_passage": relevant_passage,
                }
            )

            answer = answer.content.replace("```json", "").replace("```", "").strip()
            response = answer.replace("\n", "")
            response_json = json.loads(response)

            node_data = {
                "_id": ObjectId(request.node_id),
                "flow_id": ObjectId(request.flow_id),
                "component_id": ObjectId(request.component_id),
                "question": request.query,
                "summ": response_json.get("summ", ""),
                "df": validate_dataframe(response_json.get("df", [])),
                "graph": response_json.get("graph", ""),
                "type": "pdf",
                "is_delete": "false",
                "timestamp": datetime.datetime.utcnow(),
            }
            node_id_response = node_collection.insert_one(node_data)

            question_entries = []

            question_entries.append(
                PDFNodeQueryResponse(
                    data={
                        "question": request.query,
                        "summ": response_json.get("summ", ""),
                        "df": validate_dataframe(response_json.get("df", [])),
                        "graph": response_json.get("graph", ""),
                        "flow_id": request.flow_id,
                        "component_id": request.component_id,
                        "component_type": "pdf",
                    },
                    id=request.node_id,
                    type="PDFNode",
                )
            )

            if request.request_type == "question":
                empty_question_entry = PDFNodeQueryResponse(
                    id=str(ObjectId()),
                    data={
                        "question": "",
                        "flow_id": request.flow_id,
                        "component_id": request.component_id,
                        "component_type": "pdf",
                    },
                    type="question",
                )

                question_entries.append(empty_question_entry)

            return question_entries

    except Exception as e:
        print(traceback.print_exc())
        print(f"Error in /pdf-component-qa endpoint: {e.__traceback__}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/txt-component-qa", response_model=List[TXTNodeQueryResponse])
def TXT_QA(request: TXTNodeQueryRequest):
    try:
        record = component_collection.find_one(
            {
                "flow_id": ObjectId(request.flow_id),
                "_id": ObjectId(request.component_id),
                "type": "txt",
            }
        )

        vector_store_id = record["vector_store_id"]
        file_id = record["file_id"]
        assistant_id = record["assistant_id"]
        response = one_shot_openai(
            query_with_workspace_brief(request.query, request.workspace_brief),
            vector_store_id,
            file_id,
            assistant_id,
        )
        response_json = json.loads(response)
        print(response_json)

        node_data = {
            "_id": ObjectId(request.node_id),
            "flow_id": ObjectId(request.flow_id),
            "component_id": ObjectId(request.component_id),
            "question": request.query,
            "summ": response_json.get("summ", ""),
            "df": validate_dataframe(response_json.get("df", [])),
            "graph": response_json.get("graph", ""),
            "type": "txt",
            "is_delete": "false",
            "timestamp": datetime.datetime.utcnow(),
        }

        node_id_response = node_collection.insert_one(node_data)

        question_entries = []

        question_entries.append(
            TXTNodeQueryResponse(
                data={
                    "question": request.query,
                    "summ": response_json.get("summ", ""),
                    "df": validate_dataframe(response_json.get("df", [])),
                    "graph": response_json.get("graph", ""),
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "txt",
                },
                id=request.node_id,
                type="TXTNode",
            )
        )

        if request.request_type == "question":
            empty_question_entry = TXTNodeQueryResponse(
                id=str(ObjectId()),
                data={
                    "question": "",
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "txt",
                },
                type="question",
            )

            question_entries.append(empty_question_entry)
        return question_entries

    except Exception as e:
        print(f"Error in /txt-component-qa endpoint: {e.__traceback__}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/md-component-qa", response_model=List[MDNodeQueryResponse])
def MD_QA(request: MDNodeQueryRequest):
    try:
        record = component_collection.find_one(
            {
                "flow_id": ObjectId(request.flow_id),
                "_id": ObjectId(request.component_id),
                "type": "md",
            }
        )

        vector_store_id = record["vector_store_id"]
        file_id = record["file_id"]
        assistant_id = record["assistant_id"]
        response = one_shot_openai(
            query_with_workspace_brief(request.query, request.workspace_brief),
            vector_store_id,
            file_id,
            assistant_id,
        )
        response_json = json.loads(response)
        print(response_json)

        node_data = {
            "_id": ObjectId(request.node_id),
            "flow_id": ObjectId(request.flow_id),
            "component_id": ObjectId(request.component_id),
            "question": request.query,
            "summ": response_json.get("summ", ""),
            "df": validate_dataframe(response_json.get("df", [])),
            "graph": response_json.get("graph", ""),
            "type": "md",
            "is_delete": "false",
            "timestamp": datetime.datetime.utcnow(),
        }

        node_id_response = node_collection.insert_one(node_data)

        question_entries = []

        question_entries.append(
            MDNodeQueryResponse(
                data={
                    "question": request.query,
                    "summ": response_json.get("summ", ""),
                    "df": validate_dataframe(response_json.get("df", [])),
                    "graph": response_json.get("graph", ""),
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "md",
                },
                id=request.node_id,
                type="MDNode",
            )
        )

        if request.request_type == "question":
            empty_question_entry = MDNodeQueryResponse(
                id=str(ObjectId()),
                data={
                    "question": "",
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "md",
                },
                type="question",
            )

            question_entries.append(empty_question_entry)
            return question_entries

        return question_entries

    except Exception as e:
        print(f"Error in /md-component-qa endpoint: {e.__traceback__}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/html-component-qa", response_model=List[HTMLNodeQueryResponse])
def HTML_QA(request: HTMLNodeQueryRequest):
    try:
        record = component_collection.find_one(
            {
                "flow_id": ObjectId(request.flow_id),
                "_id": ObjectId(request.component_id),
                "type": "html",
            }
        )

        vector_store_id = record["vector_store_id"]
        file_id = record["file_id"]
        assistant_id = record["assistant_id"]
        response = one_shot_openai(
            query_with_workspace_brief(request.query, request.workspace_brief),
            vector_store_id,
            file_id,
            assistant_id,
        )
        response_json = json.loads(response)
        print(response_json)

        node_data = {
            "_id": ObjectId(request.node_id),
            "flow_id": ObjectId(request.flow_id),
            "component_id": ObjectId(request.component_id),
            "question": request.query,
            "summ": response_json.get("summ", ""),
            "df": validate_dataframe(response_json.get("df", [])),
            "graph": response_json.get("graph", ""),
            "type": "html",
            "is_delete": "false",
            "timestamp": datetime.datetime.utcnow(),
        }

        node_id_response = node_collection.insert_one(node_data)

        question_entries = []

        question_entries.append(
            HTMLNodeQueryResponse(
                data={
                    "question": request.query,
                    "summ": response_json.get("summ", ""),
                    "df": validate_dataframe(response_json.get("df", [])),
                    "graph": response_json.get("graph", ""),
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "html",
                },
                id=request.node_id,
                type="HTMLNode",
            )
        )

        if request.request_type == "question":
            empty_question_entry = HTMLNodeQueryResponse(
                id=str(ObjectId()),
                data={
                    "question": "",
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "html",
                },
                type="question",
            )

            question_entries.append(empty_question_entry)
            return question_entries

        return question_entries

    except Exception as e:
        print(f"Error in /html-component-qa endpoint: {e.__traceback__}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/docx-component-qa", response_model=List[DOCXNodeQueryResponse])
def DOCX_QA(request: DOCXNodeQueryRequest):
    try:
        record = component_collection.find_one(
            {
                "flow_id": ObjectId(request.flow_id),
                "_id": ObjectId(request.component_id),
                "type": "docx",
            }
        )

        vector_store_id = record["vector_store_id"]
        file_id = record["file_id"]
        assistant_id = record["assistant_id"]
        response = one_shot_openai(
            query_with_workspace_brief(request.query, request.workspace_brief),
            vector_store_id,
            file_id,
            assistant_id,
        )
        response_json = json.loads(response)
        print(response_json)

        node_data = {
            "_id": ObjectId(request.node_id),
            "flow_id": ObjectId(request.flow_id),
            "component_id": ObjectId(request.component_id),
            "question": request.query,
            "summ": response_json.get("summ", ""),
            "df": validate_dataframe(response_json.get("df", [])),
            "graph": response_json.get("graph", ""),
            "type": "docx",
            "is_delete": "false",
            "timestamp": datetime.datetime.utcnow(),
        }

        node_id_response = node_collection.insert_one(node_data)

        question_entries = []

        question_entries.append(
            DOCXNodeQueryResponse(
                data={
                    "question": request.query,
                    "summ": response_json.get("summ", ""),
                    "df": validate_dataframe(response_json.get("df", [])),
                    "graph": response_json.get("graph", ""),
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "docx",
                },
                id=request.node_id,
                type="DOCXNode",
            )
        )

        if request.request_type == "question":
            empty_question_entry = DOCXNodeQueryResponse(
                id=str(ObjectId()),
                data={
                    "question": "",
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "docx",
                },
                type="question",
            )

            question_entries.append(empty_question_entry)
            return question_entries

        return question_entries

    except Exception as e:
        print(f"Error in /docx-component-qa endpoint: {e.__traceback__}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/pptx-component-qa", response_model=List[PPTXNodeQueryResponse])
def PPTX_QA(request: PPTXNodeQueryRequest):
    try:
        record = component_collection.find_one(
            {
                "flow_id": ObjectId(request.flow_id),
                "_id": ObjectId(request.component_id),
                "type": "pptx",
            }
        )

        vector_store_id = record["vector_store_id"]
        file_id = record["file_id"]
        assistant_id = record["assistant_id"]
        response = one_shot_openai(
            query_with_workspace_brief(request.query, request.workspace_brief),
            vector_store_id,
            file_id,
            assistant_id,
        )
        response_json = json.loads(response)
        print(response_json)

        node_data = {
            "_id": ObjectId(request.node_id),
            "flow_id": ObjectId(request.flow_id),
            "component_id": ObjectId(request.component_id),
            "question": request.query,
            "summ": response_json.get("summ", ""),
            "df": validate_dataframe(response_json.get("df", [])),
            "graph": response_json.get("graph", ""),
            "type": "pptx",
            "is_delete": "false",
            "timestamp": datetime.datetime.utcnow(),
        }

        node_id_response = node_collection.insert_one(node_data)

        question_entries = []

        question_entries.append(
            PPTXNodeQueryResponse(
                data={
                    "question": request.query,
                    "summ": response_json.get("summ", ""),
                    "df": validate_dataframe(response_json.get("df", [])),
                    "graph": response_json.get("graph", ""),
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "pptx",
                },
                id=request.node_id,
                type="PPTXNode",
            )
        )

        if request.request_type == "question":
            empty_question_entry = PPTXNodeQueryResponse(
                id=str(ObjectId()),
                data={
                    "question": "",
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "pptx",
                },
                type="question",
            )

            question_entries.append(empty_question_entry)
            return question_entries

        return question_entries

    except Exception as e:
        print(f"Error in /pptx-component-qa endpoint: {e.__traceback__}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/csv-component-qa", response_model=List[CSVNodeQueryResponse])
def CSV_QA(request: CSVNodeQueryRequest):
    try:
        record = component_collection.find_one(
            {
                "flow_id": ObjectId(request.flow_id),
                "_id": ObjectId(request.component_id),
                "type": "csv",
            }
        )

        if not record or "table_name" not in record:
            # Raise an HTTP 404 error if the table is not found
            raise HTTPException(
                status_code=404,
                detail="Table not found for the given flow_id and component_id",
            )

        table_name = record["table_name"]
        question_with_table = f"question - {request.query} for table name: {table_name}"
        sqlQuery = csvBot.generate_sql(question_with_table)
        if csvBot.is_sql_valid(sqlQuery):
            runSQLDF = csvBot.run_sql(sqlQuery)
            summSQL = csvBot.generate_summary(question_with_table, runSQLDF)
            code = csvBot.generate_plotly_code(
                question=question_with_table,
                sql=sqlQuery,
                df_metadata=f"Running df.dtypes gives:\n {runSQLDF.dtypes}",
            )
            fig = csvBot.get_plotly_figure(plotly_code=code, df=runSQLDF)
            plotyGraph = fig.to_json()
            df_dict = runSQLDF.to_dict(orient="records")
            df_dict = [{str(k): v for k, v in row.items()} for row in df_dict]
            result_document = {
                "_id": ObjectId(request.node_id),
                "question": request.query,
                "query": sqlQuery,
                "df": df_dict,
                "summ": summSQL,
                "graph": plotyGraph,
                "flow_id": ObjectId(request.flow_id),
                "component_id": ObjectId(request.component_id),
                "type": "csv",
                "is_delete": "false",
                "created_at": datetime.datetime.utcnow(),
            }
            node_id_response = node_collection.insert_one(result_document)
            question_entries = []
            response_data = {
                "id": str(request.node_id),
                "type": "CSVNode",
                "data": {
                    "question": request.query,
                    "df": runSQLDF.to_dict(orient="records"),
                    "summ": summSQL,
                    "graph": plotyGraph,
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "csv",
                },
            }
            question_entries.append(response_data)
            if request.request_type == "question":
                empty_node = {
                    "id": str(ObjectId()),
                    "type": "question",
                    "data": {
                        "question": "",
                        "flow_id": request.flow_id,
                        "component_id": request.component_id,
                        "component_type": "csv",
                    },
                }
                question_entries.append(empty_node)

            return question_entries

        else:
            print("No answer found from llm")
            df_dict = pd.DataFrame().to_dict(orient="records")
            df_dict = [{str(k): v for k, v in row.items()} for row in df_dict]

            result_document = {
                "_id": ObjectId(request.node_id),
                "question": request.query,
                "df": df_dict,
                "summ": "",
                "graph": "",
                "flow_id": ObjectId(request.flow_id),
                "component_id": ObjectId(request.component_id),
                "type": "csv",
                "is_delete": "false",
            }

            node_id_response = node_collection.insert_one(result_document)

        question_entries = []

        response_data = {
            "id": str(request.node_id),
            "type": "CSVNode",
            "data": {
                "question": request.query,
                "df": pd.DataFrame().to_dict(orient="records"),
                "summ": "",
                "graph": "",
                "flow_id": request.flow_id,
                "component_id": request.component_id,
                "component_type": "csv",
            },
        }

        question_entries.append(response_data)

        if request.request_type == "question":
            empty_node = {
                "id": str(ObjectId()),
                "type": "question",
                "data": {
                    "question": "",
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "csv",
                },
            }
            question_entries.append(empty_node)

            return question_entries
    except Exception as e:
        print(f"Error in /csv-component-qa: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/web-component-qa", response_model=List[WebNodeQueryResponse])
def WEB_QA(request: WebNodeQueryRequest):
    try:
        record = component_collection.find_one(
            {
                "flow_id": ObjectId(request.flow_id),
                "_id": ObjectId(request.component_id),
                "type": "web",
            }
        )
        vector_store_id = record["vector_store_id"]
        file_id = record["file_id"]
        assistant_id = record["assistant_id"]
        response = one_shot_openai(
            query_with_workspace_brief(request.query, request.workspace_brief),
            vector_store_id,
            file_id,
            assistant_id,
        )
        response_json = json.loads(response)
        print(response_json)
        
        node_data = {
            "_id": ObjectId(request.node_id),
            "flow_id": ObjectId(request.flow_id),
            "component_id": ObjectId(request.component_id),
            "question": request.query,
            "summ": response_json.get("summ", ""),
            "df": validate_dataframe(response_json.get("df", [])),
            "graph": response_json.get("graph", {}),
            "type": "web",
            "is_delete": "false",
            "timestamp": datetime.datetime.utcnow(),
        }

        node_id_response = node_collection.insert_one(node_data)

        question_entries = []

        question_entries.append(
            WebNodeQueryResponse(
                data={
                    "question": request.query,
                    "summ": response_json.get("summ", ""),
                    "df": validate_dataframe(response_json.get("df", [])),
                    "graph": response_json.get("graph", {}),
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "web",
                },
                id=request.node_id,
                type="WebNode",
            )
        )

        if request.request_type == "question":
            empty_question_entry = WebNodeQueryResponse(
                id=str(ObjectId()),
                data={
                    "question": "",
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "web",
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

        return question_entries

    except Exception as e:
        print(f"Error in /web-component-qa endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/img-component-qa", response_model=List[ImgNodeQueryResponse])
def IMG_QA(request: ImgNodeQueryRequest):
    try:
        record = component_collection.find_one(
            {
                "flow_id": ObjectId(request.flow_id),
                "_id": ObjectId(request.component_id),
                "type": "image",
            }
        )

        instructions = record.get("instructions", "")
        persona_name = record.get("persona_name", "DocMap reviewer")
        base64_image = record["base64_image"]
        mime_type = record["mime_type"]
        image_bytes = base64.b64decode(base64_image)

        image_part = {"mime_type": mime_type, "data": image_bytes}

        template = f"""
    You are an AI assistant tasked with answering the user’s question based on the provided question and persona. Return the results in **JSON format** with the structure below:  

    #### **Response Format:**  
    {{
    "summ": "Your summarized response here...",
    "df": an array of JSON objects,
    "graph": "json_string_representation_of_plotly_graph"
    }}

    ### **Instructions:**
    1. Answer the question using the conversation history.
    2. Extract relevant tabular data into a JSON object compatible with Ag-Grid. If no table exists, return empty JSON object.
    3. If a dataframe is available, generate a relevant **Plotly graph**. Return it as a **valid JSON string** that can be parsed in React.js.
    4. If no graph is possible, return an empty string `""`.
    5. ** The graph's background will be black, so adjust the theme accordingly**.

    NOTE -- "Make sure you need to return only json as response only & please don't add any comments"
    NOTE -- "Make sure you need only need the answer for which context of data is available if not available return empty json as per format"

    **Here is the question:** {request.query}  
    **Here is the persona:** {persona_name}

    ### **Example Output:**  
    If the conversation history contains a table and a relevant graph, return:  

    ```json
    {{
    "summ": "Based on the conversation, the key points discussed were...",
    "df": [
        {{
        "column1": "value1",
        "column2": "value2",
        "column3": "value3"
        }},
        {{
        "column1": "value1",
        "column2": "value2",
        "column3": "value3"
        }}
    ],
    "graph": "{{\"data\": [{{\"x\": [\"2024-02-01\", \"2024-02-02\"], \"y\": [100, 150], \"type\": \"line\"}}], \"layout\": {{\"title\": \"Sample Graph\"}}"
    }}
    """

        response = model.generate_content(contents=[template, image_part])

        responseList = response.text
        responseList = (
            responseList.replace("```json", "")
            .replace("```", "")
            .replace("\n", "")
            .strip()
        )

        print(responseList)

        response_json = json.loads(responseList)
        print(response_json)

        node_data = {
            "_id": ObjectId(request.node_id),
            "flow_id": ObjectId(request.flow_id),
            "component_id": ObjectId(request.component_id),
            "question": request.query,
            "summ": response_json.get("summ", ""),
            "df": validate_dataframe(response_json.get("df", [])),
            "graph": response_json.get("graph", {}),
            "type": "image",
            "is_delete": "false",
            "timestamp": datetime.datetime.utcnow(),
        }

        node_id_response = node_collection.insert_one(node_data)

        question_entries = []

        question_entries.append(
            ImgNodeQueryResponse(
                data={
                    "question": request.query,
                    "summ": response_json.get("summ", ""),
                    "df": validate_dataframe(response_json.get("df", [])),
                    "graph": response_json.get("graph", {}),
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "image",
                },
                id=request.node_id,
                type="ImageNode",
            )
        )

        if request.request_type == "question":
            empty_question_entry = ImgNodeQueryResponse(
                id=str(ObjectId()),
                data={
                    "question": "",
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "image",
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

        return question_entries

    except Exception as e:
        print(f"Error in /img-component-qa endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/audio-component-qa", response_model=List[AudioNodeQueryResponse])
def AUDIO_QA(request: AudioNodeQueryRequest):
    try:
        record = component_collection.find_one(
            {
                "flow_id": ObjectId(request.flow_id),
                "_id": ObjectId(request.component_id),
                "type": "audio",
            }
        )
        
        instructions = record.get("instructions", "")
        persona_name = record.get("persona_name", "DocMap reviewer")

        base64_audio = record["base64_audio"]
        mime_type = record["mime_type"]
        audio_bytes = base64.b64decode(base64_audio)

        audio_part = {"mime_type": mime_type, "data": audio_bytes}

        template = f"""You are an AI assistant tasked with answering the user’s question based on the provided question and persona. Return the results in **JSON format** with the structure below:  

    #### **Response Format:**  
    {{
    "summ": "Your summarized response here...",
    "df": an array of JSON objects,
    "graph": "json_string_representation_of_plotly_graph"
    }}

    ### **Instructions:**
    1. Answer the question using the conversation history.
    2. Extract relevant tabular data into a JSON object compatible with Ag-Grid. If no table exists, return empty JSON object.
    3. If a dataframe is available, generate a relevant **Plotly graph**. Return it as a **valid JSON string** that can be parsed in React.js.
    4. If no graph is possible, return an empty string `""`.
    5. ** The graph's background will be black, so adjust the theme accordingly**.

    NOTE -- "Make sure you need to return only json as response only & please don't add any comments"
    NOTE -- "Make sure you need only need the answer for which context of data is available if not available return empty json as per format"

    **Here is the question:** {request.query}  
    **Here is the persona:** {persona_name}

    ### **Example Output:**  
    If the conversation history contains a table and a relevant graph, return:  

    ```json
    {{
    "summ": "Based on the conversation, the key points discussed were...",
    "df": [
        {{
        "column1": "value1",
        "column2": "value2",
        "column3": "value3"
        }},
        {{
        "column1": "value1",
        "column2": "value2",
        "column3": "value3"
        }}
    ],
    "graph": "{{\"data\": [{{\"x\": [\"2024-02-01\", \"2024-02-02\"], \"y\": [100, 150], \"type\": \"line\"}}], \"layout\": {{\"title\": \"Sample Graph\"}}"
    }}
    """

        response = model.generate_content(contents=[template, audio_part])

        responseList = response.text
        responseList = (
            responseList.replace("```json", "")
            .replace("```", "")
            .replace("\n", "")
            .strip()
        )

        response_json = json.loads(responseList)
        print(response_json)

        node_data = {
            "_id": ObjectId(request.node_id),
            "flow_id": ObjectId(request.flow_id),
            "component_id": ObjectId(request.component_id),
            "question": request.query,
            "summ": response_json.get("summ", ""),
            "df": validate_dataframe(response_json.get("df", [])),
            "graph": response_json.get("graph", {}),
            "type": "audio",
            "is_delete": "false",
            "timestamp": datetime.datetime.utcnow(),
        }

        node_id_response = node_collection.insert_one(node_data)

        question_entries = []

        question_entries.append(
            AudioNodeQueryResponse(
                data={
                    "question": request.query,
                    "summ": response_json.get("summ", ""),
                    "df": validate_dataframe(response_json.get("df", [])),
                    "graph": response_json.get("graph", {}),
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "audio",
                },
                id=request.node_id,
                type="AudioNode",
            )
        )

        if request.request_type == "question":
            empty_question_entry = AudioNodeQueryResponse(
                id=str(ObjectId()),
                data={
                    "question": "",
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "audio",
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

        return question_entries

    except Exception as e:
        print(f"Error in /audio-component-qa endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/youtube-component-qa", response_model=List[YoutubeNodeQueryResponse])
def YOUTUBE_QA(request: YoutubeNodeQueryRequest):
    try:
        record = component_collection.find_one(
            {
                "flow_id": ObjectId(request.flow_id),
                "_id": ObjectId(request.component_id),
                "type": "youtube",
            }
        )

        instructions = record.get("instructions", "")
        persona_name = record.get("persona_name", "DocMap reviewer")
        
        youtube_url = record["youtube_url"]
        mime_type = "video/*"

        template = f"""
      You are an AI assistant tasked with answering the user’s question based on the provided question and persona. Return the results in **JSON format** with the structure below:  

    #### **Response Format:**  
    {{
    "summ": "Your summarized response here...",
    "df": an array of JSON objects,
    "graph": "json_string_representation_of_plotly_graph"
    }}

    ### **Instructions:**
    1. Answer the question using the conversation history.
    2. Extract relevant tabular data into a JSON object compatible with Ag-Grid. If no table exists, return empty JSON object.
    3. If a dataframe is available, generate a relevant **Plotly graph**. Return it as a **valid JSON string** that can be parsed in React.js.
    4. If no graph is possible, return an empty string `""`.
    5. ** The graph's background will be black, so adjust the theme accordingly**.

    NOTE -- "Make sure you need to return only json as response only & please don't add any comments"
    NOTE -- "Make sure you need only need the answer for which context of data is available if not available return empty json as per format"

    **Here is the question:** {request.query}  
    **Here is the persona:** {persona_name}

    ### **Example Output:**  
    If the conversation history contains a table and a relevant graph, return:  

    ```json
    {{
    "summ": "Based on the conversation, the key points discussed were...",
    "df": [
        {{
        "column1": "value1",
        "column2": "value2",
        "column3": "value3"
        }},
        {{
        "column1": "value1",
        "column2": "value2",
        "column3": "value3"
        }}
    ],
    "graph": "{{\"data\": [{{\"x\": [\"2024-02-01\", \"2024-02-02\"], \"y\": [100, 150], \"type\": \"line\"}}], \"layout\": {{\"title\": \"Sample Graph\"}}"
    }}
    """

        response = model_vertexai.generate_content(
            contents=[template, Part.from_uri(youtube_url, mime_type)]
        )

        responseList = response.text
        responseList = (
            responseList.replace("```json", "")
            .replace("```", "")
            .replace("\n", "")
            .strip()
        )

        response_json = json.loads(responseList)
        print(response_json)

        node_data = {
            "_id": ObjectId(request.node_id),
            "flow_id": ObjectId(request.flow_id),
            "component_id": ObjectId(request.component_id),
            "question": request.query,
            "summ": response_json.get("summ", ""),
            "df": validate_dataframe(response_json.get("df", [])),
            "graph": response_json.get("graph", {}),
            "type": "youtube",
            "is_delete": "false",
            "timestamp": datetime.datetime.utcnow(),
        }

        node_id_response = node_collection.insert_one(node_data)

        question_entries = []

        question_entries.append(
            YoutubeNodeQueryResponse(
                data={
                    "question": request.query,
                    "summ": response_json.get("summ", ""),
                    "df": validate_dataframe(response_json.get("df", [])),
                    "graph": response_json.get("graph", {}),
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "youtube",
                },
                id=request.node_id,
                type="YoutubeNode",
            )
        )

        if request.request_type == "question":
            empty_question_entry = YoutubeNodeQueryResponse(
                id=str(ObjectId()),
                data={
                    "question": "",
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "youtube",
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

        return question_entries

    except Exception as e:
        print(f"Error in /youtube-component-qa endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/video-component-qa", response_model=List[VideoNodeQueryResponse])
def VIDEO_QA(request: VideoNodeQueryRequest):
    try:
        record = component_collection.find_one(
            {
                "flow_id": ObjectId(request.flow_id),
                "_id": ObjectId(request.component_id),
                "type": "video",
            }
        )

        instructions = record.get("instructions", "")
        persona_name = record.get("persona_name", "DocMap reviewer")
        
        video_url = record.get("video_url")
        mime_type = record.get("mime_type", "video/*")
        if not video_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Video Q&A for local uploaded videos needs a transcript-backed "
                    "or externally addressable video source. Regenerate the map from "
                    "the video source or use the generated mind map review views."
                ),
            )

        template = f"""
          You are an AI assistant tasked with answering the user’s question based on the provided question and persona. Return the results in **JSON format** with the structure below:  

    #### **Response Format:**  
    {{
    "summ": "Your summarized response here...",
    "df": an array of JSON objects,
    "graph": "json_string_representation_of_plotly_graph"
    }}

    ### **Instructions:**
    1. Answer the question using the conversation history.
    2. Extract relevant tabular data into a JSON object compatible with Ag-Grid. If no table exists, return empty JSON object.
    3. If a dataframe is available, generate a relevant **Plotly graph**. Return it as a **valid JSON string** that can be parsed in React.js.
    4. If no graph is possible, return an empty string `""`.
    5. ** The graph's background will be black, so adjust the theme accordingly**.

    NOTE -- "Make sure you need to return only json as response only & please don't add any comments"
    NOTE -- "Make sure you need only need the answer for which context of data is available if not available return empty json as per format"

    **Here is the question:** {request.query}  
    **Here is the persona:** {persona_name}

    ### **Example Output:**  
    If the conversation history contains a table and a relevant graph, return:  

    ```json
    {{
    "summ": "Based on the conversation, the key points discussed were...",
    "df": [
        {{
        "column1": "value1",
        "column2": "value2",
        "column3": "value3"
        }},
        {{
        "column1": "value1",
        "column2": "value2",
        "column3": "value3"
        }}
    ],
    "graph": "{{\"data\": [{{\"x\": [\"2024-02-01\", \"2024-02-02\"], \"y\": [100, 150], \"type\": \"line\"}}], \"layout\": {{\"title\": \"Sample Graph\"}}"
    }}
    """

        response = model_vertexai.generate_content(
            contents=[template, Part.from_uri(video_url, mime_type)]
        )

        print(response)
        print(response.text)

        responseList = response.text
        responseList = (
            responseList.replace("```json", "")
            .replace("```", "")
            .replace("\n", "")
            .strip()
        )

        response_json = json.loads(responseList)
        print(response_json)

        node_data = {
            "_id": ObjectId(request.node_id),
            "flow_id": ObjectId(request.flow_id),
            "component_id": ObjectId(request.component_id),
            "question": request.query,
            "summ": response_json.get("summ", ""),
            "df": validate_dataframe(response_json.get("df", [])),
            "graph": response_json.get("graph", {}),
            "type": "video",
            "is_delete": "false",
            "timestamp": datetime.datetime.utcnow(),
        }

        node_id_response = node_collection.insert_one(node_data)

        question_entries = []

        question_entries.append(
            VideoNodeQueryResponse(
                data={
                    "question": request.query,
                    "summ": response_json.get("summ", ""),
                    "df": validate_dataframe(response_json.get("df", [])),
                    "graph": response_json.get("graph", {}),
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "video",
                },
                id=request.node_id,
                type="VideoNode",
            )
        )

        if request.request_type == "question":
            empty_question_entry = VideoNodeQueryResponse(
                id=str(ObjectId()),
                data={
                    "question": "",
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "video",
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

        return question_entries

    except Exception as e:
        print(f"Error in /video-component-qa endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.delete("/soft-delete-node/{node_id}", response_model=dict)
def soft_delete_node(node_id: str):
    try:
        result = node_collection.update_one(
            {"_id": ObjectId(node_id)}, {"$set": {"is_delete": "true"}}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Node not found.")

        return {"message": "Node soft deleted successfully."}

    except Exception as e:
        print(f"Error in /soft-delete-node endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.get("/get-all-flow-details/{flow_id}")
def get_flow_details(flow_id: str):
    try:
        if not ObjectId.is_valid(flow_id):
            raise HTTPException(status_code=400, detail="Invalid flow_id format.")

        flow = flow_collection.find_one({"_id": ObjectId(flow_id)})
        if not flow:
            raise HTTPException(status_code=404, detail="Flow not found.")

        components = list(component_collection.find({"flow_id": ObjectId(flow_id)}))
        if not components:
            raise HTTPException(
                status_code=404, detail="No components found for the given flow_id."
            )

        flow_details = {
            "flow": {
                "flow_id": str(flow["_id"]),
                "flow_name": flow.get("flow_name"),
                "description": flow.get("description"),
                "summary": flow.get("summary"),
            },
            "components": [],
        }

        for component in components:
            component_id = str(component["_id"])
            nodes = list(
                node_collection.find(
                    {
                        "component_id": ObjectId(component_id),
                        "flow_id": ObjectId(flow_id),
                    }
                )
            )

            component_details = {
                "component_id": component_id,
                "name": component.get("name"),
                "file_hash": component.get("file_hash"),
                "size": component.get("size"),
                "s3_path": component.get("s3_path"),
                "nodes": [],
            }

            for node in nodes:
                component_details["nodes"].append(
                    {
                        "node_id": str(node["_id"]),
                        "question": node.get("question"),
                        "answer": node.get("answer"),
                        "timestamp": node.get("timestamp"),
                    }
                )

            flow_details["components"].append(component_details)

        return flow_details

    except Exception as e:
        print(f"Error in /get-all-flow-details/{flow_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/create_sql_component/", response_model=SQLComponentResponse)
def create_sql_component(request: SQLComponentRequest):
    try:
        update_operation_progress(
            request.operation_id,
            phase="validating",
            message="Preparing SQL source",
            detail=request.table_name,
            progress=12,
        )
        flow = flow_collection.find_one({"_id": ObjectId(request.flow_id)})
        
        if flow["flow_type"] != 'manual':
            raise HTTPException(status_code=400, detail="Only Manual Mindmap is supported for SQL.")
        
        update_operation_progress(
            request.operation_id,
            phase="schema",
            message="Reading SQL schema",
            detail=f"Looking for tables matching {request.table_name}.",
            progress=38,
        )
        df_ddl = sqlBot.run_sql("SELECT type, sql FROM sqlite_master WHERE sql IS NOT NULL AND name LIKE '%" + request.table_name + "%'")
        print(df_ddl)

        update_operation_progress(
            request.operation_id,
            phase="ai_reading",
            message="AI is reading SQL table context",
            detail="Training available table definitions for questions.",
            progress=68,
        )
        for ddl in df_ddl['sql'].to_list():
            sqlBot.train(ddl=ddl)

        training_data = sqlBot.get_training_data()
        print(training_data)
        update_operation_progress(
            request.operation_id,
            phase="saving",
            message="Adding SQL source node",
            detail=request.table_name,
            progress=88,
        )

        component_data = {
            "flow_id": ObjectId(request.flow_id),
            "type": "sql",
            "table_name": request.table_name,
            **source_metadata_fields(
                virtual_source_context(
                    label=request.table_name,
                    source_type="sql",
                    flow_id=request.flow_id,
                )
            ),
        }

        component_id = component_collection.insert_one(component_data).inserted_id
        update_operation_progress(
            request.operation_id,
            phase="complete",
            message="SQL source ready",
            detail=request.table_name,
            progress=100,
            status_value="completed",
        )

        return SQLComponentResponse(
            component_id=str(component_id),
            type="sql",
            message="Component created successfully",
        )

    except HTTPException as e:
        update_operation_progress(
            request.operation_id,
            phase="failed",
            message="SQL source could not be added",
            detail=str(e.detail),
            progress=100,
            status_value="failed",
        )
        raise e
    except Exception as e:
        print(f"Error in /create_sql_component/: {e}")
        update_operation_progress(
            request.operation_id,
            phase="failed",
            message="SQL source could not be added",
            detail=str(e),
            progress=100,
            status_value="failed",
        )
        raise HTTPException(
            status_code=500, detail=f"Error creating SQL component: {str(e)}"
        )


@app.post("/components-follow-up-questions", response_model=List[ComponentFollowUpQueryResponse])
def create_follow_up_questions(request: ComponentFollowUpQueryRequest):
    try:
        if request.component_type == "pdf":
            record = component_collection.find_one(
                {
                    "flow_id": ObjectId(request.flow_id),
                    "_id": ObjectId(request.component_id),
                    "type": "pdf",
                }
            )

            if record["processing_type"] == "gpt":
                assistant = openai.beta.assistants.update(
                    assistant_id=record["assistant_id"],
                    name=request.persona_name,
                    instructions=request.instructions,
                    model=request.model_name,
                    temperature=request.temperature,
                    top_p=request.top_p,
                    tool_resources={
                        "file_search": {"vector_store_ids": [record["vector_store_id"]]}
                    },
                )
            else:
                component_collection.update_one(
                    {"_id": ObjectId(request.component_id)},
                    {
                        "$set": {
                            "instructions": request.instructions,
                            "persona_name": request.persona_name,
                        }
                    },
                )

            summary_pdf = record["summary"]
            relevant_passage = " ".join(summary_pdf)
            template = """Given the following summary and persona, generate three follow-up questions that the persona might ask about the text data. Respond with a list of questions, one per line, in Python string format delimited by |||. If no relevant questions are found, return an empty string.

            Here is the summary :- {summary_pdf}
            Here is the persona :- {persona}"""

            prompt = PromptTemplate.from_template(template)

            llm_chain = prompt | llm
            answer = llm_chain.invoke(
                {"summary_pdf": relevant_passage, "persona": request.persona_name}
            )

            responseList = answer.content

            print(responseList)

            responseList = (
                responseList.replace("```python", "").replace("```", "").strip()
            )
            responseList = responseList.replace("\n", "")

            responseList = [item.strip() for item in responseList.split("|||")]

            question_entries = []

            if responseList:

                for q in responseList:
                    question_entries.append(
                        ComponentFollowUpQueryResponse(
                            id=str(ObjectId()),
                            flow_id=request.flow_id,
                            data={
                                "question": q,
                                "component_id": request.component_id,
                                "component_type": request.component_type,
                            },
                            type="followUp",
                            position={"x": 0, "y": 0},
                        )
                    )

            empty_question_entry = ComponentFollowUpQueryResponse(
                id=str(ObjectId()),
                flow_id=request.flow_id,
                position={"x": 0, "y": 0},
                data={
                    "question": "",
                    "component_id": request.component_id,
                    "component_type": request.component_type,
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

            return question_entries

        elif request.component_type == "txt":
            record = component_collection.find_one(
                {
                    "flow_id": ObjectId(request.flow_id),
                    "_id": ObjectId(request.component_id),
                    "type": "txt",
                }
            )

            assistant = openai.beta.assistants.update(
                assistant_id=record["assistant_id"],
                name=request.persona_name,
                instructions=request.instructions,
                model=request.model_name,
                temperature=request.temperature,
                top_p=request.top_p,
                tool_resources={
                    "file_search": {"vector_store_ids": [record["vector_store_id"]]}
                },
            )


            summary_txt = record["summary"]

            relevant_passage = " ".join(summary_txt)

            template = """Given the following summary and persona, generate three follow-up questions that the persona might ask about the text data. Respond with a list of questions, one per line, in Python string format delimited by |||. If no relevant questions are found, return an empty string.

            Here is the summary :- {summary_txt}
            Here is the persona :- {persona}"""

            prompt = PromptTemplate.from_template(template)

            llm_chain = prompt | llm
            answer = llm_chain.invoke(
                {"summary_txt": relevant_passage, "persona": request.persona_name}
            )

            responseList = answer.content

            print(responseList)

            responseList = (
                responseList.replace("```python", "").replace("```", "").strip()
            )
            responseList = responseList.replace("\n", "")

            responseList = [item.strip() for item in responseList.split("|||")]

            question_entries = []

            if responseList:

                for q in responseList:
                    question_entries.append(
                        ComponentFollowUpQueryResponse(
                            id=str(ObjectId()),
                            flow_id=request.flow_id,
                            data={
                                "question": q,
                                "component_id": request.component_id,
                                "component_type": request.component_type,
                            },
                            type="followUp",
                            position={"x": 0, "y": 0},
                        )
                    )

            empty_question_entry = ComponentFollowUpQueryResponse(
                id=str(ObjectId()),
                flow_id=request.flow_id,
                position={"x": 0, "y": 0},
                data={
                    "question": "",
                    "component_id": request.component_id,
                    "component_type": request.component_type,
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

            return question_entries

        elif request.component_type == "md":
            record = component_collection.find_one(
                {
                    "flow_id": ObjectId(request.flow_id),
                    "_id": ObjectId(request.component_id),
                    "type": "md",
                }
            )

            assistant = openai.beta.assistants.update(
                assistant_id=record["assistant_id"],
                name=request.persona_name,
                instructions=request.instructions,
                model=request.model_name,
                temperature=request.temperature,
                top_p=request.top_p,
                tool_resources={
                    "file_search": {"vector_store_ids": [record["vector_store_id"]]}
                },
            )

            summary_md = record["summary"]

            relevant_passage = " ".join(summary_md)

            template = """Given the following summary and persona, generate three follow-up questions that the persona might ask about the text data. Respond with a list of questions, one per line, in Python string format delimited by |||. If no relevant questions are found, return an empty string.

            Here is the summary :- {summary_md}
            Here is the persona :- {persona}"""

            prompt = PromptTemplate.from_template(template)

            llm_chain = prompt | llm
            answer = llm_chain.invoke(
                {"summary_md": relevant_passage, "persona": request.persona_name}
            )

            responseList = answer.content

            print(responseList)

            responseList = (
                responseList.replace("```python", "").replace("```", "").strip()
            )
            responseList = responseList.replace("\n", "")

            responseList = [item.strip() for item in responseList.split("|||")]

            question_entries = []

            if responseList:

                for q in responseList:
                    question_entries.append(
                        ComponentFollowUpQueryResponse(
                            id=str(ObjectId()),
                            flow_id=request.flow_id,
                            data={
                                "question": q,
                                "component_id": request.component_id,
                                "component_type": request.component_type,
                            },
                            type="followUp",
                            position={"x": 0, "y": 0},
                        )
                    )

            empty_question_entry = ComponentFollowUpQueryResponse(
                id=str(ObjectId()),
                flow_id=request.flow_id,
                position={"x": 0, "y": 0},
                data={
                    "question": "",
                    "component_id": request.component_id,
                    "component_type": request.component_type,
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

            return question_entries

        elif request.component_type == "html":
            record = component_collection.find_one(
                {
                    "flow_id": ObjectId(request.flow_id),
                    "_id": ObjectId(request.component_id),
                    "type": "html",
                }
            )

            assistant = openai.beta.assistants.update(
                assistant_id=record["assistant_id"],
                name=request.persona_name,
                instructions=request.instructions,
                model=request.model_name,
                temperature=request.temperature,
                top_p=request.top_p,
                tool_resources={
                    "file_search": {"vector_store_ids": [record["vector_store_id"]]}
                },
            )

            summary_html = record["summary"]

            relevant_passage = " ".join(summary_html)

            template = """Given the following summary and persona, generate three follow-up questions that the persona might ask about the text data. Respond with a list of questions, one per line, in Python string format delimited by |||. If no relevant questions are found, return an empty string.

            Here is the summary :- {summary_html}
            Here is the persona :- {persona}"""

            prompt = PromptTemplate.from_template(template)

            llm_chain = prompt | llm
            answer = llm_chain.invoke(
                {"summary_html": relevant_passage, "persona": request.persona_name}
            )

            responseList = answer.content

            print(responseList)

            responseList = (
                responseList.replace("```python", "").replace("```", "").strip()
            )
            responseList = responseList.replace("\n", "")

            responseList = [item.strip() for item in responseList.split("|||")]

            question_entries = []

            if responseList:

                for q in responseList:
                    question_entries.append(
                        ComponentFollowUpQueryResponse(
                            id=str(ObjectId()),
                            flow_id=request.flow_id,
                            data={
                                "question": q,
                                "component_id": request.component_id,
                                "component_type": request.component_type,
                            },
                            type="followUp",
                            position={"x": 0, "y": 0},
                        )
                    )

            empty_question_entry = ComponentFollowUpQueryResponse(
                id=str(ObjectId()),
                flow_id=request.flow_id,
                position={"x": 0, "y": 0},
                data={
                    "question": "",
                    "component_id": request.component_id,
                    "component_type": request.component_type,
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

            return question_entries

        elif request.component_type == "docx":
            record = component_collection.find_one(
                {
                    "flow_id": ObjectId(request.flow_id),
                    "_id": ObjectId(request.component_id),
                    "type": "docx",
                }
            )

            assistant = openai.beta.assistants.update(
                assistant_id=record["assistant_id"],
                name=request.persona_name,
                instructions=request.instructions,
                model=request.model_name,
                temperature=request.temperature,
                top_p=request.top_p,
                tool_resources={
                    "file_search": {"vector_store_ids": [record["vector_store_id"]]}
                },
            )

            summary_docx = record["summary"]

            relevant_passage = " ".join(summary_docx)

            template = """Given the following summary and persona, generate three follow-up questions that the persona might ask about the text data. Respond with a list of questions, one per line, in Python string format delimited by |||. If no relevant questions are found, return an empty string.

            Here is the summary :- {summary_docx}
            Here is the persona :- {persona}"""

            prompt = PromptTemplate.from_template(template)

            llm_chain = prompt | llm
            answer = llm_chain.invoke(
                {"summary_docx": relevant_passage, "persona": request.persona_name}
            )

            responseList = answer.content

            print(responseList)

            responseList = (
                responseList.replace("```python", "").replace("```", "").strip()
            )
            responseList = responseList.replace("\n", "")

            responseList = [item.strip() for item in responseList.split("|||")]

            question_entries = []

            if responseList:

                for q in responseList:
                    question_entries.append(
                        ComponentFollowUpQueryResponse(
                            id=str(ObjectId()),
                            flow_id=request.flow_id,
                            data={
                                "question": q,
                                "component_id": request.component_id,
                                "component_type": request.component_type,
                            },
                            type="followUp",
                            position={"x": 0, "y": 0},
                        )
                    )

            empty_question_entry = ComponentFollowUpQueryResponse(
                id=str(ObjectId()),
                flow_id=request.flow_id,
                position={"x": 0, "y": 0},
                data={
                    "question": "",
                    "component_id": request.component_id,
                    "component_type": request.component_type,
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

            return question_entries

        elif request.component_type == "pptx":
            record = component_collection.find_one(
                {
                    "flow_id": ObjectId(request.flow_id),
                    "_id": ObjectId(request.component_id),
                    "type": "pptx",
                }
            )

            assistant = openai.beta.assistants.update(
                assistant_id=record["assistant_id"],
                name=request.persona_name,
                instructions=request.instructions,
                model=request.model_name,
                temperature=request.temperature,
                top_p=request.top_p,
                tool_resources={
                    "file_search": {"vector_store_ids": [record["vector_store_id"]]}
                },
            )


            summary_pptx = record["summary"]

            relevant_passage = " ".join(summary_pptx)

            template = """Given the following summary and persona, generate three follow-up questions that the persona might ask about the text data. Respond with a list of questions, one per line, in Python string format delimited by |||. If no relevant questions are found, return an empty string.

            Here is the summary :- {summary_pptx}
            Here is the persona :- {persona}"""

            prompt = PromptTemplate.from_template(template)

            llm_chain = prompt | llm
            answer = llm_chain.invoke(
                {"summary_pptx": relevant_passage, "persona": request.persona_name}
            )

            responseList = answer.content

            print(responseList)

            responseList = (
                responseList.replace("```python", "").replace("```", "").strip()
            )
            responseList = responseList.replace("\n", "")

            responseList = [item.strip() for item in responseList.split("|||")]

            question_entries = []

            if responseList:

                for q in responseList:
                    question_entries.append(
                        ComponentFollowUpQueryResponse(
                            id=str(ObjectId()),
                            flow_id=request.flow_id,
                            data={
                                "question": q,
                                "component_id": request.component_id,
                                "component_type": request.component_type,
                            },
                            type="followUp",
                            position={"x": 0, "y": 0},
                        )
                    )

            empty_question_entry = ComponentFollowUpQueryResponse(
                id=str(ObjectId()),
                flow_id=request.flow_id,
                position={"x": 0, "y": 0},
                data={
                    "question": "",
                    "component_id": request.component_id,
                    "component_type": request.component_type,
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

            return question_entries

        elif request.component_type == "sql":
            record = component_collection.find_one(
                {
                    "flow_id": ObjectId(request.flow_id),
                    "_id": ObjectId(request.component_id),
                    "type": "sql",
                }
            )
            table_name = record["table_name"]
            responseDDL = sqlBot.get_related_ddl(table_name)
            responseDOC = sqlBot.get_related_documentation(table_name)
            responseSimilarSQL = sqlBot.get_similar_question_sql(table_name)
            responseList = sqlBot.get_followup_questions_custom(
                table_name, responseSimilarSQL, responseDDL, responseDOC
            )
            responseList = (
                responseList.replace("```python", "").replace("```", "").strip()
            )
            responseList = responseList.replace("\n", "")  # Remove newlines
            responseList = responseList.replace("\\", "")  # Remove backslashes

            responseList = [item.strip() for item in responseList.split("|||")]

            print(responseList)

            question_entries = []

            if responseList:

                for q in responseList:
                    question_entries.append(
                        ComponentFollowUpQueryResponse(
                            id=str(ObjectId()),
                            flow_id=request.flow_id,
                            data={
                                "question": q,
                                "component_id": request.component_id,
                                "component_type": request.component_type,
                            },
                            type="followUp",
                            position={"x": 0, "y": 0},
                        )
                    )

            empty_question_entry = ComponentFollowUpQueryResponse(
                id=str(ObjectId()),
                flow_id=request.flow_id,
                position={"x": 0, "y": 0},
                data={
                    "question": "",
                    "component_id": request.component_id,
                    "component_type": request.component_type,
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

            return question_entries

        elif request.component_type == "csv":
            record = component_collection.find_one(
                {
                    "flow_id": ObjectId(request.flow_id),
                    "_id": ObjectId(request.component_id),
                    "type": "csv",
                }
            )
            table_name = record["table_name"]
            print("Thissssss is table name", table_name)
            responseDDL = csvBot.get_related_ddl(table_name)
            print("THIS IS RESSSPONSE -----", responseDDL)
            responseDOC = csvBot.get_related_documentation(table_name)
            responseSimilarSQL = csvBot.get_similar_question_sql(table_name)
            responseList = csvBot.get_followup_questions_custom(
                table_name, responseSimilarSQL, responseDDL, responseDOC
            )
            responseList = (
                responseList.replace("```python", "").replace("```", "").strip()
            )
            responseList = responseList.replace("\n", "")
            responseList = responseList.replace("\\", "")  # Remove backslashes

            responseList = [item.strip() for item in responseList.split("|||")]

            print(responseList)

            question_entries = []

            if responseList:

                for q in responseList:
                    question_entries.append(
                        ComponentFollowUpQueryResponse(
                            id=str(ObjectId()),
                            flow_id=request.flow_id,
                            data={
                                "question": q,
                                "component_id": request.component_id,
                                "component_type": request.component_type,
                            },
                            type="followUp",
                            position={"x": 0, "y": 0},
                        )
                    )

            empty_question_entry = ComponentFollowUpQueryResponse(
                id=str(ObjectId()),
                flow_id=request.flow_id,
                position={"x": 0, "y": 0},
                data={
                    "question": "",
                    "component_id": request.component_id,
                    "component_type": request.component_type,
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

            return question_entries

        elif request.component_type == "web":
            record = component_collection.find_one(
                {
                    "flow_id": ObjectId(request.flow_id),
                    "_id": ObjectId(request.component_id),
                    "type": "web",
                }
            )
            
            assistant = openai.beta.assistants.update(
                assistant_id=record["assistant_id"],
                name=request.persona_name,
                instructions=request.instructions,
                model=request.model_name,
                temperature=request.temperature,
                top_p=request.top_p,
                tool_resources={
                    "file_search": {"vector_store_ids": [record["vector_store_id"]]}
                },
            )

            summary_web = record["summary"]

            relevant_passage = " ".join(summary_web)

            template = """
            Given the following summary and persona, generate three follow-up questions that the persona might ask about the text data. Respond with a list of questions, one per line, in Python string format delimited by |||. If no relevant questions are found, return an empty string.

            Here is the summary :- {summary_web}
            Here is the persona :- {persona}
            """

            prompt = PromptTemplate.from_template(template)

            llm_chain = prompt | llm
            answer = llm_chain.invoke(
                {"summary_web": relevant_passage, "persona": request.persona_name}
            )

            responseList = answer.content

            print(responseList)

            responseList = (
                responseList.replace("```python", "").replace("```", "").strip()
            )
            responseList = responseList.replace("\n", "")  # Remove newlines

            responseList = [item.strip() for item in responseList.split("|||")]

            question_entries = []

            if responseList:

                for q in responseList:
                    question_entries.append(
                        ComponentFollowUpQueryResponse(
                            id=str(ObjectId()),
                            flow_id=request.flow_id,
                            data={
                                "question": q,
                                "component_id": request.component_id,
                                "component_type": request.component_type,
                            },
                            type="followUp",
                            position={"x": 0, "y": 0},
                        )
                    )

            empty_question_entry = ComponentFollowUpQueryResponse(
                id=str(ObjectId()),
                flow_id=request.flow_id,
                position={"x": 0, "y": 0},
                data={
                    "question": "",
                    "component_id": request.component_id,
                    "component_type": request.component_type,
                },
                type="question",
            )

            question_entries.append(empty_question_entry)

            return question_entries

        elif request.component_type == "image":
            record = component_collection.find_one(
                {
                    "flow_id": ObjectId(request.flow_id),
                    "_id": ObjectId(request.component_id),
                    "type": "image",
                }
            )

            if record:
                component_collection.update_one(
                    {"_id": ObjectId(request.component_id)},
                    {
                        "$set": {
                            "instructions": request.instructions,
                            "persona_name": request.persona_name,
                        }
                    },
                )

                base64_image = record["base64_image"]
                mime_type = record["mime_type"]
                image_bytes = base64.b64decode(base64_image)

                image_part = {"mime_type": mime_type, "data": image_bytes}
                #    and persona - "+request.persona_name+" ,

                response = model.generate_content(
                    contents=[
                        "Given the following image generate three follow-up questions that the persona - "+ request.persona_name +" might ask about the image. Respond with a list of questions, one per line, in Python string format delimited by |||. If no relevant questions are found, return an empty string and return only questions only",
                        image_part,
                    ]
                )

                responseList = response.text
                responseList = (
                    responseList.replace("```python", "").replace("```", "").strip()
                )
                responseList = [
                    q.strip()
                    for q in responseList.strip('"').replace("\n", "").split("|||")
                ]

                print(responseList)

                question_entries = []

                if responseList:

                    for q in responseList:
                        question_entries.append(
                            ComponentFollowUpQueryResponse(
                                id=str(ObjectId()),
                                flow_id=request.flow_id,
                                data={
                                    "question": q,
                                    "component_id": request.component_id,
                                    "component_type": request.component_type,
                                },
                                type="followUp",
                                position={"x": 0, "y": 0},
                            )
                        )

                empty_question_entry = ComponentFollowUpQueryResponse(
                    id=str(ObjectId()),
                    flow_id=request.flow_id,
                    position={"x": 0, "y": 0},
                    data={
                        "question": "",
                        "component_id": request.component_id,
                        "component_type": request.component_type,
                    },
                    type="question",
                )
                
                question_entries.append(empty_question_entry)

                return question_entries
        elif request.component_type == "audio":
            record = component_collection.find_one(
                {
                    "flow_id": ObjectId(request.flow_id),
                    "_id": ObjectId(request.component_id),
                    "type": "audio",
                }
            )

            if record:

                component_collection.update_one(
                    {"_id": ObjectId(request.component_id)},
                    {
                        "$set": {
                            "instructions": request.instructions,
                            "persona_name": request.persona_name,
                        }
                    },
                )

                base64_audio = record["base64_audio"]
                mime_type = record["mime_type"]
                audio_bytes = base64.b64decode(base64_audio)

                audio_part = {"mime_type": mime_type, "data": audio_bytes}

                response = model.generate_content(
                    contents=[
                        "Given the following audio generate three follow-up questions that the persona - "+ request.persona_name +" might ask about the image. Respond with a list of questions, one per line, in Python string format delimited by |||. If no relevant questions are found, return an empty string and return only questions only",
                        audio_part,
                    ]
                )

                responseList = response.text
                responseList = (
                    responseList.replace("```python", "").replace("```", "").strip()
                )
                responseList = [
                    q.strip()
                    for q in responseList.strip('"').replace("\n", "").split("|||")
                ]

                print(responseList)

                question_entries = []

                if responseList:

                    for q in responseList:
                        question_entries.append(
                            ComponentFollowUpQueryResponse(
                                id=str(ObjectId()),
                                flow_id=request.flow_id,
                                data={
                                    "question": q,
                                    "component_id": request.component_id,
                                    "component_type": request.component_type,
                                },
                                type="followUp",
                                position={"x": 0, "y": 0},
                            )
                        )

                empty_question_entry = ComponentFollowUpQueryResponse(
                    id=str(ObjectId()),
                    flow_id=request.flow_id,
                    position={"x": 0, "y": 0},
                    data={
                        "question": "",
                        "component_id": request.component_id,
                        "component_type": request.component_type,
                    },
                    type="question",
                )
                
                question_entries.append(empty_question_entry)

                return question_entries

        elif request.component_type == "youtube":
            record = component_collection.find_one(
                {
                    "flow_id": ObjectId(request.flow_id),
                    "_id": ObjectId(request.component_id),
                    "type": "youtube",
                }
            )

            if record:

                component_collection.update_one(
                    {"_id": ObjectId(request.component_id)},
                    {
                        "$set": {
                            "instructions": request.instructions,
                            "persona_name": request.persona_name,
                        }
                    },
                )

                youtube_url = record["youtube_url"]
                mime_type = "video/*"

                response = model_vertexai.generate_content(
                    contents=[
                        "Given the following youtube video generate three follow-up questions that the persona - "+ request.persona_name +" might ask about the image. Respond with a list of questions, one per line, in Python string format delimited by |||. If no relevant questions are found, return an empty string and return only questions only",
                        Part.from_uri(youtube_url, mime_type),
                    ]
                )
                
                responseList = response.text
                responseList = (
                    responseList.replace("```python", "").replace("```", "").strip()
                )
                responseList = [
                    q.strip()
                    for q in responseList.strip('"').replace("\n", "").split("|||")
                ]

                print(responseList)

                question_entries = []

                if responseList:

                    for q in responseList:
                        question_entries.append(
                            ComponentFollowUpQueryResponse(
                                id=str(ObjectId()),
                                flow_id=request.flow_id,
                                data={
                                    "question": q,
                                    "component_id": request.component_id,
                                    "component_type": request.component_type,
                                },
                                type="followUp",
                                position={"x": 0, "y": 0},
                            )
                        )

                empty_question_entry = ComponentFollowUpQueryResponse(
                    id=str(ObjectId()),
                    flow_id=request.flow_id,
                    position={"x": 0, "y": 0},
                    data={
                        "question": "",
                        "component_id": request.component_id,
                        "component_type": request.component_type,
                    },
                    type="question",
                )

                question_entries.append(empty_question_entry)

                return question_entries

        elif request.component_type == "video":
            record = component_collection.find_one(
                {
                    "flow_id": ObjectId(request.flow_id),
                    "_id": ObjectId(request.component_id),
                    "type": "video",
                }
            )

            if record:

                component_collection.update_one(
                    {"_id": ObjectId(request.component_id)},
                    {
                        "$set": {
                            "instructions": request.instructions,
                            "persona_name": request.persona_name,
                        }
                    },
                )

                video_url = record["video_url"]
                mime_type = record["mime_type"]


                response = model_vertexai.generate_content(
                    contents=[
                        "Given the following video generate three follow-up questions that the persona - "+ request.persona_name +" might ask about the image. Respond with a list of questions, one per line, in Python string format delimited by |||. If no relevant questions are found, return an empty string and return only questions only",
                        Part.from_uri(video_url, mime_type),
                    ]
                )

                responseList = response.text
                responseList = (
                    responseList.replace("```python", "").replace("```", "").strip()
                )
                responseList = [
                    q.strip()
                    for q in responseList.strip('"').replace("\n", "").split("|||")
                ]

                question_entries = []

                if responseList:

                    for q in responseList:
                        question_entries.append(
                            ComponentFollowUpQueryResponse(
                                id=str(ObjectId()),
                                flow_id=request.flow_id,
                                data={
                                    "question": q,
                                    "component_id": request.component_id,
                                    "component_type": request.component_type,
                                },
                                type="followUp",
                                position={"x": 0, "y": 0},
                            )
                        )

                empty_question_entry = ComponentFollowUpQueryResponse(
                    id=str(ObjectId()),
                    flow_id=request.flow_id,
                    position={"x": 0, "y": 0},
                    data={
                        "question": "",
                        "component_id": request.component_id,
                        "component_type": request.component_type,
                    },
                    type="question",
                )

                question_entries.append(empty_question_entry)

                return question_entries
        else:
            pass

    except Exception as e:
        print(f"Error in /components-follow-up-questions: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/sql-component-qa", response_model=List[SQLNodeQueryResponse])
def SQL_QA(request: SQLNodeQueryRequest):
    try:
        record = component_collection.find_one(
            {
                "flow_id": ObjectId(request.flow_id),
                "_id": ObjectId(request.component_id),
                "type": "sql",
            }
        )

        if not record or "table_name" not in record:
            raise HTTPException(
                status_code=404,
                detail="Table not found for the given flow_id and component_id",
            )

        table_name = record["table_name"]

        question_with_table = (
            f"question - {request.question} for table name: {table_name}"
        )

        sqlQuery = sqlBot.generate_sql(question_with_table)
        if sqlBot.is_sql_valid(sqlQuery):
            runSQLDF = sqlBot.run_sql(sqlQuery)
            summSQL = sqlBot.generate_summary(question_with_table, runSQLDF)
            code = sqlBot.generate_plotly_code(
                question=question_with_table,
                sql=sqlQuery,
                df_metadata=f"Running df.dtypes gives:\n {runSQLDF.dtypes}",
            )
            fig = sqlBot.get_plotly_figure(plotly_code=code, df=runSQLDF)
            plotyGraph = fig.to_json()

            df_dict = runSQLDF.to_dict(orient="records")
            df_dict = [{str(k): v for k, v in row.items()} for row in df_dict]
            result_document = {
                "_id": ObjectId(request.node_id),
                "question": request.question,
                "query": sqlQuery,
                "df": df_dict,
                "summ": summSQL,
                "graph": plotyGraph,
                "flow_id": ObjectId(request.flow_id),
                "component_id": ObjectId(request.component_id),
                "type": "sql",
                "is_delete": "false",
                "created_at": datetime.datetime.utcnow(),
            }

            node_id_response = node_collection.insert_one(result_document)

            question_entries = []

            response_data = {
                "id": str(request.node_id),
                "type": "SQLNode",
                "data": {
                    "question": request.question,
                    "query": sqlQuery,
                    "df": runSQLDF.to_dict(orient="records"),
                    "summ": summSQL,
                    "graph": plotyGraph,
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "sql",
                },
            }

            question_entries.append(response_data)

            if request.request_type == "question":
                empty_node = {
                    "id": str(ObjectId()),
                    "type": "question",
                    "data": {
                        "question": "",
                        "flow_id": request.flow_id,
                        "component_id": request.component_id,
                        "component_type": "sql",
                    },
                }
                question_entries.append(empty_node)

            return question_entries

        else:

            print("No answer found from llm")

            df_dict = pd.DataFrame().to_dict(orient="records")
            df_dict = [{str(k): v for k, v in row.items()} for row in df_dict]

            result_document = {
                "_id": ObjectId(request.node_id),
                "question": request.question,
                "query": "I don't know",
                "df": df_dict,
                "summ": "",
                "graph": "",
                "flow_id": ObjectId(request.flow_id),
                "component_id": ObjectId(request.component_id),
                "type": "sql",
                "is_delete": "false",
                "created_at": datetime.datetime.utcnow(),
            }

            node_id_response = node_collection.insert_one(result_document)

            question_entries = []

            response_data = {
                "id": str(request.node_id),
                "type": "SQLNode",
                "data": {
                    "question": request.question,
                    "query": "I don't know",
                    "df": pd.DataFrame().to_dict(orient="records"),
                    "summ": "",
                    "graph": "",
                    "flow_id": request.flow_id,
                    "component_id": request.component_id,
                    "component_type": "sql",
                },
            }

            question_entries.append(response_data)

            if request.request_type == "question":
                empty_node = {
                    "id": str(ObjectId()),
                    "type": "question",
                    "data": {
                        "question": "",
                        "flow_id": request.flow_id,
                        "component_id": request.component_id,
                        "component_type": "sql",
                    },
                }

                question_entries.append(empty_node)

            return question_entries

    except Exception as e:
        traceback.print_exc()
        print(f"Error in /sql-component-qa: {str(e.__traceback__)}")

        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.post("/multiple-qa-summarize", response_model=MultipleQuestionAnswerQueryResponse)
def multiple_qa_summarize(request: MultipleQuestionAnswerQueryRequest):
    try:
        conversation = []

        for parent_id in request.parent_node_ids:
            question, answer = fetch_question_answer_from_node_collection(
                parent_id, request.flow_id
            )
            if question and answer:
                conversation.append({"role": "user", "content": question})
                conversation.append(
                    {"role": "assistant", "content": f"Answer: \n{answer}"}
                )

        print(conversation)

        template = """
        You are an AI assistant tasked with answering the user’s question based on the provided conversation history. Return the results in **JSON format** with the structure below:  

        #### **Response Format:**  
        {{
        "summ": "Your summarized response here...",
        "df": an array of JSON objects,
        "graph": "json_string_representation_of_plotly_graph"
        }}

        ### **Instructions:**
        1. Answer the question using the conversation history.
        2. Extract relevant tabular data into a JSON object compatible with Ag-Grid. If no table exists, return empty JSON object.
        3. If a dataframe is available, generate a relevant **Plotly graph**. Return it as a **valid JSON string** that can be parsed in React.js.
        4. If no graph is possible, return an empty string `""`.
        5. ** The graph's background will be black, so adjust the theme accordingly**.

        **Here is the question:** {query}  
        **Here is the conversation history:** {history}

        NOTE -- "Make sure you need to return only json as response only & please don't add any comments"
        NOTE -- "Make sure you need only need the answer for which context of data is available if not available return empty json as per format"
        

        ### **Example Output:**  
        If the conversation history contains a table and a relevant graph, return:  

        ```json
        {{
        "summ": "Based on the conversation, the key points discussed were...",
        "df": [
            {{
            "column1": "value1",
            "column2": "value2",
            "column3": "value3"
            }},
            {{
            "column1": "value1",
            "column2": "value2",
            "column3": "value3"
            }}
        ],
        "graph": "{{\"data\": [{{\"x\": [\"2024-02-01\", \"2024-02-02\"], \"y\": [100, 150], \"type\": \"line\"}}], \"layout\": {{\"title\": \"Sample Graph\"}}"
        }}
        """

        json_structure = """{
            "summ": "Your summary text here...",
                "df": [
                    {
                    "column1": "value1",
                    "column2": "value2",
                    "column3": "value3"
                    },
                    {
                    "column1": "value1",
                    "column2": "value2",
                    "column3": "value3"
                    }
                ],
                "graph": {
                    "data": [ ... ],
                    "layout": { ... }
                }
            }"""

        prompt = PromptTemplate.from_template(template)

        print(prompt)

        llm_chain = prompt | llm
        answer = llm_chain.invoke({"query": request.question, "history": conversation})

        response = (
            answer.content.replace("```json", "")
            .replace("```", "")
            .strip()
            .replace("\n", "")
        )
        response_json = json.loads(response)
        print(response_json)

        node_data = {
            "_id": ObjectId(request.node_id),
            "flow_id": ObjectId(request.flow_id),
            "parent_node_ids": request.parent_node_ids,
            "question": request.question,
            "summ": response_json.get("summ", ""),
            "df": validate_dataframe(response_json.get("df", [])),
            "graph": response_json.get("graph", ""),
            "type": "MultipleQA",
            "is_delete": "false",
            "created_at": datetime.datetime.utcnow(),
        }

        node_id_response = node_collection.insert_one(node_data)

        response = MultipleQuestionAnswerQueryResponse(
            data={
                "question": request.question,
                "summ": response_json.get("summ", ""),
                "df": validate_dataframe(response_json.get("df", [])),
                "graph": response_json.get("graph", ""),
                "flow_id": request.flow_id,
                "parent_node_ids": request.parent_node_ids,
                "component_type": "MultipleQA",
            },
            id=request.node_id,
            type="MultipleQA",
            parent_node_ids=request.parent_node_ids,
        )

        return response

    except Exception as e:
        print(f"Error in /multiple-qa-summarize: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error processing the request: {str(e)}"
        )


@app.post("/flow-summarizer", response_model=FlowSummarizeResponse)
def flow_summarizer(request: FlowSummarizeRequest):
    try:
        nodes = node_collection.find({"flow_id": ObjectId(request.flow_id)})
        if not nodes:
            raise HTTPException(
                status_code=404, detail="No nodes found for the given flow_id."
            )

        conversation = []
        print("This are nodes", request.flow_id)
        for node in nodes:
            node_id = node["_id"]
            print(node_id)
            question, answer = fetch_question_answer_from_node_collection(
                node_id, request.flow_id
            )
            if question and answer:
                conversation.append({"role": "user", "content": question})
                conversation.append(
                    {"role": "assistant", "content": f"Answer: \n{answer}"}
                )

        print(conversation)

        template = """You are an AI assistant tasked with generating a JSX element based on multiple conversations between the user and assistant.

        ### **Rules:**
        1. **Return only valid JSX. No explanations, comments, or extra text.**
        2. **Use only `plotly.js` and `ag-grid-community`. No other libraries are allowed.**
        3. **The output must look like a structured financial report, not just 2-3 components.**
        4. **The layout should have clear sections like:**
            - Executive Summary (must be 100-150 words) 
            - Key Financial Metrics  (must highlight all the crucial points)
            - Performance Tables  (most important and data crucial)
            - Multiple Charts for Trends  
            - Additional Insights  
        5. **Ensure proper spacing, professional styling, and structured formatting.**
        6. **Use `ag-grid-community` for multiple tables.**
        7. **Use `plotly.js` for multiple relevant graphs.**
        8. **All sections should be visually distinct but cohesive.**
        9. **Make the design responsive, with professional styling (flexbox, grid, typography).**
        10. **Ensure the final output looks like an actual financial report from an investment firm.**
        11. For AG-Grid React always include the ref, rowClass, rowHeight, rowStyle, headerHeight and domLayout given in the **REFERENCE**.
        12. **FONT COLOR SHOULD BE BLACK FOR p tags and h1 tags**.
        13. **!important NO STYLING SHOULD BE APPLIED TO PLOT**.
        14. **BACKGROUND COLOR  OF MAIN DIV WILL BE WHITE**.
        15. **TRY TO LAYOUT AG-GRID BY GIVING HEIGHT AND WIDTH AS INLINE CSS BASED ON THE ROWDATA AND COLDEFS**.
        16. **!important GET AG-GRID TABLES IN WHITE **.
        17. **INCLUDE HR TAG after EACH SECTION**.
        18. **ALWAYS HAVE THE HEADING OF FINANCIAL REPORT AT BEGINNING AT THE CENTER**.
        19. **GIVE SOME GAPS AFTER EACH SECTION AND BETWEEN AG-GRID TABLES**.


        ### **Conversation History**
        Here is the conversation history :- {conversation}

        ### **Reference Output (Only JSX, No Comments or Extra Text, No Need to follow as given below):**  

        <div>
            <p style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "10px" }}>
                Summary: {{Your Answer}}
            </p>

            <div className="ag-theme-alpine"> 
                <AgGridReact
                    rowData=[
                        {{ column1: "value1", column2: "value2", column3: "value3" }},
                        {{ column1: "value1", column2: "value2", column3: "value3" }}
                    ]
                    columnDefs=[
                        {{ headerName: "Column 1", field: "column1" }},
                        {{ headerName: "Column 2", field: "column2" }},
                        {{ headerName: "Column 3", field: "column3" }}
                    ]
                    rowClass={{"ag-row"}}
					rowHeight={{56}}
					rowStyle={{ alignItems: "center !important" }}
					headerHeight={{56}}
                    domLayout="autoHeight"
                />
            </div>

            <div style={{ width: "100%", height: "400px" }}>
                <Plot
                    data=[
                        {{ x: [1, 2, 3], y: [10, 20, 30], type: "scatter", mode: "lines+markers", marker: {{ color: "red" }}}}
                    ]
                    layout={{ title: "Graph Title", width: 600, height: 400 }}
                />
            </div>
        </div>        
        """
        prompt = PromptTemplate.from_template(template)

        llm_chain = prompt | llm
        answer = llm_chain.invoke({"conversation": conversation})

        print(answer)

        answer = answer.content.replace("```jsx", "").replace("```", "").strip()
        response = answer.replace("\n", "")

        update_result = flow_collection.update_one(
            {"_id": ObjectId(request.flow_id)}, {"$set": {"summary": response}}
        )

        response = FlowSummarizeResponse(
            flow_id=request.flow_id,
            response=response,
        )
        print(response)

        return response

    except Exception as e:
        print(f"Error in /flow-summarizer: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"Error processing the request: {str(e)}"
        )

@app.get("/sqlite-tables", response_model=List[str])
def read_sqlite_tables():
    cursor = connection.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cursor.fetchall()]
    connection.close()
    return tables
