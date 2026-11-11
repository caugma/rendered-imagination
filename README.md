# Rendered Imagination — IWAIT 2027 Online Exhibition

IWAIT 2027 특별세션 *Creative Works with Technology* 온라인 전시 사이트입니다.

## 어디를 고치나요?

| 바꾸고 싶은 것 | 고칠 파일 |
|---|---|
| 전시 기간, 세션 시간, 장소, 소개글, 로고 이름 | `settings.txt` |
| 작품 제목, 작가, 설명, 영상 주소 | `works/01.txt` ~ `works/07.txt` |
| 작품 이미지, 초록 PDF | `works/01/` ~ `works/07/` 폴더에 업로드 |
| 로고 이미지 | `images/logos/` 폴더에 업로드 |

`index.html`, `work.html`, `assets/` 폴더는 고치지 않아도 됩니다.

자세한 방법은 운영 매뉴얼을 보세요.

## 구조

빌드 과정이 없는 정적 사이트입니다. 페이지가 열릴 때 `settings.txt`와 `works/*.txt`를 읽어 화면을 그립니다.
GitHub Pages, Netlify, Cloudflare Pages 등 어디에 올려도 그대로 동작합니다.
컴퓨터에서 `index.html`을 더블클릭해 열면 내용이 보이지 않습니다 (보안상 브라우저가 파일 읽기를 막음). 게시된 주소로 확인하세요.
