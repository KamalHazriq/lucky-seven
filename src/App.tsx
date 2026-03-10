import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home.tsx'
import Lobby from './pages/Lobby.tsx'
import Game from './pages/Game.tsx'
import Results from './pages/Results.tsx'
import Join from './pages/Join.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/join" element={<Join />} />
      <Route path="/lobby/:gameId" element={<Lobby />} />
      <Route path="/game/:gameId" element={<Game />} />
      <Route path="/results/:gameId" element={<Results />} />
    </Routes>
  )
}
