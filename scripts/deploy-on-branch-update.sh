#!/bin/bash
# Deploy script: if remote branch demo-contact-deployment has new commits,
# pull and rebuild the project. Run via cron every 5 min.

set -e
REPO_DIR="/var/www/html/chatdemo"
BRANCH="demo-contact-deployment"
LOG_FILE="/var/log/chatdemo-deploy.log"
BUILD_DIR="$REPO_DIR"
# User that runs Apache (so it can read build/). CentOS/RHEL: apache; Debian: www-data
WEB_USER="${WEB_USER:-apache}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

if [ ! -d "$REPO_DIR" ]; then
  log "ERROR: Repo directory does not exist: $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"
if [ ! -d .git ]; then
  log "ERROR: Not a git repository: $REPO_DIR"
  exit 1
fi

# Ensure we're on the right branch
current_branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$current_branch" != "$BRANCH" ]; then
  log "Checking out branch: $BRANCH (was: $current_branch)"
  git checkout "$BRANCH" 2>&1 | tee -a "$LOG_FILE"
fi

# Fetch and compare with remote (no checkout yet)
git fetch origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE" || true
local_rev=$(git rev-parse HEAD 2>/dev/null || echo "")
remote_rev=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")

if [ -z "$remote_rev" ]; then
  log "WARN: Could not get origin/$BRANCH; skipping."
  exit 0
fi

if [ "$local_rev" = "$remote_rev" ]; then
  log "No update (already at $local_rev). Skipping pull and build."
  exit 0
fi

log "Update detected. Pulling and rebuilding..."
git pull origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

# After pull, ensure .htaccess is readable by web server (in case it was recreated as root)
fix_permissions() {
  if [ "$(id -u)" -ne 0 ]; then
    log "WARN: Not running as root - cannot chown. Cron should run as root so build/ is readable by Apache."
    return 0
  fi
  if [ -f "$REPO_DIR/.htaccess" ]; then
    chown "$WEB_USER:$WEB_USER" "$REPO_DIR/.htaccess" 2>/dev/null || true
  fi
  if [ -d "$REPO_DIR/build" ]; then
    chown -R "$WEB_USER:$WEB_USER" "$REPO_DIR/build"
    chmod -R u=rX,g=rX,o=rX "$REPO_DIR/build"
    log "Set build/ and .htaccess ownership to $WEB_USER."
  fi
}

if [ -f "$REPO_DIR/package.json" ]; then
  log "Installing dependencies..."
  npm ci 2>&1 | tee -a "$LOG_FILE" || npm install 2>&1 | tee -a "$LOG_FILE"
  log "Building..."
  npm run build 2>&1 | tee -a "$LOG_FILE"
  fix_permissions
  log "Deploy finished successfully."
else
  log "ERROR: No package.json in $REPO_DIR"
  exit 1
fi
