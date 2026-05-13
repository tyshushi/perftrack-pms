import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';

const VALIRAM_LOGO_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCADUASwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAK5rxX8SvCvgWeCDxB4h03Rpp1LxRXty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";

export interface EmployeeInfo {
  full_name: string;
  employee_code?: string;
  position_title?: string;
  department_name?: string;
}

export interface CycleInfo {
  name: string;
  year: number;
  rating_type: string;
  rating_scale_max?: number;
  rating_levels?: Array<{ value: any; label: string; description?: string }>;
}

export interface KpiData {
  id: string;
  name: string;
  kpi_dimension: string;
  weight: number;
  status: string;
  is_late?: boolean;
  actual_achievement?: string;
  self_rating?: any;
  self_remarks?: string;
  mgr_score?: any;
  mgr_comment?: string;
  rating_targets?: Array<{ value: any; label: string; target: string }>;
}

export interface ScorecardData {
  employee: EmployeeInfo;
  cycle: CycleInfo;
  kpis: KpiData[];
}

function getRatingLabel(value: any, cycle: CycleInfo): string {
  const levels = cycle.rating_levels || [];
  if (cycle.rating_type === 'NUMERIC') {
    const lv = levels.find(l => Number(l.value) === Number(value));
    return lv?.label || '';
  }
  const lv = levels.find((l: any) => l.value === value);
  return lv?.label || (typeof value === 'string' ? value : '');
}

function calcWeightedScore(mgrScore: any, weight: number, cycle: CycleInfo): number {
  const scaleMax = cycle.rating_scale_max || 5;
  if (cycle.rating_type === 'NUMERIC') {
    return (Number(mgrScore) / scaleMax) * weight;
  }
  if (cycle.rating_type === 'MET_NOT_MET') {
    return (mgrScore === 'Met' ? 1 : 0) * weight;
  }
  return (Number(mgrScore) / 100) * weight;
}

function addFooter(doc: jsPDF, pageNum: number, totalPages: number, generatedDate: string) {
  const pageWidth = 210;
  const pageHeight = 297;
  doc.setFontSize(7.5);
  doc.setTextColor(160, 160, 160);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'This is a computer-generated document. No signature is required.',
    pageWidth / 2, pageHeight - 8,
    { align: 'center' }
  );
  doc.text(
    `Page ${pageNum} of ${totalPages} | Generated: ${generatedDate}`,
    pageWidth / 2, pageHeight - 4,
    { align: 'center' }
  );
}

