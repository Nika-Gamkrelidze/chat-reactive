# Cron setup: auto-deploy on branch update (CentOS)

This runs every 5 minutes, checks if `demo-contact-deployment` has new commits on the remote, and if so runs `git pull` and `npm run build` in `/var/www/html/chatdemo/`.

## Directory layout on server

| Path | Purpose |
|------|--------|
| `/var/www/html/chatdemo/` | Git project (repo root). Clone here. |
| `/var/www/html/chatdemo/build/` | Built app. Created by `npm run build`. |
| `/var/www/html/chatdemo/.htaccess` | Routes all requests into `build/` (static files + SPA fallback to `build/index.html`). |

Apache **DocumentRoot** should be `/var/www/html/chatdemo`. The `.htaccess` in that directory sends users to the built version in `build/`.

## 0. First-time: clone the repo on the server

If the project is not on the server yet, clone it once (as the user that will run cron and own the files, e.g. `deploy` or `root`):

```bash
# Create parent dir if needed
sudo mkdir -p /var/www/html
sudo chown YOUR_USER:YOUR_USER /var/www/html   # or leave as root if cron runs as root

cd /var/www/html
git clone -b demo-contact-deployment YOUR_REPO_URL chatdemo
cd chatdemo
```

Replace `YOUR_REPO_URL` with your repo URL (e.g. `https://github.com/yourorg/chat-reactive.git` or `git@github.com:yourorg/chat-reactive.git`). Use `-b demo-contact-deployment` so the clone is already on that branch.

Then install dependencies and build once:

```bash
cd /var/www/html/chatdemo
npm ci
npm run build
```

After that, use the deploy script (and cron) for future updates.

### Will every build remove `.htaccess` inside `build/`?

**No.** The repo has `public/.htaccess`. Create React App **copies everything from `public/` into `build/`** on every `npm run build`. So each deploy recreates `build/` and **puts** `public/.htaccess` into `build/` again. You do not need to add `.htaccess` manually inside `build/` on the server—it comes from the repo on each build. If you use a **repo-root** `.htaccess` (in `/var/www/html/chatdemo/.htaccess`), that file lives outside `build/`, so it is never deleted by the build.

## 1. Copy the script to the server

Copy `deploy-on-branch-update.sh` to your CentOS server (e.g. into the repo or `/usr/local/bin/`):

```bash
# Example: from your dev machine (adjust user@server and path)
scp scripts/deploy-on-branch-update.sh user@your-server:/var/www/html/chatdemo/scripts/
```

Or create the file directly on the server under `/var/www/html/chatdemo/scripts/deploy-on-branch-update.sh`.

## 2. On the CentOS server

### Make script executable

```bash
sudo chmod +x /var/www/html/chatdemo/scripts/deploy-on-branch-update.sh
```

### Create log file (optional; script will append)

```bash
sudo touch /var/log/chatdemo-deploy.log
sudo chown YOUR_WEB_USER:YOUR_WEB_USER /var/log/chatdemo-deploy.log
```

Replace `YOUR_WEB_USER` with the user that owns `/var/www/html/chatdemo` (e.g. `nginx`, `apache`, or your deploy user). If the script runs as root via cron, `root` is fine for the log.

### Ensure repo and branch exist

```bash
cd /var/www/html/chatdemo
git fetch origin
git checkout demo-contact-deployment
git pull origin demo-contact-deployment
```

### Install Node/npm if needed

The script runs `npm ci` (or `npm install`) and `npm run build`. Ensure Node.js and npm are installed and on the PATH for the user that runs the cron job:

```bash
node -v
npm -v
```

## 3. Add the cron job

Run as the user that owns the repo (recommended) or root:

```bash
crontab -e
```

Add this line (runs every 5 minutes):

```cron
*/5 * * * * /var/www/html/chatdemo/scripts/deploy-on-branch-update.sh
```

If the script is elsewhere, e.g. `/usr/local/bin/`:

```cron
*/5 * * * * /usr/local/bin/deploy-on-branch-update.sh
```

To use a specific user and ensure PATH includes node:

```cron
*/5 * * * * PATH=/usr/local/bin:/usr/bin:/bin && /var/www/html/chatdemo/scripts/deploy-on-branch-update.sh
```

Save and exit. List the crontab:

```bash
crontab -l
```

## 4. Serving the built app

Create React App writes output to `build/`. Point your web server (nginx/apache) at that folder, e.g.:

- **nginx:** `root /var/www/html/chatdemo/build;` for this site’s `location /`.
- **Apache:** set `DocumentRoot` to `/var/www/html/chatdemo/build`.

After the first successful build, (re)load the web server config and open the site to confirm.

## 5. Test the script once

```bash
/var/www/html/chatdemo/scripts/deploy-on-branch-update.sh
```

Then check:

```bash
cat /var/log/chatdemo-deploy.log
```

## Troubleshooting

- **Permission denied:** Run the script as the user that owns `/var/www/html/chatdemo` and ensure that user can run `git` and `npm`.
- **npm not found in cron:** Set `PATH` in the crontab line (see above) or use the full path to `npm` (e.g. from `which npm`).
- **Git asks for credentials:** Use a deploy key or credential helper so `git fetch`/`git pull` work non-interactively.
