import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCmsData, saveCmsData, updateSyncState, getPublicPortfolioData } from "./store";
import { syncGoogleDriveRoot, listUserDriveFolders } from "./drive-client";
import type { CmsProject, CmsSection } from "./types";

export const getDriveCmsState = createServerFn({ method: "GET" }).handler(async () => {
  return getCmsData();
});

export const getPublishedPortfolioDrive = createServerFn({ method: "GET" }).handler(async () => {
  return getPublicPortfolioData();
});

export const listDriveFoldersServer = createServerFn({ method: "POST" })
  .validator((token: string) => token)
  .handler(async ({ data: token }) => {
    if (!token) throw new Error("Missing access token");
    return listUserDriveFolders(token);
  });

export const connectAndSyncFolder = createServerFn({ method: "POST" })
  .validator((data: { folderId: string; folderName?: string; token?: string | null }) => data)
  .handler(async ({ data }) => {
    const folderId = data.folderId?.trim();
    if (!folderId) throw new Error("Please provide a Google Drive folder ID or link.");
    const token = data.token || getCmsData().syncState.access_token || null;

    const result = await syncGoogleDriveRoot(folderId, token);
    return {
      success: true,
      ...result,
      store: getCmsData(),
    };
  });

export const triggerSyncNow = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null }) => data)
  .handler(async ({ data }) => {
    const cms = getCmsData();
    const folderId = cms.syncState.root_folder_id;
    if (!folderId) throw new Error("No Google Drive folder connected yet.");
    const token = data?.token || cms.syncState.access_token || null;

    const result = await syncGoogleDriveRoot(folderId, token);
    return {
      success: true,
      ...result,
      store: getCmsData(),
    };
  });

export const updateProjectMetadataServer = createServerFn({ method: "POST" })
  .validator(
    (payload: {
      id: string;
      title?: string;
      description?: string;
      client_name?: string | null;
      project_year?: number | null;
      tags?: string[];
      featured?: boolean;
      custom_cover_path?: string | null;
      display_order?: number;
      published?: boolean;
      section_id?: string;
    }) => payload,
  )
  .handler(async ({ data: payload }) => {
    const store = getCmsData();
    const index = store.projects.findIndex((p) => p.id === payload.id);
    if (index === -1) throw new Error("Project not found");

    const current = store.projects[index];
    const updated: CmsProject = {
      ...current,
      ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
      ...(payload.description !== undefined ? { description: payload.description.trim() } : {}),
      ...(payload.client_name !== undefined ? { client_name: payload.client_name } : {}),
      ...(payload.project_year !== undefined ? { project_year: payload.project_year } : {}),
      ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
      ...(payload.featured !== undefined ? { featured: payload.featured } : {}),
      ...(payload.custom_cover_path !== undefined
        ? {
            custom_cover_path: payload.custom_cover_path,
            cover_path: payload.custom_cover_path || current.cover_path,
          }
        : {}),
      ...(payload.display_order !== undefined ? { display_order: payload.display_order } : {}),
      ...(payload.published !== undefined ? { published: payload.published } : {}),
      ...(payload.section_id !== undefined ? { section_id: payload.section_id } : {}),
      updated_at: new Date().toISOString(),
    };

    store.projects[index] = updated;
    saveCmsData(store);
    return updated;
  });

export const updateSectionMetadataServer = createServerFn({ method: "POST" })
  .validator(
    (payload: {
      id: string;
      name?: string;
      slug?: string;
      description?: string;
      display_order?: number;
      visible?: boolean;
    }) => payload,
  )
  .handler(async ({ data: payload }) => {
    const store = getCmsData();
    const index = store.sections.findIndex((s) => s.id === payload.id);
    if (index === -1) throw new Error("Section not found");

    const current = store.sections[index];
    const updated: CmsSection = {
      ...current,
      ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
      ...(payload.slug !== undefined ? { slug: payload.slug.trim() } : {}),
      ...(payload.description !== undefined ? { description: payload.description.trim() } : {}),
      ...(payload.display_order !== undefined ? { display_order: payload.display_order } : {}),
      ...(payload.visible !== undefined ? { visible: payload.visible } : {}),
      updated_at: new Date().toISOString(),
    };

    store.sections[index] = updated;
    saveCmsData(store);
    return updated;
  });

export const deleteProjectServer = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const store = getCmsData();
    store.projects = store.projects.filter((p) => p.id !== id);
    store.syncState.total_projects = store.projects.length;
    saveCmsData(store);
    return { success: true };
  });

export const deleteSectionServer = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const store = getCmsData();
    store.sections = store.sections.filter((s) => s.id !== id);
    store.projects = store.projects.filter((p) => p.section_id !== id);
    store.syncState.total_sections = store.sections.length;
    store.syncState.total_projects = store.projects.length;
    saveCmsData(store);
    return { success: true };
  });
