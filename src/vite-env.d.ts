/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION_CODE?: string;
  readonly VITE_APP_VERSION_NAME?: string;
  readonly [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
