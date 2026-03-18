import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// React 18 并发模式入口
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
