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

const DOCMAP_PRIMARY_SOURCES = [
	{ img: PROMPTSvg, content: "Start from workspace brief", name: "brief" },
	{ img: PDFSvg, content: "Upload PDF", name: "pdf" },
	{ img: DOCXSvg, content: "Upload DOCX", name: "docx" },
	{ img: MDSvg, content: "Upload Markdown", name: "md" },
	{ img: TXTSvg, content: "Upload TXT", name: "txt" },
];

const LEGACY_DEMO_SOURCES = [
	{ img: CSVSvg, content: "CSV", name: "csv" },
	{ img: SQLSvg, content: "Connect SQL", name: "sql" },
	{ img: WEBSvg, content: "Enter URL", name: "web" },
	{ img: AudioSvg, content: "Select Audio File", name: "audio" },
	{ img: YOUTUBESvg, content: "Connect YouTube", name: "youtube" },
	{ img: IMGSvg, content: "Select Image File", name: "img" },
	{ img: PPTXSvg, content: "Select PPTX File", name: "pptx" },
	{ img: HTMLSvg, content: "Select HTML File", name: "html" },
	{ img: VIDEOSvg, content: "Select Video File", name: "video" },
];

const showLegacySources =
	typeof window !== "undefined" &&
	window.localStorage?.getItem("docmap:showLegacySources") === "true";

const DataSourceSelect = () => {
	const popNode = modalStore((s) => s.popNode);

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
			<div className="data-source-select-container">
				{DOCMAP_PRIMARY_SOURCES.map((source) => (
					<DataSourceSet key={source.name} data={source} />
				))}
			</div>
			{showLegacySources ? (
				<>
					<h5>LEGACY DEMO SOURCES</h5>
					<div className="data-source-select-container">
						{LEGACY_DEMO_SOURCES.map((source) => (
							<DataSourceSet key={source.name} data={source} />
						))}
					</div>
				</>
			) : null}
		</div >
	)

}

export default DataSourceSelect
