# RuTracker Torrent Extension

A Chrome extension for enhancing RuTracker torrent downloads with batch operations and filtering capabilities.

## Features

- 🚀 Quick Toolbar Interface
  - Fixed position toolbar for easy access
  - Icon-based buttons with tooltips
  - Semi-transparent modern design

- 📥 Download Management
  - Single-click torrent downloads
  - Batch download support
  - Download progress indication
  - Automatic file naming using torrent titles

- 🔍 Content Filtering
  - Filter torrents by date (24h, 3 days, 7 days, 30 days)
  - Toggle between read/unread items
  - Batch preview in new tabs

- ✨ User Experience
  - Checkbox selection for multiple items
  - Visual progress tracking
  - Login status detection
  - Error handling with clear messages

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/rutracker-torrent-extension.git
```

2. Install dependencies:
```bash
pnpm install
```

3. Build the extension:
```bash
pnpm build
```

4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder from the project directory

## Usage

### Basic Operations

1. **Single Download**
   - Click the download icon next to any torrent to download it directly

2. **Batch Operations**
   - Use checkboxes to select multiple torrents
   - Click the batch download button to download all selected items
   - Use the "Select All" button to toggle all checkboxes

3. **Filtering**
   - Use the dropdown to select a time range
   - Click the filter button to apply the selection
   - Use the eye icon to toggle between read/unread items

4. **Preview**
   - Select multiple items and use the preview button to open them in new tabs

### Toolbar Functions

- 📋 Select All: Toggle selection of all visible torrents
- ⏲️ Time Filter: Filter torrents by their update time
- 👁️ Read Status: Toggle selection based on read/unread status
- 🔍 Preview: Open selected torrents in new tabs
- ⬇️ Download: Start downloading selected torrents

## Development

### Commands

```bash
# Install dependencies
pnpm install

# Development build with watch mode
pnpm dev

# Production build
pnpm build

# Format code
pnpm format
```

### Project Structure

- Built with TypeScript, React, and Tailwind CSS
- Uses Chrome Extension Manifest V3
- Managed with pnpm package manager

## Requirements

- Node.js 16+
- pnpm
- Chrome/Chromium browser 