import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

const viewportSafeTop = () => {
    if (typeof document === 'undefined') {
        return 8;
    }
    const headerBottom = document.querySelector('.header')?.getBoundingClientRect?.().bottom;
    return Math.ceil(Number.isFinite(headerBottom) ? headerBottom + 8 : 8);
};

const currentAppThemeClass = () => {
    if (typeof document === 'undefined') {
        return '';
    }
    if (document.querySelector('.app.light')) {
        return 'light';
    }
    if (document.querySelector('.app.dark')) {
        return 'dark';
    }
    return '';
};

const AnchoredPopover = ({
    open,
    anchorRef,
    avoidRef,
    className = '',
    children,
    ariaLabel,
    role,
    placement = 'bottom-start',
    viewportPadding = 8,
    offset = 8,
    dataAttribute = 'anchored-popover'
}) => {
    const popoverRef = useRef(null);
    const [style, setStyle] = useState(null);

    const updatePosition = useCallback(() => {
        const anchor = anchorRef?.current;
        if (!anchor) {
            return;
        }
        const anchorRect = anchor.getBoundingClientRect();
        const avoidRect = avoidRef?.current?.getBoundingClientRect?.();
        const popoverRect = popoverRef.current?.getBoundingClientRect?.();
        const popoverWidth = popoverRect?.width || 220;
        const popoverHeight = popoverRect?.height || 220;
        const viewportWidth = window.innerWidth || 1280;
        const viewportHeight = window.innerHeight || 800;
        const safeTop = Math.max(viewportPadding, viewportSafeTop());

        const preferTop =
            placement.startsWith('top') ||
            anchorRect.bottom + offset + popoverHeight > viewportHeight - viewportPadding;
        const candidateTop = preferTop
            ? anchorRect.top - popoverHeight - offset
            : anchorRect.bottom + offset;
        const rawTop =
            !preferTop && avoidRect
                ? Math.max(candidateTop, avoidRect.bottom + offset)
                : candidateTop;
        const rawLeft = placement.endsWith('end')
            ? anchorRect.right - popoverWidth
            : anchorRect.left;

        setStyle({
            left: `${clamp(rawLeft, viewportPadding, Math.max(viewportPadding, viewportWidth - popoverWidth - viewportPadding))}px`,
            top: `${clamp(rawTop, safeTop, Math.max(safeTop, viewportHeight - popoverHeight - viewportPadding))}px`
        });
    }, [anchorRef, avoidRef, offset, placement, viewportPadding]);

    useLayoutEffect(() => {
        if (!open) {
            setStyle(null);
            return undefined;
        }
        updatePosition();
        const handleUpdate = () => updatePosition();
        window.addEventListener('resize', handleUpdate);
        window.addEventListener('scroll', handleUpdate, true);
        return () => {
            window.removeEventListener('resize', handleUpdate);
            window.removeEventListener('scroll', handleUpdate, true);
        };
    }, [open, updatePosition]);

    useLayoutEffect(() => {
        if (open) {
            updatePosition();
        }
    }, [children, open, updatePosition]);

    if (!open || typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div
            ref={popoverRef}
            className={`anchored-popover-portal ${currentAppThemeClass()} ${className}`.trim()}
            aria-label={ariaLabel}
            role={role}
            data-overlay-root={dataAttribute}
            style={{
                visibility: style ? 'visible' : 'hidden',
                ...(style || {})
            }}
        >
            {children}
        </div>,
        document.body
    );
};

export default AnchoredPopover;
