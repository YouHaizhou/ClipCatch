// ============================================================
// MarkdownRenderer — Markdown 渲染组件
// 使用 react-markdown + remark-gfm，支持代码高亮样式
// ============================================================
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
  content: string
  isStreaming?: boolean  // 是否显示打字机光标
  className?: string
}

export default function MarkdownRenderer({
  content,
  isStreaming = false,
  className,
}: MarkdownRendererProps) {
  return (
    <div
      data-selectable="true"
      className={cn(
        'prose prose-invert prose-sm max-w-none',
        // 自定义 prose 样式，与整体主题保持一致
        '[--tw-prose-body:hsl(210,20%,88%)]',
        '[--tw-prose-headings:hsl(174,72%,60%)]',
        '[--tw-prose-links:hsl(174,72%,55%)]',
        '[--tw-prose-bold:hsl(210,20%,95%)]',
        '[--tw-prose-code:hsl(174,72%,70%)]',
        '[--tw-prose-quotes:hsl(215,14%,55%)]',
        '[--tw-prose-hr:hsl(220,14%,22%)]',
        // 代码块背景
        '[&_pre]:bg-muted [&_pre]:border [&_pre]:border-border [&_pre]:rounded-lg',
        '[&_code]:text-primary [&_code]:bg-primary/10 [&_code]:px-1 [&_code]:rounded',
        '[&_pre_code]:bg-transparent [&_pre_code]:px-0',
        // 表格样式
        '[&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-1.5',
        '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5',
        // 引用块
        '[&_blockquote]:border-l-primary/50 [&_blockquote]:bg-primary/5 [&_blockquote]:rounded-r-lg [&_blockquote]:py-0.5',
        // 列表
        '[&_li]:my-0.5',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
      {/* 打字机光标 */}
      {isStreaming && (
        <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  )
}
