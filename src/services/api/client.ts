export type AnalysisStatus =
  | 'queued'
  | 'validating'
  | 'analyzing'
  | 'enriching'
  | 'completed'
  | 'failed';

export type AnalysisItem = {
  id: string;
  filename: string;
  file_size: number;
  sha256: string;
  status: AnalysisStatus;
  progress_message: string;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  report?: Record<string, unknown> | null;
};

export type UploadResponse = {
  id: string;
  filename: string;
  size: number;
  sha256: string;
  status: AnalysisStatus;
};

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

export async function fetchAnalyses(baseUrl: string, token = ''): Promise<AnalysisItem[]> {
  const response = await fetch(endpoint(baseUrl, '/v1/analyses'), {
    headers: token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {},
  });
  if (!response.ok) {
    throw new Error(`Gagal mengambil riwayat (${response.status})`);
  }
  return (await response.json()) as AnalysisItem[];
}

export async function fetchAnalysis(
  baseUrl: string,
  id: string,
  token = '',
): Promise<AnalysisItem> {
  const response = await fetch(endpoint(baseUrl, `/v1/analyses/${id}`), {
    headers: token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {},
  });
  if (!response.ok) {
    throw new Error(`Gagal mengambil detail analisis (${response.status})`);
  }
  return (await response.json()) as AnalysisItem;
}

export function uploadUrl(baseUrl: string): string {
  return endpoint(baseUrl, '/v1/analyses');
}
