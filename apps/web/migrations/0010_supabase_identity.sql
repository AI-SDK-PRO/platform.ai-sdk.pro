CREATE TABLE IF NOT EXISTS aisdk_pro.auth_identity (
  supabase_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  user_id text NOT NULL UNIQUE REFERENCES aisdk_pro."user"(id) ON DELETE CASCADE
);

-- Workspace data is accessed through server routes with explicit owner checks.
REVOKE ALL ON SCHEMA aisdk_pro FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA aisdk_pro FROM PUBLIC, anon, authenticated;
ALTER TABLE aisdk_pro.auth_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE aisdk_pro."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE aisdk_pro.account ENABLE ROW LEVEL SECURITY;
ALTER TABLE aisdk_pro.session ENABLE ROW LEVEL SECURITY;
ALTER TABLE aisdk_pro.verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE aisdk_pro.imported_repository ENABLE ROW LEVEL SECURITY;
ALTER TABLE aisdk_pro.repository_file ENABLE ROW LEVEL SECURITY;
ALTER TABLE aisdk_pro.platform_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE aisdk_pro.deployment_project ENABLE ROW LEVEL SECURITY;
ALTER TABLE aisdk_pro.deployment_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE aisdk_pro.workspace_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE aisdk_pro.prompt_preset ENABLE ROW LEVEL SECURITY;
ALTER TABLE aisdk_pro.platform_migration_version ENABLE ROW LEVEL SECURITY;
