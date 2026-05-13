import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';

async function loadLogoAsDataUrl(): Promise<string | null> {
  try {
    const response = await fetch('/perftrack-pms/valiram-logo.jpg');
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

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

export async function generateScorecardPDF(data: ScorecardData): Promise<Blob> {
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
  const logoDataUrl = await loadLogoAsDataUrl();
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'JPEG', marginL, 11, logoWidth, logoHeight);
  }

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
    const pdfBlob = await generateScorecardPDF(item);
    const code = (item.employee.employee_code || item.employee.full_name.replace(/\s+/g, '_')).replace(/[^a-zA-Z0-9_-]/g, '');
    zip.file(`${code}_scorecard_${item.cycle.year}.pdf`, pdfBlob);
  }
  return zip.generateAsync({ type: 'blob' });
}
