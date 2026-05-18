import { getPdfExportProfile } from './exportProfiles.js';
import {
    AUTO_PAGE_SIZE_ID,
    PAGE_SIZE_PRESETS,
    getPageSize,
    normalizeOrientation
} from './pageSizes.js';
import { isHierarchyEdge, projectPdfExportData } from './projection.js';

const COLORS = {
    ink: '#1f2937',
    muted: '#6b7280',
    faint: '#e5e7eb',
    panel: '#f8fafc',
    accent: '#2563eb',
    accentSoft: '#dbeafe',
    task: '#047857',
    taskSoft: '#d1fae5',
    review: '#b45309',
    reviewSoft: '#fef3c7',
    source: '#4f46e5',
    sourceSoft: '#e0e7ff'
};

const MARGINS = { top: 54, right: 46, bottom: 48, left: 46 };
const NODE_BOX = { width: 150, height: 58 };
const AUTO_FIT_PAGE_SIZE_IDS = ['letter', 'tabloid', 'arch-c', 'arch-d', 'arch-e'];
const TITLE_BLOCK_HEIGHT = 74;
const NOTES_PANEL_MIN_WIDTH = 210;
const DIAGRAM_DENSITY = {
    roomy: { id: 'roomy', label: 'Roomy', positionScale: 1, maxScale: 1.15, padding: 26 },
    balanced: { id: 'balanced', label: 'Balanced', positionScale: 0.86, maxScale: 1.25, padding: 22 },
    compact: { id: 'compact', label: 'Compact', positionScale: 0.72, maxScale: 1.35, padding: 18 },
    fit: { id: 'fit', label: 'Fit', positionScale: 0.6, maxScale: 1.45, padding: 14 }
};

const cleanText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const safeFilename = (value = 'mind-map-export') =>
    cleanText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'mind-map-export';

const setColor = (doc, method, color) => {
    const hex = String(color || '#000000').replace('#', '');
    const value = hex.length === 3
        ? hex.split('').map((char) => `${char}${char}`).join('')
        : hex.padEnd(6, '0').slice(0, 6);
    const rgb = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
    doc[method](rgb[0], rgb[1], rgb[2]);
};

