export type AnalysisStatus = 'queued' | 'validating' | 'analyzing' | 'enriching' | 'completed' | 'failed';
export type DexSummary = { status: 'available' | 'partial' | 'failed' | 'unavailable'; dex_file_count: number; dex_files?: { name: string; class_count: number }[]; package_count: number; class_count: number; method_count: number; library_count: number; warnings: string[] };
export type AnalysisItem = { id: string; filename: string; file_size: number; sha256: string; status: AnalysisStatus; progress_message: string; error_message?: string | null; created_at: string; updated_at: string; report?: Record<string, unknown> | null; dex_summary?: DexSummary | null };
export type UploadResponse = { id: string; filename: string; size: number; sha256: string; status: AnalysisStatus };
export type Page<T> = { items: T[]; total: number; limit: number; offset: number };
export type DexPackage = { name: string; class_count: number; method_count: number };
export type DexClass = { name: string; package: string; dex_file: string; method_count: number };
export type DexMethod = { name: string; signature: string; kind: string; access_flags: number };
export type DexLibrary = { name: string; category: string; confidence: string; method: string; evidence_count: number; evidence: string[]; version: string | null };

function endpoint(baseUrl: string, path: string): string { return baseUrl.replace(/\/$/, '') + path; }
async function request<T>(baseUrl: string, path: string, token = ''): Promise<T> {
  const response = await fetch(endpoint(baseUrl, path), { headers: token.trim() ? { Authorization: 'Bearer ' + token.trim() } : {} });
  if (!response.ok) {
    let message = 'Permintaan gagal (' + response.status + ')';
    try { const body = await response.json() as { detail?: string }; if (body.detail) message = body.detail; } catch { /* Keep HTTP status message. */ }
    throw new Error(message);
  }
  return await response.json() as T;
}
export function fetchAnalyses(baseUrl: string, token = ''): Promise<AnalysisItem[]> { return request(baseUrl, '/v1/analyses', token); }
export function fetchAnalysis(baseUrl: string, id: string, token = ''): Promise<AnalysisItem> { return request(baseUrl, '/v1/analyses/' + encodeURIComponent(id), token); }
export function fetchDexSummary(baseUrl: string, id: string, token = ''): Promise<DexSummary> { return request(baseUrl, '/v1/analyses/' + encodeURIComponent(id) + '/dex', token); }
function pageParams(q: string, offset: number, limit: number): string { const p = new URLSearchParams({ q, limit: String(limit), offset: String(offset) }); return p.toString(); }
export function fetchDexPackages(baseUrl: string, id: string, q: string, offset: number, token = ''): Promise<Page<DexPackage>> { return request(baseUrl, '/v1/analyses/' + encodeURIComponent(id) + '/dex/packages?' + pageParams(q, offset, 50), token); }
export function fetchDexClasses(baseUrl: string, id: string, q: string, offset: number, token = '', packageName = ''): Promise<Page<DexClass>> { const p = new URLSearchParams({ q, limit: '50', offset: String(offset) }); if (packageName) p.set('package', packageName); return request(baseUrl, '/v1/analyses/' + encodeURIComponent(id) + '/dex/classes?' + p.toString(), token); }
export function fetchDexMethods(baseUrl: string, id: string, className: string, token = ''): Promise<{ class_name: string; items: DexMethod[]; total: number }> { const params = new URLSearchParams({ class_name: className }); return request(baseUrl, '/v1/analyses/' + encodeURIComponent(id) + '/dex/methods?' + params.toString(), token); }
export function fetchDexLibraries(baseUrl: string, id: string, q: string, offset: number, token = ''): Promise<Page<DexLibrary>> { return request(baseUrl, '/v1/analyses/' + encodeURIComponent(id) + '/dex/libraries?' + pageParams(q, offset, 50), token); }
export function fetchApkFiles(baseUrl: string, id: string, q: string, offset: number, token = ''): Promise<Page<string>> { return request(baseUrl, '/v1/analyses/' + encodeURIComponent(id) + '/files?' + pageParams(q, offset, 100), token); }
export function uploadUrl(baseUrl: string): string { return endpoint(baseUrl, '/v1/analyses'); }