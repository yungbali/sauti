import React, { useEffect, useState } from 'react';
import { Trash2, RefreshCw } from 'lucide-react';

function Sessions() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchSessions = () => {
        setLoading(true);
        fetch('/v1/admin/sessions')
            .then(res => res.json())
            .then(data => {
                setSessions(data.sessions || []);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch sessions:', err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const terminateSession = (sessionId) => {
        if (!confirm('Are you sure you want to terminate this session?')) return;

        fetch(`/v1/admin/sessions/${sessionId}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(() => {
                setSessions(prev => prev.filter(s => s.session_id !== sessionId));
            })
            .catch(err => console.error('Failed to terminate session:', err));
    };

    return (
        <div style={{ padding: '40px' }}>
            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: '4px' }}>Active Sessions</h1>
                    <p className="text-secondary text-sm">Manage streaming sessions • {sessions.length} active</p>
                </div>
                <button onClick={fetchSessions} className="btn btn-secondary">
                    <RefreshCw size={16} /> Refresh
                </button>
            </header>

            {/* Sessions Table */}
            <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--accent-dark)' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Session ID</th>
                            <th>Asset ID</th>
                            <th>Location</th>
                            <th>Device</th>
                            <th>Connection</th>
                            <th>Started At</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="7" style={{ padding: '40px', textAlign: 'center' }}>
                                    <div className="text-secondary">Loading sessions...</div>
                                </td>
                            </tr>
                        ) : sessions.length === 0 ? (
                            <tr>
                                <td colSpan="7" style={{ padding: '40px', textAlign: 'center' }}>
                                    <div className="text-tertiary">No active sessions found</div>
                                </td>
                            </tr>
                        ) : (
                            sessions.map(session => (
                                <tr key={session.session_id}>
                                    <td>
                                        <code style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-blue)' }}>
                                            {session.session_id.substring(0, 12)}...
                                        </code>
                                    </td>
                                    <td className="font-medium">{session.asset_id}</td>
                                    <td>
                                        <span className="badge">
                                            {session.country || 'Unknown'}
                                        </span>
                                    </td>
                                    <td className="text-secondary">{session.device_type || 'N/A'}</td>
                                    <td className="text-secondary">{session.connection_type || 'N/A'}</td>
                                    <td className="text-secondary text-sm">
                                        {new Date(session.created_at).toLocaleString()}
                                    </td>
                                    <td>
                                        <button
                                            onClick={() => terminateSession(session.session_id)}
                                            className="btn btn-danger"
                                            style={{ padding: '6px 12px' }}
                                            title="Terminate Session"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default Sessions;
