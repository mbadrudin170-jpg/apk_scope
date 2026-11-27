let backendUrl = "";
let backendToken = "";

export function setApiConfig(url: string, token: string): void {
  backendUrl = url.trim();
  backendToken = token.trim();
}

export function getApiConfig(): { url: string; token: string } {
  return { url: backendUrl, token: backendToken };
}
