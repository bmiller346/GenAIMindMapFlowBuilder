/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import { buildFilteredGraphProjection } from '../views/graphProjection';
import { CompactMapControls } from '../views/localViews/MapControls';
import {
    CORE_VIEWS,
    GRAPH_FILTERS,
    NODE_DENSITY_OPTIONS,
    WORKSPACE_OUTPUT_GROUPS,
    WORKSPACE_OUTPUT_OPTIONS
} from '../views/localViews/localViewConfig';

const MapRibbonHost = () => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        activeView: state.activeView,
        activeCanvasView: state.activeCanvasView,
        setActiveView: state.setActiveView,
        setActiveCanvasView: state.setActiveCanvasView,
        selectedBranchId: state.selectedBranchId,
        setSelectedBranchId: state.setSelectedBranchId,
        activeGraphFilters: state.activeGraphFilters,
        setActiveGraphFilters: state.setActiveGraphFilters,
        canvasNodeDensity: state.canvasNodeDensity,
        setCanvasNodeDensity: state.setCanvasNodeDensity
    });
    const {
        nodes,
        edges,
        activeView,
        activeCanvasView,
        setActiveView,
        setActiveCanvasView,
        selectedBranchId,
        setSelectedBranchId,
        activeGraphFilters,
        setActiveGraphFilters,
        canvasNodeDensity,
        setCanvasNodeDensity
    } = useStore(useShallow(selector));
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [outputMenuOpen, setOutputMenuOpen] = useState(false);
    const [viewMenuOpen, setViewMenuOpen] = useState(false);
    const [nodeViewMenuOpen, setNodeViewMenuOpen] = useState(false);
    const panelRef = useRef(null);
    const viewMenuButtonRef = useRef(null);
    const nodeViewMenuButtonRef = useRef(null);
    const outputMenuButtonRef = useRef(null);
    const filtersMenuButtonRef = useRef(null);

    const projection = useMemo(
        () =>
            buildFilteredGraphProjection(nodes, edges, {
                branchId: selectedBranchId,
                filters: activeGraphFilters
            }),
        [activeGraphFilters, edges, nodes, selectedBranchId]
    );
    const activeFilterSet = useMemo(
        () => new Set(activeGraphFilters),
        [activeGraphFilters]
    );
    const selectedRoot = projection.nodes.find((node) => node.id === selectedBranchId);
    const selectedCanvasNode = useMemo(
        () => nodes.find((node) => node.selected && node.type === 'response'),
        [nodes]
    );
    const branchLensCandidate = selectedRoot || selectedCanvasNode;
    const activeCanvasOption = CORE_VIEWS.find((view) => view.id === activeCanvasView);
    const outputModeValue = WORKSPACE_OUTPUT_OPTIONS.some((view) => view.id === activeView)
        ? activeView
        : '';
    const activeOutputOption = WORKSPACE_OUTPUT_OPTIONS.find((view) => view.id === outputModeValue);
    const canReflowCanvas = activeCanvasView === 'mindmap' || activeCanvasView === 'knowledgeGraph';

    useEffect(() => {
        if (!filtersOpen && !outputMenuOpen && !viewMenuOpen && !nodeViewMenuOpen) {
            return undefined;
        }

        const handlePointerDown = (event) => {
            if (
                panelRef.current?.contains(event.target) ||
                event.target?.closest?.('[data-overlay-root="local-views-popover"]')
            ) {
                return;
            }
            setFiltersOpen(false);
            setOutputMenuOpen(false);
            setViewMenuOpen(false);
            setNodeViewMenuOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [filtersOpen, nodeViewMenuOpen, outputMenuOpen, viewMenuOpen]);

    const toggleGraphFilter = (filterId) => {
        const nextFilters = activeFilterSet.has(filterId)
            ? activeGraphFilters.filter((id) => id !== filterId)
            : [...activeGraphFilters, filterId];
        setActiveGraphFilters(nextFilters);
    };

    const applySelectedBranchScope = () => {
        if (branchLensCandidate?.id) {
            setSelectedBranchId(branchLensCandidate.id);
        }
    };

    return (
        <div ref={panelRef} className="shell-ribbon-map-controls">
            <CompactMapControls
                panelRef={panelRef}
                activeCanvasOption={activeCanvasOption}
                activeCanvasView={activeCanvasView}
                activeView={activeView}
                activeOutputOption={activeOutputOption}
                outputModeValue={outputModeValue}
                activeGraphFilters={activeGraphFilters}
                selectedBranchId={selectedBranchId}
                branchLensCandidate={branchLensCandidate}
                nodes={nodes}
                refs={{
                    viewMenuButtonRef,
                    nodeViewMenuButtonRef,
                    outputMenuButtonRef,
                    filtersMenuButtonRef
                }}
                menus={{
                    viewMenuOpen,
                    nodeViewMenuOpen,
                    outputMenuOpen,
                    filtersOpen
                }}
                setters={{
                    setViewMenuOpen,
                    setNodeViewMenuOpen,
                    setOutputMenuOpen,
                    setFiltersOpen,
                    setSelectedBranchId,
                    setActiveCanvasView,
                    setCanvasNodeDensity,
                    setActiveGraphFilters,
                    toggleGraphFilter,
                    setActiveView,
                    applySelectedBranchScope
                }}
                constants={{
                    coreViews: CORE_VIEWS,
                    nodeDensityOptions: NODE_DENSITY_OPTIONS,
                    canvasNodeDensity,
                    canReflowCanvas,
                    graphFilters: GRAPH_FILTERS,
                    activeFilterSet,
                    outputGroups: WORKSPACE_OUTPUT_GROUPS
                }}
            />
        </div>
    );
};

export default MapRibbonHost;
