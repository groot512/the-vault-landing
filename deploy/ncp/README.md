# NCP 프론트엔드 배포

THE VAULT의 HTML, CSS, JavaScript와 공개 이미지·영상만 NCP의 Nginx로 제공한다. 인증, 데이터베이스, RLS와 관리자 Edge Functions는 기존 Supabase 프로젝트를 계속 사용한다.

## 운영 구조

```text
GitHub 원본 저장소
        ↓
NCP /srv/the-vault/repository
        ↓ publish.sh
NCP /var/www/the-vault/releases/{UTC 시각}
        ↓ current 심볼릭 링크
Nginx
        ↓
사용자 브라우저
        ↓ 인증·DB 요청
Supabase
```

## 배포 원칙

- 웹에 필요한 파일만 새 릴리스 디렉터리로 복사한다.
- Markdown 작업문서, Git 정보와 서버 비밀정보는 웹 루트에 복사하지 않는다.
- 새 릴리스 생성이 끝난 뒤 `current` 링크를 교체하므로 복사 도중의 불완전한 화면을 노출하지 않는다.
- HTTPS 적용 전 IP 기반 배포는 스테이징 확인용으로만 사용한다.
- Web Crypto와 실제 로그인 검증은 도메인과 HTTPS를 적용한 뒤 진행한다.

## 서버에서 수동 배포

```bash
cd /srv/the-vault/repository
git fetch origin main
git checkout main
git pull --ff-only origin main
sudo ./deploy/ncp/publish.sh
sudo nginx -t
sudo systemctl reload nginx
```

## GitHub main 자동 배포

NCP 서버의 `systemd` 타이머가 1분마다 GitHub `main`의 새 커밋을 확인한다. 새 커밋이 있으면 fast-forward 가능한 경우에만 저장소를 갱신하고 새 정적 릴리스를 발행한다.

```text
GitHub main 갱신
      ↓ 최대 약 1분
NCP systemd timer
      ↓ 새 커밋·로컬 변경·fast-forward 검사
vault-deploy 저권한 사용자
      ↓
새 릴리스 발행과 current 링크 교체
```

보안 원칙:

- GitHub에는 NCP SSH 개인키를 저장하지 않는다.
- NCP가 공개 GitHub 저장소에 HTTPS로 나가는 연결만 사용한다.
- 자동 배포는 로그인 셸이 없는 `vault-deploy` 전용 사용자로 실행한다.
- 저장소에 로컬 수정이 있거나 이력이 갈라지면 자동 배포를 중단한다.
- 자동 배포 사용자는 `/srv/the-vault`, `/var/www/the-vault`, `/var/lib/vault-deploy`만 쓸 수 있다.

운영 명령:

```bash
# 다음 실행 시각과 최근 실행 결과
systemctl list-timers the-vault-deploy.timer
systemctl status the-vault-deploy.service

# 최근 자동 배포 로그
journalctl -u the-vault-deploy.service -n 50 --no-pager

# 즉시 한 번 확인·배포
sudo systemctl start the-vault-deploy.service

# 자동 배포 일시 중지·재개
sudo systemctl stop the-vault-deploy.timer
sudo systemctl start the-vault-deploy.timer
```

`/var/lib/vault-deploy/deployed-commit`에는 마지막으로 자동 배포한 Git 커밋이 기록된다.

## 도메인 적용 단계

1. 공식 도메인의 A 레코드를 NCP 공인 IP에 연결한다.
2. NCP ACG에서 TCP 80과 443을 허용한다.
3. HTTPS 인증서를 적용한다.
4. Supabase Edge Function의 허용 Origin에 공식 도메인을 추가한다.
5. 공식 도메인에서 로그인, TOTP, 관리자 계정 발급과 구성원 관리를 다시 검증한다.

## Mobile Friendly V2 미리보기

V2는 운영 `main`과 다른 Git worktree와 웹 루트를 사용한다.

```text
GitHub codex/mobile-friendly-v2
        ↓
NCP /srv/the-vault/mobile-friendly-v2
        ↓ publish.sh
NCP /var/www/the-vault-previews/mobile-v2/current
        ↓
/preview/mobile-v2/
```

이 경로는 비교·검증용이다. 운영 자동 배포의 `current` 링크를 바꾸지 않으며 `main` 공개 화면에도 영향을 주지 않는다.

수동 갱신은 서버에서 다음 순서로 수행한다.

```bash
sudo -u vault-deploy git -C /srv/the-vault/repository fetch origin codex/mobile-friendly-v2
sudo -u vault-deploy git -C /srv/the-vault/mobile-friendly-v2 checkout --detach origin/codex/mobile-friendly-v2
VAULT_WEB_ROOT=/var/www/the-vault-previews/mobile-v2 /srv/the-vault/mobile-friendly-v2/deploy/ncp/publish.sh
nginx -t
systemctl reload nginx
```
