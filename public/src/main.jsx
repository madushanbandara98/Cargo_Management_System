import React from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import '../login.css';
import '../dashboard.css';
import '../shipment.css';

function AppBootstrap() {
  return null;
}

createRoot(document.getElementById('react-root')).render(<AppBootstrap />);

// The existing interface remains behavior-compatible while Vite owns the
// frontend build. New screens can now be migrated to React incrementally.
import('../app.js');
