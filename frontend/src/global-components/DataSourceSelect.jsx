import DataSourceSet from "../nodes/DataSourceSet";
import CSVSvg from "../assets/csv.svg";
import SQLSvg from "../assets/sql.svg";
import PDFSvg from "../assets/pdf.svg"
import WEBSvg from "../assets/web.svg"
import AudioSvg from "../assets/audio.svg"
import IMGSvg from '../assets/img.svg';
import MDSvg from "../assets/md.svg"
import HTMLSvg from "../assets/html.svg"
import DOCXSvg from "../assets/docx.svg"
import PPTXSvg from "../assets/pptx.svg"
import TXTSvg from "../assets/text.svg"
import VIDEOSvg from "../assets/video.svg"
import YOUTUBESvg from "../assets/youtube.svg"
import PROMPTSvg from "../assets/prompt.svg"
import CROSSSvg from "../assets/cross.svg";
import modalStore from "../stores/modalStore";

const WORKSPACE_SOURCES = [
	{ img: PROMPTSvg, content: "Start from workspace brief", name: "brief", mode: "No-source draft", detail: "Creates reviewable assumption nodes." },
];

const DOCUMENT_SOURCES = [
	{ img: PDFSvg, content: "Upload PDF", name: "pdf", mode: "Source-traceable", detail: "Extracts chunks and citations." },
	{ img: DOCXSvg, content: "Upload DOCX", name: "docx", mode: "Source-traceable", detail: "Extracts chunks and citations." },
	{ img: MDSvg, content: "Upload Markdown", name: "md", mode: "Source-traceable", detail: "Extracts chunks and citations." },
	{ img: TXTSvg, content: "Upload TXT", name: "txt", mode: "Source-traceable", detail: "Extracts chunks and citations." },
	{ img: PPTXSvg, content: "Upload PPTX", name: "pptx", mode: "AI intake", detail: "Reviewable draft; no chunk citations." },
	{ img: HTMLSvg, content: "Upload HTML", name: "html", mode: "AI intake", detail: "Reviewable draft; no chunk citations." },
];

const WEB_SOURCES = [
	{ img: WEBSvg, content: "Enter URL", name: "web", mode: "AI intake", detail: "Web-derived draft; verify sources." },
	{ img: YOUTUBESvg, content: "Connect YouTube", name: "youtube", mode: "AI intake", detail: "Reviewable draft; no chunk citations." },
];

const MEDIA_SOURCES = [
	{ img: AudioSvg, content: "Select Audio File", name: "audio", mode: "AI intake", detail: "Transcribed draft; no chunk citations." },
	{ img: IMGSvg, content: "Select Image File", name: "img", mode: "AI intake", detail: "Vision draft; no chunk citations." },
	{ img: VIDEOSvg, content: "Select Video File", name: "video", mode: "AI intake", detail: "Frame/audio draft; no chunk citations." },
];

const DATA_SOURCES = [
	{ img: CSVSvg, content: "CSV", name: "csv", mode: "Data intake", detail: "Table analysis, not source chunks." },
	{ img: SQLSvg, content: "Connect SQL", name: "sql", mode: "Data intake", detail: "Query analysis, not source chunks." },
];

const DataSourceSelect = () => {
	const popNode = modalStore((s) => s.popNode);
	const sourceGroups = [
		{ title: "WORKSPACE", sources: WORKSPACE_SOURCES },
		{ title: "DOCUMENTS", sources: DOCUMENT_SOURCES },
		{ title: "WEB", sources: WEB_SOURCES },
		{ title: "MEDIA", sources: MEDIA_SOURCES },
		{ title: "DATA", sources: DATA_SOURCES },
	];

	return (
		< div className="data-source-selector" >
			<div className="data-source-selector-header">
				<h5>CHOOSE A STARTING POINT</h5>
				<button
					type="button"
					className="icon-button"
					aria-label="Close source picker"
					onClick={() => popNode()}
				>
					<img src={CROSSSvg} alt="" />
				</button>
			</div>
			{sourceGroups.map((group) => (
				<div key={group.title}>
					<h5>{group.title}</h5>
					{group.title === "DOCUMENTS" ? (
						<p className="data-source-group-note">
							PDF, DOCX, Markdown, and TXT are the MVP source-traceable paths.
							Other inputs create reviewable drafts and should be verified before export.
						</p>
					) : null}
					<div className="data-source-select-container">
						{group.sources.map((source) => (
							<DataSourceSet key={source.name} data={source} />
						))}
					</div>
				</div>
			))}
		</div >
	)

}

export default DataSourceSelect
