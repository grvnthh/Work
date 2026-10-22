export type DriveMediaKind = "image" | "video" | "pdf" | "other";

export type DriveAsset = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  thumbnailUrl?: string;
  kind: DriveMediaKind;
  size?: number;
  relativePath?: string;
};

export type CmsSection = {
  id: string;
  drive_id: string;
  name: string;
  slug: string;
  description: string;
  cover_path: string | null;
  display_order: number;
  visible: boolean;
  created_at: string;
  updated_at: string;
};

export type CmsProject = {
  id: string;
  drive_id: string;
  drive_type: "file" | "folder";
  section_id: string;
  title: string;
  description: string;
  media_paths: string[];
  assets: DriveAsset[];
  cover_path: string | null;
  custom_cover_path?: string | null;
  video_path: string | null;
  video_url: string | null;
  tags: string[];
  client_name: string | null;
  project_year: number | null;
  featured: boolean;
  display_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
};

export type DriveSyncStatus = "synced" | "syncing" | "error" | "not_connected";

export type DriveSyncState = {
  connected: boolean;
  root_folder_id: string | null;
  root_folder_name: string | null;
  access_token: string | null;
  sync_status: DriveSyncStatus;
  last_synced: string | null;
  last_error: string | null;
  start_page_token: string | null;
  total_sections: number;
  total_projects: number;
};

export type CmsStoreData = {
  syncState: DriveSyncState;
  sections: CmsSection[];
  projects: CmsProject[];
};
