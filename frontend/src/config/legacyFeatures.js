export const LEGACY_FEATURE_KEYS = {
    showLegacyLanding: 'docmap:showLegacyLanding'
};

const isEnabled = (key) => {
    if (typeof window === 'undefined') {
        return false;
    }

    try {
        return window.localStorage?.getItem(key) === 'true';
    } catch {
        return false;
    }
};

export const isLegacyLandingEnabled = () =>
    isEnabled(LEGACY_FEATURE_KEYS.showLegacyLanding);
