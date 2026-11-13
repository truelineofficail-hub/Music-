# Music (PWA)

Folder layout
```
Music/
├── index.html
├── manifest.json
├── sw.js
├── favicon.ico
├── icons/        app icons (any, maskable, apple-touch, favicons)
├── music/        PUT YOUR .mp3 FILES HERE (names must match index.html)
└── covers/       PUT YOUR COVER IMAGES HERE (1.jpg, 2.jpg ... polaroid-1.jpg, black-swan.jpg)
```

Setup
1. Copy your 30 mp3 files into `music/` and covers into `covers/`.
2. Upload the whole `Music` folder to any HTTPS host (Netlify, GitHub Pages, Vercel, Cloudflare Pages).
   Service workers do not run from file:// , so test locally with:  `python3 -m http.server 8000`  then open http://localhost:8000
3. Open the site on your phone > browser menu > "Add to Home Screen" / "Install app". The app is named **Music**.
4. First visit while online downloads all songs, after that it plays offline.

After changing any file, bump `VERSION` in sw.js (v1 -> v2) so devices refresh their cache.
