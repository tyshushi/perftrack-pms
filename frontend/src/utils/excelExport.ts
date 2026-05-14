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

const CUSTOM_REPORT_COLUMN_LABELS: Record<string, string> = {
  employee_id:               'Employee ID',
  full_name:                 'Full Name',
  email:                     'Email',
  department:                'Department',
  division:                  'Division',
  section:                   'Section',
  position_title:            'Position',
  job_grade:                 'Grade',
  category:                  'Category',
  employee_type:             'Employee Type',
  country:                   'Country',
  work_location:             'Work Location',
  hire_date:                 'Hire Date',
  gender:                    'Gender',
  direct_manager:            'Direct Manager',
  reviewing_manager:         'Reviewing Manager',
  hod:                       'HOD',
  cycle_name:                'Cycle',
  cycle_year:                'Year',
  scorecard_status:          'Scorecard Status',
  is_late:                   'Is Late',
  kpi_count:                 'KPI Count',
  self_rating_overall:       'Self Rating Overall',
  mgr_rating_overall:        'Manager Rating Overall',
  fin_weight:                'Financials %',
  cust_weight:               'Customer %',
  ip_weight:                 'Internal Process %',
  lg_weight:                 'Learning & Growth %',
  lc_weight:                 'Leadership & Culture %',
  kpi_name:                  'KPI Name',
  kpi_dimension:             'Dimension',
  kpi_weight:                'KPI Weight',
  kpi_measurement:           'Measurement',
  kpi_type:                  'KPI Type',
  rating_target_1:           'Rating Target 1',
  rating_target_2:           'Rating Target 2',
  rating_target_3:           'Rating Target 3',
  rating_target_4:           'Rating Target 4',
  rating_target_5:           'Rating Target 5',
  kpi_self_rating:           'Self Rating',
  kpi_self_rating_label:     'Self Rating Label',
  kpi_mgr_rating:            'Manager Rating',
  kpi_mgr_rating_label:      'Manager Rating Label',
  kpi_weighted_contribution: 'Weighted Contribution',
  kpi_actual_achievement:    'Actual Achievement',
  kpi_self_remarks:          'Self Remarks',
  kpi_mgr_comment:           'Manager Comment',
  kpi_status:                'KPI Status',
  kpi_is_late:               'KPI Is Late',
};

export function generateCustomReport(data: any[], columns: string[], filename: string): void {
  const wb = XLSX.utils.book_new();

  const headers = columns.map(c => CUSTOM_REPORT_COLUMN_LABELS[c] || c);
  const rows: any[][] = [headers];

  for (const record of data) {
    rows.push(
      columns.map(c => {
        const val = record[c];
        if (val === null || val === undefined) return '';
        if (typeof val === 'boolean') return val ? 'Yes' : 'No';
        return val;
      })
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1A1A1A' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: false },
  };

  headers.forEach((_, colIdx) => {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (ws[cellAddr]) ws[cellAddr].s = headerStyle;
  });

  const colWidths = headers.map((header, colIdx) => {
    let maxLen = header.length;
    for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
      const val = rows[rowIdx][colIdx];
      const len = val != null ? String(val).length : 0;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(maxLen + 2, 50) };
  });
  ws['!cols'] = colWidths;
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };

  XLSX.utils.book_append_sheet(wb, ws, 'Custom Report');
  XLSX.writeFile(wb, filename);
}

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
