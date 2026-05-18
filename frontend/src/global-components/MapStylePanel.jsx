import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import {
    MAP_HIERARCHY_MODES,
    MAP_STYLE_THEMES,
    NODE_EMPHASIS_OPTIONS,
    DEFAULT_MAP_STYLE,
    autoStyleWorkspaceNodes,
    normalizeMapStyle,
    resetWorkspaceNodeEmphasis
} from '../utils/mapStyles';

const MapStylePanel = () => {
    const nodes = useStore((state) => state.nodes);
    const edges = useStore((state) => state.edges);
    const setNodes = useStore((state) => state.setNodes);
    const mapStyle = useStore((state) => state.mapStyle);
    const setMapStyle = useStore((state) => state.setMapStyle);
    const flowId = flowStore((state) => state.flow_id);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const normalizedStyle = normalizeMapStyle(mapStyle);

    const updateMapStyle = (patch, summary) => {
        const nextStyle = normalizeMapStyle({
            ...normalizedStyle,
            ...patch
        });
        setMapStyle(nextStyle);
        if (flowId) {
            setSaveStatus('dirty');
        }
        recordActivity({
            type: 'map_style_changed',
            title: 'Changed map style',
            summary,
            metadata: nextStyle
        });
    };

    const autoStyleMap = () => {
        const nextNodes = autoStyleWorkspaceNodes(nodes, edges);
        setNodes(nextNodes);
        if (flowId) {
            setSaveStatus('dirty');
        }
        recordActivity({
            type: 'map_style_auto_applied',
            title: 'Auto-styled map',
            summary: 'Applied visual emphasis from node type, review state, priority, source refs, and depth.',
            metadata: {
                styled_nodes: nextNodes.length
            }
        });
    };

    const resetStyling = () => {
        const nextNodes = resetWorkspaceNodeEmphasis(nodes);
        setNodes(nextNodes);
        setMapStyle(DEFAULT_MAP_STYLE);
        if (flowId) {
            setSaveStatus('dirty');
        }
        recordActivity({
            type: 'map_style_reset',
            title: 'Reset map styling',
            summary: 'Cleared node emphasis and restored the default map style.',
            metadata: DEFAULT_MAP_STYLE
        });
    };

    return (
        <section className="map-style-panel" aria-label="Map style">
            <div className="map-style-panel-header">
                <strong>Map style</strong>
                <span>{MAP_STYLE_THEMES.find((theme) => theme.id === normalizedStyle.theme)?.label}</span>
            </div>
            <div className="map-style-control-group">
                <p>Theme</p>
                <div className="map-style-segmented">
                    {MAP_STYLE_THEMES.map((theme) => (
                        <button
                            key={theme.id}
                            type="button"
                            className={normalizedStyle.theme === theme.id ? 'active' : ''}
                            title={theme.description}
                            onClick={() =>
                                updateMapStyle(
                                    { theme: theme.id },
                                    `Map theme changed to ${theme.label}.`
                                )
                            }
                        >
                            {theme.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="map-style-control-group">
                <p>Hierarchy</p>
                <div className="map-style-segmented">
                    {MAP_HIERARCHY_MODES.map((mode) => (
                        <button
                            key={mode.id}
                            type="button"
                            className={normalizedStyle.hierarchy === mode.id ? 'active' : ''}
                            title={mode.description}
                            onClick={() =>
                                updateMapStyle(
                                    { hierarchy: mode.id },
                                    `Map hierarchy changed to ${mode.label}.`
                                )
                            }
                        >
                            {mode.label}
                        </button>
                    ))}
                </div>
            </div>
            <label className="map-style-toggle">
                <input
                    type="checkbox"
                    checked={normalizedStyle.showEmphasisBadges}
                    onChange={(event) =>
                        updateMapStyle(
                            { showEmphasisBadges: event.target.checked },
                            event.target.checked
                                ? 'Node emphasis badges are visible.'
                                : 'Node emphasis badges are hidden.'
                        )
                    }
                />
                <span>Show emphasis badges</span>
            </label>
            <div className="map-style-actions">
                <button type="button" onClick={autoStyleMap} disabled={nodes.length === 0}>
                    Auto-style map
                </button>
                <button type="button" onClick={resetStyling} disabled={nodes.length === 0}>
                    Reset styling
                </button>
            </div>
            <div
                className={`map-style-preview map-style-preview-${normalizedStyle.theme}`}
                aria-hidden="true"
            >
                {NODE_EMPHASIS_OPTIONS.filter((option) => option.id).slice(0, 4).map((option) => (
                    <span key={option.id} className={`map-style-preview-node preview-${option.id}`}>
                        {option.label}
                    </span>
                ))}
            </div>
        </section>
    );
};

export default MapStylePanel;
