export const PAGE_ORIENTATIONS = {
    PORTRAIT: 'portrait',
    LANDSCAPE: 'landscape'
};

export const PAGE_SIZE_PRESETS = {
    letter: { id: 'letter', label: 'Letter', width: 612, height: 792 },
    tabloid: { id: 'tabloid', label: 'Tabloid / Ledger', width: 792, height: 1224 },
    ledger: { id: 'ledger', label: 'Ledger', width: 792, height: 1224 },
    'arch-c': { id: 'arch-c', label: 'ARCH C', width: 1296, height: 1728 },
    'arch-d': { id: 'arch-d', label: 'ARCH D', width: 1728, height: 2592 },
    'arch-e': { id: 'arch-e', label: 'ARCH E', width: 2592, height: 3456 },
    a3: { id: 'a3', label: 'ISO A3', width: 841.89, height: 1190.55 },
    a2: { id: 'a2', label: 'ISO A2', width: 1190.55, height: 1683.78 },
    a1: { id: 'a1', label: 'ISO A1', width: 1683.78, height: 2383.94 },
    a0: { id: 'a0', label: 'ISO A0', width: 2383.94, height: 3370.39 }
};

export const DEFAULT_PAGE_SIZE_ID = 'letter';
export const DEFAULT_ORIENTATION = PAGE_ORIENTATIONS.LANDSCAPE;
export const AUTO_PAGE_SIZE_ID = 'auto';
export const AUTO_PAGE_SIZE_OPTION = {
    id: AUTO_PAGE_SIZE_ID,
    label: 'Auto fit',
    width: 0,
    height: 0
};

export const normalizeOrientation = (orientation = DEFAULT_ORIENTATION) => {
    const value = String(orientation || '').trim().toLowerCase();
    return value === PAGE_ORIENTATIONS.PORTRAIT
        ? PAGE_ORIENTATIONS.PORTRAIT
        : PAGE_ORIENTATIONS.LANDSCAPE;
};

export const normalizePageSizeId = (pageSizeId = DEFAULT_PAGE_SIZE_ID) => {
    const key = String(pageSizeId || '').trim().toLowerCase();
    if (key === AUTO_PAGE_SIZE_ID) {
        return AUTO_PAGE_SIZE_ID;
    }
    return PAGE_SIZE_PRESETS[key] ? key : DEFAULT_PAGE_SIZE_ID;
};

export const getPageSizePreset = (pageSizeId = DEFAULT_PAGE_SIZE_ID) =>
    normalizePageSizeId(pageSizeId) === AUTO_PAGE_SIZE_ID
        ? AUTO_PAGE_SIZE_OPTION
        : PAGE_SIZE_PRESETS[normalizePageSizeId(pageSizeId)];

export const getPageSize = ({
    pageSizeId = DEFAULT_PAGE_SIZE_ID,
    orientation = DEFAULT_ORIENTATION
} = {}) => {
    const preset = getPageSizePreset(pageSizeId);
    const normalizedOrientation = normalizeOrientation(orientation);
    const shortSide = Math.min(preset.width, preset.height);
    const longSide = Math.max(preset.width, preset.height);

    return {
        ...preset,
        orientation: normalizedOrientation,
        width:
            normalizedOrientation === PAGE_ORIENTATIONS.LANDSCAPE
                ? longSide
                : shortSide,
        height:
            normalizedOrientation === PAGE_ORIENTATIONS.LANDSCAPE
                ? shortSide
                : longSide
    };
};

export const listPageSizes = ({ includeAuto = false } = {}) => [
    ...(includeAuto ? [AUTO_PAGE_SIZE_OPTION] : []),
    ...Object.values(PAGE_SIZE_PRESETS)
];
