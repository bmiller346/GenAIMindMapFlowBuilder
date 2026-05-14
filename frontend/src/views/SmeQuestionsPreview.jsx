/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { getSmeQuestionPreviewRows } from './graphProjection';
import { withLocalPreviewAcceptance } from './localPreviewMetadata';

const SmeQuestionsPreview = ({ nodes, projection, setNodes, setActiveView }) => {
    const previewRows = useMemo(
        () => getSmeQuestionPreviewRows(projection),
        [projection]
    );
    const defaultIds = useMemo(
        () => new Set(previewRows.map((row) => row.question_id)),
        [previewRows]
    );
    const [selectedIds, setSelectedIds] = useState(new Set());
    const activeIds = selectedIds.size > 0 ? selectedIds : defaultIds;

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
                status: 'open'
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
                    flow: 'sme_review_questions',
                    accepted_at: acceptedAt,
                    node_id: node.id,
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
        setActiveView('table');
    };

    return (
        <div className="local-sme-questions-preview">
            <div className="local-task-preview-header">
                <div>
                    <strong>SME review questions</strong>
                    <span>{previewRows.length} generated local questions</span>
                </div>
                <button type="button" onClick={acceptQuestions}>
                    Accept selected
                </button>
            </div>
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
                <p className="local-table-empty">
                    No SME review questions are needed for this branch.
                </p>
            ) : null}
        </div>
    );
};

export default SmeQuestionsPreview;
