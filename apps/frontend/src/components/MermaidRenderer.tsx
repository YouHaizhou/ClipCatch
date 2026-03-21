// ============================================================
// MermaidRenderer — 渲染 Mermaid 图表（思维导图、流程图等）
// 支持鼠标滚轮缩放、拖拽平移、自适应尺寸
// ============================================================
import { useLayoutEffect, useRef } from 'react'
import mermaid from 'mermaid'

interface MermaidRendererProps {
  content: string
  className?: string
}

// 初始化 mermaid 配置（仅一次）
let mermaidInitialized = false
if (!mermaidInitialized) {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    mindmap: {
      padding: 20,
      maxNodeWidth: 200,
      fontSize: 14,
      fontFamily: 'sans-serif',
    },
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
    },
    themeVariables: {
      primaryColor: '#1e293b',
      primaryTextColor: '#f1f5f9',
      primaryBorderColor: '#64748b',
      lineColor: '#94a3b8',
      secondBkgColor: '#0f172a',
      tertiaryColor: '#1e293b',
      tertiaryTextColor: '#e2e8f0',
      tertiaryBorderColor: '#475569',
    },
  })
  mermaidInitialized = true
}

// 为 SVG 启用拖拽和缩放
function enableSvgInteraction(svg: SVGSVGElement) {
  let isPanning = false
  let startX = 0
  let startY = 0
  let translateX = 0
  let translateY = 0
  let scale = 1

  const g = svg.querySelector('g') as SVGGElement
  if (!g) return

  // 鼠标滚轮缩放
  svg.addEventListener('wheel', (e) => {
    e.preventDefault()
    const rect = svg.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.5, Math.min(3, scale * delta))
    const scaleChange = newScale / scale
    translateX = x - (x - translateX) * scaleChange
    translateY = y - (y - translateY) * scaleChange
    scale = newScale
    g.setAttribute('transform', `translate(${translateX},${translateY}) scale(${scale})`)
  })

  // 鼠标拖拽平移
  svg.addEventListener('mousedown', (e) => {
    isPanning = true
    startX = e.clientX - translateX
    startY = e.clientY - translateY
  })

  svg.addEventListener('mousemove', (e) => {
    if (!isPanning) return
    translateX = e.clientX - startX
    translateY = e.clientY - startY
    g.setAttribute('transform', `translate(${translateX},${translateY}) scale(${scale})`)
  })

  svg.addEventListener('mouseup', () => {
    isPanning = false
  })

  svg.addEventListener('mouseleave', () => {
    isPanning = false
  })
}

// 调整 SVG 尺寸以适应内容
function fitSvgToContent(svg: SVGSVGElement) {
  const g = svg.querySelector('g') as SVGGElement
  if (!g) return

  // 获取 g 元素的实际边界
  try {
    const bbox = g.getBBox()
    if (bbox.width > 0 && bbox.height > 0) {
      const padding = 40
      const width = bbox.width + padding * 2
      const height = bbox.height + padding * 2
      
      // 设置 SVG 的 viewBox 和尺寸
      svg.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`)
      svg.setAttribute('width', '100%')
      svg.setAttribute('height', 'auto')
      svg.style.minHeight = '500px'
    }
  } catch (e) {
    console.warn('Failed to fit SVG:', e)
  }
}

export default function MermaidRenderer({ content, className }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!containerRef.current) return

    const render = async () => {
      try {
        // 清空容器
        containerRef.current!.innerHTML = ''

        // 创建临时 div 用于 mermaid 渲染
        const tempDiv = document.createElement('div')
        tempDiv.className = 'mermaid'
        tempDiv.textContent = content
        containerRef.current!.appendChild(tempDiv)

        // 渲染
        await mermaid.contentLoaded()
        await mermaid.run()

        // 为 SVG 启用交互和调整尺寸
        const svg = containerRef.current!.querySelector('svg') as SVGSVGElement
        if (svg) {
          // 延迟调整以确保 SVG 完全渲染
          setTimeout(() => {
            fitSvgToContent(svg)
            enableSvgInteraction(svg)
          }, 100)
        }
      } catch (err) {
        console.error('Mermaid render error:', err)
        containerRef.current!.innerHTML = `<div class="text-xs text-red-400 p-4">图表渲染失败</div>`
      }
    }

    render()
  }, [content])

  return (
    <div className={`w-full rounded-xl border border-border bg-card overflow-hidden ${className ?? ''}`}>
      <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 bg-muted/30">
        <span className="text-xs text-primary font-medium">思维导图</span>
        <span className="text-xs text-muted-foreground">（滚轮缩放 | 拖拽平移）</span>
      </div>
      <div
        ref={containerRef}
        className="p-4 flex justify-center items-start cursor-grab active:cursor-grabbing overflow-auto"
        style={{ background: 'hsl(220, 13%, 12%)', maxHeight: '600px' }}
      />
    </div>
  )
}
