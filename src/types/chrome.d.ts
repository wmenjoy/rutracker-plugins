/// <reference types="chrome"/>

declare namespace Chrome {
  export type Runtime = typeof chrome.runtime;
  export type Tabs = typeof chrome.tabs;
  export type Storage = typeof chrome.storage;
} 