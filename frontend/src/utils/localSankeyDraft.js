const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const starterPromptPattern =
    /create a source-backed sankey flow lens from this workspace or source context/i;

export const isSankeyDraftRequest = ({ prompt = '', session = {}, revision = {} } = {}) => {
    const metadata = {
        ...(session.metadata || {}),
        ...(revision.metadata || {})
    };
    const text = [
        prompt,
        revision.prompt,
        session.intent,
        metadata.output_shape,
        metadata.requested_visual,
        ...asArray(metadata.requested_output_shapes)
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return text.includes('sankey') || (text.includes('chart') && text.includes('source target value'));
};

const topicFromPrompt = (prompt = '') => {
    const promptText = String(prompt || '');
    const knowledgeMatch = promptText.match(/\b(?:from|using)\s+(?:your\s+)?(?:knowledge|code knowledge)\s+(?:on|in|for)?\s*(.+)$/i);
    const rawTopic = knowledgeMatch?.[1] || promptText;
    const cleaned = rawTopic
        .replace(/\s+/g, ' ')
        .replace(/\bsource-backed\s+sankey\s+flow\s+lens\s+(?:from|for|about|on)?\s*/i, '')
        .replace(/\bsankey\s+flow\s+lens\s+(?:from|for|about|on)?\s*/i, '')
        .replace(/[?.!]+$/g, '')
        .trim()
        .replace(/^for\s+/i, '')
        .replace(/^(create|build|draft|generate|make|map|show)\s+(a|an|the\s+)?/i, '');
    if (!cleaned || starterPromptPattern.test(cleaned)) {
        return '';
    }
    return cleaned.slice(0, 120);
};

const isFireAlarmCodeTopic = (topic = '') =>
    /\b(fire\s+alarm|nfpa\s*72|nfpa\s*70|nec|new\s+jersey|nj\s+ucc|ifc|ibc|ahj)\b/i.test(topic);

const splitCsvLine = (line = '') => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (const character of String(line)) {
        if (character === '"') {
            inQuotes = !inQuotes;
            continue;
        }
        if (character === ',' && !inQuotes) {
            cells.push(current.trim());
            current = '';
            continue;
        }
        current += character;
    }
    cells.push(current.trim());
    return cells;
};

