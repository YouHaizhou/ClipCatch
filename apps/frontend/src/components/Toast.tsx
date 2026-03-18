// ============================================================
// Toast — 全局通知组件（轻量自实现，无需引入重型库）
// ============================================================
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastMessage {
  id: number
  type: ToastType
  message: string
}

// 全局事件总线：任何地方调用 showToast() 即可触发
let toastHandler: ((msg: Omit<ToastMessage, 'id'>) => void) | null = null

export function showToast(type: ToastType, message: string) {
  toastHandler?.({ type, message })
}

export default function Toast() {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  useEffect(() => {
    // 注册全局处理器
    toastHandler = (msg) => {
      const id = Date.now()
      setMessages((prev) => [...prev, { ...msg, id }])
      // 3 秒后自动移除
      setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== id))
      }, 3000)
    }
    return () => { toastHandler = null }
  }, [])

  const remove = (id: number) =>
    setMessages((prev) => prev.filter((m) => m.id !== id))

  const icons = { success: CheckCircle, error: XCircle, info: Info }
  const colors = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    error:   'border-red-500/30 bg-red-500/10 text-red-300',
    info:    'border-blue-500/30 bg-blue-500/10 text-blue-300',
  }

  if (messages.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {messages.map((msg) => {
        const Icon = icons[msg.type]
        return (
          <div
            key={msg.id}
            className={cn(
              'pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg border',
              'backdrop-blur-sm shadow-lg max-w-sm text-sm',
              'animate-in slide-in-from-right-4 fade-in duration-200',
              colors[msg.type]
            )}
          >
            <Icon size={15} className="shrink-0" />
            <span className="flex-1">{msg.message}</span>
            <button
              onClick={() => remove(msg.id)}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
