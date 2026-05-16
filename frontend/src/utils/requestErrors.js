export const isCanceledRequest = (error) =>
    error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError';

const detailMessage = (detail) => {
    if (!detail) {
        return '';
    }
    if (typeof detail === 'string') {
        return detail;
    }
    if (Array.isArray(detail)) {
        return detail
            .map((item) => detailMessage(item))
            .filter(Boolean)
            .join('\n');
    }
    if (typeof detail === 'object') {
        const message = detailMessage(detail.message);
        const errors = detailMessage(detail.errors);
        if (message && errors) {
            return `${message}\n${errors}`;
        }
        if (message || errors) {
            return message || errors;
        }
        if (detail.msg) {
            const loc = Array.isArray(detail.loc) ? `${detail.loc.join('.')}: ` : '';
            return `${loc}${detail.msg}`;
        }
        return JSON.stringify(detail);
    }
    return String(detail);
};

export const requestErrorMessage = (error) => {
    if (isCanceledRequest(error)) {
        return 'Canceled by user.';
    }

    return (
        detailMessage(error?.response?.data?.detail) ||
        error?.response?.statusText ||
        error?.message ||
        'Request failed.'
    );
};
