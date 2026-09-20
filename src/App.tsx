import { Navigate, Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { MachinePage } from './pages/MachinePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/machine/:slug" element={<MachinePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
