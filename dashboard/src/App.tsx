import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import TerminalPage from './pages/Terminal';
import Operators from './pages/Operators';
import Bots from './pages/Bots';
import Settings from './pages/Settings';

function isAuthenticated() {
  return !!localStorage.getItem('jarvis_token');
}

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated);

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="terminal" element={<TerminalPage />} />
          <Route path="operators" element={<Operators />} />
          <Route path="bots" element={<Bots />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
