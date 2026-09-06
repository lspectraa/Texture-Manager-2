import { afterEach, describe, expect, it, vi } from "vitest";
import {
  androidGetStorageStatus,
  type AndroidStorageStatus,
} from "./tauriAndroidStorage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tauriAndroidStorage", () => {
  it("uses test override when __TM2_TEST_STORAGE_STATUS__ is present", async () => {
    const mockStatus: AndroidStorageStatus = {
      allFilesGranted: true,
      geodeReadable: false,
      geodePath: null,
    };
    vi.stubGlobal("window", {
      __TM2_TEST_STORAGE_STATUS__: mockStatus,
    });

    const result = await androidGetStorageStatus();
    expect(result).toEqual(mockStatus);
  });

  it("returns default status outside of Tauri runtime", async () => {
    vi.stubGlobal("window", {});
    const result = await androidGetStorageStatus();
    expect(result).toEqual({
      allFilesGranted: true,
      geodeReadable: true,
      geodePath: null,
    });
  });
});
