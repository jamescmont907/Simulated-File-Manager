const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: 'simulated_file_manager',
  waitForConnections: true,
  connectionLimit: 10
});

app.locals.db = pool;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', apiRouter);

app.listen(PORT, () => {
  console.log(`Simulated File Manager running at http://localhost:${PORT}`);
});
