export const isCanceledRequest = (error) =>
    error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError';

export const requestErrorMessage = (error) => {
    if (isCanceledRequest(error)) {
        return 'Canceled by user.';
    }

    return (
        error?.response?.data?.detail ||
        error?.response?.statusText ||
        error?.message ||
        'Request failed.'
    );
};
