# 🚀 OTT Navigator Panel - Complete Installation Guide

Full-featured IPTV/OTT Management Panel with Admin Dashboard, User Management, M3U Playlist Generation, and Xtream Codes API.

## ✨ Features

### Admin Panel
- 📊 **Dashboard** - Real-time statistics and analytics
- 👥 **User Management** - Create, edit, delete users with bulk operations
- 💰 **Reseller System** - Multi-level reseller management
- 📦 **Package Management** - Flexible subscription packages
- 📺 **Channel Management** - Organize and manage channels
- 📋 **Playlist Management** - M3U playlist generation
- 🔐 **Authentication** - Secure JWT-based authentication
- 📝 **Activity Logs** - Complete audit trail
- 🔧 **API Generator** - Generate M3U and Xtream Codes URLs

### API Features
- ✅ RESTful API with JWT authentication
- ✅ M3U Playlist generation
- ✅ Xtream Codes API support
- ✅ Rate limiting and security
- ✅ MySQL database with connection pooling
- ✅ Automatic user expiry checking
- ✅ Session management

## 📋 Requirements

- **VPS/Server**: Ubuntu 20.04+ or CentOS 7+
- **Node.js**: 16.x or higher
- **MySQL**: 8.0 or higher
- **Nginx**: Latest stable
- **RAM**: Minimum 2GB
- **Storage**: Minimum 20GB

## 🚀 Quick Installation (Automated)

### Method 1: One-Click Install Script

```bash
# Download and run deploy script
curl -o- https://raw.githubusercontent.com/yourusername/ott-panel/main/deploy.sh | bash

# Or download first
wget https://raw.githubusercontent.com/yourusername/ott-panel/main/deploy.sh
chmod +x deploy.sh
sudo ./deploy.sh
```

### Method 2: Docker Installation (Recommended)

```bash
# Clone repository
git clone https://github.com/yourusername/ott-panel.git
cd ott-panel

# Create .env file
cp .env.example .env
nano .env  # Edit configuration

# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f
```

### Method 3: Manual Installation

#### Step 1: Update System
```bash
sudo apt update && sudo apt upgrade -y
```

#### Step 2: Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Should be v18.x
```

#### Step 3: Install MySQL
```bash
sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql

# Secure MySQL
sudo mysql_secure_installation
```

#### Step 4: Create Database
```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE ott_panel;
CREATE USER 'ott_user'@'localhost' IDENTIFIED BY 'YourStrongPassword123!';
GRANT ALL PRIVILEGES ON ott_panel.* TO 'ott_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

#### Step 5: Install Application
```bash
# Create directory
sudo mkdir -p /var/www/ott-panel
cd /var/www/ott-panel

# Upload files (use FileZilla, scp, or git)
# Option A: Using Git
git clone https://github.com/yourusername/ott-panel.git .

# Option B: Using SCP from local machine
# scp -r * root@your-vps-ip:/var/www/ott-panel/

# Install dependencies
npm install --production

# Create .env file
cp .env.example .env
nano .env
```

#### Step 6: Configure Environment Variables
Edit `.env`:
```bash
PORT=3000
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-min-32-characters-long
DB_HOST=localhost
DB_USER=ott_user
DB_PASSWORD=YourStrongPassword123!
DB_NAME=ott_panel
```

#### Step 7: Install PM2 (Process Manager)
```bash
sudo npm install -g pm2

# Start application
pm2 start server.js --name ott-panel

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs

# Monitor application
pm2 monit
```

#### Step 8: Install and Configure Nginx
```bash
sudo apt install -y nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/ott-panel
```

Paste this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Change this
    
    client_max_body_size 100M;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/ott-panel /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default site
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

#### Step 9: Configure Firewall
```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

#### Step 10: Setup SSL (Optional but Recommended)
```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

## 🔐 Default Login Credentials

After installation, login with:
- **Username**: `admin`
- **Password**: `admin123`

⚠️ **IMPORTANT**: Change the default password immediately after first login!

## 📡 API Endpoints

### Authentication
```
POST /api/auth/login
POST /api/auth/change-password
```

### Users
```
GET    /api/users
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id
POST   /api/users/bulk-extend
```

### Packages
```
GET    /api/packages
POST   /api/packages
DELETE /api/packages/:id
```

