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
import DRAWERSvg from "../assets/drawer.svg";
import CROSSSvg from "../assets/cross.svg";
import modalStore from "../stores/modalStore";
import useStore from "../stores/store";
import { useMemo, useState } from "react";
import { buildSourceLibraryProjection } from "../views/graphProjection";
import { useShallow } from "zustand/shallow";

const WORKSPACE_SOURCES = [
	{ img: PROMPTSvg, content: "Start from workspace brief", name: "brief", mode: "No-source draft", detail: "Creates reviewable assumption nodes." },
];

const DOCUMENT_SOURCES = [
	{ img: DRAWERSvg, content: "Review folder / file set", name: "source_set", mode: "Source-set review", detail: "Uploads multiple files with relative paths." },
	{ img: PDFSvg, content: "Upload PDF", name: "pdf", mode: "Source-traceable", detail: "Extracts cited document sections." },
	{ img: DOCXSvg, content: "Upload DOCX", name: "docx", mode: "Source-traceable", detail: "Extracts cited document sections." },
	{ img: MDSvg, content: "Upload Markdown", name: "md", mode: "Source-traceable", detail: "Extracts cited document sections." },
	{ img: TXTSvg, content: "Upload TXT", name: "txt", mode: "Source-traceable", detail: "Extracts cited document sections." },
	{ img: PPTXSvg, content: "Upload PPTX", name: "pptx", mode: "AI intake", detail: "Reviewable draft; no section citations." },
	{ img: HTMLSvg, content: "Upload HTML", name: "html", mode: "AI intake", detail: "Reviewable draft; no section citations." },
];

const WEB_SOURCES = [
	{ img: WEBSvg, content: "Enter URL", name: "web", mode: "AI intake", detail: "Web-derived draft; verify sources." },
	{ img: YOUTUBESvg, content: "Connect YouTube", name: "youtube", mode: "AI intake", detail: "Reviewable draft; no section citations." },
];

const MEDIA_SOURCES = [
	{ img: AudioSvg, content: "Select Audio File", name: "audio", mode: "AI intake", detail: "Transcribed draft; no section citations." },
	{ img: IMGSvg, content: "Select Image File", name: "img", mode: "AI intake", detail: "Vision draft; no section citations." },
	{ img: VIDEOSvg, content: "Select Video File", name: "video", mode: "AI intake", detail: "Frame/audio draft; no section citations." },
];

const DATA_SOURCES = [
	{ img: CSVSvg, content: "Upload data table", name: "csv", mode: "Structured evidence", detail: "Tables, charts, and findings keep query/source refs." },
	{ img: SQLSvg, content: "Connect SQL table", name: "sql", mode: "Structured evidence", detail: "Query results can become source-backed artifacts." },
];

const DEVELOPER_SOURCES = [
	{ img: DRAWERSvg, content: "Scan GitHub repository", name: "code_intelligence", mode: "Developer", detail: "Deterministic graph; no AI cost unless interpretation is added." },
];

