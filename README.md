# Simulated File Manager

A retro-styled virtual file manager web app with a neon chaos vaporwave theme. Browse folders, create/edit/delete files, and run built-in programs — all in the browser.

## Features

- Virtual filesystem with folders and files (stored in MySQL)
- Notepad++-style text editor with syntax highlighting, search/replace, and line numbers
- Built-in programs: Clock, Hacker Simulator, Defense Game, Worm
- Trash/Recycle Bin with restore and permanent delete
- Grid and list view modes
- Retro pixel art UI with CRT overlay, particle background, and chiptune sound effects

## Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- [XAMPP](https://www.apachefriends.org/) (or any MySQL server running on port 3306)

## Setup

1. Clone or download this project.

2. Install dependencies:
   ```
   npm install
   ```

3. Start MySQL (via XAMPP or your preferred method).

4. Seed the database:
   ```
   mysql -u root < db/init.sql
   ```

5. Start the server:
   ```
   npm start
   ```

6. Open http://localhost:3000 in your browser.

## Project Structure

```
Simulated File Manager/
  db/init.sql        - Database schema and seed data
  public/
    index.html       - Main page
    css/style.css    - All styles
    js/app.js        - All client-side logic
  routes/api.js      - REST API endpoints
  server.js          - Express server entry point
```
