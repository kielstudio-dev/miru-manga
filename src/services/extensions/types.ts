export type ExtensionType = 'madara' | 'mangastream' | 'mangadex' | 'custom';

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  lang: string;
  icon: string;
  baseUrl: string;
  type: ExtensionType;
  description?: string;
  isNsfw?: boolean;
  installed?: boolean;
  headers?: Record<string, string>;
}

export interface ExtensionRepository {
  id: string;
  name: string;
  url: string;
  extensions: ExtensionManifest[];
}
