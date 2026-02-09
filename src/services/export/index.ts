import { ExportRequest, ExportResult } from '../../types/export';
import { exportToCSV } from './csv';
import { exportToPDF } from './pdf';

export async function handleExport(request: ExportRequest): Promise<ExportResult> {
  try {
    const { userId, format, dateRange } = request;

    const startDate = dateRange?.startDate;
    const endDate = dateRange?.endDate;

    if (format === 'csv') {
      const csvContent = exportToCSV(userId, startDate, endDate);
      const fileName = `expenses_${new Date().toISOString().split('T')[0]}.csv`;

      return {
        success: true,
        format: 'csv',
        fileName,
        message: `CSV export ready: ${fileName}`,
        data: csvContent,
      };
    } else if (format === 'pdf') {
      const pdfBuffer = await exportToPDF(userId, startDate, endDate);
      const fileName = `expenses_report_${new Date().toISOString().split('T')[0]}.pdf`;

      return {
        success: true,
        format: 'pdf',
        fileName,
        message: `PDF export ready: ${fileName}`,
        data: pdfBuffer,
      };
    } else {
      return {
        success: false,
        format: request.format,
        message: `Unsupported export format: ${request.format}`,
      };
    }
  } catch (error: any) {
    console.error('[Export] Error:', error.message);
    return {
      success: false,
      format: request.format,
      message: `Export failed: ${error.message}`,
    };
  }
}

export { exportToCSV } from './csv';
export { exportToPDF } from './pdf';
