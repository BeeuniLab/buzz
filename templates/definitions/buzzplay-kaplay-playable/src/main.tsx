import '@/lib/errorReporter'
import '@/index.css'

import { createRoot } from 'react-dom/client'

import { HomePage } from '@/pages/HomePage'

createRoot(document.getElementById('root')!).render(<HomePage />)
