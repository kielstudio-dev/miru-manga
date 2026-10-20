import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import { Page } from '../types';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'];

function isImageFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  // Filter out macOS hidden metadata files (e.g., __MACOSX/.DS_Store)
  if (lower.includes('__macosx') || lower.startsWith('.')) return false;
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// Natural sort for page numbers (e.g., "1.jpg", "2.jpg", "10.jpg")
function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export async function extractCbzArchive(
  archiveUri: string,
  mangaId: string,
  chapterId: string
): Promise<Page[]> {
  try {
    // 1. Read archive file as Base64
    let base64Data: string;

    if (archiveUri.startsWith('data:') || archiveUri.startsWith('blob:') || archiveUri.startsWith('http')) {
      // In web or network fetch
      const resp = await fetch(archiveUri);
      const arrayBuffer = await resp.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      return await extractZipEntries(zip, mangaId, chapterId);
    } else {
      // Native FileSystem
      base64Data = await FileSystem.readAsStringAsync(archiveUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const zip = await JSZip.loadAsync(base64Data, { base64: true });
      return await extractZipEntries(zip, mangaId, chapterId);
    }
  } catch (err) {
    console.error('[ArchiveService] Failed to extract CBZ/ZIP archive:', err);
    throw new Error('Unable to extract comic archive. The file may be corrupted.');
  }
}

async function extractZipEntries(
  zip: JSZip,
  mangaId: string,
  chapterId: string
): Promise<Page[]> {
  const imageEntries = Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir && isImageFile(name))
    .sort(naturalSort);

  if (imageEntries.length === 0) {
    throw new Error('No readable comic pages found in this archive.');
  }

  // Ensure output directory exists if on native
  const baseDir = FileSystem.cacheDirectory
    ? `${FileSystem.cacheDirectory}manga_pages/${mangaId}/${chapterId}/`
    : null;

  if (baseDir) {
    const dirInfo = await FileSystem.getInfoAsync(baseDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
    }
  }

  const pages: Page[] = [];

  for (let i = 0; i < imageEntries.length; i++) {
    const filename = imageEntries[i];
    const zipFile = zip.files[filename];

    if (baseDir) {
      // Extract to native local cache file
      const ext = filename.substring(filename.lastIndexOf('.'));
      const targetFilePath = `${baseDir}page_${i.toString().padStart(4, '0')}${ext}`;

      const base64 = await zipFile.async('base64');
      await FileSystem.writeAsStringAsync(targetFilePath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      pages.push({
        index: i,
        url: targetFilePath,
      });
    } else {
      // Web fallback: base64 data URI
      const base64 = await zipFile.async('base64');
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpeg';
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const dataUri = `data:${mime};base64,${base64}`;

      pages.push({
        index: i,
        url: dataUri,
      });
    }
  }

  return pages;
}
