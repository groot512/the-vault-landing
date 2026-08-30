#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
web_root="${VAULT_WEB_ROOT:-/var/www/the-vault}"
release_id="$(date -u +%Y%m%dT%H%M%SZ)"
release_dir="${web_root}/releases/${release_id}"

root_files=(
  index.html
  styles.css
  script.js
  navigation.css
  navigation.js
  products.css
  products.js
  i18n.js
)

content_dirs=(
  assets
  app
  tessera
  digital-vault
)

install -d -m 0755 "${release_dir}"

for relative_path in "${root_files[@]}"; do
  install -m 0644 "${repo_root}/${relative_path}" "${release_dir}/${relative_path}"
done

for relative_path in "${content_dirs[@]}"; do
  cp -a "${repo_root}/${relative_path}" "${release_dir}/${relative_path}"
done

find "${release_dir}" -type d -exec chmod 0755 {} +
find "${release_dir}" -type f -exec chmod 0644 {} +

ln -sfn "${release_dir}" "${web_root}/current"

printf 'Published THE VAULT release %s to %s\n' "${release_id}" "${release_dir}"
