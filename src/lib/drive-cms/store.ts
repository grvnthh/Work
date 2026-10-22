import fs from "node:fs";
import path from "node:path";
import type { CmsStoreData, DriveSyncState } from "./types";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "portfolio-cms.json");

const defaultSyncState: DriveSyncState = {
  connected: false,
  root_folder_id: null,
  root_folder_name: null,
  access_token: null,
  sync_status: "not_connected",
  last_synced: null,
  last_error: null,
  start_page_token: null,
  total_sections: 0,
  total_projects: 0,
};

const defaultData: CmsStoreData = {
  syncState: defaultSyncState,
  sections: [],
  projects: [],
};

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getCmsData(): CmsStoreData {
  try {
    ensureDataDir();
    if (!fs.existsSync(STORE_FILE)) {
      saveCmsData(defaultData);
      return defaultData;
    }
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<CmsStoreData>;
    return {
      syncState: {
        ...defaultSyncState,
        ...(parsed.syncState ?? {}),
      },
      sections: parsed.sections ?? [],
      projects: parsed.projects ?? [],
    };
  } catch (error) {
    console.error("[Drive CMS] Error reading store file:", error);
    return defaultData;
  }
}

export function saveCmsData(data: CmsStoreData): void {
  try {
    ensureDataDir();
    const tempFile = `${STORE_FILE}.${Date.now()}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempFile, STORE_FILE);
  } catch (error) {
    console.error("[Drive CMS] Error saving store file:", error);
  }
}

export function updateSyncState(partial: Partial<DriveSyncState>): DriveSyncState {
  const data = getCmsData();
  data.syncState = {
    ...data.syncState,
    ...partial,
  };
  saveCmsData(data);
  return data.syncState;
}

export function getPublicPortfolioData() {
  const data = getCmsData();
  const visibleSections = data.sections
    .filter((s) => s.visible)
    .sort((a, b) => a.display_order - b.display_order);

  const visibleSectionIds = new Set(visibleSections.map((s) => s.id));

  const publishedProjects = data.projects
    .filter((p) => p.published && visibleSectionIds.has(p.section_id))
    .sort((a, b) => a.display_order - b.display_order);

  return {
    sections: visibleSections,
    projects: publishedProjects,
    syncState: data.syncState,
  };
}
