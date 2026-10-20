import { MimirProvider } from '@mimir/renderer/titlebar-kit'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { UpdatePage } from '@/update/UpdatePage'

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

createRoot(container).render(
  <StrictMode>
    <MimirProvider>
      <UpdatePage />
    </MimirProvider>
  </StrictMode>,
)
