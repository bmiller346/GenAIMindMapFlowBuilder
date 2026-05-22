export const FLOWCHART_DISPLAY_MODES = {
    CARDS: 'cards',
    COMPACT: 'compact',
    SYMBOLS: 'symbols'
};

export const FLOWCHART_DISPLAY_OPTIONS = [
    {
        id: FLOWCHART_DISPLAY_MODES.CARDS,
        label: 'Cards',
        description: 'Show labels, trust badges, and node actions.'
    },
    {
        id: FLOWCHART_DISPLAY_MODES.COMPACT,
        label: 'Compact',
        description: 'Reduce badges and actions until the step is in focus.'
    },
    {
        id: FLOWCHART_DISPLAY_MODES.SYMBOLS,
        label: 'Symbols',
        description: 'Emphasize flowchart shapes and connector paths.'
    }
];

export const flowchartDisplayLabel = (mode) =>
    FLOWCHART_DISPLAY_OPTIONS.find((option) => option.id === mode)?.label ||
    FLOWCHART_DISPLAY_OPTIONS[0].label;
