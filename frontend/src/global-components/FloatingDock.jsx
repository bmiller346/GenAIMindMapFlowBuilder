import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Panel } from '@xyflow/react';
import {
    FiChevronsLeft,
    FiChevronsRight,
    FiChevronsUp,
    FiMoreHorizontal,
    FiMove,
    FiRotateCcw
} from 'react-icons/fi';
import {
    getFloatingDockPlacement,
    normalizeFloatingDockPlacement,
    saveFloatingDockPlacement
} from '../config/localSettings';

const DEFAULT_PLACEMENT = {
    dock: 'top',
    offset: { x: 0, y: 0 }
};

const PANEL_POSITIONS = {
    top: 'top-center',
    left: 'top-left',
    right: 'top-right',
    floating: 'top-center'
};

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const fallbackSafeTop = 72;
const menuWidthEstimate = 180;

const getDockSafeTop = () => {
    if (typeof document === 'undefined') {
        return fallbackSafeTop;
    }
    const header = document.querySelector('.header');
    const headerBottom = header?.getBoundingClientRect?.().bottom;
    return Math.ceil(Number.isFinite(headerBottom) ? headerBottom + 10 : fallbackSafeTop);
};

const DOCK_COMMANDS = [
    { dock: 'top', label: 'Top', icon: FiChevronsUp },
    { dock: 'left', label: 'Left', icon: FiChevronsLeft },
    { dock: 'right', label: 'Right', icon: FiChevronsRight },
    { dock: 'floating', label: 'Float', icon: FiMove }
];

const dockFromPointer = ({ clientX, clientY, viewportWidth, activeDock }) => {
    const sideZone = Math.min(220, Math.max(120, viewportWidth * 0.16));
    const detachDistance = 92;
    const topZone = getDockSafeTop() + 86;
    if (activeDock === 'left' && clientX > detachDistance && clientX < viewportWidth - sideZone) {
        return clientY <= topZone ? 'top' : 'floating';
    }
    if (activeDock === 'right' && clientX < viewportWidth - detachDistance && clientX > sideZone) {
        return clientY <= topZone ? 'top' : 'floating';
    }
    if (clientX <= sideZone) {
        return 'left';
    }
    if (clientX >= viewportWidth - sideZone) {
        return 'right';
    }
    if (clientY <= topZone) {
        return 'top';
    }
    return 'floating';
};

const offsetFromPointerForDock = (dock, pointer = {}) => {
    const width = window.innerWidth || 1280;
    const pointerX = Number.isFinite(pointer.clientX) ? pointer.clientX : width / 2;
    const pointerY = Number.isFinite(pointer.clientY) ? pointer.clientY : 86;
    if (dock === 'left') {
        return { x: 0, y: pointerY - 28 };
    }
    if (dock === 'right') {
        return { x: 0, y: pointerY - 28 };
    }
    if (dock === 'floating') {
        return { x: pointerX - width / 2, y: pointerY - 28 };
    }
    return { x: pointerX - width / 2, y: 0 };
};

const clampOffsetForDock = (dock, offset) => {
    const width = window.innerWidth || 1280;
    const height = window.innerHeight || 800;
    const safeTop = getDockSafeTop();
    if (dock === 'left' || dock === 'right') {
        return {
            x: 0,
            y: clamp(offset.y, safeTop, Math.max(safeTop, height - 180))
        };
    }
    if (dock === 'top') {
        return {
            x: clamp(offset.x, -(width / 2 - 180), width / 2 - 180),
            y: 0
        };
    }
    return {
        x: clamp(offset.x, -(width / 2 - 180), width / 2 - 180),
        y: clamp(offset.y, safeTop, Math.max(safeTop, height - 180))
    };
};

const shouldUseNativeContextMenu = (target) =>
    Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));

const menuPointInViewport = ({ x, y }) => {
    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 800;
    return {
        x: clamp(x, 8, Math.max(8, viewportWidth - menuWidthEstimate - 8)),
        y: clamp(y, getDockSafeTop(), Math.max(getDockSafeTop(), viewportHeight - 260))
    };
};

