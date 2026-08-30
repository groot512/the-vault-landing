#!/usr/bin/env bash

set -euo pipefail

repo_dir="${VAULT_REPO_DIR:-/srv/the-vault/repository}"
web_root="${VAULT_WEB_ROOT:-/var/www/the-vault}"
state_dir="${VAULT_STATE_DIR:-/var/lib/vault-deploy}"
lock_file="${state_dir}/deploy.lock"
deployed_commit_file="${state_dir}/deployed-commit"

install -d -m 0755 "${state_dir}"

exec 9>"${lock_file}"
if ! flock -n 9; then
  printf 'Another THE VAULT deployment is already running.\n'
  exit 0
fi

if [[ ! -d "${repo_dir}/.git" ]]; then
  printf 'Repository not found: %s\n' "${repo_dir}" >&2
  exit 1
fi

current_branch="$(git -C "${repo_dir}" symbolic-ref --quiet --short HEAD || true)"
if [[ "${current_branch}" != "main" ]]; then
  printf 'Repository must be on main; current branch is %s.\n' "${current_branch:-detached HEAD}" >&2
  exit 1
fi

if ! git -C "${repo_dir}" diff --quiet || ! git -C "${repo_dir}" diff --cached --quiet; then
  printf 'Repository has local changes; automatic deployment stopped.\n' >&2
  exit 1
fi

git -C "${repo_dir}" fetch --quiet origin main

current_commit="$(git -C "${repo_dir}" rev-parse HEAD)"
target_commit="$(git -C "${repo_dir}" rev-parse origin/main)"

if [[ "${current_commit}" == "${target_commit}" ]]; then
  printf 'THE VAULT is already current at %s.\n' "${current_commit}"
  exit 0
fi

if ! git -C "${repo_dir}" merge-base --is-ancestor "${current_commit}" "${target_commit}"; then
  printf 'origin/main is not a fast-forward from %s; automatic deployment stopped.\n' "${current_commit}" >&2
  exit 1
fi

git -C "${repo_dir}" merge --ff-only --quiet "${target_commit}"
VAULT_WEB_ROOT="${web_root}" "${repo_dir}/deploy/ncp/publish.sh"
printf '%s\n' "${target_commit}" > "${deployed_commit_file}"

printf 'Automatically deployed THE VAULT commit %s.\n' "${target_commit}"
