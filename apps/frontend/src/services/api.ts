// ============================================================
// 统一 HTTP 客户端
// Electron 开发模式：走 Vite proxy（相对路径），避免 CSP 限制
// Electron 生产模式：直连 http://127.0.0.1:{port}
// ============================================================
import type { ApiResponse } from '@/types'

declare global {
  interface Window {
    electronAPI?: {
      selectDirectory: () => Promise<string | null>
      saveFile: (defaultName: string) => Promise<string | null>
      openPath: (filePath: string) => Promise<void>
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
      getBackendPort: () => Promise<number>
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}

let backendPort = 57891
const isProdElectron = (): boolean =>
  typeof window !== 'undefined' && window.location.protocol === 'file:'

export async function initApiClient(): Promise<void> {
  if (window.electronAPI) {
    backendPort = await window.electronAPI.getBackendPort()
  }
}

function baseUrl(): string {
  if (isProdElectron()) return `http://127.0.0.1:${backendPort}`
  return ''
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  const json: ApiResponse<T> = await res.json()
  if (json.code !== 0) throw new Error(json.message ?? 'Unknown error')
  return json.data as T
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  const json: ApiResponse<T> = await res.json()
  if (json.code !== 0) throw new Error(json.message ?? 'Unknown error')
  return json.data as T
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`)
  const json: ApiResponse<T> = await res.json()
  if (json.code !== 0) throw new Error(json.message ?? 'Unknown error')
  return json.data as T
}

/**
 * 图片代理 URL：绕过 B 站防盗链和 Electron CSP http:// 限制
 * 开发模式走 Vite proxy，生产模式使用完整后端地址
 */
export function proxyImageUrl(url: string): string {
  if (!url || url.includes('transparent.png')) return ''
  const encoded = encodeURIComponent(url)
  if (isProdElectron()) {
    return `http://127.0.0.1:${backendPort}/api/proxy/image?url=${encoded}`
  }
  return `/api/proxy/image?url=${encoded}`
}

export async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`)
  const json: ApiResponse<T> = await res.json()
  if (json.code !== 0) throw new Error(json.message ?? 'Unknown error')
  return json.data as T
}

export function createSSE(path: string): EventSource {
  return new EventSource(`${baseUrl()}${path}`)
}
