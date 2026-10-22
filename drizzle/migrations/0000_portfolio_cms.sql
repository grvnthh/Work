CREATE TABLE public.portfolio_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text NOT NULL DEFAULT '',
  cover_path text,
  display_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.portfolio_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_sections TO authenticated;
GRANT ALL ON public.portfolio_sections TO service_role;
ALTER TABLE public.portfolio_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Visible portfolio sections are public" ON public.portfolio_sections FOR SELECT TO anon, authenticated USING (visible OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'grvnth.design@gmail.com');
CREATE POLICY "Portfolio admin manages sections" ON public.portfolio_sections FOR ALL TO authenticated USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'grvnth.design@gmail.com') WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'grvnth.design@gmail.com');
CREATE TABLE public.portfolio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.portfolio_sections(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  media_paths text[] NOT NULL DEFAULT '{}',
  video_path text,
  video_url text,
  tags text[] NOT NULL DEFAULT '{}',
  client_name text,
  project_year integer,
  featured boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.portfolio_projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_projects TO authenticated;
GRANT ALL ON public.portfolio_projects TO service_role;
ALTER TABLE public.portfolio_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published work in visible sections is public" ON public.portfolio_projects FOR SELECT TO anon, authenticated USING (published AND EXISTS (SELECT 1 FROM public.portfolio_sections s WHERE s.id = section_id AND s.visible) OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'grvnth.design@gmail.com');
CREATE POLICY "Portfolio admin manages projects" ON public.portfolio_projects FOR ALL TO authenticated USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'grvnth.design@gmail.com') WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'grvnth.design@gmail.com');
CREATE INDEX portfolio_projects_section_order_idx ON public.portfolio_projects (section_id, display_order);
CREATE INDEX portfolio_projects_published_order_idx ON public.portfolio_projects (published, display_order);