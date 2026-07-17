# GamerScream App — Agent Kurallari

> Workspace yonlendirmesi icin `../AGENTS.md`, App reposundaki isler icin bu dosya birincil kaynaktir. `CLAUDE.md` ve `.gemini/settings.json` sadece bu dosyaya yonlendirir.

## Proje Ozeti

Bu repo GamerScream desktop app ve backend API reposudur.

| Katman | Dizin | Teknoloji |
|--------|-------|-----------|
| Desktop | `apps/desktop/` | Electron + Vite + React + TypeScript |
| Server | `apps/server/` | Node.js + Express 5 + LiveKit |

Landing page ayri repodur: `../web/`.

## Baglam Dosyalari

1. `PRODUCT.md` — Urun, mimari, endpoint ve deployment bilgileri
2. `.agents/workflows/release.md` — Release workflow'u
3. `../docs/architecture.md` — Workspace mimari ozeti
4. `../docs/web-reference.md` — Web ve release link iliskisi

## Temel Kurallar

- Bu klasor ayri bir git reposudur. Git islemleri icin `git -C app ...` kullan.
- Root workspace veya `../web/.git` ile git gecmisini birlestirme.
- App icinde pnpm workspace vardir; komutlari repo kokunden calistir.
- Kullanici degisikliklerini koru; ilgisiz dirty worktree dosyalarini geri alma veya yeniden bicimlendirme.
- Kod hazirlamak ya da yerel onizleme yapmak commit, push, deploy, tag veya release yetkisi vermez. Bunlar icin acik kullanici onayi gerekir.
- UI'da emoji yerine `lucide-react` ikonlari kullan.
- Tek dosya 300 LOC'u gecmemelidir; mevcut buyuk dosyalara yeni ozellik eklemeden once bolmeyi degerlendir.
- Production secret, key, env ve deployment dosyalarina dokunmadan once kullanicidan onay al.

## API Guvenligi ve Veri Butunlugu

- Yeni veya degisen her route icin kimlik dogrulama, yetkilendirme, girdi dogrulama, rate limit, hata sizintisi ve eszamanli istek davranisini incele; ilgili server testi olmadan route degisikligini tamamlanmis sayma.
- `/api/health`, `/api/ready`, uygulama PIN dogrulamasi ve ticket ile korunan SSE girisi bilincli istisnalardir. Kullanici/kanal islemleri `x-access-token`, admin islemleri server-side admin secret istemeye devam etmelidir.
- SSE access token'i query string'e koyma. Kisa omurlu, tek kullanimlik `/api/events-ticket` akisini koru.
- Ozel kanal erisimi istemci beyanina guvenmemelidir. PIN sonrasi verilen capability access session + room'a bagli, kisa omurlu ve tek kullanimlik kalmalidir; oyuncu listesi de ayni yetki sinirini korumalidir.
- `username`, `createdBy`, `room`, `deviceId`, `inputMode`, PIN ve capability alanlarini istemciden geldigi haliyle guvenilir kabul etme. Tip, uzunluk/desen ve authenticated session bagini server tarafinda dogrula.
- JSON POST isteklerinde content type kontrolu ve `10kb` body limiti; hassas rotalarda session/IP/global rate limitleri; LiveKit cagrilarinda timeout ve kontrollu `503` davranisi korunmalidir.
- Hata cevaplarinda secret, token, PIN hash'i, stack trace veya dahili LiveKit ayrintisi donme. Secret karsilastirmalarinda timing-safe yaklasimi koru.

## Ses Isleme Sozlesmeleri

- Settings mikrofon metresi ile yerel katilimci ses gostergesi ayni bagimsiz ham mikrofon olcerini kullanir: `useMicrophoneLevelMonitor` + `readFrequencyLevel`. Yerel gostergeyi LiveKit `isSpeaking` sinyaline geri baglama; bu sinyal yalnizca uzak katilimcilar icin kullanilabilir.
- Yerel gosterge mikrofon secimi, mute, mic gain ve input-mode gate durumuna uymali; sessizlikte pasif, konusmada aktif, mute/gain `0` iken pasif kalmalidir. Mevcut esik `0.09`, tutma suresi `200ms`dir; degisiklikler akustik QA ve test gerektirir.
- Ham mikrofon monitoru suspended `AudioContext`'i resume etmeli; interval, MediaStream track ve context'i unmount/cihaz degisiminde temizlemelidir. Channels ve Settings ayni anda gereksiz ek monitor streamleri acmamalidir.
- RNNoise tek noise-suppression katmanidir. `getUserMedia` built-in `noiseSuppression` kapali kalmali; ayar `0%` iken suppression gercekten kapali olmalidir.
- Noise suppression degisikligi hem aktif wet/dry pipeline'a hem de sonraki reconnect parametrelerine yansimalidir. RNNoise baslatilamazsa kullaniciya sesin filtresiz oldugu soylenmeli; calismayan bir fallback varmis gibi mesaj verilmemelidir.
- Ses pipeline'i degisikliklerinde en az mikrofon guvenligi, RNNoise/reconnect, yerel speaking indicator, mute/input mode ve stream cleanup testlerini calistir.

