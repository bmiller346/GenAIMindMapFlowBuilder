export const PDF_EXPORT_PROFILES = {
    'vector-map': {
        id: 'vector-map',
        label: 'Vector Map',
        description: 'A clean vector rendering of the visible workspace map.',
        defaultPageSizeId: 'a2',
        defaultOrientation: 'landscape',
        sections: [
            { type: 'title', title: 'Workspace Map' },
            { type: 'diagram', title: 'Map' },
            { type: 'legend', title: 'Legend' }
        ]
    },
    'map-outline': {
        id: 'map-outline',
        label: 'Map Outline',
        description: 'Diagram first, followed by a hierarchy outline.',
        defaultPageSizeId: 'letter',
        defaultOrientation: 'portrait',
        sections: [
            { type: 'title', title: 'Map Outline' },
            { type: 'diagram', title: 'Map' },
            { type: 'outline', title: 'Outline' }
        ]
    },
    'build-review': {
        id: 'build-review',
        label: 'Build Review',
        description: 'Review-oriented export with map, risks, questions, and source readiness.',
        defaultPageSizeId: 'letter',
        defaultOrientation: 'portrait',
        sections: [
            { type: 'title', title: 'Build Review' },
            { type: 'diagram', title: 'Map' },
            { type: 'review', title: 'Risks, Questions, and Review Items' },
            { type: 'outline', title: 'Supporting Outline' }
        ]
    },
    'review-sheet': {
        id: 'review-sheet',
        label: 'Review Sheet',
        description: 'Plotter-friendly diagram sheet with title block and markup area.',
        defaultPageSizeId: 'arch-d',
        defaultOrientation: 'landscape',
        sections: [
            { type: 'diagram', title: 'Review Sheet', titleBlock: true, notesPanel: true },
            { type: 'review', title: 'Open Review Items' }
        ]
    },
    'outline-tasks': {
        id: 'outline-tasks',
        label: 'Outline + Tasks',
        description: 'Text-forward outline and task handoff export.',
        defaultPageSizeId: 'letter',
        defaultOrientation: 'portrait',
        sections: [
            { type: 'title', title: 'Outline + Tasks' },
            { type: 'outline', title: 'Outline' },
            { type: 'tasks', title: 'Tasks' },
            { type: 'review', title: 'Open Review Items' }
        ]
    },
    newsletter: {
        id: 'newsletter',
        label: 'Newsletter',
        description: 'A broad-audience update brief with optional workspace visuals and review notes.',
        defaultPageSizeId: 'letter',
        defaultOrientation: 'portrait',
        sections: [
            { type: 'title', title: 'Newsletter' },
            { type: 'newsletter', title: 'Newsletter Brief' },
            { type: 'diagram', title: 'Workspace Snapshot' },
            { type: 'review', title: 'Editor Review Notes' }
        ]
    }
};

export const DEFAULT_PDF_EXPORT_PROFILE_ID = 'vector-map';

export const normalizeProfileId = (profileId = DEFAULT_PDF_EXPORT_PROFILE_ID) => {
    const key = String(profileId || '').trim();
    return PDF_EXPORT_PROFILES[key] ? key : DEFAULT_PDF_EXPORT_PROFILE_ID;
};

export const getPdfExportProfile = (profileId = DEFAULT_PDF_EXPORT_PROFILE_ID) =>
    PDF_EXPORT_PROFILES[normalizeProfileId(profileId)];

export const listPdfExportProfiles = () => Object.values(PDF_EXPORT_PROFILES);
