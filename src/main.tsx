import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// CRITICAL: Handle React 18 StrictMode properly
const isDevelopment = import.meta.env.DEV;

const AppWithWrapper = () => {
  // In development, track mount/unmount cycles
  React.useEffect(() => {
    if (isDevelopment) {
      console.log('🔄 App mounted');
      return () => {
        console.log('🔄 App unmounted');
      };
    }
  }, []);

  return <App />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  // CONDITIONAL: Only use StrictMode in production to prevent double-mounting issues
  isDevelopment ? (
    <AppWithWrapper />
  ) : (
    <React.StrictMode>
      <AppWithWrapper />
    </React.StrictMode>
  )
);