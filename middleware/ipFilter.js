const ipRangeCheck = require('ip-range-check');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'little_to_large_super_secret_key_123';

// Whitelisted subnets and IP ranges for admin access
const ALLOWED_SUBNETS = [
  '127.0.0.1',          // IPv4 Localhost
  '::1',                // IPv6 Localhost
  '192.168.0.0/16',     // Common LAN range
  '10.0.0.0/8',         // Private Network A
  '172.16.0.0/12'       // Private Network B
];

// Load additional whitelisted IPs from environment variable if defined
if (process.env.ADMIN_IP_WHITELIST) {
  const extraIps = process.env.ADMIN_IP_WHITELIST.split(',').map(ip => ip.trim());
  ALLOWED_SUBNETS.push(...extraIps);
}

function adminIpFilter(req, res, next) {
  // 1. Bypass IP check if request has a valid admin JWT token
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.email === 'admin@littlelarge.in') {
        // Authenticated admin session is allowed from any IP
        return next();
      }
    } catch (err) {
      // Invalid token, fall back to IP check
    }
  }

  // 2. Extract client IP, resolving proxies (e.g. Render/Cloudflare)
  const clientIp = req.headers['x-forwarded-for'] 
    ? req.headers['x-forwarded-for'].split(',')[0].trim() 
    : req.socket.remoteAddress;

  const isAllowed = ipRangeCheck(clientIp, ALLOWED_SUBNETS);

  if (!isAllowed) {
    console.warn(`[SECURITY WARNING] Unauthorized admin panel access attempt from IP: ${clientIp}`);
    // Return standard 404 response to obfuscate the existence of the admin route
    return res.status(404).send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>Not Found</h1><p>The requested URL was not found on this server.</p></body></html>');
  }

  next();
}

module.exports = adminIpFilter;