const FloatingDock = ({
    id,
    ariaLabel,
    className = '',
    children,
    defaultPlacement = DEFAULT_PLACEMENT,
    controlsPlacement = 'frame'
}) => {
    const dragStateRef = useRef(null);
    const menuRef = useRef(null);
    const menuTriggerRef = useRef(null);
    const [placement, setPlacement] = useState(() =>
        getFloatingDockPlacement(id, defaultPlacement)
    );
    const [previewDock, setPreviewDock] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPoint, setMenuPoint] = useState(null);

    const commitPlacement = useCallback(
        (nextPlacement) => {
            const normalized = normalizeFloatingDockPlacement(nextPlacement);
            const persisted = saveFloatingDockPlacement(id, normalized);
            setPlacement(persisted);
            return persisted;
        },
        [id]
    );

    const closeMenu = useCallback(() => {
        setMenuOpen(false);
        setMenuPoint(null);
    }, []);

    const openMenuAt = useCallback((point) => {
        setMenuPoint(menuPointInViewport(point));
        setMenuOpen(true);
    }, []);

    const resetPlacement = useCallback(() => {
        commitPlacement(defaultPlacement);
        setPreviewDock('');
        closeMenu();
    }, [closeMenu, commitPlacement, defaultPlacement]);

    const dockTo = useCallback(
        (dock) => {
            commitPlacement({
                dock,
                offset: clampOffsetForDock(dock, offsetFromPointerForDock(dock))
            });
            closeMenu();
        },
        [closeMenu, commitPlacement]
    );

    const toggleMenuFromTrigger = useCallback(
        (event) => {
            event.stopPropagation();
            if (menuOpen) {
                closeMenu();
                return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            openMenuAt({
                x: rect.left,
                y: rect.bottom + 6
            });
        },
        [closeMenu, menuOpen, openMenuAt]
    );

    const openContextMenu = useCallback(
        (event) => {
            if (shouldUseNativeContextMenu(event.target)) {
                return;
            }
            event.preventDefault();
            openMenuAt({
                x: event.clientX,
                y: event.clientY
            });
        },
        [openMenuAt]
    );

    const startDrag = useCallback(
        (event) => {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            closeMenu();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            dragStateRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                placement,
                latestPlacement: placement
            };
            setIsDragging(true);

            const handlePointerMove = (moveEvent) => {
                const state = dragStateRef.current;
                if (!state) {
                    return;
                }
                const nextDock = dockFromPointer({
                    clientX: moveEvent.clientX,
                    clientY: moveEvent.clientY,
                    viewportWidth: window.innerWidth || 1280,
                    activeDock: state.placement.dock
                });
                const delta = {
                    x: moveEvent.clientX - state.startX,
                    y: moveEvent.clientY - state.startY
                };
                const rawOffset =
                    nextDock === state.placement.dock
                        ? {
                              x: state.placement.offset.x + delta.x,
                              y: state.placement.offset.y + delta.y
                          }
                        : offsetFromPointerForDock(nextDock, moveEvent);
                setPreviewDock(nextDock);
                const nextPlacement = {
                    dock: nextDock,
                    offset: clampOffsetForDock(nextDock, rawOffset)
                };
                dragStateRef.current.latestPlacement = nextPlacement;
                setPlacement(nextPlacement);
            };

            const stopDrag = () => {
                const state = dragStateRef.current;
                dragStateRef.current = null;
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', stopDrag);
                window.removeEventListener('pointercancel', stopDrag);
                setPreviewDock('');
                setIsDragging(false);
                if (state) {
                    commitPlacement(state.latestPlacement || placement);
                }
            };

            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', stopDrag);
            window.addEventListener('pointercancel', stopDrag);
        },
        [closeMenu, commitPlacement, id, placement]
    );

    useEffect(() => {
        if (!menuOpen) {
            return undefined;
        }
        const handlePointerDown = (event) => {
            if (
                menuRef.current?.contains(event.target) ||
                menuTriggerRef.current?.contains(event.target)
            ) {
                return;
            }
            closeMenu();
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                closeMenu();
            }
        };
        window.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [closeMenu, menuOpen]);

    const panelPosition = PANEL_POSITIONS[placement.dock] || PANEL_POSITIONS.top;
    const offset = useMemo(
        () => clampOffsetForDock(placement.dock, placement.offset),
        [placement]
    );

    const dockMenu =
        menuOpen && menuPoint
            ? createPortal(
                  <div
                      ref={menuRef}
                      className="floating-dock-menu floating-dock-menu--portal"
                      role="menu"
                      style={{
                          left: `${menuPoint.x}px`,
                          top: `${menuPoint.y}px`
                      }}
                  >
                      <div className="floating-dock-menu-status">
                          <span>Dock</span>
                          <strong>{placement.dock === 'floating' ? 'Floating' : placement.dock}</strong>
                      </div>
                      {DOCK_COMMANDS.map(({ dock, label, icon: Icon }) => (
                          <button
                              key={dock}
                              type="button"
                              className={placement.dock === dock ? 'active' : ''}
                              role="menuitem"
                              onClick={() => dockTo(dock)}
                          >
                              <Icon aria-hidden="true" />
                              <span>{label}</span>
                          </button>
                      ))}
                      <button
                          type="button"
                          role="menuitem"
                          onClick={resetPlacement}
                      >
                          <FiRotateCcw aria-hidden="true" />
                          <span>Reset</span>
                      </button>
                  </div>,
                  document.body
              )
            : null;

    const dockControls = (
        <div className="floating-dock-handle">
            <button
                type="button"
                className="floating-dock-drag"
                title="Drag to move, slide on rails, or pull away to float"
                aria-label="Move toolbar"
                onPointerDown={startDrag}
            >
                <FiMove aria-hidden="true" />
            </button>
            <span className="floating-dock-placement-label">
                {placement.dock === 'floating' ? 'Float' : placement.dock}
            </span>
            <div className="floating-dock-actions">
                <button
                    ref={menuTriggerRef}
                    type="button"
                    className={`floating-dock-menu-trigger ${menuOpen ? 'active' : ''}`}
                    title="Dock options"
                    aria-label="Dock options"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={toggleMenuFromTrigger}
                >
                    <FiMoreHorizontal aria-hidden="true" />
                </button>
            </div>
        </div>
    );
    const renderedChildren =
        controlsPlacement === 'child' && isValidElement(children)
            ? cloneElement(children, { dockControls })
            : children;

    return (
        <>
            {isDragging ? (
                <Panel position="top-left" className="floating-dock-guides-panel">
                    <div className="floating-dock-guides" aria-hidden="true">
                        {DOCK_COMMANDS.map(({ dock, label }) => (
                            <div
                                key={dock}
                                className={`floating-dock-guide floating-dock-guide-${dock} ${
                                    previewDock === dock ? 'active' : ''
                                }`}
                            >
                                {label}
                            </div>
                        ))}
                    </div>
                </Panel>
            ) : null}
            <Panel
                position={panelPosition}
                className={`floating-dock-panel floating-dock-panel-${placement.dock}`}
                data-dock-id={id}
                style={{
                    display: 'block',
                    transform: `translate(${offset.x}px, ${offset.y}px)`
                }}
            >
                <section
                    className={[
                        'floating-dock',
                        `floating-dock-${placement.dock}`,
                        menuOpen ? 'floating-dock-menu-open' : '',
                        isDragging ? 'floating-dock-dragging' : '',
                        previewDock ? `floating-dock-preview-${previewDock}` : '',
                        className
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    aria-label={ariaLabel}
                    onContextMenu={openContextMenu}
                >
                    {controlsPlacement === 'frame' ? dockControls : null}
                    {renderedChildren}
                </section>
            </Panel>
            {dockMenu}
        </>
    );
};

export default FloatingDock;
