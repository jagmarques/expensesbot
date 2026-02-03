export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface ExportRequest {
  userId: string;
  format: 'csv' | 'pdf';
  dateRange?: DateRange;
  includeCategories?: string[];
}

export interface ExportResult {
  success: boolean;
  format: string;
  fileName?: string;
  message: string;
  data?: Buffer | string;
}
