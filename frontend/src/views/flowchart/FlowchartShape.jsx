const FlowchartShape = ({ shape = 'process' }) => {
    if (shape === 'decision') {
        return <polygon points="100,4 196,68 100,132 4,68" />;
    }

    if (shape === 'terminator') {
        return <rect x="5" y="8" width="190" height="120" rx="60" ry="60" />;
    }

    if (shape === 'document') {
        return (
            <path d="M 6 8 H 194 V 96 C 172 84 154 112 132 98 C 112 86 94 112 72 98 C 50 84 30 112 6 96 Z" />
        );
    }

    return <rect x="6" y="10" width="188" height="112" rx="6" ry="6" />;
};

export default FlowchartShape;
