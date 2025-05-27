import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthCallback from './pages/AuthCallback';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/live-tiktok-app">
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<div style={{ padding: '2rem' }}><h1>404 Page Not Found</h1></div>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
