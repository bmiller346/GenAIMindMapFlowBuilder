const ShellOverlayHost = ({ overlay }) => {
    if (!overlay?.kind) {
        return null;
    }

    return (
        <div
            className="shell-overlay-layer"
            data-overlay-kind={overlay.kind}
            data-overlay-id={overlay.id || undefined}
        />
    );
};

export default ShellOverlayHost;
