export const FLOWCHART_MIN_ZOOM = 0.2;
export const FLOWCHART_MAX_ZOOM = 1.6;
export const FLOWCHART_WHEEL_ZOOM_SENSITIVITY = 0.0015;

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const wheelDeltaMultiplier = (deltaMode, viewportHeight) => {
    if (deltaMode === 1) {
        return 16;
    }
    if (deltaMode === 2) {
        return viewportHeight;
    }
    return 1;
};

export const zoomViewportAroundPoint = ({
    viewport,
    pointerX,
    pointerY,
    wheelDelta,
    minZoom = FLOWCHART_MIN_ZOOM,
    maxZoom = FLOWCHART_MAX_ZOOM,
    sensitivity = FLOWCHART_WHEEL_ZOOM_SENSITIVITY
}) => {
    const nextZoom = clamp(
        Number((viewport.zoom * Math.exp(-wheelDelta * sensitivity)).toFixed(3)),
        minZoom,
        maxZoom
    );

    if (nextZoom === viewport.zoom) {
        return viewport;
    }

    const diagramX = (pointerX - viewport.x) / viewport.zoom;
    const diagramY = (pointerY - viewport.y) / viewport.zoom;

    return {
        x: pointerX - diagramX * nextZoom,
        y: pointerY - diagramY * nextZoom,
        zoom: nextZoom
    };
};
