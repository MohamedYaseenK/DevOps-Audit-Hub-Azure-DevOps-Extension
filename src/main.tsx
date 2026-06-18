import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import * as SDK from 'azure-devops-extension-sdk'

// Initialise the ADO Extension SDK
// This tells ADO the extension is ready to load
SDK.init().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})