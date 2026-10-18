import Taro from '@tarojs/taro'
import type {
  MiniappLoginInput,
  MiniappLoginResponse,
  MiniappSession,
  MiniappDocument,
  MiniappDocumentSummary,
  MiniappPage,
  MiniappDocumentsQuery,
  FolderNode,
  TagListResponse,
  ConversationSummary,
  ConversationDetail,
  MiniappOperation,
  MiniappWriteResponse,
  MiniappCreateNoteInput,
  MiniappUpdateInput,
  MiniappAppendInput,
  MiniappSaveAnswerInput,
  MiniappCaptureInput,
} from '@mimir/shared/miniapp'
import { getSession, setSession } from './session'
import { origin, localKey, readStorage, writeStorage } from './storage'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请检查网络后重试。'
}
export function parseError(status: number, data: unknown) {
  const envelope = data as { error?: { code?: string; message?: string; details?: unknown } } | null
  return new ApiError(
    status,
    envelope?.error?.code || 'HTTP_ERROR',
    envelope?.error?.message || `服务请求失败（${status}），请稍后重试。`,
    envelope?.error?.details,
  )
}
export function authHeaders() {
  const session = getSession()
  if (!session) throw new ApiError(401, 'SESSION_REQUIRED', '请先登录现有账号。')
  return { Authorization: `Bearer ${session.token}` }
}
export function handleUnauthorized(status: number, authorization?: string) {
  if (status === 401 && (!authorization || authorization === `Bearer ${getSession()?.token}`))
    setSession(null, '登录已失效，请重新登录。草稿仍保留在本机。')
}
export function requireOrigin() {
  if (!origin)
    throw new ApiError(
      0,
      'SERVER_NOT_CONFIGURED',
      '尚未配置服务端，请在构建时填写固定 HTTPS 域名。',
    )
  return `${origin}/api/miniapp`
}
export async function request<T>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  data?: object,
  publicRequest = false,
): Promise<T> {
  const url = requireOrigin() + path
  const authorization = publicRequest ? undefined : authHeaders().Authorization
  const header = {
    'Content-Type': 'application/json',
    ...(authorization ? { Authorization: authorization } : {}),
  }
  let response: Taro.request.SuccessCallbackResult<T>
  try {
    response = await Taro.request<T>({ url, method, data, header, timeout: 30000 })
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      '网络请求中断或超时。写入结果可能已保存，请先查询操作结果。',
    )
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (!publicRequest) handleUnauthorized(response.statusCode, authorization)
    throw parseError(response.statusCode, response.data)
  }
  return response.data
}
export function query(values: Record<string, string | number | undefined>) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}
export const api = {
  login: (data: MiniappLoginInput) =>
    request<MiniappLoginResponse>('/auth/login', 'POST', data, true),
  session: () => request<MiniappSession>('/auth/session'),
  logout: () => request<{ ok: true }>('/auth/logout', 'POST'),
  folders: () => request<{ items: FolderNode[] }>('/folders'),
  tags: () => request<TagListResponse>('/tags'),
  documents: (params: MiniappDocumentsQuery) =>
    request<MiniappPage<MiniappDocumentSummary>>(
      `/documents?${query({ folder: params.folder, tag: params.tag, kind: params.kind, limit: typeof params.limit === 'number' ? params.limit : 30, offset: typeof params.offset === 'number' ? params.offset : 0 })}`,
    ),
  document: (id: string) =>
    request<{ document: MiniappDocument }>(`/documents/${encodeURIComponent(id)}`),
  conversations: (offset = 0) =>
    request<MiniappPage<ConversationSummary>>(`/conversations?${query({ offset, limit: 20 })}`),
  conversation: (id: string) =>
    request<{ conversation: ConversationDetail }>(`/conversations/${encodeURIComponent(id)}`),
  operation: (id: string) => request<MiniappWriteResponse>(`/operations/${encodeURIComponent(id)}`),
  create: (data: MiniappCreateNoteInput) => request<MiniappWriteResponse>('/notes', 'POST', data),
  update: (id: string, data: MiniappUpdateInput) =>
    request<MiniappWriteResponse>(`/documents/${encodeURIComponent(id)}/update`, 'POST', data),
  append: (id: string, data: MiniappAppendInput) =>
    request<MiniappWriteResponse>(`/documents/${encodeURIComponent(id)}/append`, 'POST', data),
  saveAnswer: (id: string, data: MiniappSaveAnswerInput) =>
    request<MiniappWriteResponse>(`/messages/${encodeURIComponent(id)}/note`, 'POST', data),
  capture: (data: MiniappCaptureInput) => request<MiniappWriteResponse>('/capture', 'POST', data),
}
export interface PendingWrite {
  requestId: string
  path: string
  data: Record<string, unknown>
  updatedAt: string
}
export function rememberWrite(ownerId: string, input: PendingWrite) {
  writeStorage(localKey(ownerId, `operation:${input.requestId}`), input)
}
export function pendingWrite(ownerId: string, id: string) {
  return readStorage<PendingWrite>(localKey(ownerId, `operation:${id}`))
}
export async function sendWrite(
  ownerId: string,
  path: string,
  data: Record<string, unknown> & { requestId: string },
): Promise<MiniappOperation> {
  rememberWrite(ownerId, {
    path,
    data,
    requestId: data.requestId,
    updatedAt: new Date().toISOString(),
  })
  const response = await request<MiniappWriteResponse>(path, 'POST', data)
  return response.operation
}
export async function recoverWrite(id: string) {
  return (await api.operation(id)).operation
}
export function operationProblem(operation: MiniappOperation) {
  if (operation.status === 'pending') return '服务端仍在处理中。请稍后查询结果，不要重复提交。'
  if (operation.status === 'interrupted')
    return '操作已中断，结果不确定。请刷新相关资料确认后，再发起新操作。'
  if (operation.status === 'failed') return operation.error?.message || '操作失败，输入已保留。'
  return ''
}