export function generateScorecardPDF(data: ScorecardData): Blob {
  const { employee, cycle, kpis } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginL = 14;
  const marginR = 14;

  const generatedDate = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // --- HEADER ---
  const logoHeight = 15;
  const logoWidth = logoHeight * (300 / 212);
  doc.addImage('data:image/jpeg;base64,' + VALIRAM_LOGO_B64, 'JPEG', marginL, 11, logoWidth, logoHeight);

  const titleX = marginL + logoWidth + 6;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 26, 26);
  doc.text(`Performance Scorecard ${cycle.year}`, titleX, 19);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 107, 107);
  doc.text('PerformRight by Valiram', titleX, 27);

  doc.setDrawColor(220, 220, 214);
  doc.setLineWidth(0.4);
  doc.line(marginL, 37, pageWidth - marginR, 37);

  let currentY = 43;

  // --- EMPLOYEE INFO ---
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(3, 105, 161);
  doc.text('Employee Information', marginL, currentY);
  currentY += 3;

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginL, right: marginR },
    body: [
      ['Name', employee.full_name || '—'],
      ['Employee Code', employee.employee_code || '—'],
      ['Position', employee.position_title || '—'],
      ['Department', employee.department_name || '—'],
      ['Cycle', cycle.name],
      ['Generated Date', generatedDate],
    ],
    styles: { fontSize: 9, cellPadding: 3.5, textColor: [26, 26, 26] },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [247, 247, 245] as [number, number, number], cellWidth: 48 },
      1: { fillColor: [255, 255, 255] as [number, number, number] },
    },
    theme: 'grid',
    tableLineColor: [220, 220, 214] as [number, number, number],
    tableLineWidth: 0.3,
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // --- RATING FRAMEWORK ---
  const levels = cycle.rating_levels || [];
  if (levels.length > 0) {
    if (currentY > pageHeight - 60) { doc.addPage(); currentY = 18; }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(3, 105, 161);
    doc.text('Rating Framework', marginL, currentY);
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      margin: { left: marginL, right: marginR },
      head: [['Value', 'Label', 'Description']],
      body: levels.map((lv: any) => [String(lv.value), lv.label || '—', lv.description || '—']),
      styles: { fontSize: 8.5, cellPadding: 3, textColor: [26, 26, 26] },
      headStyles: { fillColor: [26, 26, 26] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [247, 247, 245] as [number, number, number] },
      theme: 'grid',
      tableLineColor: [220, 220, 214] as [number, number, number],
      tableLineWidth: 0.3,
      columnStyles: { 0: { cellWidth: 18, halign: 'center' }, 1: { cellWidth: 48 } },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // --- KPI SUMMARY ---
  if (currentY > pageHeight - 60) { doc.addPage(); currentY = 18; }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(3, 105, 161);
  doc.text('KPI Summary', marginL, currentY);
  currentY += 3;

  let totalWeightedScore = 0;
  let hasAnyMgrScore = false;

  const kpiRows = kpis.map((kpi, idx) => {
    const selfLabel = kpi.self_rating != null
      ? (() => { const l = getRatingLabel(kpi.self_rating, cycle); return l ? `${kpi.self_rating} — ${l}` : String(kpi.self_rating); })()
      : '—';
    const mgrLabel = kpi.mgr_score != null
      ? (() => { const l = getRatingLabel(kpi.mgr_score, cycle); return l ? `${kpi.mgr_score} — ${l}` : String(kpi.mgr_score); })()
      : '—';

    let weightedStr = '—';
    if (kpi.mgr_score != null) {
      const ws = calcWeightedScore(kpi.mgr_score, kpi.weight, cycle);
      totalWeightedScore += ws;
      hasAnyMgrScore = true;
      weightedStr = ws.toFixed(2);
    }

    return [
      String(idx + 1),
      kpi.name + (kpi.is_late ? ' (Late)' : ''),
      kpi.kpi_dimension,
      `${kpi.weight}%`,
      selfLabel,
      mgrLabel,
      weightedStr,
    ];
  });

  const totalWeight = kpis.reduce((s, k) => s + k.weight, 0);
  const totalRow = ['', 'Total', '', `${totalWeight}%`, '', '', hasAnyMgrScore ? totalWeightedScore.toFixed(2) : '—'];

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginL, right: marginR },
    head: [['No', 'KPI Name', 'Dimension', 'Weight%', 'Self Rating', 'Mgr Rating', 'Weighted Score']],
    body: [...kpiRows, totalRow],
    styles: { fontSize: 8, cellPadding: 2.8, textColor: [26, 26, 26] },
    headStyles: { fillColor: [26, 26, 26] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [247, 247, 245] as [number, number, number] },
    theme: 'grid',
    tableLineColor: [220, 220, 214] as [number, number, number],
    tableLineWidth: 0.3,
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' as const },
      3: { cellWidth: 16, halign: 'center' as const },
      4: { cellWidth: 26 },
      5: { cellWidth: 26 },
      6: { cellWidth: 22, halign: 'right' as const },
    },
    didParseCell: (hookData: any) => {
      if (hookData.row.index === kpiRows.length) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [235, 235, 242];
      }
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // --- SELF EVALUATION ---
  const selfEvalKpis = kpis.filter(k => k.actual_achievement || k.self_rating != null || k.self_remarks);
  if (selfEvalKpis.length > 0) {
    if (currentY > pageHeight - 50) { doc.addPage(); currentY = 18; }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(3, 105, 161);
    doc.text('Self Evaluation', marginL, currentY);
    currentY += 5;

    for (const kpi of selfEvalKpis) {
      if (currentY > pageHeight - 44) { doc.addPage(); currentY = 18; }

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 26, 26);
      doc.text(kpi.name + (kpi.is_late ? ' (Late)' : ''), marginL, currentY);
      currentY += 4;

      const rows: string[][] = [];
      if (kpi.actual_achievement) rows.push(['Actual Achievement', kpi.actual_achievement]);
      if (kpi.self_rating != null) {
        const l = (cycle.rating_levels || []).find((r: any) => r.value === kpi.self_rating)?.label || getRatingLabel(kpi.self_rating, cycle);
        rows.push(['Self Rating', l ? `${kpi.self_rating} — ${l}` : String(kpi.self_rating)]);
      }
      if (kpi.self_remarks) rows.push(['Self Remarks', kpi.self_remarks]);

      if (rows.length > 0) {
        autoTable(doc, {
          startY: currentY,
          margin: { left: marginL, right: marginR },
          body: rows,
          styles: { fontSize: 8.5, cellPadding: 3, textColor: [26, 26, 26] },
          columnStyles: {
            0: { fontStyle: 'bold', fillColor: [247, 247, 245] as [number, number, number], cellWidth: 48 },
            1: { fillColor: [255, 255, 255] as [number, number, number] },
          },
          theme: 'grid',
          tableLineColor: [220, 220, 214] as [number, number, number],
          tableLineWidth: 0.3,
        });
        currentY = (doc as any).lastAutoTable.finalY + 5;
      }
    }
  }

  // --- MANAGER EVALUATION ---
  const mgrEvalKpis = kpis.filter(k => k.mgr_score != null || k.mgr_comment);
  if (mgrEvalKpis.length > 0) {
    if (currentY > pageHeight - 50) { doc.addPage(); currentY = 18; }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(3, 105, 161);
    doc.text('Manager Evaluation', marginL, currentY);
    currentY += 5;

    for (const kpi of mgrEvalKpis) {
      if (currentY > pageHeight - 44) { doc.addPage(); currentY = 18; }

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 26, 26);
      doc.text(kpi.name + (kpi.is_late ? ' (Late)' : ''), marginL, currentY);
      currentY += 4;

      const rows: string[][] = [];
      if (kpi.mgr_score != null) {
        const l = getRatingLabel(kpi.mgr_score, cycle);
        rows.push(['Manager Rating', l ? `${kpi.mgr_score} — ${l}` : String(kpi.mgr_score)]);
      }
      if (kpi.mgr_comment) rows.push(['Manager Comment', kpi.mgr_comment]);

      if (rows.length > 0) {
        autoTable(doc, {
          startY: currentY,
          margin: { left: marginL, right: marginR },
          body: rows,
          styles: { fontSize: 8.5, cellPadding: 3, textColor: [26, 26, 26] },
          columnStyles: {
            0: { fontStyle: 'bold', fillColor: [247, 247, 245] as [number, number, number], cellWidth: 48 },
            1: { fillColor: [255, 255, 255] as [number, number, number] },
          },
          theme: 'grid',
          tableLineColor: [220, 220, 214] as [number, number, number],
          tableLineWidth: 0.3,
        });
        currentY = (doc as any).lastAutoTable.finalY + 5;
      }
    }
  }

  // --- FOOTER on every page ---
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addFooter(doc, p, totalPages, generatedDate);
  }

  return doc.output('blob');
}

export async function generateScorecardZip(items: ScorecardData[]): Promise<Blob> {
  const zip = new JSZip();
  for (const item of items) {
    const pdfBlob = generateScorecardPDF(item);
    const code = (item.employee.employee_code || item.employee.full_name.replace(/\s+/g, '_')).replace(/[^a-zA-Z0-9_-]/g, '');
    zip.file(`${code}_scorecard_${item.cycle.year}.pdf`, pdfBlob);
  }
  return zip.generateAsync({ type: 'blob' });
}
