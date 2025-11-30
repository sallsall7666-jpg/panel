#!/bin/bash

# OTT Navigator Panel - Auto Deploy Script
# Usage: chmod +x deploy.sh && ./deploy.sh

set -e

echo "╔═══════════════════════════════════════════════════╗"
echo "║  🚀 OTT Navigator Panel - Auto Deploy Script     ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}❌ Please run as root (use sudo)${NC}"
  exit 1
fi

echo -e "${YELLOW}📋 Step 1: System Update${NC}"
apt update && apt upgrade -y

echo ""
echo -e "${YELLOW}📦 Step 2: Installing Dependencies${NC}"

# Install Node.js 18.x
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
fi

# Install MySQL
if ! command -v mysql &> /dev/null; then
    echo "Installing MySQL..."
    apt install -y mysql-server
    systemctl start mysql
    systemctl enable mysql
    
    # Secure MySQL installation
    mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'OttPanel@2024';"
    mysql -e "DELETE FROM mysql.user WHERE User='';"
    mysql -e "DROP DATABASE IF EXISTS test;"
    mysql -e "FLUSH PRIVILEGES;"
fi

# Install Nginx
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    apt install -y nginx
    systemctl start nginx
    systemctl enable nginx
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

echo ""
echo -e "${YELLOW}📁 Step 3: Setting up Application${NC}"

# Create application directory
APP_DIR="/var/www/ott-panel"
mkdir -p $APP_DIR
cd $APP_DIR

# Create package.json
cat > package.json << 'EOF'
{
  "name": "ott-navigator-panel",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "mysql2": "^3.6.5",
    "express-rate-limit": "^7.1.5",
    "dotenv": "^16.3.1"
  }
}
EOF

# Install npm packages
echo "Installing Node packages..."
npm install --production

# Create .env file
cat > .env << EOF
PORT=3000
NODE_ENV=production
JWT_SECRET=$(openssl rand -hex 64)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=OttPanel@2024
DB_NAME=ott_panel
EOF

# Create database
echo -e "${YELLOW}🗄️  Step 4: Setting up Database${NC}"
mysql -u root -pOttPanel@2024 -e "CREATE DATABASE IF NOT EXISTS ott_panel;"

echo ""
echo -e "${YELLOW}⚙️  Step 5: Configuring Nginx${NC}"

# Create Nginx configuration
cat > /etc/nginx/sites-available/ott-panel << 'EOF'
server {
    listen 80;
    server_name _;
    
    client_max_body_size 100M;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/ott-panel /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
nginx -t
systemctl reload nginx

echo ""
echo -e "${YELLOW}🔥 Step 6: Setting up Firewall${NC}"
ufw --force enable
ufw allow 22
ufw allow 80
ufw allow 443

echo ""
echo -e "${YELLOW}🚀 Step 7: Starting Application${NC}"

# Copy server.js (you need to upload this separately)
if [ ! -f "server.js" ]; then
    echo -e "${RED}⚠️  server.js not found! Please upload server.js to $APP_DIR${NC}"
    echo "You can upload it using: scp server.js root@your-vps-ip:$APP_DIR/"
else
    # Start with PM2
    pm2 delete ott-panel 2>/dev/null || true
    pm2 start server.js --name ott-panel
    pm2 save
    pm2 startup
fi

# Set proper permissions
chown -R www-data:www-data $APP_DIR
chmod -R 755 $APP_DIR

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Deployment Complete!                          ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}📝 Next Steps:${NC}"
echo ""
echo "1. Upload server.js to VPS:"
echo "   ${YELLOW}scp server.js root@your-vps-ip:$APP_DIR/${NC}"
echo ""
echo "2. Upload frontend files to:"
echo "   ${YELLOW}$APP_DIR/public/${NC}"
echo ""
echo "3. Start the application:"
echo "   ${YELLOW}cd $APP_DIR && pm2 start server.js --name ott-panel${NC}"
echo ""
echo "4. Access your panel at:"
echo "   ${YELLOW}http://your-vps-ip${NC}"
echo ""
echo "5. Default login:"
echo "   Username: ${YELLOW}admin${NC}"
echo "   Password: ${YELLOW}admin123${NC}"
echo ""
echo -e "${RED}⚠️  IMPORTANT: Change default password immediately!${NC}"
echo ""
echo "6. Setup SSL (recommended):"
echo "   ${YELLOW}apt install certbot python3-certbot-nginx -y${NC}"
echo "   ${YELLOW}certbot --nginx -d your-domain.com${NC}"
echo ""
echo "7. View logs:"
echo "   ${YELLOW}pm2 logs ott-panel${NC}"
echo ""
echo "8. Monitor application:"
echo "   ${YELLOW}pm2 monit${NC}"
echo ""
echo -e "${GREEN}🎉 Happy streaming!${NC}"
