import { useMemo, useState } from 'react';
import CROSSSvg from '../assets/cross.svg';
import modalStore from '../stores/modalStore';
import {
    AUTO_PAGE_SIZE_ID,
    downloadPdfExport,
    getPdfExportPreview,
    listPageSizes,
    listPdfExportProfiles,
    projectPdfExportData
} from '../export/pdf';

const profileSectionLabels = {
    title: 'Cover',
    diagram: 'Diagram',
    outline: 'Outline',
    tasks: 'Tasks',
    review: 'Review',
    legend: 'Legend',
    newsletter: 'Newsletter'
};

const diagramDensityOptions = [
    { id: 'roomy', label: 'Roomy' },
    { id: 'balanced', label: 'Balanced' },
    { id: 'compact', label: 'Compact' },
    { id: 'fit', label: 'Fit' }
];

const profileDefaults = {
    'vector-map': {
        pageSizeId: AUTO_PAGE_SIZE_ID,
        orientation: 'landscape',
        includeTitleBlock: false,
        includeOutlinePanel: false,
        includeNotesPanel: false,
        diagramDensity: 'balanced'
    },
    'map-outline': {
        pageSizeId: AUTO_PAGE_SIZE_ID,
        orientation: 'landscape',
        includeTitleBlock: true,
        includeOutlinePanel: true,
        includeNotesPanel: false,
        diagramDensity: 'balanced'
    },
    'build-review': {
        pageSizeId: AUTO_PAGE_SIZE_ID,
        orientation: 'landscape',
        includeTitleBlock: true,
        includeOutlinePanel: true,
        includeNotesPanel: false,
        diagramDensity: 'compact'
    },
    'review-sheet': {
        pageSizeId: AUTO_PAGE_SIZE_ID,
        orientation: 'landscape',
        includeTitleBlock: true,
        includeOutlinePanel: false,
        includeNotesPanel: true,
        diagramDensity: 'compact'
    },
    'outline-tasks': {
        pageSizeId: 'letter',
        orientation: 'portrait',
        includeTitleBlock: true,
        includeOutlinePanel: false,
        includeNotesPanel: false,
        diagramDensity: 'balanced'
    },
    newsletter: {
        pageSizeId: 'letter',
        orientation: 'portrait',
        includeTitleBlock: true,
        includeOutlinePanel: false,
        includeNotesPanel: false,
        diagramDensity: 'compact'
    }
};

