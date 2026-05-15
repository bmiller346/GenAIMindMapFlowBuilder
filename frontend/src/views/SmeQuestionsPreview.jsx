/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { getSmeQuestionPreviewRows } from './graphProjection';
import { withLocalPreviewAcceptance } from './localPreviewMetadata';
import {
    makePreviewDiffSummary,
    PreviewDiffSummary
} from './previewDiffSummary';
import useActivityStore from '../stores/activityStore';
import flowStore from '../stores/flowStore';

const smeRowsFromGeneratedPreview = (generatedPreview) => {
    const items = Array.isArray(generatedPreview?.preview_items)
        ? generatedPreview.preview_items
        : [];

    return items.map((item, index) => {
        const mutation = item.proposed_mutation || {};
        const reviewQuestion = mutation.sme_review_question || {};
        return {
            id: item.node_id,
            title: item.title,
            question_id: item.id,
            question_order: index + 1,
            reason: reviewQuestion.reason || item.rationale,
            question: reviewQuestion.question || item.title,
            generated_preview_item: item,
            included: true
        };
    });
};

const SmeQuestionsPreview = ({
    nodes,
    projection,
    generatedPreview,
    onRejectGeneratedPreview,
    setNodes,
    setActiveView,
    onAskAi
}) => {
    const previewRows = useMemo(
        () => {
            const generatedRows = smeRowsFromGeneratedPreview(generatedPreview);
            return generatedRows.length > 0
                ? generatedRows
                : getSmeQuestionPreviewRows(projection);
        },
        [projection, generatedPreview]
    );
    const defaultIds = useMemo(
        () => new Set(previewRows.map((row) => row.question_id)),
        [previewRows]
    );
    const [selectedIds, setSelectedIds] = useState(new Set());
    const activeIds = selectedIds.size > 0 ? selectedIds : defaultIds;
    const diffSummary = useMemo(
        () =>
            makePreviewDiffSummary({
                rows: previewRows,
                activeIds,
                idKey: 'question_id',
                artifactLabel: 'SME question',
                updatedFields: ['SME questions'],
                mode: generatedPreview ? 'generated' : 'local'
            }),
        [activeIds, generatedPreview, previewRows]
    );
    const addActivity = useActivityStore((s) => s.addActivity);
    const flowId = flowStore((s) => s.flow_id);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);

    const toggleRow = (questionId) => {
        setSelectedIds(() => {
            const next = new Set(activeIds);
            if (next.has(questionId)) {
                next.delete(questionId);
            } else {
                next.add(questionId);
            }
            return next;
        });
    };

    const acceptQuestions = () => {
        if (activeIds.size === 0) {
            return;
        }

        const acceptedAt = new Date().toISOString();
        const questionsByNodeId = previewRows.reduce((groups, row) => {
            if (!activeIds.has(row.question_id)) {
                return groups;
            }

            const questions = groups.get(row.id) || [];
            questions.push({
                id: row.question_id,
                question: row.question,
                reason: row.reason,
                status: 'open',
                preview_item_id: row.generated_preview_item?.id,
                generated_preview_item: row.generated_preview_item
            });
            groups.set(row.id, questions);
            return groups;
        }, new Map());

        setNodes(
            nodes.map((node) => {
                const questions = questionsByNodeId.get(node.id);
                if (!questions) {
                    return node;
                }

                const data = withLocalPreviewAcceptance(node.data, {
                    flow: questions.some((question) => question.generated_preview_item)
                        ? 'generated_reviewer_sme_questions'
                        : 'sme_review_questions',
                    accepted_at: acceptedAt,
                    node_id: node.id,
                    helper_id: questions.some((question) => question.generated_preview_item)
                        ? 'reviewer'
                        : undefined,
                    preview_id: generatedPreview?.preview_id,
                    question_count: questions.length,
                    question_ids: questions.map((question) => question.id)
                });

                return {
                    ...node,
                    data: {
                        ...data,
                        sme_review_questions: {
                            accepted: true,
                            accepted_at: acceptedAt,
                            questions
                        }
                    }
                };
            })
        );
        setSelectedIds(new Set());
        if (flowId) {
            setSaveStatus('dirty');
        }
        addActivity({
            status: 'completed',
            title: 'Accepted SME questions',
            detail: `Accepted ${activeIds.size} SME question${
                activeIds.size === 1 ? '' : 's'
            }.`,
            context: 'Helper: Reviewer'
        });
        onRejectGeneratedPreview?.();
        setActiveView('table');
    };

    const rejectGeneratedPreview = () => {
        onRejectGeneratedPreview?.();
        addActivity({
            status: 'completed',
            title: 'Rejected SME questions preview',
            detail: `Rejected ${previewRows.length} generated SME question${
                previewRows.length === 1 ? '' : 's'
            }.`,
            context: 'Helper: Reviewer'
        });
    };

    return (
        <div className="local-sme-questions-preview">
            <div className="local-task-preview-header">
                <div>
                    <strong>Draft SME questions</strong>
                    <span>
                        {generatedPreview ? 'AI-generated review artifact' : 'Accepted gaps and questions'} |{' '}
                        {previewRows.length} questions
                    </span>
                </div>
                <span className="output-state-pill">
                    {generatedPreview ? 'AI-generated' : 'Accepted workspace'}
                </span>
                <button type="button" onClick={acceptQuestions}>
                    Accept selected
                </button>
                {generatedPreview ? (
                    <button type="button" onClick={rejectGeneratedPreview}>
                        Reject generated
                    </button>
                ) : null}
            </div>
            <PreviewDiffSummary changes={diffSummary} />
            <div className="local-table-wrap">
                <table className="local-projection-table">
                    <thead>
                        <tr>
                            <th>Use</th>
                            <th>Node</th>
                            <th>Reason</th>
                            <th>Question</th>
                        </tr>
                    </thead>
                    <tbody>
                        {previewRows.map((row) => (
                            <tr key={row.question_id}>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={activeIds.has(row.question_id)}
                                        onChange={() => toggleRow(row.question_id)}
                                        aria-label={`Include ${row.question}`}
                                    />
                                </td>
                                <td>{row.title}</td>
                                <td>{row.reason}</td>
                                <td>{row.question}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {previewRows.length === 0 ? (
                <div className="local-table-empty local-empty-actions">
                    <strong>No SME review questions are needed for this branch.</strong>
                    <span>
                        Project now did not find obvious SME prompts. Ask AI to draft
                        expert-review questions if the branch still needs human judgment.
                    </span>
                    <button type="button" onClick={onAskAi} disabled={!flowId}>
                        Ask AI to draft SME questions
                    </button>
                    <button type="button" onClick={() => setActiveView('gaps')}>
                        Review gaps first
                    </button>
                </div>
            ) : null}
        </div>
    );
};

export default SmeQuestionsPreview;
