# LeetCode Time Tracker Chrome Extension

A Chrome extension that tracks time spent on LeetCode problems and displays problem information.

## Features

- **Time Tracking**: Tracks time spent on each LeetCode problem tab
- **Problem Data Extraction**: Extracts problem title, difficulty, tags, and type
- **Real-time Display**: Shows current problem information and time spent
- **Problem Storage**: Automatically saves problem data to localStorage
- **Last Question Button**: Quick access to the most recently used problem
- **Statistics**: View total problems solved, time spent, and most used problems
- **TypeScript**: Fully written in TypeScript with proper type safety

## Development

### Prerequisites

- Node.js (v16 or higher)
- npm

### Setup

1. Install dependencies:
   ```bash
   npm run install-deps
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select this directory

### Development Commands

- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch for changes and recompile automatically
- `npm run clean` - Remove compiled JavaScript files
- `npm run dev` - Clean and build in one command

### Project Structure

```
src/
├── background.ts        # Service worker (background script)
├── content.ts           # Content script for LeetCode pages
├── popup.ts             # Popup UI script
└── storage-manager.ts   # Problem data storage management

# Compiled output (generated)
background.js
content.js
popup.js
storage-manager.js

# Extension files
manifest.json         # Chrome extension manifest
popup.html           # Popup UI HTML
```

## How It Works

1. **Background Script**: Manages time tracking for different problem titles
2. **Content Script**: Extracts problem data from LeetCode pages and saves to storage
3. **Storage Manager**: Handles problem data persistence and retrieval
4. **Popup**: Displays current problem information, time spent, and provides quick access to last question

## Usage

1. **Visit a LeetCode Problem**: Go to any LeetCode problem page (e.g., https://leetcode.com/problems/two-sum/)
2. **Open Extension**: Click the extension icon to see problem details and timer
3. **View Statistics**: Click the "Stats" button to see your problem-solving statistics
4. **Quick Access**: Use the "Open Last Question" button to quickly return to your most recent problem

## Type Safety

The extension uses TypeScript for:
- Chrome API type definitions
- Data structure validation
- Better IDE support and error catching
- Improved maintainability

## Building for Production

1. Run `npm run build` to compile TypeScript
2. The compiled JavaScript files will be generated in the root directory
3. Load the extension in Chrome using the compiled files
