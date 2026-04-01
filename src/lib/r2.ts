// R2 Storage client helpers

const WORKER_URL = 'https://approved-upload.ben-6a6.workers.dev';

let authPassword = '';

export function setPassword(pw: string): void {
  authPassword = pw;
  sessionStorage.setItem('approved_pw', pw);
}

export function getPassword(): string {
  return authPassword || sessionStorage.getItem('approved_pw') || '';
}

export function clearPassword(): void {
  authPassword = '';
  sessionStorage.removeItem('approved_pw');
}

export function hasPassword(): boolean {
  return !!getPassword();
}

export async function r2Get<T = any>(path: string): Promise<T> {
  const res = await fetch(`${WORKER_URL}?file=${encodeURIComponent(path)}`);
  if (res.status === 404) {
    throw new Error('Not found');
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status}`);
  }
  return res.json();
}

export async function r2GetRaw(path: string): Promise<ArrayBuffer> {
  const res = await fetch(`${WORKER_URL}?file=${encodeURIComponent(path)}`);
  if (res.status === 404) {
    throw new Error('Not found');
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status}`);
  }
  return res.arrayBuffer();
}

export async function r2Put(path: string, data: any): Promise<void> {
  const formData = new FormData();
  formData.append('path', path);
  formData.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));

  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'X-Auth-Password': getPassword() },
    body: formData
  });

  if (res.status === 401) {
    clearPassword();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    throw new Error(`Failed to save: ${res.status}`);
  }
}

export async function r2PutPDF(path: string, pdfBlob: Blob): Promise<void> {
  const formData = new FormData();
  formData.append('path', path);
  formData.append('file', pdfBlob);

  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'X-Auth-Password': getPassword() },
    body: formData
  });

  if (res.status === 401) {
    clearPassword();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    throw new Error(`Failed to upload PDF: ${res.status}`);
  }
}

export async function r2Delete(path: string): Promise<void> {
  const res = await fetch(`${WORKER_URL}?file=${encodeURIComponent(path)}`, {
    method: 'DELETE',
    headers: { 'X-Auth-Password': getPassword() }
  });

  if (res.status === 401) {
    clearPassword();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    throw new Error(`Failed to delete: ${res.status}`);
  }
}

export async function r2List(prefix: string = ''): Promise<{ key: string; size: number; uploaded: string }[]> {
  const res = await fetch(`${WORKER_URL}?list=1&prefix=${encodeURIComponent(prefix)}`);
  if (!res.ok) {
    throw new Error(`Failed to list: ${res.status}`);
  }
  const data = await res.json();
  return data.files;
}

// Validate password by attempting to fetch prospects.json
export async function validatePassword(pw: string): Promise<boolean> {
  // Temporarily set password for the test
  const oldPw = authPassword;
  authPassword = pw;

  try {
    // Try to put a test marker to verify write access
    const formData = new FormData();
    formData.append('path', '.auth-test');
    formData.append('file', new Blob(['test'], { type: 'text/plain' }));

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'X-Auth-Password': pw },
      body: formData
    });

    if (res.status === 401) {
      authPassword = oldPw;
      return false;
    }

    // Password is valid, keep it
    setPassword(pw);
    return true;
  } catch {
    authPassword = oldPw;
    return false;
  }
}
