import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { ReactFlowProvider } from '@xyflow/react';
import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import { configureLocalCredentialHeaders } from './config/localSettings';

configureLocalCredentialHeaders();

const Landing = lazy(() =>
    import('./Landing.jsx').then((module) => ({ default: module.Landing }))
);

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <ReactFlowProvider>
            <Router>
                <Routes>
                    <Route
                        path="/"
                        element={<App />}
                    />
                    <Route
                        path="/landing"
                        element={
                            <Suspense fallback={null}>
                                <Landing />
                            </Suspense>
                        }
                    />
                    {/* <App /> */}
                </Routes>
            </Router>
        </ReactFlowProvider>
    </StrictMode>
);
