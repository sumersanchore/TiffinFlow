import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import {QueryClientProvider} from '@tanstack/react-query'
import {Toaster} from 'sonner'
import '@fontsource-variable/dm-sans'
import './style.css'
import {App} from './App'
import {client} from './services/api'
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><BrowserRouter><App/></BrowserRouter><Toaster richColors position="bottom-right"/></QueryClientProvider>)
