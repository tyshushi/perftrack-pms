import * as XLSX from 'xlsx';

const HEADERS = [
  'Employee ID',
  'Full Name',
  'Email',
  'Department',
  'Division',
  'Section',
  'Position',
  'Grade',
  'Category',
  'Employee Type',
  'Country',
  'Work Location',
  'Hire Date',
  'Gender',
  'Direct Manager',
  'Reviewing Manager',
  'HOD',
  'Scorecard Status',
  'Is Late',
  'KPI Count',
  'Self Rating',
  'Manager Rating',
  'Financials %',
  'Customer %',
  'Internal Process %',
  'Learning & Growth %',
  'Leadership & Culture %',
];

export function generateCycleReport(data: any[], cycleName: string, cycleYear: number): void {
  const wb = XLSX.utils.book_new();

  const rows: any[][] = [HEADERS];

  for (const emp of data) {
    rows.push([
      emp.employee_id ?? '',
      emp.full_name ?? '',
      emp.email ?? '',
      emp.department_name ?? '',
      emp.division ?? '',
      emp.section ?? '',
      emp.position_title ?? '',
      emp.job_grade ?? '',
      emp.category ?? '',
      emp.employee_type ?? '',
      emp.country ?? '',
      emp.work_location ?? '',
      emp.hire_date ?? '',
      emp.gender ?? '',
      emp.direct_manager ?? '',
      emp.reviewing_manager ?? '',
      emp.hod ?? '',
      emp.scorecard_status ?? '',
      emp.is_late ? 'Yes' : 'No',
      emp.kpi_count ?? 0,
      emp.self_rating != null ? Number(emp.self_rating.toFixed(4)) : '',
      emp.mgr_rating != null ? Number(emp.mgr_rating.toFixed(4)) : '',
      emp.fin_weight ?? 0,
      emp.cust_weight ?? 0,
      emp.ip_weight ?? 0,
      emp.lg_weight ?? 0,
      emp.lc_weight ?? 0,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Header styling: bold, dark background (#1a1a1a), white text
  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1A1A1A' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: false },
  };

  HEADERS.forEach((_, colIdx) => {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (ws[cellAddr]) {
      ws[cellAddr].s = headerStyle;
    }
  });

  // Auto column widths based on content
  const colWidths = HEADERS.map((header, colIdx) => {
    let maxLen = header.length;
    for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
      const val = rows[rowIdx][colIdx];
      const len = val != null ? String(val).length : 0;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(maxLen + 2, 50) };
  });
  ws['!cols'] = colWidths;

  // Freeze the top header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };

  XLSX.utils.book_append_sheet(wb, ws, 'Scorecard Report');

  const safeName = cycleName.replace(/[/\\?%*:|"<>]/g, '_');
  XLSX.writeFile(wb, `${safeName}_${cycleYear}_scorecard_report.xlsx`);
}
