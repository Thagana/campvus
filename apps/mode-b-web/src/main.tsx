import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@campvus/design/index.css'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('missing #root element')

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
