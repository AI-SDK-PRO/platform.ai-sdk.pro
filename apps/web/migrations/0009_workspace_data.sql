CREATE TABLE IF NOT EXISTS aisdk_pro.workspace_profile (
  user_id TEXT PRIMARY KEY REFERENCES aisdk_pro."user"(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  about_me TEXT NOT NULL DEFAULT '' CHECK (char_length(about_me) <= 500),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS aisdk_pro.prompt_preset (
  user_id TEXT NOT NULL REFERENCES aisdk_pro."user"(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 100),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 2000),
  provider TEXT NOT NULL CHECK (provider IN ('edge-glm', 'openai', 'anthropic', 'google')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot)
);
