---
description: How to deploy GroupShield to a server
---

# Deploy GroupShield

// turbo-all

1. Connect to the server via SSH
2. Clone the repo:
```bash
git clone https://github.com/nirdahan9/GroupShield.git
cd GroupShield
```
3. Install dependencies:
```bash
npm install
```
4. First run — scan QR code:
```bash
node bot.js
```
5. After QR scan succeeds, stop the process (Ctrl+C) and start with PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
```
6. To verify it's running:
```bash
pm2 list
pm2 logs groupshield
```
7. To update from GitHub:
```bash
git pull
pm2 restart groupshield
```
