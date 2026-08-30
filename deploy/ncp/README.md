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

## 다음 단계

1. 공식 도메인의 A 레코드를 NCP 공인 IP에 연결한다.
2. NCP ACG에서 TCP 80과 443을 허용한다.
3. HTTPS 인증서를 적용한다.
4. Supabase Edge Function의 허용 Origin에 공식 도메인을 추가한다.
5. 공식 도메인에서 로그인, TOTP, 관리자 계정 발급과 구성원 관리를 다시 검증한다.