const DataSourceSelect = ({
	mode = "workspace_intake",
	returnModal,
	returnProps = {},
	selectedSourceIds = [],
	uploadedSourceId = ""
}) => {
	const pushNode = modalStore((s) => s.pushNode);
	const popNode = modalStore((s) => s.popNode);
	const { nodes, edges, workspaceBrief, sourceLibrary, developerMode } = useStore(
		useShallow((state) => ({
			nodes: state.nodes,
			edges: state.edges,
			workspaceBrief: state.workspaceBrief,
			sourceLibrary: state.sourceLibrary,
			developerMode: state.developerMode
		}))
	);
	const isAskAIContext = mode === "ask_ai_context";
	const initialSourceIds = useMemo(
		() =>
			Array.from(
				new Set([
					...(Array.isArray(selectedSourceIds) ? selectedSourceIds : []),
					...(Array.isArray(returnProps.initialContextSourceIds)
						? returnProps.initialContextSourceIds
						: []),
					returnProps.initialContextSourceId || "",
					uploadedSourceId || ""
				].filter(Boolean))
			),
		[
			returnProps.initialContextSourceId,
			returnProps.initialContextSourceIds,
			selectedSourceIds,
			uploadedSourceId
		]
	);
	const [activeSourceIds, setActiveSourceIds] = useState(initialSourceIds);
	const loadedSources = useMemo(
		() =>
			buildSourceLibraryProjection(nodes, edges, workspaceBrief, sourceLibrary).sources,
		[edges, nodes, sourceLibrary, workspaceBrief]
	);
	const modalProps = isAskAIContext
		? {
			sourcePickerMode: mode,
			returnModal: DataSourceSelect,
			returnProps: {
				mode,
				returnModal,
				returnProps,
				selectedSourceIds: activeSourceIds
			}
		}
		: { sourcePickerMode: mode, returnModal, returnProps };
	const sourceGroups = [
		...(isAskAIContext ? [] : [{ title: "WORKSPACE", sources: WORKSPACE_SOURCES }]),
		{
			title: "DOCUMENTS",
			sources: isAskAIContext
				? DOCUMENT_SOURCES.filter((source) => ["source_set", "pdf", "docx"].includes(source.name))
				: DOCUMENT_SOURCES
		},
		...(isAskAIContext
			? []
			: [
				{ title: "WEB", sources: WEB_SOURCES },
				{ title: "MEDIA", sources: MEDIA_SOURCES },
				{ title: "STRUCTURED EVIDENCE", sources: DATA_SOURCES },
				...(developerMode ? [{ title: "DEVELOPER", sources: DEVELOPER_SOURCES }] : []),
			]),
	];
	const selectedCount = activeSourceIds.length;

	const toggleSource = (sourceId) => {
		setActiveSourceIds((current) =>
			current.includes(sourceId)
				? current.filter((id) => id !== sourceId)
				: [...current, sourceId]
		);
	};

	const returnToAskAI = () => {
		if (!returnModal) {
			popNode();
			return;
		}
		pushNode(returnModal, {
			...returnProps,
			initialContextSourceIds: activeSourceIds,
			initialContextSourceId: activeSourceIds[0] || ""
		});
	};

	return (
		< div className="data-source-selector" >
			<div className="data-source-selector-header">
				<h5>{isAskAIContext ? "SOURCE CONTEXT" : "CHOOSE A STARTING POINT"}</h5>
				<button
					type="button"
					className="icon-button"
					aria-label="Close source picker"
					onClick={() => (isAskAIContext ? returnToAskAI() : popNode())}
				>
					<img src={CROSSSvg} alt="" />
				</button>
			</div>
			{isAskAIContext ? (
				<div className="source-context-basket">
					<div className="source-context-basket-header">
						<div>
							<h5>SELECTED SOURCES</h5>
							<p>{selectedCount ? `${selectedCount} selected for Ask AI` : "Pick one or more sources before returning to Ask AI."}</p>
						</div>
						<button
							type="button"
							onClick={() => setActiveSourceIds([])}
							disabled={!selectedCount}
						>
							Clear
						</button>
					</div>
					{loadedSources.length ? (
						<div className="source-context-list">
							{loadedSources.map((source) => (
								<label key={source.id} className="source-context-row">
									<input
										type="checkbox"
										checked={activeSourceIds.includes(source.id)}
										onChange={() => toggleSource(source.id)}
									/>
									<span>
										<strong>{source.title || source.id}</strong>
										<small>
											{[
												source.type_label || source.type || "Source",
												source.status,
												source.chunk_count ? `${source.chunk_count} sections` : ""
											].filter(Boolean).join(" | ")}
										</small>
									</span>
								</label>
							))}
						</div>
					) : (
						<p className="data-source-group-note">
							No loaded sources yet. Add a PDF or DOCX below, then verify it here before returning to Ask AI.
						</p>
					)}
				</div>
			) : null}
			{sourceGroups.map((group) => (
				<div key={group.title}>
				<h5>{isAskAIContext && group.title === "DOCUMENTS" ? "ADD SOURCE CONTEXT" : group.title}</h5>
				{group.title === "DOCUMENTS" ? (
					<p className="data-source-group-note">
						{isAskAIContext
							? "Attach a PDF, DOCX, or source set to the current Ask AI prompt. The workspace will return to Ask AI after upload."
							: "Use source-set review for folder-like packages. PDF, DOCX, Markdown, and TXT remain source-traceable single-file paths; other inputs create reviewable drafts."}
					</p>
				) : null}
				<div className="data-source-select-container">
					{group.sources.map((source) => (
						<DataSourceSet key={source.name} data={source} modalProps={modalProps} />
					))}
				</div>
				</div>
			))}
			{isAskAIContext ? (
				<div className="source-context-actions">
					<button type="button" onClick={returnToAskAI}>
						Use selected sources
					</button>
				</div>
			) : null}
		</div >
	)

}

export default DataSourceSelect
