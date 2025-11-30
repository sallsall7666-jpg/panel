const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ott_panel',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Create connection pool
const pool = mysql.createPool(DB_CONFIG);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Authentication Middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Admin-only middleware
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ==================== DATABASE INITIALIZATION ====================
async function initDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // Create tables
    await connection.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'superadmin') DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS resellers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        credits INT DEFAULT 0,
        commission DECIMAL(5,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS packages (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        duration VARCHAR(50) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        connections INT DEFAULT 1,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        package_id INT,
        status ENUM('active', 'expired', 'suspended') DEFAULT 'active',
        expiry_date DATE,
        max_connections INT DEFAULT 1,
        revenue DECIMAL(10,2) DEFAULT 0,
        reseller_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL,
        FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE SET NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS playlists (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        url TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'M3U',
        category VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS channels (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50),
        stream_url TEXT NOT NULL,
        logo_url TEXT,
        epg_id VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        ip_address VARCHAR(45),
        device VARCHAR(100),
        login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_type ENUM('admin', 'reseller', 'user'),
        user_id INT,
        action VARCHAR(100) NOT NULL,
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_created_at (created_at),
        INDEX idx_user (user_type, user_id)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_agents (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        device VARCHAR(100),
        ip_address VARCHAR(45),
        location VARCHAR(100),
        connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        key_name VARCHAR(50) UNIQUE NOT NULL,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create default admin if not exists
    const [admins] = await connection.query('SELECT * FROM admins LIMIT 1');
    if (admins.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await connection.query(
        'INSERT INTO admins (username, email, password, role) VALUES (?, ?, ?, ?)',
        ['admin', 'admin@ottnavigator.com', hashedPassword, 'superadmin']
      );
      console.log('✅ Default admin created: admin / admin123');
    }

    connection.release();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

// ==================== AUTHENTICATION ROUTES ====================

// Admin Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const [admins] = await pool.query(
      'SELECT * FROM admins WHERE username = ? OR email = ?',
      [username, username]
    );

    if (admins.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = admins[0];
    const validPassword = await bcrypt.compare(password, admin.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_type, user_id, action, ip_address) VALUES (?, ?, ?, ?)',
      ['admin', admin.id, 'Login', req.ip]
    );

    res.json({
      token,
      user: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Change Password
app.post('/api/auth/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const [admins] = await pool.query('SELECT * FROM admins WHERE id = ?', [req.user.id]);
    const admin = admins[0];

    const validPassword = await bcrypt.compare(currentPassword, admin.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ==================== USERS ROUTES ====================

// Get all users
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT u.*, p.name as package_name, r.username as reseller_name
      FROM users u
      LEFT JOIN packages p ON u.package_id = p.id
      LEFT JOIN resellers r ON u.reseller_id = r.id
      ORDER BY u.created_at DESC
    `);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create user
app.post('/api/users', authenticate, async (req, res) => {
  try {
    const { username, email, password, package_id, expiry_date, max_connections, revenue, reseller_id } = req.body;
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await pool.query(
      `INSERT INTO users (username, email, password, package_id, expiry_date, max_connections, revenue, reseller_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, email, hashedPassword, package_id, expiry_date, max_connections, revenue || 0, reseller_id]
    );

    await pool.query(
      'INSERT INTO activity_logs (user_type, user_id, action, details) VALUES (?, ?, ?, ?)',
      ['admin', req.user.id, 'User Created', `Created user: ${username}`]
    );

    res.json({ id: result.insertId, message: 'User created successfully' });
  } catch (error) {
    console.error(error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Username or email already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
});

// Update user
app.put('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, package_id, status, expiry_date, max_connections, revenue } = req.body;
    
    await pool.query(
      `UPDATE users SET username = ?, email = ?, package_id = ?, status = ?, 
       expiry_date = ?, max_connections = ?, revenue = ? WHERE id = ?`,
      [username, email, package_id, status, expiry_date, max_connections, revenue, id]
    );

    await pool.query(
      'INSERT INTO activity_logs (user_type, user_id, action, details) VALUES (?, ?, ?, ?)',
      ['admin', req.user.id, 'User Updated', `Updated user ID: ${id}`]
    );

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
app.delete('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query('DELETE FROM users WHERE id = ?', [id]);

    await pool.query(
      'INSERT INTO activity_logs (user_type, user_id, action, details) VALUES (?, ?, ?, ?)',
      ['admin', req.user.id, 'User Deleted', `Deleted user ID: ${id}`]
    );

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Bulk extend expiry
app.post('/api/users/bulk-extend', authenticate, async (req, res) => {
  try {
    const { userIds, days } = req.body;
    
    await pool.query(
      `UPDATE users SET expiry_date = DATE_ADD(expiry_date, INTERVAL ? DAY) WHERE id IN (?)`,
      [days, userIds]
    );

    await pool.query(
      'INSERT INTO activity_logs (user_type, user_id, action, details) VALUES (?, ?, ?, ?)',
      ['admin', req.user.id, 'Bulk Extend', `Extended ${userIds.length} users by ${days} days`]
    );

    res.json({ message: 'Users extended successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to extend users' });
  }
});

// ==================== PACKAGES ROUTES ====================

app.get('/api/packages', authenticate, async (req, res) => {
  try {
    const [packages] = await pool.query('SELECT * FROM packages ORDER BY price ASC');
    res.json(packages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

app.post('/api/packages', authenticate, async (req, res) => {
  try {
    const { name, duration, price, connections, description } = req.body;
    
    const [result] = await pool.query(
      'INSERT INTO packages (name, duration, price, connections, description) VALUES (?, ?, ?, ?, ?)',
      [name, duration, price, connections, description]
    );

    res.json({ id: result.insertId, message: 'Package created successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create package' });
  }
});

app.delete('/api/packages/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM packages WHERE id = ?', [req.params.id]);
    res.json({ message: 'Package deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete package' });
  }
});

// ==================== RESELLERS ROUTES ====================

app.get('/api/resellers', authenticate, async (req, res) => {
  try {
    const [resellers] = await pool.query('SELECT * FROM resellers ORDER BY created_at DESC');
    res.json(resellers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch resellers' });
  }
});

app.post('/api/resellers', authenticate, async (req, res) => {
  try {
    const { username, email, password, credits, commission } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await pool.query(
      'INSERT INTO resellers (username, email, password, credits, commission) VALUES (?, ?, ?, ?, ?)',
      [username, email, hashedPassword, credits, commission]
    );

    res.json({ id: result.insertId, message: 'Reseller created successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create reseller' });
  }
});

// ==================== CHANNELS ROUTES ====================

app.get('/api/channels', authenticate, async (req, res) => {
  try {
    const [channels] = await pool.query('SELECT * FROM channels ORDER BY category, name');
    res.json(channels);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

app.post('/api/channels', authenticate, async (req, res) => {
  try {
    const { name, category, stream_url, logo_url, epg_id } = req.body;
    
    const [result] = await pool.query(
      'INSERT INTO channels (name, category, stream_url, logo_url, epg_id) VALUES (?, ?, ?, ?, ?)',
      [name, category, stream_url, logo_url, epg_id]
    );

    res.json({ id: result.insertId, message: 'Channel created successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// ==================== M3U PLAYLIST GENERATION ====================

app.get('/api/playlist/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const auth = req.query.auth;

    // Verify user
    const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(404).send('User not found');
    }

    const user = users[0];

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).send('User account is not active');
    }

    // Check expiry
    if (new Date(user.expiry_date) < new Date()) {
      return res.status(403).send('Subscription expired');
    }

    // Get channels
    const [channels] = await pool.query('SELECT * FROM channels WHERE is_active = TRUE');

    // Generate M3U
    let m3u = '#EXTM3U\n';
    m3u += `#EXTINF:-1 tvg-logo="" group-title="Info",User: ${username}\n`;
    m3u += 'http://\n';

    channels.forEach(channel => {
      m3u += `#EXTINF:-1 tvg-id="${channel.epg_id || ''}" tvg-logo="${channel.logo_url || ''}" group-title="${channel.category}",${channel.name}\n`;
      m3u += `${channel.stream_url}\n`;
    });

    // Log access
    await pool.query(
      'INSERT INTO activity_logs (user_type, user_id, action, ip_address) VALUES (?, ?, ?, ?)',
      ['user', user.id, 'Playlist Downloaded', req.ip]
    );

    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.setHeader('Content-Disposition', `attachment; filename="${username}.m3u"`);
    res.send(m3u);
  } catch (error) {
    res.status(500).send('Failed to generate playlist');
  }
});

// ==================== XTREAM CODES API ====================

app.get('/player_api.php', async (req, res) => {
  try {
    const { username, password, action } = req.query;

    const [users] = await pool.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      return res.json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.json({ error: 'Invalid credentials' });
    }

    if (action === 'get_live_categories') {
      const [categories] = await pool.query('SELECT DISTINCT category FROM channels');
      res.json(categories.map((c, i) => ({ category_id: i + 1, category_name: c.category })));
    } else if (action === 'get_live_streams') {
      const [channels] = await pool.query('SELECT * FROM channels WHERE is_active = TRUE');
      res.json(channels.map(c => ({
        num: c.id,
        name: c.name,
        stream_type: 'live',
        stream_id: c.id,
        stream_icon: c.logo_url,
        epg_channel_id: c.epg_id,
        category_id: 1
      })));
    } else {
      res.json({
        user_info: {
          username: user.username,
          password: password,
          message: '',
          auth: 1,
          status: user.status === 'active' ? 'Active' : 'Banned',
          exp_date: new Date(user.expiry_date).getTime() / 1000,
          is_trial: '0',
          active_cons: '0',
          created_at: new Date(user.created_at).getTime() / 1000,
          max_connections: user.max_connections
        },
        server_info: {
          url: req.protocol + '://' + req.get('host'),
          port: '',
          https_port: '',
          server_protocol: 'http',
          rtmp_port: '',
          timezone: 'Asia/Kuala_Lumpur'
        }
      });
    }
  } catch (error) {
    res.json({ error: 'API error' });
  }
});

// ==================== STATISTICS ====================

app.get('/api/stats', authenticate, async (req, res) => {
  try {
    const [totalUsers] = await pool.query('SELECT COUNT(*) as count FROM users');
    const [activeUsers] = await pool.query('SELECT COUNT(*) as count FROM users WHERE status = "active"');
    const [totalResellers] = await pool.query('SELECT COUNT(*) as count FROM resellers');
    const [totalRevenue] = await pool.query('SELECT SUM(revenue) as total FROM users');
    const [todayUsers] = await pool.query('SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = CURDATE()');
    const [monthlyUsers] = await pool.query('SELECT COUNT(*) as count FROM users WHERE MONTH(created_at) = MONTH(CURDATE())');

    res.json({
      totalUsers: totalUsers[0].count,
      activeUsers: activeUsers[0].count,
      totalResellers: totalResellers[0].count,
      totalRevenue: totalRevenue[0].total || 0,
      todayCreated: todayUsers[0].count,
      monthlyCreated: monthlyUsers[0].count
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ==================== ACTIVITY LOGS ====================

app.get('/api/activity-logs', authenticate, async (req, res) => {
  try {
    const [logs] = await pool.query(
      'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100'
    );
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════╗
║   🚀 OTT Navigator Panel Started     ║
║                                       ║
║   Port: ${PORT}                         ║
║   Environment: ${process.env.NODE_ENV || 'development'}       ║
║                                       ║
║   Default Admin:                      ║
║   Username: admin                     ║
║   Password: admin123                  ║
║                                       ║
║   API Docs: http://localhost:${PORT}/api ║
╚═══════════════════════════════════════╝
      `);
    });
  })
  .catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