### Resellers
```
GET    /api/resellers
POST   /api/resellers
```

### Channels
```
GET    /api/channels
POST   /api/channels
```

### Playlists
```
GET    /api/playlist/:username?auth=xxxxx
```

### Xtream Codes API
```
GET    /player_api.php?username=xxx&password=xxx&action=get_live_streams
```

## 🔧 Configuration

### Environment Variables (.env)
```bash
# Server
PORT=3000
NODE_ENV=production

# Security
JWT_SECRET=generate-a-strong-random-string-here

# Database
DB_HOST=localhost
DB_USER=ott_user
DB_PASSWORD=your-password
DB_NAME=ott_panel

# Optional: Email notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### Generate Secure JWT Secret
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 📱 API Usage Examples

### Login
```bash
curl -X POST http://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Create User
```bash
curl -X POST http://your-domain.com/api/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "package_id": 1,
    "expiry_date": "2024-12-31"
  }'
```

### Generate M3U Playlist
```bash
# Direct download
http://your-domain.com/api/playlist/username?auth=encoded_credentials

# Using curl
curl -o playlist.m3u "http://your-domain.com/api/playlist/testuser"
```

### Xtream Codes API
```bash
# Get user info
http://your-domain.com/player_api.php?username=testuser&password=password123

# Get live streams
http://your-domain.com/player_api.php?username=testuser&password=password123&action=get_live_streams
```

## 🛠️ Maintenance

### View Logs
```bash
# PM2 logs
pm2 logs ott-panel

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# MySQL logs
sudo tail -f /var/log/mysql/error.log
```

### Restart Services
```bash
# Restart app
pm2 restart ott-panel

# Restart Nginx
sudo systemctl restart nginx

# Restart MySQL
sudo systemctl restart mysql
```

### Backup Database
```bash
# Backup
mysqldump -u ott_user -p ott_panel > backup_$(date +%Y%m%d).sql

# Restore
mysql -u ott_user -p ott_panel < backup_20240101.sql
```

### Update Application
```bash
cd /var/www/ott-panel
git pull  # If using git
npm install
pm2 restart ott-panel
```

## 🔒 Security Best Practices

1. **Change Default Credentials**
   - Change default admin password immediately
   - Use strong passwords (min 12 characters)

2. **Keep System Updated**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

3. **Enable Firewall**
   ```bash
   sudo ufw enable
   sudo ufw status
   ```

4. **Use SSL/HTTPS**
   - Always use SSL certificates in production
   - Force HTTPS redirects

5. **Regular Backups**
   - Backup database daily
   - Keep backups in secure location

6. **Monitor Logs**
   - Check logs regularly for suspicious activity
   - Set up log rotation

7. **Rate Limiting**
   - Already configured in application
   - Adjust limits in server.js if needed

## 📊 Monitoring

### Check Application Status
```bash
pm2 status
pm2 monit
```

### Check System Resources
```bash
htop
df -h  # Disk space
free -h  # Memory
```

### Database Performance
```sql
-- Login to MySQL
mysql -u root -p

-- Show processlist
SHOW FULL PROCESSLIST;

-- Check table sizes
SELECT 
    table_name AS 'Table',
    ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.TABLES
WHERE table_schema = 'ott_panel'
ORDER BY (data_length + index_length) DESC;
```

## 🐛 Troubleshooting

### Application won't start
```bash
# Check logs
pm2 logs ott-panel

# Check if port is in use
sudo netstat -tulpn | grep 3000

# Restart application
pm2 restart ott-panel
```

### Database connection error
```bash
# Test MySQL connection
mysql -u ott_user -p

# Check MySQL status
sudo systemctl status mysql

# Restart MySQL
sudo systemctl restart mysql
```

### Nginx 502 Bad Gateway
```bash
# Check if app is running
pm2 status

# Check Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

## 📞 Support

For issues and questions:
- 📧 Email: support@ottnavigator.com
- 💬 GitHub Issues: https://github.com/yourusername/ott-panel/issues

## 📄 License

This project is licensed under the MIT License.

## 🎉 Credits

Developed with ❤️ for the OTT/IPTV community.

---

**⚠️ Disclaimer**: This software is for educational and legitimate business purposes only. Users are responsible for complying with all applicable laws and regulations.
