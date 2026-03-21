// ============================================================
// MarkmapRenderer — 将 Markdown 大纲渲染为交互式思维导图
// 使用 markmap-lib + markmap-view
// ============================================================
import { useLayoutEffect, useRef } from 'react'
import { Transformer } from 'markmap-lib'
import { Markmap, loadCSS, loadJS } from 'markmap-view'
import { deriveOptions } from 'markmap-view'

interface MarkmapRendererProps {
  content: string
  className?: string
}

const transformer = new Transformer()

export default function MarkmapRenderer({ content, className }: MarkmapRendererProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const mmRef  = useRef<Markmap | null>(null)

  useLayoutEffect(() => {
    if (!svgRef.current) return

    // 转换 markdown 大纲为 markmap 数据
    const { root, features } = transformer.transform(content)

    // 加载 markmap 所需的 CSS/JS assets（字体、图标等）
    const { styles, scripts } = transformer.getUsedAssets(features)
    if (styles?.length) loadCSS(styles)
    if (scripts?.length) loadJS(scripts, { getMarkmap: () => ({ Markmap }) })

    if (!mmRef.current) {
      mmRef.current = Markmap.create(svgRef.current, deriveOptions({
        duration: 300,
        maxWidth: 280,
        color: ['#2dd4bf', '#818cf8', '#fb923c', '#34d399', '#f472b6'],
        initialExpandLevel: 2,
      }))
    }

    mmRef.current.setData(root)
    // 延迟 fit 确保 SVG 已渲染完成
    setTimeout(() => mmRef.current?.fit(), 100)

    return () => {
      // 不销毁实例，只在 content 变化时 setData
    }
  }, [content])

  return (
    <div className={`w-full rounded-xl border border-border bg-card overflow-hidden ${className ?? ''}`}>
      <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 bg-muted/30">
        <span className="text-xs text-primary font-medium">思维导图</span>
        <span className="text-xs text-muted-foreground">（可拖拽缩放）</span>
      </div>
      <svg
        ref={svgRef}
        className="w-full"
        style={{ height: '460px', display: 'block' }}
      />
    </div>
  )
}
