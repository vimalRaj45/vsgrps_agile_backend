const pool = require('./db');
async function init() {
  await pool.query(`
  DROP TABLE IF EXISTS audit_log CASCADE;
  DROP TABLE IF EXISTS notifications CASCADE;
  DROP TABLE IF EXISTS links CASCADE;
  DROP TABLE IF EXISTS files CASCADE;
  DROP TABLE IF EXISTS meeting_notes CASCADE;
  DROP TABLE IF EXISTS meeting_attendees CASCADE;
  DROP TABLE IF EXISTS meetings CASCADE;
  DROP TABLE IF EXISTS task_comments CASCADE;
  DROP TABLE IF EXISTS task_label_assignments CASCADE;
  DROP TABLE IF EXISTS task_labels CASCADE;
  DROP TABLE IF EXISTS subtasks CASCADE;
  DROP TABLE IF EXISTS tasks CASCADE;
  DROP TABLE IF EXISTS project_members CASCADE;
  DROP TABLE IF EXISTS projects CASCADE;
  DROP TABLE IF EXISTS invites CASCADE;
  DROP TABLE IF EXISTS users CASCADE;
  DROP TABLE IF EXISTS companies CASCADE;
  DROP TABLE IF EXISTS sessions CASCADE;


  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    logo_url TEXT,
    timezone TEXT DEFAULT 'UTC',
    working_days TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK (role IN ('Admin', 'Product Owner', 'Scrum Master', 'Developer', 'Stakeholder')) DEFAULT 'Developer',
    avatar_url TEXT,
    theme_preference TEXT DEFAULT 'dark',
    timezone TEXT DEFAULT 'UTC',
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    invite_accepted BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_token TEXT,
    reset_token TEXT,
    reset_token_expiry TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'Developer',
    token TEXT UNIQUE NOT NULL,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    accepted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK (status IN ('Active','On Hold','Completed')) DEFAULT 'Active',
    cover_color TEXT DEFAULT '#1976d2',
    cover_icon TEXT DEFAULT 'folder',
    pinned BOOLEAN DEFAULT FALSE,
    archived BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(project_id, user_id)
  );

  CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK (status IN ('To Do','In Progress','Review','Done'))
      DEFAULT 'To Do',
    priority TEXT CHECK (priority IN ('Low','Medium','High','Critical'))
      DEFAULT 'Medium',
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date DATE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE subtasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE task_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#1976d2'
  );

  CREATE TABLE task_label_assignments (
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    label_id UUID REFERENCES task_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
  );

  CREATE TABLE task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ,
    status TEXT CHECK (status IN ('Scheduled','In Progress','Completed'))
      DEFAULT 'Scheduled',
    agenda TEXT,
    summary TEXT,
    meeting_link TEXT,
    outcome TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE meeting_attendees (
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (meeting_id, user_id)
  );

  CREATE TABLE meeting_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    section TEXT CHECK (section IN ('Discussion','Decision','Action Item'))
      NOT NULL,
    content TEXT NOT NULL,
    converted_to_task BOOLEAN DEFAULT FALSE,
    due_date DATE,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    mimetype TEXT,
    size INTEGER,
    data BYTEA,
    is_private BOOLEAN DEFAULT FALSE,
    shared_with UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    title TEXT,
    favicon_url TEXT,
    is_private BOOLEAN DEFAULT FALSE,
    shared_with UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT CHECK (action IN ('created','updated','deleted','removed','uploaded','downloaded')) NOT NULL,
    changes JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    expires TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, subscription)
  );
  `);
  console.log('Database initialized successfully');
  process.exit(0);
}
init().catch(err => { console.error(err); process.exit(1); });
