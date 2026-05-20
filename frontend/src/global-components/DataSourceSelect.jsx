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
	{ img: DRAWERSvg, content: "Review folder / file set", name: "source_set", mode: "Multi-source", detail: "Batch upload PDF, DOCX, Markdown, and TXT with paths preserved." },
	{ img: PDFSvg, content: "Upload one PDF", name: "pdf", mode: "Single source", detail: "For multiple PDFs, use source set above." },
	{ img: DOCXSvg, content: "Upload one DOCX", name: "docx", mode: "Single source", detail: "For multiple DOCX files, use source set above." },
	{ img: MDSvg, content: "Upload one Markdown", name: "md", mode: "Single source", detail: "For multiple Markdown files, use source set above." },
	{ img: TXTSvg, content: "Upload one TXT", name: "txt", mode: "Single source", detail: "For multiple TXT files, use source set above." },
	{ img: PPTXSvg, content: "Upload PPTX", name: "pptx", mode: "AI draft", detail: "Single upload; creates a reviewable draft, not section citations." },
	{ img: HTMLSvg, content: "Upload HTML", name: "html", mode: "AI draft", detail: "Single upload; creates a reviewable draft, not section citations." },
];

const WEB_SOURCES = [
	{ img: WEBSvg, content: "Enter URL", name: "web", mode: "AI draft", detail: "Single URL; creates a reviewable draft." },
	{ img: YOUTUBESvg, content: "Connect YouTube", name: "youtube", mode: "AI draft", detail: "Single URL; creates a reviewable draft." },
];

const MEDIA_SOURCES = [
	{ img: AudioSvg, content: "Select Audio File", name: "audio", mode: "AI draft", detail: "Single upload; transcribed into a reviewable draft." },
	{ img: IMGSvg, content: "Select Image File", name: "img", mode: "AI draft", detail: "Single upload; interpreted into a reviewable draft." },
	{ img: VIDEOSvg, content: "Select Video File", name: "video", mode: "AI draft", detail: "Single upload; frame/audio draft for review." },
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
	variant = "modal",
	onClose,
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
			buildSourceLibraryProjection(nodes, edges, workspaceBrief, sourceLibrary, {
				includeWorkspaceBriefSource: isAskAIContext
			}).sources,
		[edges, isAskAIContext, nodes, sourceLibrary, workspaceBrief]
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
			if (onClose) {
				onClose();
			} else {
				popNode();
			}
			return;
		}
		pushNode(returnModal, {
			...returnProps,
			initialContextSourceIds: activeSourceIds,
			initialContextSourceId: activeSourceIds[0] || ""
		});
	};

	return (
		< div className={`data-source-selector data-source-selector--${variant}`} >
			<div className="data-source-selector-header">
				<h5>{isAskAIContext ? "SOURCE CONTEXT" : "CHOOSE A STARTING POINT"}</h5>
				<button
					type="button"
					className="icon-button"
					aria-label="Close source picker"
					onClick={() => (isAskAIContext ? returnToAskAI() : onClose ? onClose() : popNode())}
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
							? "Need more than one document? Use source set for batch upload, or add single PDF/DOCX files one at a time. This picker stays open so you can verify the selected context before returning to Ask AI."
							: "Use source set when you want multiple documents in one upload. Single-source uploads are intentionally one file at a time for clearer extraction, role choice, and review. AI draft inputs create reviewable drafts instead of section-cited source records."}
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
