// ============================================================
// MarkdownRenderer — Markdown 渲染组件
// 支持普通 Markdown、```mermaid 代码块（思维导图/流程图）
// ============================================================
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import MermaidRenderer from './MermaidRenderer'

interface MarkdownRendererProps {
  content: string
  isStreaming?: boolean
  className?: string
}

// 将内容按 ```mermaid ... ``` 或 ```markmap ... ``` 分割
function splitContent(content: string): { type: 'md' | 'mermaid' | 'markmap'; text: string }[] {
  const parts: { type: 'md' | 'mermaid' | 'markmap'; text: string }[] = []
  // 同时匹配 mermaid 和 markmap 代码块
  const regex = /```(mermaid|markmap)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'md', text: content.slice(lastIndex, match.index) })
    }
    const blockType = match[1] as 'mermaid' | 'markmap'
    parts.push({ type: blockType, text: match[2] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'md', text: content.slice(lastIndex) })
  }
  return parts
}

const proseClasses = [
  'prose prose-invert prose-sm max-w-none',
  '[--tw-prose-body:hsl(210,20%,88%)]',
  '[--tw-prose-headings:hsl(174,72%,60%)]',
  '[--tw-prose-links:hsl(174,72%,55%)]',
  '[--tw-prose-bold:hsl(210,20%,95%)]',
  '[--tw-prose-code:hsl(174,72%,70%)]',
  '[--tw-prose-quotes:hsl(215,14%,55%)]',
  '[--tw-prose-hr:hsl(220,14%,22%)]',
  '[&_pre]:bg-muted [&_pre]:border [&_pre]:border-border [&_pre]:rounded-lg',
  '[&_code]:text-primary [&_code]:bg-primary/10 [&_code]:px-1 [&_code]:rounded',
  '[&_pre_code]:bg-transparent [&_pre_code]:px-0',
  '[&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-1.5',
  '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5',
  '[&_blockquote]:border-l-primary/50 [&_blockquote]:bg-primary/5 [&_blockquote]:rounded-r-lg [&_blockquote]:py-0.5',
  '[&_li]:my-0.5',
].join(' ')

export default function MarkdownRenderer({
  content,
  isStreaming: _isStreaming = false,
  className,
}: MarkdownRendererProps) {
  const parts = splitContent(content)
  const hasCharts = parts.some(p => p.type === 'mermaid' || p.type === 'markmap')

  if (!hasCharts) {
    return (
      <div data-selectable="true" className={cn(proseClasses, className)}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    )
  }

  return (
    <div data-selectable="true" className={cn('flex flex-col gap-4', className)}>
      {parts.map((part, i) =>
        part.type === 'mermaid' ? (
          <MermaidRenderer key={i} content={part.text} />
        ) : part.type === 'markmap' ? (
          // markmap 已弃用，显示提示
          <div key={i} className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400">
            ⚠️ Markmap 已升级为 Mermaid 思维导图，请更新模板
          </div>
        ) : part.text.trim() ? (
          <div key={i} className={proseClasses}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
          </div>
        ) : null
      )}
    </div>
  )
}
