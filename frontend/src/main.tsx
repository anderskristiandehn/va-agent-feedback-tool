import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Apply saved dark mode preference before first paint
const savedDark = localStorage.getItem('darkMode')
if (savedDark !== 'false') {
  document.documentElement.classList.add('dark')
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, retry: 1 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
