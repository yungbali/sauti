import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Server, Database, Wifi, TrendingUp } from 'lucide-react';

const socket = io();

function Overview() {
    const [stats, setStats] = useState(null);
    const [bandwidthData, setBandwidthData] = useState([]);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        fetch('/v1/admin/stats')
            .then(res => res.json())
            .then(data => setStats(data))
            .catch(err => console.error('Failed to fetch stats:', err));

        socket.on('connect', () => {
            setIsConnected(true);
            console.log('Connected to WebSocket');
        });

        socket.on('disconnect', () => setIsConnected(false));

        const interval = setInterval(() => {
            setBandwidthData(prev => {
                const newData = [...prev, { time: new Date().toLocaleTimeString(), usage: Math.random() * 100 }];
                if (newData.length > 20) newData.shift();
                return newData;
            });
        }, 2000);

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            clearInterval(interval);
        };
    }, []);

    if (!stats) return <div style={{ padding: '40px' }}>Loading stats...</div>;

    return (
        <div style={{ padding: '40px' }}>
            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: '4px' }}>System Overview</h1>
                    <p className="text-secondary text-sm">Real-time monitoring dashboard</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className={`status-indicator ${isConnected ? 'online' : 'offline'}`}></div>
                    <span className="text-sm text-secondary">{isConnected ? 'Real-time Connected' : 'Disconnected'}</span>
                </div>
            </header>

            {/* Pipeline Stats (Large Cards) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                <div className="pipeline-card blue">
                    <div className="pipeline-tag">
                        <Server size={14} /> SYSTEM
                    </div>
                    <div className="pipeline-title">Uptime</div>
                    <div className="pipeline-meta">Since last restart</div>
                    <div className="pipeline-amount">{Math.floor(stats.system.uptime / 60)}m</div>
                </div>

                <div className="pipeline-card cream">
                    <div className="pipeline-tag">
                        <Wifi size={14} /> REALTIME
                    </div>
                    <div className="pipeline-title">Active Connections</div>
                    <div className="pipeline-meta">WebSocket clients</div>
                    <div className="pipeline-amount">{stats.realtime.activeConnections}</div>
                </div>

                <div className="pipeline-card coral">
                    <div className="pipeline-tag">
                        <TrendingUp size={14} /> SESSIONS
                    </div>
                    <div className="pipeline-title">24h Active</div>
                    <div className="pipeline-meta">Streaming sessions</div>
                    <div className="pipeline-amount">{stats.database.activeSessions24h || 0}</div>
                </div>

                <div className="pipeline-card dark">
                    <div className="pipeline-tag">
                        <Database size={14} /> ASSETS
                    </div>
                    <div className="pipeline-title">Total Media</div>
                    <div className="pipeline-meta">Ingested videos</div>
                    <div className="pipeline-amount">{stats.database.totalAssets || 0}</div>
                </div>
            </div>

            {/* Two Column Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
                {/* Network Traffic Chart */}
                <div className="chart-container">
                    <h3 className="chart-title">Network Traffic (Live)</h3>
                    <div style={{ height: '300px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={bandwidthData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#2C2F38" />
                                <XAxis dataKey="time" stroke="#6B7280" style={{ fontSize: '12px' }} />
                                <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1A1C23',
                                        border: '1px solid #2C2F38',
                                        borderRadius: '8px',
                                        fontSize: '14px'
                                    }}
                                />
                                <Line type="monotone" dataKey="usage" stroke="#3ECFFA" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* System Metrics */}
                <div className="chart-container">
                    <h3 className="chart-title">System Metrics</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <MetricRow label="Memory Used" value={`${Math.round(stats.system.memoryUsage.heapUsed / 1024 / 1024)} MB`} />
                        <MetricRow label="Memory Total" value={`${Math.round(stats.system.memoryUsage.heapTotal / 1024 / 1024)} MB`} />
                        <MetricRow label="Node Version" value={stats.system.nodeVersion} />
                        <MetricRow label="Database" value={stats.database.status} badge={stats.database.status === 'connected' ? 'online' : 'offline'} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function MetricRow({ label, value, badge }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #2C2F38' }}>
            <span className="text-sm text-secondary">{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {badge && <div className={`status-indicator ${badge}`}></div>}
                <span className="text-sm font-medium">{value}</span>
            </div>
        </div>
    );
}

export default Overview;
