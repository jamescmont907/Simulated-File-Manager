CREATE DATABASE IF NOT EXISTS simulated_file_manager;
USE simulated_file_manager;

DROP TABLE IF EXISTS fs_nodes;

CREATE TABLE fs_nodes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  parent_id   INT NULL,
  name        VARCHAR(255) NOT NULL,
  type        ENUM('folder', 'file') NOT NULL,
  content     LONGTEXT NULL,
  size        INT DEFAULT 0,
  original_parent_id INT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES fs_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Root
INSERT INTO fs_nodes (id, parent_id, name, type) VALUES (1, NULL, 'My Computer', 'folder');

-- Top-level folders
INSERT INTO fs_nodes (id, parent_id, name, type) VALUES (2, 1, 'Documents', 'folder');
INSERT INTO fs_nodes (id, parent_id, name, type) VALUES (3, 1, 'Pictures', 'folder');
INSERT INTO fs_nodes (id, parent_id, name, type) VALUES (4, 1, 'Music', 'folder');
INSERT INTO fs_nodes (id, parent_id, name, type) VALUES (5, 1, 'Downloads', 'folder');
INSERT INTO fs_nodes (id, parent_id, name, type) VALUES (6, 1, 'Programs', 'folder');
INSERT INTO fs_nodes (id, parent_id, name, type) VALUES (7, 1, 'Trash', 'folder');

-- Documents files
INSERT INTO fs_nodes (parent_id, name, type, content, size) VALUES
  (2, 'README.txt', 'file', 'Welcome to the Simulated File Manager!\n\nThis is a virtual filesystem that runs entirely in your browser.\nFeel free to create, rename, and delete files and folders.', 156),
  (2, 'notes.txt', 'file', 'TODO:\n- Learn more about Node.js\n- Build something cool\n- Take a break', 68);

-- Pictures files
INSERT INTO fs_nodes (parent_id, name, type, content, size) VALUES
  (3, 'sunset.bmp', 'file', '[Simulated bitmap image - 640x480 pixels]', 42),
  (3, 'pixel_art.bmp', 'file', '[Simulated pixel art - 32x32 pixels]', 36);

-- Music files
INSERT INTO fs_nodes (parent_id, name, type, content, size) VALUES
  (4, 'playlist.txt', 'file', '1. Retro Wave - Synthmaster\n2. Pixel Dreams - Chiptune\n3. 8-Bit Adventure - NES Band', 82);

-- Programs files
INSERT INTO fs_nodes (parent_id, name, type, content, size) VALUES
  (6, 'hello.exe', 'file', '[Simulated executable - prints Hello World]', 44),
  (6, 'editor.exe', 'file', '[Simulated text editor application]', 35),
  (6, 'clock.exe', 'file', '[Neon Clock - a retro digital/analog clock application]', 55),
  (6, 'h4ck3r.exe', 'file', '[CLASSIFIED - UNAUTHORIZED ACCESS TOOL v3.1.7]', 47),
  (6, 'd3f3nd.exe', 'file', '[FIREWALL DEFENSE SYSTEM - Quick-Time Coding Game]', 51),
  (6, 'worm.exe', 'file', '[WARNING: DIGITAL WORM - Will consume files in current directory!]', 65),
  (6, 'browser.exe', 'file', '[NeonNet Browser v1.0 - Surf the retro web]', 44);