const cleanCell = (value = '') =>
    String(value || '')
        .replace(/^[-*#\s]+/, '')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim();

const dependencyLabel = (...parts) =>
    parts
        .map(cleanCell)
        .filter((part) => part && !/^tbd$/i.test(part))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

const dependencyRow = ({
    source,
    target,
    notes = '',
    stage = 'Dependency',
    refs = [],
    reviewState,
    confidence
}) => ({
    source: cleanCell(source),
    target: cleanCell(target),
    value: 1,
    metric: 'dependency',
    stage,
    notes: cleanCell(notes) || 'Review dependency and applicable edition/section before use.',
    confidence,
    review_state: reviewState,
    source_refs: refs
});

const rowIdFromPath = (source = '', target = '', index = 0) =>
    `row-${index + 1}-${`${source}-${target}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)}`;

const withCitationRepairMetadata = (rows = [], { refs = [], queryId = '' } = {}) =>
    rows.map((row, index) => {
        const source = cleanCell(row.source);
        const target = cleanCell(row.target);
        const notes = cleanCell(row.notes);
        const rowId = row.row_id || rowIdFromPath(source, target, index);
        const sourceRefs = asArray(row.source_refs).length ? asArray(row.source_refs) : refs;
        const citationStatus = sourceRefs.length ? 'source_backed' : 'needs_source';
        return {
            ...row,
            row_id: rowId,
            evidence_item_id: rowId,
            source,
            target,
            source_refs: sourceRefs,
            evidence_status: citationStatus,
            citation_status: citationStatus,
            source_policy: sourceRefs.length ? 'cited' : 'reviewer_source_required',
            evidence_input_hint:
                'Upload a source, select an existing source, or paste a URL, then ask AI to correct only this output item.',
            source_input_hint:
                'Upload a source, select an existing source, or paste a URL, then ask AI to correct only this output item.',
            citation_query: [source, target, notes].filter(Boolean).join(' | '),
            evidence_repair_prompt: [
                'Correct and cite this output item.',
                `Item id: ${rowId}`,
                `Current source: ${source}`,
                `Current target: ${target}`,
                notes ? `Current notes: ${notes}` : '',
                queryId ? `Artifact/query id: ${queryId}` : '',
                'Use uploaded sources, selected sources, pasted URLs, or web search/public context when available. If the current citation is weak, random, or missing, replace it with better evidence. Return only the corrected item fields plus source_refs and review_state.'
            ]
                .filter(Boolean)
                .join('\n'),
            source_repair_prompt: [
                'Correct and cite this output item.',
                `Row id: ${rowId}`,
                `Source: ${source}`,
                `Target: ${target}`,
                notes ? `Notes: ${notes}` : '',
                queryId ? `Query id: ${queryId}` : '',
                'Use uploaded sources, selected sources, pasted URLs, or web search/public context when available. If the current citation is weak, random, or missing, replace it with better evidence. Return only the corrected source, target, value, metric, notes, review_state, and source_refs for this row.'
            ]
                .filter(Boolean)
                .join('\n')
        };
    });

const uniqueRows = (rows = []) => {
    const seen = new Set();
    return rows.filter((row) => {
        if (!row.source || !row.target || row.source === row.target) {
            return false;
        }
        const key = `${row.source}->${row.target}`.toLowerCase();
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const extractCsvDependencyRows = ({ text, refs, reviewState, confidence }) => {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const headerIndex = lines.findIndex((line) =>
        /^dependency_id\s*,\s*triggering_code\s*,\s*triggering_edition\s*,\s*triggering_section/i.test(
            line
        )
    );
    if (headerIndex < 0) {
        return [];
    }

    const rows = [];
    for (const line of lines.slice(headerIndex + 1)) {
        if (/^(sql example|--|\w+\s+table\b)/i.test(line) || !line.includes(',')) {
            break;
        }
        const cells = splitCsvLine(line);
        if (cells.length < 7 || !/^\d+$/i.test(cells[0])) {
            continue;
        }
        const [
            ,
            triggeringCode,
            triggeringEdition,
            triggeringSection,
            dependencyCode,
            dependencyEdition,
            dependencySection,
            ...noteCells
        ] = cells;
        rows.push(
            dependencyRow({
                source: dependencyLabel(triggeringCode, triggeringEdition, triggeringSection),
                target: dependencyLabel(dependencyCode, dependencyEdition, dependencySection),
                notes: noteCells.join(', '),
                stage: 'CSV dependency',
                refs,
                reviewState,
                confidence
            })
        );
    }
    return rows;
};

const extractTabularDependencyRows = ({ text, refs, reviewState, confidence }) => {
    const lines = String(text || '').split(/\r?\n/);
    const headerIndex = lines.findIndex((line) =>
        /Code\/Standard\s+Edition\s+Triggering Code\/Section\s+Dependency Code\/Section\s+Notes/i.test(
            line
        )
    );
    if (headerIndex < 0) {
        return [];
    }

    const rows = [];
    for (const line of lines.slice(headerIndex + 1)) {
        if (!line.trim()) {
            if (rows.length) {
                break;
            }
            continue;
        }
        const cells = line.includes('\t')
            ? line.split('\t').map(cleanCell)
            : line.split(/\s{2,}/).map(cleanCell);
        if (cells.length < 4 || /^csv format/i.test(cells[0])) {
            break;
        }
        const [code, edition, trigger, dependency, ...noteCells] = cells;
        rows.push(
            dependencyRow({
                source: dependencyLabel(code, edition, trigger),
                target: dependencyLabel(dependency),
                notes: noteCells.join(' '),
                stage: 'Table dependency',
                refs,
                reviewState,
                confidence
            })
        );
    }
    return rows;
};

const codeishPattern =
    /\b(NJAC|NFPA|NEC|IBC|IMC|IPC|IFC|ASME|IEEE|Article|Section|Chapter|CE-\d+|A17\.1|CSD-1)\b/i;

const extractOutlineDependencyRows = ({ text, refs, reviewState, confidence }) => {
    const rows = [];
    const stack = [];
    String(text || '')
        .split(/\r?\n/)
        .forEach((line) => {
            const match = line.match(/^(\s*)[-*]\s+(?:\*\*)?([^:*]+?)(?:\*\*)?(?::|\s+-\s+)?(.*)$/);
            if (!match) {
                return;
            }
            const indent = match[1].replace(/\t/g, '    ').length;
            const label = cleanCell(match[2]);
            const notes = cleanCell(match[3]);
            if (!codeishPattern.test(`${label} ${notes}`)) {
                return;
            }
            while (stack.length && stack[stack.length - 1].indent >= indent) {
                stack.pop();
            }
            const parent = stack[stack.length - 1];
            if (parent) {
                rows.push(
                    dependencyRow({
                        source: parent.label,
                        target: label,
                        notes,
                        stage: 'Outline dependency',
                        refs,
                        reviewState,
                        confidence
                    })
                );
            }
            stack.push({ indent, label });
        });
    return rows;
};

const extractDependencyRowsFromText = ({ text, refs, reviewState, confidence }) =>
    uniqueRows([
        ...extractCsvDependencyRows({ text, refs, reviewState, confidence }),
        ...extractTabularDependencyRows({ text, refs, reviewState, confidence }),
        ...extractOutlineDependencyRows({ text, refs, reviewState, confidence })
    ]);

const fireAlarmCodeRows = ({ topic, refs, reviewState, confidence }) => [
    {
        source: 'Project scope and occupancy',
        target: 'Adopted code and AHJ basis',
        value: 1,
        metric: 'review item',
        stage: 'Code basis',
        notes: `Confirm jurisdiction, occupancy/use group, construction scope, and adopted editions before applying ${topic}.`,
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'Adopted code and AHJ basis',
        target: 'Building/fire code alarm triggers',
        value: 1,
        metric: 'review item',
        stage: 'Applicability',
        notes:
            'Identify the adopted building/fire code requirements that trigger manual fire alarm, automatic detection, monitoring, notification, or exceptions.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'Adopted code and AHJ basis',
        target: 'NFPA 72 system requirements',
        value: 1,
        metric: 'review item',
        stage: 'Standard mapping',
        notes:
            'Map system type, initiating devices, notification, supervising station interface, documentation, inspection, testing, and maintenance requirements to NFPA 72.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'Adopted code and AHJ basis',
        target: 'NFPA 70 circuit and power requirements',
        value: 1,
        metric: 'review item',
        stage: 'Standard mapping',
        notes:
            'Map branch circuits, wiring methods, survivability/pathways, grounding, disconnecting means, and power supply constraints to NFPA 70/NEC as adopted.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'Building/fire code alarm triggers',
        target: 'Device and sequence design criteria',
        value: 1,
        metric: 'review item',
        stage: 'Design criteria',
        notes:
            'Turn required functions into design criteria: manual boxes, detection, elevator recall, sprinkler monitoring, smoke control, emergency control functions, and notification zones.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'NFPA 72 system requirements',
        target: 'Device and sequence design criteria',
        value: 1,
        metric: 'review item',
        stage: 'Design criteria',
        notes:
            'Use NFPA 72 criteria to review initiating device spacing/location, audibility/visibility, circuit class/pathway survivability, and signal priorities.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'NFPA 70 circuit and power requirements',
        target: 'Power, wiring, and pathway design',
        value: 1,
        metric: 'review item',
        stage: 'Electrical criteria',
        notes:
            'Translate NEC requirements into circuiting, conductor, raceway, power supply, battery/secondary power, and labeling constraints.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'Device and sequence design criteria',
        target: 'Drawings, riser, matrix, and calculations',
        value: 1,
        metric: 'review item',
        stage: 'Submittal package',
        notes:
            'Coordinate floor plans, riser diagram, input/output matrix, battery calculations, voltage-drop calculations, device candela/sounder settings, and monitoring details.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'Power, wiring, and pathway design',
        target: 'Drawings, riser, matrix, and calculations',
        value: 1,
        metric: 'review item',
        stage: 'Submittal package',
        notes:
            'Carry power and pathway constraints into the riser, circuit schedules, voltage-drop calculations, and installation details.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'Drawings, riser, matrix, and calculations',
        target: 'AHJ review, inspection, and acceptance testing',
        value: 1,
        metric: 'review item',
        stage: 'Approval and closeout',
        notes:
            'Prepare review comments, inspection records, acceptance test documentation, owner training/closeout, and ITM handoff for AHJ and stakeholder acceptance.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    }
];

const defaultSankeyRows = ({ topic, refs, reviewState, confidence }) => [
    {
        source: 'Project requirements',
        target: 'Applicable code basis',
        value: 1,
        metric: 'count',
        stage: 'Code basis',
        notes: `Confirm governing requirements for ${topic}.`,
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'Applicable code basis',
        target: 'Device and circuit design criteria',
        value: 1,
        metric: 'count',
        stage: 'Design criteria',
        notes: 'Normalize code and project constraints into design criteria before diagramming.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'Device and circuit design criteria',
        target: 'Initiating device layout',
        value: 1,
        metric: 'count',
        stage: 'Layout',
        notes: 'Map initiating device placement as a reviewable flow path.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'Device and circuit design criteria',
        target: 'Notification appliance layout',
        value: 1,
        metric: 'count',
        stage: 'Layout',
        notes: 'Map notification appliance placement as a reviewable flow path.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'Initiating device layout',
        target: 'AHJ and stakeholder review',
        value: 1,
        metric: 'count',
        stage: 'Review',
        notes: 'Confirm assumptions with the reviewer or authority having jurisdiction.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    },
    {
        source: 'Notification appliance layout',
        target: 'AHJ and stakeholder review',
        value: 1,
        metric: 'count',
        stage: 'Review',
        notes: 'Confirm assumptions with the reviewer or authority having jurisdiction.',
        confidence,
        review_state: reviewState,
        source_refs: refs
    }
];

export const buildLocalSankeyDraft = ({
    prompt = '',
    priorPrompt = '',
    sourceRefs = [],
    now = Date.now()
} = {}) => {
    if (!isSankeyDraftRequest({ prompt: `${priorPrompt} ${prompt}` })) {
        return null;
    }

    const queryId = `local-sankey-${now}`;
    const refs = asArray(sourceRefs);
    const reviewState = refs.length ? 'source_backed' : 'needs_review';
    const confidence = refs.length ? 0.72 : 0.38;
    const contextText = `${priorPrompt}\n${prompt}`;
    const extractedRows = extractDependencyRowsFromText({
        text: contextText,
        refs,
        reviewState,
        confidence
    });
    const topic =
        topicFromPrompt(prompt) ||
        topicFromPrompt(priorPrompt) ||
        (extractedRows.length ? 'interdisciplinary code dependencies' : '');
    if (!topic) {
        return {
            draftNodes: [],
            draftEdges: [],
            draftAnnotations: [
                {
                    id: `sankey-context-needed-${now}`,
                    type: 'sankey_context_needed',
                    title: 'Sankey needs flow context',
                    body:
                        'Add sources, paste source/target/value rows, or revise with the process/domain you want mapped before accepting a Sankey flow lens.',
                    source_refs: []
                }
            ]
        };
    }

    const baseRows = extractedRows.length
        ? extractedRows
        : isFireAlarmCodeTopic(topic)
        ? fireAlarmCodeRows({ topic, refs, reviewState, confidence })
        : defaultSankeyRows({ topic, refs, reviewState, confidence });
    const rows = withCitationRepairMetadata(baseRows, { refs, queryId });
    const titlePrefix = refs.length ? 'Source-backed Sankey flow lens' : 'Review-only Sankey starter';

    const nodeId = `draft-sankey-${now}`;
    const generatedArtifacts = [
        {
            id: `${queryId}-table`,
            artifact_type: 'data_table',
            data: {
                rows,
                columns: [
                    'source',
                    'target',
                    'value',
                    'metric',
                    'stage',
                    'notes',
                    'confidence',
                    'review_state',
                    'source_refs'
                ],
                row_count: rows.length,
                query_id: queryId,
                table_name: 'local_sankey_flow_rows',
                result_hash: `${queryId}-hash`
            }
        },
        {
            id: `${queryId}-chart`,
            artifact_type: 'chart',
            data: {
                chart_spec: {
                    chart_type: 'sankey',
                    source_column: 'source',
                    target_column: 'target',
                    value_column: 'value'
                },
                data_rows: rows,
                query_id: queryId
            }
        },
        {
            id: `${queryId}-summary`,
            artifact_type: 'data_summary',
            data: {
                title: `${titlePrefix}: ${topic}`,
                summary:
                    refs.length > 0
                        ? 'Local fallback rows were created from your revision and attached source references. Values should still be reviewed before use.'
                        : 'Local fallback rows were created from your prompt only. They are not code advice or source-backed evidence until adopted code sources and AHJ requirements are attached.',
                row_count: rows.length,
                query_id: queryId,
                row_correction_supported: true
            }
        }
    ];

    return {
        draftNodes: [
            {
                id: nodeId,
                title: `${titlePrefix}: ${topic}`,
                summary:
                    refs.length > 0
                        ? `Reviewable source/target/value rows for ${topic}.`
                        : `Review-only source/target/value rows for ${topic}. Add adopted code sources before treating this as evidence.`,
                node_type: 'reference',
                status: reviewState,
                review_state: reviewState,
                artifact_type: 'structured_data_analysis',
                generated_artifacts: generatedArtifacts,
                df: rows,
                source_refs: refs,
                metadata: {
                    domain: 'structured_data',
                    local_fallback: 'sankey_flow_lens',
                    output_shape: 'chart',
                    visual_mode: 'chart',
                    query_id: queryId,
                    table_name: 'local_sankey_flow_rows',
                    result_hash: `${queryId}-hash`,
                    row_count: rows.length,
                    row_correction_supported: true
                }
            }
        ],
        draftEdges: [],
        draftAnnotations: [
            {
                id: `${queryId}-review-note`,
                type: 'sankey_review_note',
                title: refs.length ? 'Review flow weights' : 'Source required before code reliance',
                body:
                    refs.length
                        ? 'This local Sankey draft uses placeholder values. Replace them with sourced counts, costs, effort, risks, or confidence scores before treating width as evidence.'
                        : 'This Sankey draft is prompt-only. Attach adopted code excerpts, project criteria, or AHJ comments before treating any path as source-backed code guidance.',
                source_refs: refs
            }
        ]
    };
};

const outputShapeFromContext = ({ session = {}, revision = {}, outputShape = '', requestedVisual = '' } = {}) =>
    [
        outputShape,
        requestedVisual,
        revision.metadata?.output_shape,
        revision.metadata?.requested_visual,
        session.metadata?.output_shape,
        session.metadata?.requested_visual,
        ...asArray(revision.metadata?.requested_output_shapes),
        ...asArray(session.metadata?.requested_output_shapes)
    ]
        .map((value) => String(value || '').trim())
        .find(Boolean) || 'mind_map';

const starterNeedsContext = (prompt = '') =>
    /\b(source-backed|workspace|source context|selected pdf|selected source|this branch|this context|these requirements|these meeting notes|these standards files|this document context)\b/i.test(
        prompt
    );

const nodeTypeForOutput = (shape = '', title = '') => {
    const text = `${shape} ${title}`.toLowerCase();
    if (/\b(task|kanban|handoff|implementation|30\/60\/90)\b/.test(text)) {
        return 'task';
    }
    if (/\b(checklist|step|flow)\b/.test(text)) {
        return 'step';
    }
    if (/\b(question|sme|gap|review|source|coverage|evidence)\b/.test(text)) {
        return 'question';
    }
    if (/\b(table|chart|executive|news|newsletter|article|report)\b/.test(text)) {
        return 'reference';
    }
    return 'concept';
};

const labelForOutput = (shape = '') =>
    ({
        checklist: 'Checklist',
        tasks: 'Task plan',
        kanban: 'Kanban plan',
        flow_chart: 'Flowchart',
        knowledge_graph: 'Connections map',
        mind_map: 'Map',
        outline: 'Outline',
        table: 'Table',
        chart: 'Chart',
        source_coverage: 'Source coverage',
        review_annotations: 'Review packet',
        sme_questions: 'SME questions',
        software_overlap_report: 'Software overlap',
        missing_info_report: 'Missing information',
        implementation_handoff_package: 'Handoff package',
        executive_summary: 'Executive summary',
        news_article: 'News article',
        newsletter: 'Newsletter',
        presentation_sections: 'Stakeholder package'
    })[shape] || 'Guided draft';

const branchDefinitionsForOutput = (shape = '', topic = '') => {
    const defaultTopic = topic || 'the request';
    if (['checklist', 'tasks', 'kanban'].includes(shape)) {
        return [
            ['Confirm scope and acceptance criteria', `Clarify what ${defaultTopic} must accomplish.`, 'task'],
            ['Collect inputs and constraints', 'List documents, owners, codes, systems, dates, and assumptions to verify.', 'task'],
            ['Sequence the work', 'Turn the request into ordered work that can be reviewed and assigned.', 'task'],
            ['Validate evidence and closeout', 'Flag source gaps, decisions, and proof needed before acceptance.', 'task']
        ];
    }
    if (shape === 'flow_chart') {
        return [
            ['Inputs', `Capture the inputs or triggers for ${defaultTopic}.`, 'step'],
            ['Decision points', 'Identify decisions, exceptions, and review gates.', 'step'],
            ['Handoffs', 'Map who or what receives work at each stage.', 'step'],
            ['Outputs', 'Define the deliverables, approvals, or records produced.', 'step']
        ];
    }
    if (['source_coverage', 'review_annotations', 'sme_questions', 'missing_info_report', 'software_overlap_report'].includes(shape)) {
        return [
            ['Claims to verify', `List the claims or assumptions inside ${defaultTopic}.`, 'question'],
            ['Evidence needed', 'Identify source references, data, or expert review needed.', 'question'],
            ['Review questions', 'Capture questions for SMEs, owners, or reviewers.', 'question'],
            ['Recommended repair path', 'Name the next action before this can be accepted as evidence.', 'task']
        ];
    }
    if (['implementation_handoff_package', 'executive_summary', 'news_article', 'newsletter', 'presentation_sections'].includes(shape)) {
        return [
            ['Audience and decision', `Clarify who needs ${defaultTopic} and what decision or action is needed.`, 'reference'],
            ['Key points', 'Draft the main findings, claims, or story beats for review.', 'reference'],
            ['Evidence and assumptions', 'Separate supported facts from assumptions that need confirmation.', 'question'],
            ['Next actions', 'List follow-up work, owners, or publishing steps.', 'task']
        ];
    }
    if (['table', 'chart'].includes(shape)) {
        return [
            ['Rows to capture', `Identify the row-level records for ${defaultTopic}.`, 'reference'],
            ['Columns or encodings', 'Define useful columns, metrics, categories, and chart encodings.', 'reference'],
            ['Anomalies and gaps', 'Flag missing values, weak evidence, or suspicious rows.', 'question'],
            ['Review action', 'Confirm which rows are ready to accept.', 'task']
        ];
    }
    return [
        ['Core structure', `Break ${defaultTopic} into its main parts.`, 'category'],
        ['Relationships and dependencies', 'Identify handoffs, dependencies, overlaps, and constraints.', 'concept'],
        ['Evidence and risks', 'Flag source support, assumptions, and review risks.', 'question'],
        ['Next actions', 'Convert the useful parts into follow-up work.', 'task']
    ];
};

export const buildLocalGuidedFallbackDraft = ({
    prompt = '',
    priorPrompt = '',
    session = {},
    revision = {},
    outputShape = '',
    requestedVisual = '',
    sourceRefs = [],
    now = Date.now()
} = {}) => {
    const sankeyDraft = buildLocalSankeyDraft({ prompt, priorPrompt, sourceRefs, now });
    if (sankeyDraft) {
        return sankeyDraft;
    }

    const topic = topicFromPrompt(prompt);
    const shape = outputShapeFromContext({ session, revision, outputShape, requestedVisual });
    if (!topic) {
        return starterNeedsContext(priorPrompt || prompt)
            ? {
                  draftNodes: [],
                  draftEdges: [],
                  draftAnnotations: [
                      {
                          id: `guided-context-needed-${now}`,
                          type: 'guided_context_needed',
                          title: 'This guided start needs context',
                          body:
                              'Add sources, select existing workspace content, or revise with the subject you want this recipe to draft before accepting changes.',
                          source_refs: []
                      }
                  ]
              }
            : null;
    }

    const refs = asArray(sourceRefs);
    const rootId = `draft-guided-${now}`;
    const label = labelForOutput(shape);
    const reviewState = refs.length ? 'source_backed' : 'needs_review';
    const rootNode = {
        id: rootId,
        title: `${label}: ${topic}`,
        summary:
            refs.length > 0
                ? `Reviewable ${label.toLowerCase()} scaffold for ${topic}.`
                : `Reviewable ${label.toLowerCase()} scaffold for ${topic}. Add source support before treating it as evidence.`,
        node_type: nodeTypeForOutput(shape, label),
        status: reviewState,
        review_state: reviewState,
        source_refs: refs,
        metadata: {
            local_fallback: 'guided_start',
            output_shape: shape,
            visual_mode: requestedVisual || shape
        }
    };
    const childNodes = branchDefinitionsForOutput(shape, topic).map(([title, summary, nodeType], index) => ({
        id: `${rootId}-item-${index + 1}`,
        parent_id: rootId,
        title,
        summary,
        node_type: nodeType,
        status: reviewState,
        review_state: reviewState,
        source_refs: refs,
        metadata: {
            local_fallback: 'guided_start',
            output_shape: shape,
            visual_mode: requestedVisual || shape,
            item_index: index + 1
        }
    }));

    return {
        draftNodes: [rootNode, ...childNodes],
        draftEdges: childNodes.map((node) => ({
            id: `draft-edge-${rootId}-${node.id}`,
            source_node_id: rootId,
            target_node_id: node.id
        })),
        draftAnnotations: [
            {
                id: `guided-review-note-${now}`,
                type: 'guided_review_note',
                title: 'Review local scaffold',
                body:
                    'This draft was created locally because model generation was unavailable. Treat it as structure to edit, cite, or replace with source-backed output.',
                source_refs: refs
            }
        ]
    };
};
