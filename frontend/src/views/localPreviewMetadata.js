const FINAL_REVIEW_STATUSES = new Set(['approved', 'reviewed']);

export const reviewStatusAfterPreviewAccept = (currentStatus) =>
    FINAL_REVIEW_STATUSES.has(currentStatus) ? currentStatus : 'needs_review';

const existingAcceptances = (data) =>
    Array.isArray(data?.local_preview_acceptances)
        ? data.local_preview_acceptances
        : [];

export const withLocalPreviewAcceptance = (data, acceptance) => ({
    ...data,
    status: reviewStatusAfterPreviewAccept(data?.status),
    local_preview_acceptances: [
        ...existingAcceptances(data),
        {
            accepted: true,
            ...acceptance
        }
    ]
});
