/// <reference types="vite/client" />
/// <reference types="chrome" />

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
} 