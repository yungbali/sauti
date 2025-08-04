-- Supabase Database Schema for African Media BaaS
-- Run this in your Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create uploads table for video ingestion tracking
CREATE TABLE IF NOT EXISTS uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id VARCHAR(255) NOT NULL UNIQUE,
    asset_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    filename VARCHAR(255),
    content_type VARCHAR(100),
    file_size BIGINT,
    cors_origin VARCHAR(255),
    upload_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create assets table for processed video assets
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id VARCHAR(255) NOT NULL UNIQUE,
    upload_id VARCHAR(255) REFERENCES uploads(upload_id),
    status VARCHAR(50) DEFAULT 'preparing',
    title VARCHAR(255),
    description TEXT,
    duration DECIMAL(10,2),
    aspect_ratio VARCHAR(20),
    master_access VARCHAR(50) DEFAULT 'none',
    mp4_support VARCHAR(50) DEFAULT 'none',
    encoding_tier VARCHAR(50) DEFAULT 'baseline',
    max_stored_resolution VARCHAR(20),
    max_stored_frame_rate DECIMAL(5,2),
    playback_ids JSONB DEFAULT '[]',
    tracks JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create ad_cue_points table for African ad insertion
CREATE TABLE IF NOT EXISTS ad_cue_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cue_point_id VARCHAR(255) NOT NULL UNIQUE,
    asset_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'pre-roll', 'mid-roll', 'post-roll'
    time_offset DECIMAL(10,3) DEFAULT 0, -- seconds
    duration DECIMAL(10,3) NOT NULL, -- seconds
    targeting JSONB DEFAULT '{}', -- African market targeting
    status VARCHAR(50) DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create analytics_events table for African ISP tracking
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id VARCHAR(255) NOT NULL UNIQUE,
    asset_id VARCHAR(255),
    event_type VARCHAR(50) NOT NULL, -- 'play', 'pause', 'buffer', 'complete'
    country_code VARCHAR(3), -- KE, NG, GH, etc.
    isp VARCHAR(100), -- Safaricom, Airtel, MTN, etc.
    device_type VARCHAR(50), -- mobile, desktop, tablet
    connection_type VARCHAR(50), -- cellular, wifi, fiber
    stream_quality VARCHAR(20), -- ultra-low, low, medium, high
    buffer_duration DECIMAL(10,3),
    watch_time DECIMAL(10,3),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at);
CREATE INDEX IF NOT EXISTS idx_ad_cue_points_asset_id ON ad_cue_points(asset_id);
CREATE INDEX IF NOT EXISTS idx_ad_cue_points_type ON ad_cue_points(type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_asset_id ON analytics_events(asset_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_country_isp ON analytics_events(country_code, isp);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_cue_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allowing service role to access all data)
-- Note: In production, you might want more granular policies

-- Uploads policies
CREATE POLICY "Enable all access for service role" ON uploads
    FOR ALL USING (auth.role() = 'service_role');

-- Assets policies  
CREATE POLICY "Enable all access for service role" ON assets
    FOR ALL USING (auth.role() = 'service_role');

-- Ad cue points policies
CREATE POLICY "Enable all access for service role" ON ad_cue_points
    FOR ALL USING (auth.role() = 'service_role');

-- Analytics events policies
CREATE POLICY "Enable all access for service role" ON analytics_events
    FOR ALL USING (auth.role() = 'service_role');

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_uploads_updated_at BEFORE UPDATE ON uploads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ad_cue_points_updated_at BEFORE UPDATE ON ad_cue_points
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();