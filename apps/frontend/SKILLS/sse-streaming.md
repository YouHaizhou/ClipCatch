# Skill：SSE 流式功能开发

## 触发时机
前端 Agent 需要实现或修改 SSE 流式功能时调用此 Skill。

## SSE 开发规范

### 创建 SSE 连接

```tsx
import { createSSE } from '@/services/api'
import { useAiStore } from '@/store/aiStore'

// 正确：通过 createSSE 创建，自动处理开发/生产模式 URL
const sse = createSSE(`/api/ai/tasks/${taskId}/stream`)

// 必须存入 store（用于手动停止）
useAiStore.getState().setState({ _sse: sse, isStreaming: true })
```

### 处理 SSE 事件

```tsx
sse.onmessage = (e) => {
  // 心跳消息跳过
  if (!e.data || e.data.startsWith(':')) return
  
  try {
    const event: AiStreamEvent = JSON.parse(e.data)
    
    if (event.type === 'progress') {
      setState({ stage: event.stage ?? '', stageMsg: event.message ?? '' })
    } else if (event.type === 'token') {
      // 函数式更新避免闭包问题
      useAiStore.setState((s) => ({
        streamBuffer: s.streamBuffer + (event.content ?? '')
      }))
    } else if (event.type === 'done') {
      setState({
        stage: 'completed',
        stageMsg: `生成完成，共 ${event.wordCount ?? 0} 字`,
        isStreaming: false,
        currentNoteId: event.noteId ?? null,
        _sse: null,
      })
      sse.close()
    } else if (event.type === 'error') {
      setState({ stage: 'failed', stageMsg: event.message ?? '', isStreaming: false, _sse: null })
      sse.close()
      showToast('error', event.message ?? '处理失败')
    }
  } catch {
    // 忽略解析错误（心跳等非 JSON 消息）
  }
}

sse.onerror = () => {
  setState({ stage: 'failed', stageMsg: '连接中断', isStreaming: false, _sse: null })
  sse.close()
}
```

### 手动停止 SSE

```tsx
import { useAiStore } from '@/store/aiStore'

const { stop } = useAiStore()

<button onClick={stop}>
  <Square size={14} fill="currentColor" /> 停止
</button>
```

### AiStreamEvent 类型

```typescript
type AiStreamEvent = {
  type: 'progress' | 'token' | 'done' | 'error'
  stage?: string
  message?: string
  content?: string
  noteId?: number
  wordCount?: number
}
```

### 阶段标签映射

```typescript
const STAGE_LABELS: Record<string, string> = {
  queued:       '等待处理...',
  extracting:   '提取音频中...',
  transcribing: '语音转写中...',
  generating:   'AI 生成中...',
  completed:    '生成完成',
  failed:       '处理失败',
}
```

### 注意事项

- 心跳消息格式为 `: heartbeat`，必须 try/catch 或判断跳过
- 不要在组件 unmount 时自动关闭 SSE（页面用 `display:none` 隐藏，不 unmount）
- 重连时用 `stop()` 关闭旧连接再创建新连接