const addFooter = (doc, context) => {
    const { pageSize, profile, data } = context;
    setColor(doc, 'setTextColor', COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(profile.label, MARGINS.left, pageSize.height - 24);
    doc.text(
        data.flowName,
        pageSize.width / 2,
        pageSize.height - 24,
        { align: 'center' }
    );
    doc.text(
        `Page ${doc.internal.getNumberOfPages()}`,
        pageSize.width - MARGINS.right,
        pageSize.height - 24,
        { align: 'right' }
    );
};

const addPage = (doc, context) => {
    if (context.hasRenderedPage) {
        doc.addPage();
    }
    context.hasRenderedPage = true;
    addFooter(doc, context);
};

const sectionTitle = (doc, title, y = MARGINS.top) => {
    setColor(doc, 'setTextColor', COLORS.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(title, MARGINS.left, y);
    setColor(doc, 'setDrawColor', COLORS.faint);
    doc.setLineWidth(0.8);
    doc.line(MARGINS.left, y + 10, doc.internal.pageSize.getWidth() - MARGINS.right, y + 10);
    return y + 30;
};

const wrapped = (doc, text, width) => doc.splitTextToSize(cleanText(text), width);

const todayLabel = () => new Date().toLocaleDateString();

const drawPill = (doc, text, x, y, color, fillColor) => {
    const label = cleanText(text);
    if (!label) {
        return 0;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const width = Math.min(doc.getTextWidth(label) + 14, 112);
    setColor(doc, 'setFillColor', fillColor);
    setColor(doc, 'setDrawColor', fillColor);
    doc.roundedRect(x, y - 9, width, 14, 7, 7, 'FD');
    setColor(doc, 'setTextColor', color);
    doc.text(label.slice(0, 24), x + 7, y + 1);
    return width;
};

const nodeColors = (node) => {
    if (node.status === 'needs_review' || node.nodeType === 'needs_review') {
        return { stroke: COLORS.review, fill: COLORS.reviewSoft };
    }
    if (node.nodeType === 'task' || node.nodeType === 'workflow' || node.nodeType === 'procedure') {
        return { stroke: COLORS.task, fill: COLORS.taskSoft };
    }
    if (node.sourceRefs?.length) {
        return { stroke: COLORS.source, fill: COLORS.sourceSoft };
    }
    return { stroke: COLORS.ink, fill: '#ffffff' };
};

const nodeSize = (node = {}) => ({
    width: Number.isFinite(node.size?.width) ? node.size.width : NODE_BOX.width,
    height: Number.isFinite(node.size?.height) ? node.size.height : NODE_BOX.height
});

const diagramDensityFor = (value) =>
    DIAGRAM_DENSITY[String(value || '').toLowerCase()] || DIAGRAM_DENSITY.balanced;

const edgeTone = (edge = {}) => {
    const relationship = String(edge.relationshipType || '').toLowerCase();
    if (/risk|block|conflict|contradict|break/.test(relationship)) {
        return {
            stroke: COLORS.review,
            fill: COLORS.review,
            dash: [4, 4],
            labelFill: COLORS.reviewSoft
        };
    }
    if (/evidence|source|support|validate|cite/.test(relationship)) {
        return {
            stroke: COLORS.source,
            fill: COLORS.source,
            dash: [3, 5],
            labelFill: COLORS.sourceSoft
        };
    }
    if (!isHierarchyEdge(edge)) {
        return {
            stroke: COLORS.accent,
            fill: COLORS.accent,
            dash: [5, 4],
            labelFill: COLORS.accentSoft
        };
    }
    return {
        stroke: '#94a3b8',
        fill: '#94a3b8',
        dash: [],
        labelFill: '#ffffff'
    };
};

const edgeLabel = (edge = {}) => {
    const label = cleanText(edge.label);
    if (label) {
        return label;
    }
    const relationship = cleanText(edge.relationshipType);
    if (!relationship || isHierarchyEdge(edge)) {
        return '';
    }
    return relationship.replaceAll('_', ' ').replaceAll('-', ' ');
};

const nodeCenter = (node = {}) => {
    const size = nodeSize(node);
    return {
        x: node.position.x + size.width / 2,
        y: node.position.y + size.height / 2
    };
};

const edgeAnchors = (source, target) => {
    const sourceSize = nodeSize(source);
    const targetSize = nodeSize(target);
    const sourceCenter = nodeCenter(source);
    const targetCenter = nodeCenter(target);
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;

    if (Math.abs(dx) >= Math.abs(dy)) {
        const sourceSide = dx >= 0 ? 'right' : 'left';
        return {
            orientation: 'horizontal',
            targetSide: dx >= 0 ? 'left' : 'right',
            from: {
                x: sourceSide === 'right' ? source.position.x + sourceSize.width : source.position.x,
                y: sourceCenter.y
            },
            to: {
                x: dx >= 0 ? target.position.x : target.position.x + targetSize.width,
                y: targetCenter.y
            }
        };
    }

    const sourceSide = dy >= 0 ? 'bottom' : 'top';
    return {
        orientation: 'vertical',
        targetSide: dy >= 0 ? 'top' : 'bottom',
        from: {
            x: sourceCenter.x,
            y: sourceSide === 'bottom' ? source.position.y + sourceSize.height : source.position.y
        },
        to: {
            x: targetCenter.x,
            y: dy >= 0 ? target.position.y : target.position.y + targetSize.height
        }
    };
};

const drawArrowHead = (doc, x, y, side, size, color) => {
    setColor(doc, 'setFillColor', color);
    if (side === 'left') {
        doc.triangle(x, y, x - size, y - size * 0.65, x - size, y + size * 0.65, 'F');
    } else if (side === 'right') {
        doc.triangle(x, y, x + size, y - size * 0.65, x + size, y + size * 0.65, 'F');
    } else if (side === 'top') {
        doc.triangle(x, y, x - size * 0.65, y - size, x + size * 0.65, y - size, 'F');
    } else {
        doc.triangle(x, y, x - size * 0.65, y + size, x + size * 0.65, y + size, 'F');
    }
};

const graphBounds = (nodes = []) => {
    if (!nodes.length) {
        return { left: 0, top: 0, right: 1, bottom: 1 };
    }
    return nodes.reduce(
        (bounds, node) => {
            const size = nodeSize(node);
            return {
                left: Math.min(bounds.left, node.position.x),
                top: Math.min(bounds.top, node.position.y),
                right: Math.max(bounds.right, node.position.x + size.width),
                bottom: Math.max(bounds.bottom, node.position.y + size.height)
            };
        },
        (() => {
            const size = nodeSize(nodes[0]);
            return {
                left: nodes[0].position.x,
                top: nodes[0].position.y,
                right: nodes[0].position.x + size.width,
                bottom: nodes[0].position.y + size.height
            };
        })()
    );
};

const compactDiagramNodes = (nodes = [], densityId = 'balanced') => {
    const density = diagramDensityFor(densityId);
    if (!nodes.length || density.positionScale === 1) {
        return nodes;
    }
    const bounds = graphBounds(nodes);
    const centerX = bounds.left + (bounds.right - bounds.left) / 2;
    const centerY = bounds.top + (bounds.bottom - bounds.top) / 2;

    return nodes.map((node) => {
        const size = nodeSize(node);
        const nodeCenterX = node.position.x + size.width / 2;
        const nodeCenterY = node.position.y + size.height / 2;
        return {
            ...node,
            position: {
                x: centerX + (nodeCenterX - centerX) * density.positionScale - size.width / 2,
                y: centerY + (nodeCenterY - centerY) * density.positionScale - size.height / 2
            }
        };
    });
};

const transformForDiagram = (nodes, box, options = {}) => {
    const bounds = graphBounds(nodes);
    const contentWidth = Math.max(bounds.right - bounds.left, 1);
    const contentHeight = Math.max(bounds.bottom - bounds.top, 1);
    const density = diagramDensityFor(options.diagramDensity);
    const scale = Math.min(box.width / contentWidth, box.height / contentHeight, density.maxScale);
    const scaledWidth = contentWidth * scale;
    const scaledHeight = contentHeight * scale;
    const offsetX = box.x + Math.max(0, (box.width - scaledWidth) / 2) - bounds.left * scale;
    const offsetY = box.y + Math.max(0, (box.height - scaledHeight) / 2) - bounds.top * scale;

    return (position = {}) => ({
        x: offsetX + (position.x || 0) * scale,
        y: offsetY + (position.y || 0) * scale,
        scale
    });
};

const sidePanelWidthFor = ({ pageSize, data, profile, options = {}, section = {} }) => {
    const hasNotesPanel =
        options.includeNotesPanel !== undefined
            ? options.includeNotesPanel
            : section.notesPanel || profile.id === 'review-sheet';
    const hasOutlinePanel =
        (options.includeOutlinePanel !== undefined
            ? options.includeOutlinePanel
            : section.outlinePanel || profile.id === 'map-outline') && data.outlineRows.length > 0;
    return hasNotesPanel || hasOutlinePanel
        ? Math.max(NOTES_PANEL_MIN_WIDTH, Math.min(340, pageSize.width * 0.26))
        : 0;
};

const titleBlockHeightFor = ({ profile, options = {}, section = {} }) => {
    const hasTitleBlock =
        options.includeTitleBlock !== undefined
            ? options.includeTitleBlock
            : section.titleBlock || profile.id === 'review-sheet';
    return hasTitleBlock ? TITLE_BLOCK_HEIGHT : 0;
};

const estimateDiagramScale = (nodes, pageSize, { data = {}, profile = {}, options = {} } = {}) => {
    const diagramNodes = compactDiagramNodes(nodes, options.diagramDensity);
    const bounds = graphBounds(diagramNodes);
    const contentWidth = Math.max(bounds.right - bounds.left, 1);
    const contentHeight = Math.max(bounds.bottom - bounds.top, 1);
    const density = diagramDensityFor(options.diagramDensity);
    const diagramSection = profile.sections?.find((section) => section.type === 'diagram') || {};
    const sidePanelWidth = sidePanelWidthFor({ pageSize, data, profile, options, section: diagramSection });
    const titleBlockHeight = titleBlockHeightFor({ profile, options, section: diagramSection });
    const gutter = sidePanelWidth > 0 ? 14 : 0;
    const drawableWidth = pageSize.width - MARGINS.left - MARGINS.right - 44 - sidePanelWidth - gutter;
    const drawableHeight = pageSize.height - MARGINS.top - MARGINS.bottom - 74 - titleBlockHeight;
    return Math.min(drawableWidth / contentWidth, drawableHeight / contentHeight, density.maxScale);
};

const resolvePageSize = ({ pageSizeId, orientation, profile, data, options = {} }) => {
    const nextOrientation = normalizeOrientation(orientation || profile.defaultOrientation);
    if (pageSizeId !== AUTO_PAGE_SIZE_ID) {
        return getPageSize({
            pageSizeId: pageSizeId || profile.defaultPageSizeId,
            orientation: nextOrientation
        });
    }

    const targetScale = profile.id === 'vector-map' ? 0.88 : 0.62;
    const candidates = AUTO_FIT_PAGE_SIZE_IDS.map((id) =>
        getPageSize({ pageSizeId: id, orientation: nextOrientation })
    );
    const readable = candidates.find((pageSize) =>
        estimateDiagramScale(data.nodes, pageSize, { data, profile, options }) >= targetScale
    );
    return readable || candidates[candidates.length - 1] || getPageSize({
        pageSizeId: profile.defaultPageSizeId,
        orientation: nextOrientation
    });
};

const shouldDrawTitleBlock = (context, section = {}) =>
    context.options.includeTitleBlock !== undefined
        ? context.options.includeTitleBlock
        : section.titleBlock || context.profile.id === 'review-sheet';

const shouldDrawNotesPanel = (context, section = {}) =>
    context.options.includeNotesPanel !== undefined
        ? context.options.includeNotesPanel
        : section.notesPanel || context.profile.id === 'review-sheet';

const shouldDrawOutlinePanel = (context, section = {}) =>
    context.options.includeOutlinePanel !== undefined
        ? context.options.includeOutlinePanel
        : section.outlinePanel || context.profile.id === 'map-outline';

const drawOutlinePanel = (doc, context, box) => {
    setColor(doc, 'setFillColor', '#ffffff');
    setColor(doc, 'setDrawColor', COLORS.faint);
    doc.roundedRect(box.x, box.y, box.width, box.height, 4, 4, 'FD');
    setColor(doc, 'setTextColor', COLORS.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Outline', box.x + 12, box.y + 18);

    const rows = context.data.outlineRows.slice(0, Math.max(4, Math.floor((box.height - 42) / 26)));
    let y = box.y + 38;
    rows.forEach((row) => {
        const indent = Math.min(row.depth || 0, 4) * 8;
        setColor(doc, 'setTextColor', row.depth === 0 ? COLORS.ink : COLORS.muted);
        doc.setFont('helvetica', row.depth <= 1 ? 'bold' : 'normal');
        doc.setFontSize(row.depth <= 1 ? 8.3 : 7.5);
        const prefix = row.number ? `${row.number} ` : '';
        const lines = wrapped(doc, `${prefix}${row.title}`, box.width - 24 - indent).slice(0, 2);
        doc.text(lines, box.x + 12 + indent, y);
        y += Math.max(18, lines.length * 9 + 5);
    });

    if (context.data.outlineRows.length > rows.length) {
        setColor(doc, 'setTextColor', COLORS.muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(
            `+ ${context.data.outlineRows.length - rows.length} more on outline page`,
            box.x + 12,
            box.y + box.height - 12
        );
    }
};

const drawNotesPanel = (doc, context, box) => {
    setColor(doc, 'setFillColor', '#ffffff');
    setColor(doc, 'setDrawColor', COLORS.faint);
    doc.roundedRect(box.x, box.y, box.width, box.height, 4, 4, 'FD');
    setColor(doc, 'setTextColor', COLORS.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Markup / Decisions', box.x + 12, box.y + 18);

    setColor(doc, 'setDrawColor', '#d1d5db');
    doc.setLineWidth(0.5);
    const rowGap = 28;
    for (let y = box.y + 42; y < box.y + box.height - 16; y += rowGap) {
        doc.line(box.x + 12, y, box.x + box.width - 12, y);
    }

    const prompts = ['Decision', 'Owner', 'Due', 'Open question'];
    setColor(doc, 'setTextColor', COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    prompts.forEach((prompt, index) => {
        const y = box.y + box.height - 62 + index * 13;
        if (y < box.y + box.height - 10) {
            doc.text(`${prompt}:`, box.x + 12, y);
        }
    });
};

const titleBlockFields = (context) => {
    const { options, data, pageSize } = context;
    return [
        ['Project', options.projectName || data.flowName],
        ['Audience', options.preparedFor || data.workspaceBrief?.audience || 'Team review'],
        ['Revision', options.revision || 'Draft'],
        ['Date', options.issueDate || todayLabel()],
        ['Sheet', `${pageSize.label || pageSize.id} ${pageSize.orientation}`],
        ['Packet', context.profile.label]
    ];
};

const drawTitleBlock = (doc, context, box) => {
    setColor(doc, 'setFillColor', '#ffffff');
    setColor(doc, 'setDrawColor', COLORS.ink);
    doc.setLineWidth(0.9);
    doc.rect(box.x, box.y, box.width, box.height, 'FD');

    const leftWidth = Math.max(box.width * 0.42, 240);
    setColor(doc, 'setDrawColor', COLORS.faint);
    doc.line(box.x + leftWidth, box.y, box.x + leftWidth, box.y + box.height);

    setColor(doc, 'setTextColor', COLORS.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(wrapped(doc, context.data.flowName, leftWidth - 24).slice(0, 2), box.x + 12, box.y + 18);
    setColor(doc, 'setTextColor', COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('TraceSpace PDF Studio', box.x + 12, box.y + box.height - 12);

    const fields = titleBlockFields(context);
    const cellWidth = (box.width - leftWidth) / 3;
    const cellHeight = box.height / 2;
    fields.forEach(([label, value], index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        const x = box.x + leftWidth + col * cellWidth;
        const y = box.y + row * cellHeight;
        setColor(doc, 'setDrawColor', COLORS.faint);
        doc.rect(x, y, cellWidth, cellHeight);
        setColor(doc, 'setTextColor', COLORS.muted);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.text(label.toUpperCase(), x + 8, y + 12);
        setColor(doc, 'setTextColor', COLORS.ink);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(wrapped(doc, value, cellWidth - 16).slice(0, 2), x + 8, y + 26);
    });
};

const drawDiagram = (doc, context, section) => {
    addPage(doc, context);
    let y = sectionTitle(doc, section.title || 'Map');
    const { pageSize, data } = context;
    const hasTitleBlock = shouldDrawTitleBlock(context, section);
    const hasNotesPanel = shouldDrawNotesPanel(context, section);
    const hasOutlinePanel = shouldDrawOutlinePanel(context, section) && data.outlineRows.length > 0;
    const sidePanelWidth = sidePanelWidthFor({
        pageSize,
        data,
        profile: context.profile,
        options: context.options,
        section
    });
    const gutter = sidePanelWidth > 0 ? 14 : 0;
    const titleBlockHeight = hasTitleBlock ? TITLE_BLOCK_HEIGHT : 0;
    const box = {
        x: MARGINS.left,
        y,
        width: Math.max(260, pageSize.width - MARGINS.left - MARGINS.right - sidePanelWidth - gutter),
        height: Math.max(240, pageSize.height - y - MARGINS.bottom - 12 - titleBlockHeight)
    };
    const sidePanelBox = {
        x: box.x + box.width + gutter,
        y: box.y,
        width: sidePanelWidth,
        height: box.height
    };
    const titleBlockBox = {
        x: MARGINS.left,
        y: box.y + box.height + 12,
        width: pageSize.width - MARGINS.left - MARGINS.right,
        height: titleBlockHeight
    };

    setColor(doc, 'setDrawColor', COLORS.faint);
    setColor(doc, 'setFillColor', COLORS.panel);
    doc.roundedRect(box.x, box.y, box.width, box.height, 6, 6, 'FD');

    if (!data.nodes.length) {
        setColor(doc, 'setTextColor', COLORS.muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.text('No visible nodes to export.', box.x + 20, box.y + 34);
        return;
    }

    const density = diagramDensityFor(context.options.diagramDensity);
    const diagramNodes = compactDiagramNodes(data.nodes, density.id);
    const toPage = transformForDiagram(
        diagramNodes,
        {
            x: box.x + density.padding,
            y: box.y + density.padding,
            width: box.width - density.padding * 2,
            height: box.height - density.padding * 2
        },
        context.options
    );
    const nodeById = new Map(diagramNodes.map((node) => [node.id, node]));

    data.edges.forEach((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) {
            return;
        }
        const anchors = edgeAnchors(source, target);
        const from = toPage(anchors.from);
        const to = toPage(anchors.to);
        const tone = edgeTone(edge);
        const lineWidth = isHierarchyEdge(edge) ? 0.8 : 1.1;
        setColor(doc, 'setDrawColor', tone.stroke);
        setColor(doc, 'setFillColor', tone.fill);
        doc.setLineWidth(Math.max(0.45, lineWidth * from.scale));
        doc.setLineDashPattern(tone.dash.map((value) => value * from.scale), 0);
        if (anchors.orientation === 'horizontal') {
            const midX = from.x + (to.x - from.x) / 2;
            doc.lines(
                [
                    [midX - from.x, 0],
                    [0, to.y - from.y],
                    [to.x - midX, 0]
                ],
                from.x,
                from.y
            );
        } else {
            const midY = from.y + (to.y - from.y) / 2;
            doc.lines(
                [
                    [0, midY - from.y],
                    [to.x - from.x, 0],
                    [0, to.y - midY]
                ],
                from.x,
                from.y
            );
        }
        doc.setLineDashPattern([], 0);
        drawArrowHead(doc, to.x, to.y, anchors.targetSide, Math.max(3.5, 5 * from.scale), tone.fill);

        const label = edgeLabel(edge);
        if (label) {
            const labelX = from.x + (to.x - from.x) / 2;
            const labelY = from.y + (to.y - from.y) / 2 - 4;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(Math.max(5.8, Math.min(8, 8 * from.scale)));
            const text = label.slice(0, 28);
            const labelWidth = Math.min(110, doc.getTextWidth(text) + 12);
            setColor(doc, 'setFillColor', tone.labelFill);
            setColor(doc, 'setDrawColor', tone.stroke);
            doc.roundedRect(labelX - labelWidth / 2, labelY - 10, labelWidth, 15, 7, 7, 'FD');
            setColor(doc, 'setTextColor', tone.stroke);
            doc.text(text, labelX, labelY + 1, { align: 'center' });
        }
    });

    diagramNodes.forEach((node) => {
        const point = toPage(node.position);
        const scale = point.scale;
        const size = nodeSize(node);
        const width = size.width * scale;
        const height = size.height * scale;
        const colors = nodeColors(node);
        setColor(doc, 'setFillColor', colors.fill);
        setColor(doc, 'setDrawColor', colors.stroke);
        doc.setLineWidth(1);
        doc.roundedRect(point.x, point.y, width, height, 5, 5, 'FD');
        setColor(doc, 'setTextColor', COLORS.ink);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(Math.max(7, Math.min(10, 10 * scale)));
        doc.text(wrapped(doc, node.title, width - 14).slice(0, 2), point.x + 7, point.y + 15);
        setColor(doc, 'setTextColor', COLORS.muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(Math.max(6, Math.min(8, 8 * scale)));
        const meta = [node.nodeType, node.status, node.sourceRefs?.length ? 'sourced' : ''].filter(Boolean).join(' | ');
        doc.text(wrapped(doc, meta, width - 14).slice(0, 1), point.x + 7, point.y + height - 8);
    });

    if (hasOutlinePanel && hasNotesPanel) {
        const splitHeight = Math.floor((sidePanelBox.height - 12) * 0.55);
        drawOutlinePanel(doc, context, {
            ...sidePanelBox,
            height: splitHeight
        });
        drawNotesPanel(doc, context, {
            x: sidePanelBox.x,
            y: sidePanelBox.y + splitHeight + 12,
            width: sidePanelBox.width,
            height: sidePanelBox.height - splitHeight - 12
        });
    } else if (hasOutlinePanel) {
        drawOutlinePanel(doc, context, sidePanelBox);
    } else if (hasNotesPanel) {
        drawNotesPanel(doc, context, sidePanelBox);
    }
    if (hasTitleBlock) {
        drawTitleBlock(doc, context, titleBlockBox);
    }
};

const drawTitle = (doc, context) => {
    addPage(doc, context);
    const { data, profile } = context;
    let y = MARGINS.top + 18;
    setColor(doc, 'setTextColor', COLORS.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text(wrapped(doc, data.flowName, context.pageSize.width - MARGINS.left - MARGINS.right), MARGINS.left, y);
    y += 42;
    setColor(doc, 'setTextColor', COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(profile.description, MARGINS.left, y);
    y += 30;

    const briefLines = [
        ['Goal', data.workspaceBrief?.goal],
        ['Audience', data.workspaceBrief?.audience],
        ['Source mode', data.workspaceBrief?.source_mode],
        ['Map style', data.mapStyle]
    ].filter(([, value]) => cleanText(value));

    briefLines.forEach(([label, value]) => {
        setColor(doc, 'setTextColor', COLORS.muted);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(label.toUpperCase(), MARGINS.left, y);
        setColor(doc, 'setTextColor', COLORS.ink);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        const lines = wrapped(doc, value, context.pageSize.width - MARGINS.left - MARGINS.right - 120);
        doc.text(lines, MARGINS.left + 110, y);
        y += Math.max(22, lines.length * 13);
    });

    y += 16;
    [
        ['Nodes', data.stats.nodeCount],
        ['Edges', data.stats.edgeCount],
        ['Tasks', data.stats.taskCount],
        ['Review items', data.stats.reviewCount],
        ['Source-backed', data.stats.sourceBackedCount]
    ].forEach(([label, value]) => {
        const width = 110;
        setColor(doc, 'setFillColor', COLORS.panel);
        setColor(doc, 'setDrawColor', COLORS.faint);
        doc.roundedRect(MARGINS.left, y, width, 54, 6, 6, 'FD');
        setColor(doc, 'setTextColor', COLORS.ink);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text(String(value), MARGINS.left + 12, y + 24);
        setColor(doc, 'setTextColor', COLORS.muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(label, MARGINS.left + 12, y + 42);
        y += 66;
    });
};

const ensureTableSpace = (doc, context, y, needed = 28, title = '') => {
    if (y + needed <= context.pageSize.height - MARGINS.bottom) {
        return y;
    }
    addPage(doc, context);
    return title ? sectionTitle(doc, title) : MARGINS.top;
};

const drawTable = (doc, context, { title, columns, rows, emptyText }) => {
    addPage(doc, context);
    let y = sectionTitle(doc, title);
    const fullWidth = context.pageSize.width - MARGINS.left - MARGINS.right;
    const totalWeight = columns.reduce((sum, column) => sum + (column.weight || 1), 0);
    const columnWidths = columns.map((column) => (fullWidth * (column.weight || 1)) / totalWeight);

    if (!rows.length) {
        setColor(doc, 'setTextColor', COLORS.muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(emptyText || 'No rows to export.', MARGINS.left, y + 6);
        return;
    }

    const drawHeader = () => {
        let x = MARGINS.left;
        setColor(doc, 'setFillColor', COLORS.panel);
        setColor(doc, 'setDrawColor', COLORS.faint);
        doc.rect(MARGINS.left, y - 14, fullWidth, 22, 'FD');
        columns.forEach((column, index) => {
            setColor(doc, 'setTextColor', COLORS.ink);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text(column.label, x + 4, y);
            x += columnWidths[index];
        });
        y += 18;
    };

    drawHeader();
    rows.forEach((row) => {
        const cellLines = columns.map((column, index) =>
            wrapped(doc, column.value(row), columnWidths[index] - 8).slice(0, 4)
        );
        const rowHeight = Math.max(24, Math.max(...cellLines.map((lines) => lines.length)) * 10 + 10);
        y = ensureTableSpace(doc, context, y, rowHeight + 10, title);
        if (y === MARGINS.top + 30) {
            drawHeader();
        }
        let x = MARGINS.left;
        setColor(doc, 'setDrawColor', COLORS.faint);
        doc.line(MARGINS.left, y - 10, MARGINS.left + fullWidth, y - 10);
        columns.forEach((column, index) => {
            setColor(doc, 'setTextColor', column.color?.(row) || COLORS.ink);
            doc.setFont('helvetica', index === 0 ? 'bold' : 'normal');
            doc.setFontSize(8.5);
            doc.text(cellLines[index], x + 4, y);
            x += columnWidths[index];
        });
        y += rowHeight;
    });
};

const drawOutline = (doc, context, section) =>
    drawTable(doc, context, {
        title: section.title || 'Outline',
        emptyText: 'No outline rows to export.',
        rows: context.data.outlineRows,
        columns: [
            { label: '#', weight: 0.5, value: (row) => row.number },
            { label: 'Title', weight: 2.4, value: (row) => `${'  '.repeat(row.depth)}${row.title}` },
            { label: 'Summary', weight: 3, value: (row) => row.summary },
            { label: 'Type', weight: 0.9, value: (row) => row.nodeType },
            { label: 'Sources', weight: 0.7, value: (row) => String(row.sourceCount || 0) }
        ]
    });

const drawTasks = (doc, context, section) =>
    drawTable(doc, context, {
        title: section.title || 'Tasks',
        emptyText: 'No task nodes were found.',
        rows: context.data.taskRows,
        columns: [
            { label: 'Task', weight: 2.5, value: (row) => row.title },
            { label: 'Owner', weight: 1, value: (row) => row.owner || 'Unassigned' },
            { label: 'Due', weight: 0.9, value: (row) => row.dueDate || 'TBD' },
            { label: 'Priority', weight: 0.8, value: (row) => row.priority || '-' },
            { label: 'Status', weight: 1, value: (row) => row.status || 'needs_review' },
            { label: 'Notes', weight: 2, value: (row) => row.summary }
        ]
    });

const drawReview = (doc, context, section) =>
    drawTable(doc, context, {
        title: section.title || 'Review Items',
        emptyText: 'No review items were found.',
        rows: context.data.reviewRows,
        columns: [
            { label: 'Item', weight: 2.2, value: (row) => row.title },
            { label: 'Reasons', weight: 1.8, value: (row) => row.reasons.join(', '), color: () => COLORS.review },
            { label: 'Owner', weight: 0.9, value: (row) => row.owner || '-' },
            { label: 'Confidence', weight: 0.9, value: (row) => row.confidence || '-' },
            { label: 'Summary', weight: 2.5, value: (row) => row.summary }
        ]
    });

const drawLegend = (doc, context, section) => {
    addPage(doc, context);
    let y = sectionTitle(doc, section.title || 'Legend');
    [
        ['Source-backed node', COLORS.source, COLORS.sourceSoft],
        ['Task or workflow node', COLORS.task, COLORS.taskSoft],
        ['Needs review item', COLORS.review, COLORS.reviewSoft],
        ['Hierarchy edge', '#94a3b8', '#ffffff']
    ].forEach(([label, stroke, fill]) => {
        setColor(doc, 'setFillColor', fill);
        setColor(doc, 'setDrawColor', stroke);
        doc.roundedRect(MARGINS.left, y, 42, 22, 4, 4, 'FD');
        setColor(doc, 'setTextColor', COLORS.ink);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(label, MARGINS.left + 56, y + 15);
        y += 36;
    });

    y += 12;
    drawPill(doc, `${context.data.stats.nodeCount} nodes`, MARGINS.left, y, COLORS.ink, COLORS.panel);
    drawPill(doc, `${context.data.edges.filter(isHierarchyEdge).length} hierarchy edges`, MARGINS.left + 100, y, COLORS.ink, COLORS.panel);
};

const SECTION_RENDERERS = {
    title: drawTitle,
    diagram: drawDiagram,
    outline: drawOutline,
    tasks: drawTasks,
    review: drawReview,
    legend: drawLegend
};

const readabilityForScale = (scale) => {
    if (scale >= 0.85) {
        return {
            level: 'good',
            label: 'Good for plotter',
            detail: 'Diagram labels should remain comfortable on the selected sheet.'
        };
    }
    if (scale >= 0.6) {
        return {
            level: 'ok',
            label: 'Readable',
            detail: 'Usable for review; choose a larger sheet for more breathing room.'
        };
    }
    if (scale >= 0.42) {
        return {
            level: 'tight',
            label: 'Text may be small',
            detail: 'Consider Auto fit, ARCH D, ARCH E, or removing side panels.'
        };
    }
    return {
        level: 'poor',
        label: 'Too compressed',
        detail: 'Use a larger sheet or split the map before sharing.'
    };
};

const estimateRowsPerPage = (pageSize) =>
    Math.max(8, Math.floor((pageSize.height - MARGINS.top - MARGINS.bottom - 60) / 34));

const estimateSectionPages = ({ section, data, pageSize }) => {
    if (section.type === 'outline') {
        return Math.max(1, Math.ceil(data.outlineRows.length / estimateRowsPerPage(pageSize)));
    }
    if (section.type === 'tasks') {
        return Math.max(1, Math.ceil(data.taskRows.length / estimateRowsPerPage(pageSize)));
    }
    if (section.type === 'review') {
        return Math.max(1, Math.ceil(data.reviewRows.length / estimateRowsPerPage(pageSize)));
    }
    return 1;
};

export const getPdfExportPreview = ({
    profileId = 'vector-map',
    pageSizeId,
    orientation,
    nodes = [],
    edges = [],
    flowName = '',
    mapStyle = '',
    workspaceBrief = {},
    options = {}
} = {}) => {
    const profile = getPdfExportProfile(profileId);
    const data = projectPdfExportData({ nodes, edges, flowName, mapStyle, workspaceBrief });
    const pageSize = resolvePageSize({ pageSizeId, orientation, profile, data, options });
    const diagramScale = estimateDiagramScale(data.nodes, pageSize, { data, profile, options });
    const pageCount = profile.sections.reduce(
        (total, section) => total + estimateSectionPages({ section, data, pageSize }),
        0
    );
    return {
        profile,
        pageSize,
        data,
        pageCount,
        diagramScale,
        readability: readabilityForScale(diagramScale),
        autoFitUsed: pageSizeId === AUTO_PAGE_SIZE_ID
    };
};

export const buildPdfExportDocument = async ({
    profileId = 'vector-map',
    pageSizeId,
    orientation,
    nodes = [],
    edges = [],
    flowName = '',
    mapStyle = '',
    workspaceBrief = {},
    options = {}
} = {}) => {
    const profile = getPdfExportProfile(profileId);
    const data = projectPdfExportData({ nodes, edges, flowName, mapStyle, workspaceBrief });
    const pageSize = resolvePageSize({ pageSizeId, orientation, profile, data, options });
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({
        orientation: pageSize.orientation,
        unit: 'pt',
        format: [pageSize.width, pageSize.height],
        compress: true
    });
    const context = { pageSize, profile, data, options };

    profile.sections.forEach((section) => {
        const renderSection = SECTION_RENDERERS[section.type];
        if (renderSection) {
            renderSection(doc, context, section);
        }
    });

    const filename = `${safeFilename(data.flowName)}-${profile.id}.pdf`;
    const pageCount = doc.internal.getNumberOfPages();
    return { doc, filename, profile, pageSize, data, pageCount };
};

export const downloadPdfExport = async (options = {}) => {
    const result = await buildPdfExportDocument(options);
    const { doc, ...metadata } = result;
    doc.save(result.filename);
    return metadata;
};

export const getAutoFitPageSizeCandidates = () =>
    AUTO_FIT_PAGE_SIZE_IDS.map((id) => PAGE_SIZE_PRESETS[id]).filter(Boolean);
