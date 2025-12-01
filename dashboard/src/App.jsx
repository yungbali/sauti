import React, { useState } from 'react';
import { LayoutDashboard, Users, Activity } from 'lucide-react';
import Overview from './pages/Overview';
import Sessions from './pages/Sessions';

function App() {
    const [activeTab, setActiveTab] = useState('overview');

    return (
        <div style={{ display: 'flex', minHeight: '100vh', width: '100vw' }}>
            {/* Sidebar */}
            <div className="sidebar">
                <div className="sidebar-logo">
                    <Activity size={24} /> Sauti Admin
                </div>

                <nav className="sidebar-nav">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`sidebar-item ${activeTab === 'overview' ? 'active' : ''}`}
                    >
                        <LayoutDashboard size={20} /> Overview
                    </button>

                    <button
                        onClick={() => setActiveTab('sessions')}
                        className={`sidebar-item ${activeTab === 'sessions' ? 'active' : ''}`}
                    >
                        <Users size={20} /> Active Sessions
                    </button>
                </nav>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'overview' && <Overview />}
                {activeTab === 'sessions' && <Sessions />}
            </div>
        </div>
    );
}

export default App;
