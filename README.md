# Little to Large — Family Clothing E-Commerce Platform

**Little to Large** is a full-stack, family-focused clothing e-commerce web platform for India. Built to scale from local weaver guilds to global operations, it features responsive designs, organic marigold-themed styling, and robust checkout functionality.

---

## Key Features

1. **Vibrant Family UI**: Customized CSS theme based on HSL colors (Marigold & Royal Indigo), fluid drop shadow cards, interactive category sliders, and pure CSS hover zoom effects.
2. **Flexible Database Layer**: Integrated MySQL controller that automatically falls back to an embedded SQLite3 database (`little_to_large.db`) if no MySQL credentials are set, providing a zero-config setup out-of-the-box.
3. **AI Wardrobe Assistant**: Rule-based chatbot which queries products, provides chip-based FAQ assistance, and tracks order statuses live.
4. **Billing & Gateways Simulator**: Interactive payment widgets simulating card inputs, COD CAPTCHA verification, and a live Canvas-rendered UPI QR code with a countdown timer.
5. **Admin Operations Portal**: Interactive CRUD views to manage catalog products, change order fulfillment states, inspect support inquiries, and view sales graphs.

---

## Technical Stack

- **Frontend**: Vanilla HTML5, CSS3, ES6 JavaScript. (Responsive grids, custom CSS variables, canvas renderings).
- **Backend**: Node.js, Express.js.
- **Database**: MySQL (production) / SQLite3 (local fallback).
- **Authentication**: JWT (JSON Web Tokens) with Bcrypt password hashes.

---

## Getting Started (Local Running)

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v16+) installed.

### 2. Quick Start (No-Config SQLite3 Mode)
Run the following commands in your shell to start the backend with the embedded database:
```bash
# Install dependencies
npm install

# Start the application
npm start
```
The server will boot up at: **`http://localhost:3000`**

### 3. MySQL Database Integration (Production Mode)
To connect the application to a live MySQL server:
1. Load your MySQL service and create a new database:
   ```sql
   CREATE DATABASE little_to_large;
   ```
2. Import the database schema from the `database/schema.sql` file:
   ```bash
   mysql -u root -p little_to_large < database/schema.sql
   ```
3. Create a `.env` file in the project root folder:
   ```env
   PORT=3000
   JWT_SECRET=little_to_large_super_secret_key_123
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=little_to_large
   DB_PORT=3306
   ```
4. Restart the server:
   ```bash
   npm start
   ```
   The database controller will detect the variables, connect to your MySQL database, and seed the tables.

---

## Pre-Seeded Accounts for Testing

During database initialization, the system automatically creates two accounts:

### 1. Customer Demo Account
- **Email**: `customer@littlelarge.in`
- **Password**: `password123`
- **Phone**: `9876543210`

### 2. Admin Dashboard Account
- **Email**: `admin@littlelarge.in`
- **Password**: `admin123`
- **Phone**: `9999999999`

*(You can also register new accounts or test the mobile OTP login—the generated OTP will print directly on screen to bypass SMS charges.)*

---

## VPS / Shared Hosting Deployment

### Option A: Hosting on a Virtual Private Server (VPS - e.g., DigitalOcean, AWS, Linode)
1. **Clone & Install**: Clone your repository and run `npm install --omit=dev`.
2. **PM2 Process Manager**: Run the application in the background using PM2:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "little-to-large"
   pm2 save
   pm2 startup
   ```
3. **Nginx Reverse Proxy**: Route public ports (80/443) to port 3000. Add this inside your Nginx server block:
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com www.yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
4. **SSL Setup**: Install Let's Encrypt certificates using Certbot:
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

### Option B: Hosting on Shared Servers (e.g., Hostinger, Bluehost via cPanel)
1. Zip the project folder (exclude `node_modules` and `little_to_large.db`).
2. Log into cPanel, search for **Setup Node.js App** under the Software section.
3. Click **Create Application**:
   - **Node.js version**: Select latest version.
   - **Application mode**: `Production`.
   - **Application root**: Path where files will be uploaded (e.g., `public_html/little-to-large`).
   - **Application URL**: Your primary domain or subdomain.
   - **Application startup file**: `server.js`.
4. Upload and extract your zip inside the application root directory using File Manager.
5. In **Setup Node.js App**, click **Run NPM Install**.
6. Under **Environment Variables**, add:
   - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`.
7. Click **Start App** / **Restart App**. Your node app is now live!