## UI Sozlesmeleri

- Electron arayuzunde browser-tipi focus outline/glow gostermemek bilincli urun kararidir. Global focus stili ile cift cerceve olusturma; buna ragmen semantic `label`, ARIA role/name ve klavye ile calisma davranisini koru.
- `Session` basligi dekoratiftir. Coklu tiklama ile gizli/secret kanala baglanan easter egg veya benzeri belgelenmemis navigasyon ekleme.
- Yerel ve uzak katilimci gostergelerini ayir: yerel gosterge ham mikrofon aktivitesini, uzak gosterge LiveKit speaking durumunu temsil eder. Gorsel hareket `prefers-reduced-motion` disinda konusma durumunu acikca gostermelidir.
- UI metinleri mevcut urun dili olan Ingilizce ile tutarli kalmali; ayni durum icin farkli ekranlarda celisen hata veya fallback metinleri kullanma.

## Update ve Release Sozlesmeleri

- Auto-update yalnizca paketlenmis uygulamada gercek feed ile dogrulanabilir; dev modundaki `Skip checkForUpdates` mesaji beklenen davranistir. Bunu update arizasi olarak duzeltmeye calisma.
- Update state machine yalnizca `downloaded` durumunda install'a izin vermeli; indirme yuzdesini sinirlamali, hata durumunu UI'a tasimali ve uygulama kapanisinda sessiz otomatik kurulum yapmamalidir.
- Kullanici release istediginde once `.agents/workflows/release.md` dosyasini tamamen oku. `.github/release-contract.env` artifact, bundle, team ve repo degerleri icin tek kaynaktir.
- macOS release/DMG islerinde `macos-developer-id-release` ve `macos-dmg-designer` skill'lerini kullan. Once login Keychain'deki mevcut Developer ID identity ve GitHub secret adlarini kontrol et; Xcode veya sertifika GUI'lerini gereksiz yere acma ve secret degerlerini loglama.
- DMG gorsel degisikliginde yerel layout onizlemesini olusturup ac; kullanici son gorunumu onaylamadan release baslatma.
- macOS imza, hardened runtime, notarization, stapling, Gatekeeper veya updater hash kontrollerini zayiflatma. Imzasiz/notarize edilmemis macOS replacement asset yukleme.
- Windows installer urun karariyla bilincli olarak imzasizdir: `WINDOWS_SIGNING=unsigned`, certificate auto-discovery kapali ve SmartScreen unknown-publisher uyarisi beklenir. Windows feed version/path/SHA-512/size kontrollerini zayiflatma.

## Komutlar

| Islem | Komut |
|-------|-------|
| Desktop Dev | `pnpm --filter desktop dev` |
| Server Dev | `pnpm --filter server dev` |
| Desktop Build | `pnpm --filter desktop build` |
| Server Build | `pnpm --filter server build` |
| Desktop Test | `pnpm --filter desktop test` |
| Server Test | `pnpm --filter server test` |

## Dogrulama Kapilari

- Desktop React/Electron degisiklikleri: `pnpm --filter desktop test`, `pnpm --filter desktop exec tsc --noEmit`, `pnpm --filter desktop exec electron-vite build`.
- Rendered UI degisiklikleri: yerel Electron uygulamasini ac, anlamli ilk ekrani ve hedef etkilesimi kontrol et; framework overlay ve ilgili console error olmamalidir.
- Ses/kanal degisiklikleri: gercek mikrofonla Settings metre, kanaldaki yerel idle/speaking/muted durumlari ve gerekiyorsa RNNoise `0%`/aktif davranisini kontrol et.
- Server/API degisiklikleri: `pnpm --filter server test` ve `pnpm --filter server build`.
- Release hazirligi: desktop + server kapilarina ek olarak `tests/release_contract_test.sh`; macOS signing identity ve gerekli GitHub secret adlari eksiksiz olmadan release baslatma.

## Release Kurallari

- Kullanici "uygulamayi guncelle" veya "release" derse `.agents/workflows/release.md` oku.
- Artifact isimleri version bagimsiz kalmalidir:
  - `GamerScream.dmg`
  - `GamerScream-Setup.exe`
- Web download linkleri latest release URL'lerini kullandigi icin release sirasinda web linklerini degistirme.
