// ============================================================
// App.tsx — 根组件
// 负责：初始化 API 客户端、全局布局（侧边栏 + 内容区）、页面切换
// 所有页面同时挂载，用 display:none 隐藏，保留各页面本地状态
// ============================================================
import { useEffect, useState } from 'react'
import { initApiClient } from '@/services/api'
import { useSettingsStore } from '@/store/settingsStore'
import Sidebar from '@/components/Sidebar'
import TitleBar from '@/components/TitleBar'
import SearchPage from '@/pages/SearchPage'
import ResourcePage from '@/pages/ResourcePage'
import WorkspacePage from '@/pages/WorkspacePage'
import SettingsPage from '@/pages/SettingsPage'
import Toast from '@/components/Toast'

export default function App() {
  const { activePage, loadSettings, testConnection } = useSettingsStore()
  const [apiReady, setApiReady] = useState(false)

  useEffect(() => {
    initApiClient().then(async () => {
      setApiReady(true)
      try { await loadSettings() } catch { /* 后端启动中，静默忽略 */ }
      Promise.allSettled([
        testConnection('deepseek'),
        testConnection('xunfei'),
      ])
    })
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          {apiReady ? (
            <>
              <div className={activePage === 'search'    ? 'h-full' : 'hidden'}><SearchPage /></div>
              <div className={activePage === 'library'   ? 'h-full' : 'hidden'}><ResourcePage /></div>
              <div className={activePage === 'workspace' ? 'h-full' : 'hidden'}><WorkspacePage /></div>
              <div className={activePage === 'settings'  ? 'h-full' : 'hidden'}><SettingsPage /></div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          )}
        </main>
      </div>
      <Toast />
    </div>
  )
}
