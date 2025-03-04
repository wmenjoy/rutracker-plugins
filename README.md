# RuTracker Torrent Helper

A Chrome extension to help manage and download torrents from RuTracker.org.

## Features

- 🔍 **Smart Scanning**
  - Automatically scans for unread torrent topics (with class `torTopic` and `t-is-unread`)
  - Extracts both topic links and direct download links
  - Avoids duplicate entries

- 📋 **Torrent Management**
  - Lists all found torrents in a clean interface
  - Marks visited torrents with a different background
  - Supports batch selection of multiple torrents
  - Provides "Select All" and "Clear All" functionality

- 💾 **Download Options**
  - One-click direct torrent download
  - Preview torrent details before downloading
  - Batch download selected torrents
  - Automatically opens torrent pages and initiates downloads

- 🔄 **State Management**
  - Persists torrent list across browser sessions
  - Tracks visited/downloaded status
  - Real-time updates when new torrents are found

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the extension:
   ```bash
   pnpm build
   ```
4. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` directory

## Usage

1. Visit any RuTracker.org forum page
2. Click the extension icon in your browser toolbar
3. Click "Scan Page" to find unread torrents
4. You can:
   - Click "Preview" to view torrent details
   - Click "Download" to download individual torrents
   - Select multiple torrents and use "Download Selected"
   - Use "Clear All" to reset the list

## Development

- Built with TypeScript, React, and Tailwind CSS
- Uses Chrome Extension Manifest V3
- Managed with pnpm package manager

## Requirements

- Node.js 16+
- pnpm
- Chrome/Chromium browser 