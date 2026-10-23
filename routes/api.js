const express = require('express');
const router = express.Router();

function getDb(req) {
  return req.app.locals.db;
}

// Get trash folder id (must be before /fs/:id)
router.get('/fs/trash/id', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute("SELECT id FROM fs_nodes WHERE name = 'Trash' AND parent_id = 1 AND type = 'folder' LIMIT 1");
    if (rows.length === 0) return res.status(404).json({ error: 'Trash folder not found' });
    res.json({ trashId: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Empty trash (must be before /fs/:id)
router.delete('/fs/trash/empty', async (req, res) => {
  try {
    const db = getDb(req);
    const [trash] = await db.execute("SELECT id FROM fs_nodes WHERE name = 'Trash' AND parent_id = 1 AND type = 'folder' LIMIT 1");
    if (trash.length === 0) return res.status(500).json({ error: 'Trash folder not found' });

    await db.execute('DELETE FROM fs_nodes WHERE parent_id = ?', [trash[0].id]);
    res.json({ emptied: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get node info + children if folder
router.get('/fs/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Node not found' });

    const node = rows[0];
    let children = [];
    if (node.type === 'folder') {
      const [childRows] = await db.execute(
        'SELECT id, parent_id, name, type, size, created_at, modified_at FROM fs_nodes WHERE parent_id = ? ORDER BY type ASC, name ASC',
        [node.id]
      );
      children = childRows;
    }
    res.json({ node, children });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get file content
router.get('/fs/:id/content', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Node not found' });
    if (rows[0].type !== 'file') return res.status(400).json({ error: 'Not a file' });
    res.json({ content: rows[0].content || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get breadcrumb path from root to node
router.get('/fs/:id/path', async (req, res) => {
  try {
    const db = getDb(req);
    const path = [];
    let currentId = parseInt(req.params.id);

    while (currentId) {
      const [rows] = await db.execute('SELECT id, parent_id, name FROM fs_nodes WHERE id = ?', [currentId]);
      if (rows.length === 0) break;
      path.unshift({ id: rows[0].id, name: rows[0].name });
      currentId = rows[0].parent_id;
    }
    res.json({ path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create file or folder
router.post('/fs/create', async (req, res) => {
  try {
    const db = getDb(req);
    const { parentId, name, type, content } = req.body;

    if (!name || !type || !parentId) {
      return res.status(400).json({ error: 'Missing required fields: parentId, name, type' });
    }
    if (type !== 'file' && type !== 'folder') {
      return res.status(400).json({ error: 'Type must be "file" or "folder"' });
    }

    const [parent] = await db.execute('SELECT * FROM fs_nodes WHERE id = ? AND type = "folder"', [parentId]);
    if (parent.length === 0) return res.status(404).json({ error: 'Parent folder not found' });

    const [dupes] = await db.execute(
      'SELECT id FROM fs_nodes WHERE parent_id = ? AND name = ? AND type = ?',
      [parentId, name, type]
    );
    if (dupes.length > 0) return res.status(409).json({ error: 'An item with that name already exists' });

    const size = type === 'file' ? (content ? Buffer.byteLength(content, 'utf8') : 0) : 0;
    const [result] = await db.execute(
      'INSERT INTO fs_nodes (parent_id, name, type, content, size) VALUES (?, ?, ?, ?, ?)',
      [parentId, name, type, type === 'file' ? (content || '') : null, size]
    );

    const [newNode] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [result.insertId]);
    res.status(201).json({ node: newNode[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rename
router.put('/fs/:id/rename', async (req, res) => {
  try {
    const db = getDb(req);
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const [rows] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Node not found' });
    if (rows[0].parent_id === null) return res.status(400).json({ error: 'Cannot rename root' });

    const [dupes] = await db.execute(
      'SELECT id FROM fs_nodes WHERE parent_id = ? AND name = ? AND type = ? AND id != ?',
      [rows[0].parent_id, name, rows[0].type, req.params.id]
    );
    if (dupes.length > 0) return res.status(409).json({ error: 'An item with that name already exists' });

    await db.execute('UPDATE fs_nodes SET name = ? WHERE id = ?', [name, req.params.id]);
    const [updated] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [req.params.id]);
    res.json({ node: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update file content
router.put('/fs/:id/content', async (req, res) => {
  try {
    const db = getDb(req);
    const { content } = req.body;

    const [rows] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Node not found' });
    if (rows[0].type !== 'file') return res.status(400).json({ error: 'Not a file' });

    const size = content ? Buffer.byteLength(content, 'utf8') : 0;
    await db.execute('UPDATE fs_nodes SET content = ?, size = ? WHERE id = ?', [content || '', size, req.params.id]);
    const [updated] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [req.params.id]);
    res.json({ node: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Move to trash
router.post('/fs/:id/trash', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Node not found' });
    if (rows[0].parent_id === null) return res.status(400).json({ error: 'Cannot trash root' });

    const [trash] = await db.execute("SELECT id FROM fs_nodes WHERE name = 'Trash' AND parent_id = 1 AND type = 'folder' LIMIT 1");
    if (trash.length === 0) return res.status(500).json({ error: 'Trash folder not found' });
    const trashId = trash[0].id;

    if (rows[0].id === trashId) return res.status(400).json({ error: 'Cannot trash the Trash folder' });

    await db.execute('UPDATE fs_nodes SET original_parent_id = parent_id, parent_id = ? WHERE id = ?', [trashId, req.params.id]);
    res.json({ trashed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore from trash
router.post('/fs/:id/restore', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Node not found' });

    const restoreTo = rows[0].original_parent_id || 1;
    const [parent] = await db.execute('SELECT id FROM fs_nodes WHERE id = ?', [restoreTo]);
    const targetId = parent.length > 0 ? restoreTo : 1;

    await db.execute('UPDATE fs_nodes SET parent_id = ?, original_parent_id = NULL WHERE id = ?', [targetId, req.params.id]);
    res.json({ restored: true, parentId: targetId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Permanent delete (bypass trash)
router.delete('/fs/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Node not found' });
    if (rows[0].parent_id === null) return res.status(400).json({ error: 'Cannot delete root' });

    await db.execute('DELETE FROM fs_nodes WHERE id = ?', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Copy node to target folder
router.post('/fs/:id/copy', async (req, res) => {
  try {
    const db = getDb(req);
    const { targetId } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId is required' });

    const [source] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [req.params.id]);
    if (source.length === 0) return res.status(404).json({ error: 'Source not found' });

    const [target] = await db.execute('SELECT * FROM fs_nodes WHERE id = ? AND type = "folder"', [targetId]);
    if (target.length === 0) return res.status(404).json({ error: 'Target folder not found' });

    async function copyNode(node, newParentId) {
      const [result] = await db.execute(
        'INSERT INTO fs_nodes (parent_id, name, type, content, size) VALUES (?, ?, ?, ?, ?)',
        [newParentId, node.name, node.type, node.content, node.size]
      );
      if (node.type === 'folder') {
        const [children] = await db.execute('SELECT * FROM fs_nodes WHERE parent_id = ?', [node.id]);
        for (const child of children) {
          await copyNode(child, result.insertId);
        }
      }
      return result.insertId;
    }

    const newId = await copyNode(source[0], parseInt(targetId));
    const [newNode] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [newId]);
    res.status(201).json({ node: newNode[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Move node to target folder
router.post('/fs/:id/move', async (req, res) => {
  try {
    const db = getDb(req);
    const { targetId } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId is required' });

    const [source] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [req.params.id]);
    if (source.length === 0) return res.status(404).json({ error: 'Source not found' });
    if (source[0].parent_id === null) return res.status(400).json({ error: 'Cannot move root' });

    const [target] = await db.execute('SELECT * FROM fs_nodes WHERE id = ? AND type = "folder"', [targetId]);
    if (target.length === 0) return res.status(404).json({ error: 'Target folder not found' });

    // Prevent moving a folder into its own descendant
    let checkId = parseInt(targetId);
    while (checkId) {
      if (checkId === parseInt(req.params.id)) {
        return res.status(400).json({ error: 'Cannot move a folder into itself or its descendants' });
      }
      const [r] = await db.execute('SELECT parent_id FROM fs_nodes WHERE id = ?', [checkId]);
      checkId = r.length > 0 ? r[0].parent_id : null;
    }

    await db.execute('UPDATE fs_nodes SET parent_id = ? WHERE id = ?', [targetId, req.params.id]);
    const [updated] = await db.execute('SELECT * FROM fs_nodes WHERE id = ?', [req.params.id]);
    res.json({ node: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