const PdfStudioModal = ({
    nodes = [],
    edges = [],
    flowName = '',
    mapStyle = '',
    workspaceBrief = {},
    acceptedArtifacts = [],
    initialProfileId = 'map-outline',
    initialPageSizeId = AUTO_PAGE_SIZE_ID,
    initialOrientation = 'landscape',
    onExportComplete
}) => {
    const popNode = modalStore((s) => s.popNode);
    const [profileId, setProfileId] = useState(initialProfileId);
    const [pageSizeId, setPageSizeId] = useState(initialPageSizeId);
    const [orientation, setOrientation] = useState(initialOrientation);
    const [includeTitleBlock, setIncludeTitleBlock] = useState(true);
    const [includeNotesPanel, setIncludeNotesPanel] = useState(false);
    const [includeOutlinePanel, setIncludeOutlinePanel] = useState(true);
    const [diagramDensity, setDiagramDensity] = useState('balanced');
    const [projectName, setProjectName] = useState(flowName || '');
    const [preparedFor, setPreparedFor] = useState(workspaceBrief?.audience || '');
    const [revision, setRevision] = useState('Draft');
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState('');
    const profiles = useMemo(() => listPdfExportProfiles(), []);
    const pageSizes = useMemo(() => listPageSizes({ includeAuto: true }), []);
    const selectedProfile =
        profiles.find((profile) => profile.id === profileId) || profiles[0];
    const pdfOptions = useMemo(
        () => ({
            includeTitleBlock,
            includeNotesPanel,
            includeOutlinePanel,
            diagramDensity,
            projectName,
            preparedFor,
            revision
        }),
        [
            diagramDensity,
            includeNotesPanel,
            includeOutlinePanel,
            includeTitleBlock,
            preparedFor,
            projectName,
            revision
        ]
    );
    const exportData = useMemo(
        () =>
            projectPdfExportData({
                nodes,
                edges,
                flowName,
                mapStyle,
                workspaceBrief,
                acceptedArtifacts
            }),
        [acceptedArtifacts, edges, flowName, mapStyle, nodes, workspaceBrief]
    );
    const exportPreview = useMemo(
        () =>
            getPdfExportPreview({
                profileId,
                pageSizeId,
                orientation,
                nodes,
                edges,
                flowName,
                mapStyle,
                workspaceBrief,
                acceptedArtifacts,
                options: pdfOptions
            }),
        [
            edges,
            flowName,
            mapStyle,
            nodes,
            orientation,
            pageSizeId,
            pdfOptions,
            profileId,
            acceptedArtifacts,
            workspaceBrief
        ]
    );

    const applyProfileDefaults = (nextProfileId) => {
        setProfileId(nextProfileId);
        const defaults = profileDefaults[nextProfileId];
        if (!defaults) {
            return;
        }
        setPageSizeId(defaults.pageSizeId);
        setOrientation(defaults.orientation);
        setIncludeTitleBlock(defaults.includeTitleBlock);
        setIncludeOutlinePanel(defaults.includeOutlinePanel);
        setIncludeNotesPanel(defaults.includeNotesPanel);
        setDiagramDensity(defaults.diagramDensity || 'balanced');
    };

    const exportPdf = async () => {
        setError('');
        setIsExporting(true);
        try {
            const result = await downloadPdfExport({
                profileId,
                pageSizeId,
                orientation,
                nodes,
                edges,
                flowName,
                mapStyle,
                workspaceBrief,
                acceptedArtifacts,
                options: {
                    ...pdfOptions
                }
            });
            onExportComplete?.(result);
            popNode();
        } catch (err) {
            setError(err?.message || 'Could not export PDF.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="modal-container pdf-studio-modal">
            <div className="title">
                <div>
                    <p>PDF Studio</p>
                    <span>Build clean review packets for plotters, Bluebeam, and team handoff.</span>
                </div>
                <img
                    src={CROSSSvg}
                    alt="Close PDF Studio"
                    onClick={() => popNode()}
                />
            </div>

            <div className="pdf-studio-summary">
                <div>
                    <strong>{exportData.stats.nodeCount}</strong>
                    <span>Nodes</span>
                </div>
                <div>
                    <strong>{exportData.stats.edgeCount}</strong>
                    <span>Edges</span>
                </div>
                <div>
                    <strong>{exportData.stats.taskCount}</strong>
                    <span>Tasks</span>
                </div>
                <div>
                    <strong>{exportData.stats.reviewCount}</strong>
                    <span>Review items</span>
                </div>
                <div>
                    <strong>{exportData.stats.newsletterCount}</strong>
                    <span>Newsletters</span>
                </div>
            </div>

            <div className="pdf-studio-grid">
                <section className="pdf-studio-panel">
                    <h3>Packet Type</h3>
                    <div className="pdf-profile-list">
                        {profiles.map((profile) => (
                            <button
                                key={profile.id}
                                type="button"
                                className={profile.id === profileId ? 'is-selected' : ''}
                                onClick={() => applyProfileDefaults(profile.id)}
                            >
                                <strong>{profile.label}</strong>
                                <span>{profile.description}</span>
                                <small>
                                    {profile.sections
                                        .map((section) => profileSectionLabels[section.type] || section.type)
                                        .join(' / ')}
                                </small>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="pdf-studio-panel">
                    <h3>Sheet Setup</h3>
                    <div className="pdf-studio-field">
                        <label htmlFor="pdf-studio-page-size">Page size</label>
                        <select
                            id="pdf-studio-page-size"
                            value={pageSizeId}
                            onChange={(event) => setPageSizeId(event.target.value)}
                        >
                            {pageSizes.map((size) => (
                                <option key={size.id} value={size.id}>
                                    {size.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="pdf-studio-segmented" aria-label="PDF orientation">
                        {['landscape', 'portrait'].map((option) => (
                            <button
                                key={option}
                                type="button"
                                className={orientation === option ? 'is-selected' : ''}
                                onClick={() => setOrientation(option)}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                    <div className="pdf-studio-preview">
                        <h4>{selectedProfile.label}</h4>
                        <p>{selectedProfile.description}</p>
                        <ul>
                            {selectedProfile.sections.map((section) => (
                                <li key={`${selectedProfile.id}-${section.type}-${section.title}`}>
                                    {profileSectionLabels[section.type] || section.type}
                                </li>
                            ))}
                        </ul>
                        <div className="pdf-studio-quality">
                            <strong className={`pdf-quality-${exportPreview.readability.level}`}>
                                {exportPreview.readability.label}
                            </strong>
                            <span>{exportPreview.readability.detail}</span>
                        </div>
                        <div className="pdf-studio-preview-grid">
                            <span>
                                Sheet
                                <strong>
                                    {exportPreview.pageSize.label} {exportPreview.pageSize.orientation}
                                </strong>
                            </span>
                            <span>
                                Pages
                                <strong>{exportPreview.pageCount}</strong>
                            </span>
                            <span>
                                Scale
                                <strong>{Math.round(exportPreview.diagramScale * 100)}%</strong>
                            </span>
                        </div>
                        {exportPreview.autoFitUsed ? (
                            <p className="pdf-studio-auto-fit">
                                Auto fit will use {exportPreview.pageSize.label} {exportPreview.pageSize.orientation}.
                            </p>
                        ) : null}
                    </div>
                    <div className="pdf-studio-options">
                        <label>
                            <input
                                type="checkbox"
                                checked={includeTitleBlock}
                                onChange={(event) => setIncludeTitleBlock(event.target.checked)}
                            />
                            Title block
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                checked={includeOutlinePanel}
                                onChange={(event) => setIncludeOutlinePanel(event.target.checked)}
                            />
                            Side outline
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                checked={includeNotesPanel}
                                onChange={(event) => setIncludeNotesPanel(event.target.checked)}
                            />
                            Markup panel
                        </label>
                    </div>
                    <div className="pdf-studio-field">
                        <label>Map density</label>
                        <div className="pdf-studio-segmented pdf-studio-segmented--density">
                            {diagramDensityOptions.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    className={diagramDensity === option.id ? 'is-selected' : ''}
                                    onClick={() => setDiagramDensity(option.id)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="pdf-studio-details">
                        <label>
                            Project
                            <input
                                type="text"
                                value={projectName}
                                onChange={(event) => setProjectName(event.target.value)}
                                placeholder="Project or workspace name"
                            />
                        </label>
                        <label>
                            Prepared for
                            <input
                                type="text"
                                value={preparedFor}
                                onChange={(event) => setPreparedFor(event.target.value)}
                                placeholder="Team, client, or review group"
                            />
                        </label>
                        <label>
                            Revision
                            <input
                                type="text"
                                value={revision}
                                onChange={(event) => setRevision(event.target.value)}
                                placeholder="Draft"
                            />
                        </label>
                    </div>
                </section>
            </div>

            {error ? <p className="pdf-studio-error">{error}</p> : null}

            <div className="pdf-studio-actions">
                <button type="button" className="cancel-btn" onClick={() => popNode()}>
                    Cancel
                </button>
                <button
                    type="button"
                    className="create-btn"
                    disabled={isExporting || (exportData.stats.nodeCount === 0 && exportData.stats.artifactCount === 0)}
                    onClick={exportPdf}
                >
                    {isExporting ? 'Exporting...' : 'Export PDF'}
                </button>
            </div>
        </div>
    );
};

export default PdfStudioModal;
