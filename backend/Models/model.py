from pydantic import BaseModel, ConfigDict, Field
from typing import Any, List, Dict, Literal

class Flow(BaseModel):
    flow_id: str
    flow_name: str
    flow_json: str
    flow_type: str
    summary: str

class PDFNodeQueryRequest(BaseModel):
    query: str
    flow_id: str
    component_id: str
    node_id: str
    request_type: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class PDFNodeQueryResponse(BaseModel):
    id: str
    type: str
    data: dict

class TXTNodeQueryRequest(BaseModel):
    query: str
    flow_id: str
    component_id: str
    node_id: str
    request_type: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class TXTNodeQueryResponse(BaseModel):
    id: str
    type: str
    data: dict

class MDNodeQueryRequest(BaseModel):
    query: str
    flow_id: str
    component_id: str
    node_id: str
    request_type: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class MDNodeQueryResponse(BaseModel):
    id: str
    type: str
    data: dict    

class HTMLNodeQueryRequest(BaseModel):
    query: str
    flow_id: str
    component_id: str
    node_id: str
    request_type: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class HTMLNodeQueryResponse(BaseModel):
    id: str
    type: str
    data: dict    

class DOCXNodeQueryRequest(BaseModel):
    query: str
    flow_id: str
    component_id: str
    node_id: str
    request_type: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class DOCXNodeQueryResponse(BaseModel):
    id: str
    type: str
    data: dict         

class PPTXNodeQueryRequest(BaseModel):
    query: str
    flow_id: str
    component_id: str
    node_id: str
    request_type: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class PPTXNodeQueryResponse(BaseModel):
    id: str
    type: str
    data: dict    

class SQLComponentRequest(BaseModel):
    flow_id: str
    table_name: str

class SQLComponentResponse(BaseModel):
    component_id: str
    type: str
    message: str

class SQLNodeQueryRequest(BaseModel):
    node_id: str
    question: str
    flow_id: str
    component_id: str
    request_type: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class SQLNodeQueryResponse(BaseModel):
    id: str  
    type: str
    data: dict

class CSVNodeQueryRequest(BaseModel):
    node_id: str
    query: str
    flow_id: str
    component_id: str
    request_type: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class CSVNodeQueryResponse(BaseModel):
    id: str  
    type: str
    data: dict

class WebNodeQueryRequest(BaseModel):
    node_id: str
    query: str
    flow_id: str
    component_id: str
    request_type: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class WebNodeQueryResponse(BaseModel):
    id: str  
    type: str
    data: dict

class ImgNodeQueryRequest(BaseModel):
    node_id: str
    query: str
    flow_id: str
    component_id: str
    request_type: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class ImgNodeQueryResponse(BaseModel):
    id: str  
    type: str
    data: dict    

class AudioNodeQueryRequest(BaseModel):
    node_id: str
    query: str
    flow_id: str
    component_id: str
    request_type: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class AudioNodeQueryResponse(BaseModel):
    id: str  
    type: str
    data: dict        

class YoutubeNodeQueryRequest(BaseModel):
    node_id: str
    query: str
    flow_id: str
    component_id: str
    request_type: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class YoutubeNodeQueryResponse(BaseModel):
    id: str  
    type: str
    data: dict      

class VideoNodeQueryRequest(BaseModel):
    node_id: str
    query: str
    flow_id: str
    component_id: str
    request_type: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class VideoNodeQueryResponse(BaseModel):
    id: str  
    type: str
    data: dict   

class ComponentFollowUpQueryRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    flow_id: str 
    component_id : str 
    component_type: str 
    persona_name : str
    temperature: float
    top_p : float
    instructions: str
    model_name : Literal["gpt-5.4", "gpt-5.5"]

class ComponentFollowUpQueryResponse(BaseModel):
    id : str
    flow_id: str 
    position: Dict[str, int]
    data: Dict[str, str]
    type: str
 
class MultipleQuestionAnswerQueryRequest(BaseModel):
    node_id: str
    question: str
    parent_node_ids: List[str]
    flow_id: str
    workspace_brief: Dict[str, Any] = Field(default_factory=dict)

class MultipleQuestionAnswerQueryResponse(BaseModel):
    id: str
    type: str
    parent_node_ids: List[str]
    data: dict

class FlowSummarizeRequest(BaseModel):
    flow_id: str  

class FlowSummarizeResponse(BaseModel):
    flow_id: str      
    response: str

class SourceDocumentModel(BaseModel):
    id: str
    filename: str
    original_filename: str
    type: Literal["pdf", "docx", "md", "txt"]
    file_hash: str
    size: int
    version: int
    status: str = "uploaded"

class DocumentChunkModel(BaseModel):
    id: str
    document_id: str
    index: int
    text: str
    page: int | None = None
    heading: str | None = None
    start_char: int = 0
    end_char: int = 0
