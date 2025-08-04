-- Supabase Database Schema for African Media BaaS
-- Optimized for media distribution and ad monetization

-- Enable Row Level Security
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;

-- Create uploads table
create table if not exists uploads (
    id uuid default gen_random_uuid() primary key,
    upload_id text unique not null,
    status text not null default 'created',
    cors_origin text,
    content_type text,
    asset_id text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create assets table  
create table if not exists assets (
    id uuid default gen_random_uuid() primary key,
    asset_id text unique not null,
    status text not null default 'preparing',
    playback_id text,
    input_url text,
    metadata jsonb default '{}',
    duration numeric,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    deleted_at timestamp with time zone
);

-- Create ad_cue_points table
create table if not exists ad_cue_points (
    id uuid default gen_random_uuid() primary key,
    cue_point_id text unique not null,
    asset_id text not null,
    type text not null, -- 'pre-roll', 'mid-roll', 'post-roll'
    time_offset numeric not null default 0,
    duration numeric not null default 30,
    ad_break_id text,
    targeting jsonb default '{}',
    metadata jsonb default '{}',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create streaming_sessions table for analytics
create table if not exists streaming_sessions (
    id uuid default gen_random_uuid() primary key,
    session_id text unique not null,
    asset_id text not null,
    playback_id text not null,
    country text,
    device_type text,
    connection_type text,
    isp text,
    optimization_settings jsonb default '{}',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    ended_at timestamp with time zone
);

-- Create indexes for performance
create index if not exists uploads_upload_id_idx on uploads(upload_id);
create index if not exists uploads_status_idx on uploads(status);
create index if not exists uploads_created_at_idx on uploads(created_at);

create index if not exists assets_asset_id_idx on assets(asset_id);
create index if not exists assets_playback_id_idx on assets(playback_id);
create index if not exists assets_status_idx on assets(status);
create index if not exists assets_created_at_idx on assets(created_at);

create index if not exists ad_cue_points_asset_id_idx on ad_cue_points(asset_id);
create index if not exists ad_cue_points_type_idx on ad_cue_points(type);
create index if not exists ad_cue_points_time_offset_idx on ad_cue_points(time_offset);

create index if not exists streaming_sessions_asset_id_idx on streaming_sessions(asset_id);
create index if not exists streaming_sessions_country_idx on streaming_sessions(country);
create index if not exists streaming_sessions_created_at_idx on streaming_sessions(created_at);

-- Create updated_at trigger function
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$ language plpgsql;

-- Add updated_at triggers
create trigger update_uploads_updated_at before update on uploads
    for each row execute procedure update_updated_at_column();

create trigger update_assets_updated_at before update on assets
    for each row execute procedure update_updated_at_column();

create trigger update_ad_cue_points_updated_at before update on ad_cue_points
    for each row execute procedure update_updated_at_column();

-- Enable Row Level Security (RLS)
alter table uploads enable row level security;
alter table assets enable row level security;
alter table ad_cue_points enable row level security;
alter table streaming_sessions enable row level security;

-- Create RLS policies (for authenticated users)
create policy "Users can view uploads" on uploads for select using (true);
create policy "Users can create uploads" on uploads for insert with check (true);
create policy "Users can update uploads" on uploads for update using (true);

create policy "Users can view assets" on assets for select using (true);
create policy "Users can create assets" on assets for insert with check (true);
create policy "Users can update assets" on assets for update using (true);

create policy "Users can view ad cue points" on ad_cue_points for select using (true);
create policy "Users can create ad cue points" on ad_cue_points for insert with check (true);
create policy "Users can update ad cue points" on ad_cue_points for update using (true);

create policy "Users can view streaming sessions" on streaming_sessions for select using (true);
create policy "Users can create streaming sessions" on streaming_sessions for insert with check (true);

-- Grant permissions to authenticated users
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

-- Insert sample data for testing
insert into assets (asset_id, status, playback_id, metadata) values 
('test-asset-123', 'ready', 'test-playback-123', '{"title": "Sample African Content", "description": "Test video for African markets"}')
on conflict (asset_id) do nothing;