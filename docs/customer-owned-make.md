# Ügyfél saját Make-fiókkal

Elfogadott modell: központi LeadFlow, ügyfelenként saját Make- és Gmail-fiók.
A partner napi munkáját a LeadFlow-ban végzi. Ez nem jelent GDPR-mentességet.

## Pilot: új cég előkészítése

Az első ügyfeleket az üzemeltető az ügyféllel közösen állítja be. A
`202609260001_provision_company.sql` migráció alkalmazása után a cég alaprekordjait
egy üzemeltetői parancs hozza létre. Az első futás csak a nevet és a slug
elérhetőségét ellenőrzi:

Az első pilot ügyfeleknél a javasolt belépési pont az összevont előkészítő. Ez egy
paranccsal létrehozza a céget, a kézi alapbeállítást, a letiltott saját Make-kapcsolatot
és az első céges Make-kulcsot. A kulcsfájl kötelezően a projektmappán kívül készül:

```powershell
node --env-file=.env.local scripts/prepare-company-onboarding.mjs "Példa Kft." pelda-kft
node --env-file=.env.local scripts/prepare-company-onboarding.mjs "Példa Kft." pelda-kft --create "C:\biztonsagos-hely\pelda-kft-make-key.txt"
```

Az első parancs csak ellenőriz. A második végzi el a létrehozást. A meghívó küldése,
a két Make-forgatókönyv beállítása, a webhookok rögzítése és az élő izolációs próba
továbbra is külön, tudatos lépés marad. Ha a kulcskiadás a cég létrehozása után hibázik,
a szkript ezt külön jelzi; ilyenkor a céget nem szabad újra létrehozni.

A különálló provisioning parancs hibaelhárításhoz és részlépésekhez továbbra is
használható:

```powershell
node --env-file=.env.local scripts/provision-company.mjs "Példa Kft." pelda-kft
```

A tényleges, atomikus létrehozáshoz külön `--create` kapcsoló kell:

```powershell
node --env-file=.env.local scripts/provision-company.mjs "Példa Kft." pelda-kft --create
```

A művelet létrehozza a céget, a kézi AI-módú beállítást és a letiltott, saját
Make-kapcsolatot. Siker esetén kiírja a publikus ajánlatkérő URL-jét, de sem
Supabase-titkot, sem Make-kulcsot nem jelenít meg. Foglalt slug vagy bármely
adatbázishiba esetén a tranzakció teljes egészében visszagördül.

Ha a migráció még nincs alkalmazva, tartalék megoldásként továbbra is generálható
az ellenőrizhető SQL:

```powershell
node scripts/generate-company-onboarding-sql.mjs "Példa Kft." pelda-kft
```

A generáló parancs csak SQL-t ír ki, adatbázist nem módosít. A kimenetet a **megfelelő Supabase
projekt** SQL Editorában kell ellenőrzés után futtatni. Ha a slug már foglalt, a
tranzakció hibával leáll, és nem hoz létre részleges céget. Az új cég kézi AI-móddal
és letiltott, saját Make-kapcsolattal indul; nem kerül a közös pilot webhookra.

Ez csak az első előkészítő egység. A tulajdonos Supabase Auth-fiókját és `users`
kapcsolatát, a céges Make-kulcsot, a két ügyfél-webhookot és a Gmail-kapcsolatot
külön kell beállítani és kétcéges izolációs próbával ellenőrizni. A Make-kapcsolatot
csak ezután szabad engedélyezni. Valódi ügyféladatot, webhookcímet vagy kulcsot ne
mentsünk a generált SQL-lekérdezéssel együtt a repositoryba.

### Meghívott tulajdonos belépése

A `/meghivas` oldal fogadja a Supabase Auth meghívó visszairányítását. Ellenőrzi a
hitelesített felhasználót és a `users.company_id` hozzárendelést, majd saját jelszó
beállítását kéri. Meghíváskor a `redirectTo` értéke a végleges LeadFlow domain
`/meghivas` oldala legyen, és ugyanez a cím szerepeljen a Supabase Auth engedélyezett
Redirect URL-ek között. Ha a cím nincs engedélyezve, a Supabase a Site URL-re
irányíthat vissza külön hiba nélkül.

Az üzemeltetői parancs először ellenőrzi a céges slugot és hogy van-e már tulajdonos;
alapesetben nem küld levelet:

```powershell
node --env-file=.env.local scripts/invite-company-owner.mjs pelda-kft owner@example.com
```

Csak az engedélyezett Redirect URL és a meghívó sablon ellenőrzése után, egy
**külön, szándékos** `--send` kapcsolóval hívja a Supabase meghívó API-ját. A visszakapott
Auth-azonosítót a cég `users` rekordjához rendeli. A parancsot csak az üzemeltető
futtathatja; a Supabase titkos kulcs nem kerülhet böngészőbe, Gitbe vagy chatbe.
Valódi ügyfélnek most még ne küldjünk meghívót: a teljes meghívás → jelszóbeállítás
→ kétcéges RLS-próba folyamatot előbb tesztcímmel kell kipróbálni.

Ha a meghívó elküldése után a céges hozzárendelés hibázik, a script külön hibát jelez.
Ilyenkor a meghívott nem állíthat be jelszót az oldalon; az üzemeltetőnek az
Auth-azonosítót és a `users` rekordot kell egyeztetnie. A meghívó linkjét és a jelszót
nem szabad naplózni vagy továbbítani.

## Első egység: bejövő Make-hitelesítés

- Fejléc: x-leadflow-secret. Céges kulcs: lfmk_ + 32 kriptográfiailag véletlen bájt hex formában.
- Csak a teljes kulcs SHA-256 lenyomata tárolható a make_credentials táblában.
- A céget a kulcs rekordja határozza meg, nem a kérésben kapott company_id.
- Visszavonás: revoked_at kitöltése. A kulcstáblához nincs böngészős hozzáférés.
- Lead olvasás/frissítés és üzenet létrehozás/frissítés csak a kulcs saját cégére történhet.
- Az AI-végpontok beküldött szövegeket dolgoznak fel, további céges adatot nem olvasnak.

Átmenetileg a meglévő MAKE_API_SECRET megmarad a szolgáltató pilotfolyamataihoz.
Ez továbbra is minden cégre jogosító üzemeltetői titok. Ügyfélnek nem adható át.
A céges kulcsok adatbázishibánál sem kaphatnak közös jogosultságot.

## Bevezetés

1. Ellenőrizni kell az éles companies.id UUID típusát, majd alkalmazni a
   supabase/migrations/202609180001_make_credentials.sql migrációt.
2. Tesztkörnyezetben két céggel élő izolációs próbát kell végezni.
   A helyettesített adatbázissal végzett unit tesztek ezt nem helyettesítik.
3. Kulcsot biztonságos üzemeltetői provisioningből kell kiadni; ne kerüljön Gitbe,
   chatbe, naplóba, URL-be vagy scenario-sablonba. Kulcskiadó UI még nincs.
4. Az ügyfélsablonok bevezetése külön egység; minden folyamat átállítása után
   eltávolítható a közös környezeti titok.

## Még hátravan

- A cégenkénti kulcskiadás élő tesztje és a teljes ügyfél-onboarding.
- Gmail-piszkozat azonosító mentése.
- Make/Gmail-alapú automatikus státuszegyeztetés a kézi rendezés kiváltására.

## Automatizálási indítások naplója

A `202609270002_automation_dispatches.sql` migráció szerveroldali, tenanthez kötött
naplót hoz létre a LeadFlow → Make indításokhoz. Nem tárol webhookcímet,
e-mail-címet vagy üzenettartalmat. Rögzíti az eseménytípust, a próbálkozások számát,
az utolsó HTTP-eredményt és a Make visszaigazolásával lezárt állapotot. A partner
böngészője közvetlenül nem olvashatja ezt a táblát.

Az üzemeltető személyes adatok kiírása nélkül ellenőrizheti egy cég összesített
állapotát:

```powershell
node --env-file=.env.local scripts/check-automation-dispatches.mjs pelda-kft
```

Bizonytalan HTTP- vagy hálózati eredménynél a rendszer továbbra sem próbálkozik
automatikusan újra, mert a Make átvételének hiánya nem bizonyítható. Az auditnapló
`completed` állapotba kerül, amikor a Make létrehozta a kimenő választervezetet,
illetve amikor a Gmail-küldés eredményét visszaigazolta. A még nyitott bejegyzések
az üzemeltetői ellenőrzővel külön láthatók.

### Gmail-küldési visszaigazolás

A `202609270003_message_delivery_receipts.sql` migráció az üzenethez menti a Gmail
modul által visszaadott átlátszatlan üzenetazonosítót, valamint a sikeres vagy
igazoltan sikertelen küldés időpontját. Az azonosító tenanthez kötötten egyedi,
nem kerül a partner böngészőjébe, és nem tartalmaz levélszöveget vagy címzettet.
A Make sikeres státusz-visszahívása opcionálisan `provider_message_id` mezőt küld;
a régi scenario-k e mező nélkül is működnek, így az átállás megszakításmentes.

## Céges Make-kulcs kiadása a pilotban

Az üzemeltető először ellenőrzi a cég slugját, a letiltott saját Make-kapcsolatot
és hogy nincs aktív kulcs. Ez nem módosít adatot:

```powershell
node --env-file=.env.local scripts/issue-company-make-key.mjs pelda-kft
```

Az első valódi kulcs kiadása külön `--issue` kapcsolóval történik. A kimeneti fájl
abszolút útvonalú, a projektmappán kívüli, új helyi fájl legyen. A script kizárólag
ebbe írja a titkot, az adatbázisba csak a SHA-256 lenyomatát menti. Létező fájlt
nem ír felül; aktív kulcs esetén leáll. A titok nem jelenik meg a terminálon.

```powershell
node --env-file=.env.local scripts/issue-company-make-key.mjs pelda-kft --issue C:\Users\User\Documents\make-key-pelda.txt
```

A fájlt csak az ügyfél saját Make-scenario-jának `x-leadflow-secret` fejlécébe
másoláshoz használd, majd töröld. Ne szinkronizált vagy megosztott mappát válassz.
Windows alatt a fájl jogosultságai a szülőmappából is öröklődhetnek; válassz csak
számodra hozzáférhető helyet. Kulcsrotációhoz és elveszett kulcs pótlásához külön
eljárás kell, ez a script új aktív kulcsot nem ad ki meglévő mellé.

A több HTTP-modult tartalmazó blueprinteket nem kell kézzel végigírni. Exportáld a
két, már ügyfélhez klónozott Make-forgatókönyvet, majd futtasd az előkészítőt. Az
összes bemeneti és kimeneti fájlnak a projektmappán kívül kell lennie:

```powershell
node scripts/prepare-company-make-blueprints.mjs pelda-kft `
  "C:\biztonsagos-hely\pelda-kft-make-key.txt" `
  "C:\biztonsagos-hely\new-lead-export.blueprint.json" `
  "C:\biztonsagos-hely\reply-export.blueprint.json" `
  "C:\biztonsagos-hely\pelda-kft-ready"
```

A szkript minden `x-leadflow-secret` fejlécet frissít, és kizárólag új fájlokat
hoz létre; meglévő kimenetet nem ír felül. Importáld a két elkészült fájlt a
megfelelő Make-forgatókönyvbe, állítsd vissza az azonnali ütemezést, majd töröld a
kulcsfájlt, az exportokat és az előkészített blueprinteket.

Az üzemeltető a bekötés közben és után állapotellenőrzést futtathat. Az eredmény
igen/nem állapotokat és mindig egyetlen következő teendőt mutat biztonságos
sorrendben; nem írja ki az e-mail-címet, kulcsot vagy webhookcímeket:

```powershell
node --env-file=.env.local scripts/check-company-onboarding.mjs pelda-kft
```

A `202610030002_company_onboarding_progress.sql` migráció után az élő ellenőrzések
eredménye is cégenként rögzíthető. Egy pontot csak a próba tényleges, kézi
ellenőrzése után szabad igazolni:

```powershell
node --env-file=.env.local scripts/check-company-onboarding.mjs pelda-kft --confirm owner-login
node --env-file=.env.local scripts/check-company-onboarding.mjs pelda-kft --confirm new-lead-flow
node --env-file=.env.local scripts/check-company-onboarding.mjs pelda-kft --confirm approved-reply-flow
node --env-file=.env.local scripts/check-company-onboarding.mjs pelda-kft --confirm tenant-isolation
```

Az ellenőrzési pontok rendre a tulajdonosi belépést, a bejövő érdeklődő teljes
folyamatát és belső értesítését, a jóváhagyott válasz kézbesítését és
visszaigazolását, valamint a két cég közötti adat- és Make-izolációt jelentik.
A parancs csak akkor írja ki, hogy a cég pilotra kész, ha az összes technikai
feltétel és mind a négy élő próba teljesült. A visszaigazolások személyes adatot,
webhookcímet és titkot nem tárolnak.

### Webhookok beállítása és engedélyezés

A két Make-webhook cím titoknak számít, ezért ne kerüljön parancssorba vagy Gitbe.
Hozz létre a projektmappán kívül egy helyi JSON-fájlt az alábbi mezőkkel:

```json
{
  "newLeadWebhookUrl": "https://hook.eu1.make.com/…",
  "approvedReplyWebhookUrl": "https://hook.eu1.make.com/…"
}
```

Az első futás csak ellenőriz. Megköveteli a saját Make-módot, a még letiltott
kapcsolatot, az aktív céges kulcsot és a két szabályos Make-webhookot:

```powershell
node --env-file=.env.local scripts/configure-company-make.mjs pelda-kft C:\Users\User\Documents\pelda-webhooks.json
```

Az ellenőrzés után a `--stage` kapcsoló elmenti mindkét webhookot, de a kapcsolatot
letiltva hagyja. Így a Make-scenario-k beállíthatók és ellenőrizhetők éles forgalom nélkül:

```powershell
node --env-file=.env.local scripts/configure-company-make.mjs pelda-kft C:\Users\User\Documents\pelda-webhooks.json --stage
```

Csak a két kikapcsolt scenario ellenőrzése és az élő próba előkészítése után használd
a `--enable` kapcsolót. Ez atomikusan menti a címeket és engedélyezi a LeadFlow
útválasztását. Már engedélyezett kapcsolatot egyik művelet sem módosít:

```powershell
node --env-file=.env.local scripts/configure-company-make.mjs pelda-kft C:\Users\User\Documents\pelda-webhooks.json --enable
```

Sikeres engedélyezés után töröld a helyi JSON-fájlt. Ezután futtasd újra a csak
olvasó onboarding-ellenőrzőt, majd végezd el a bejövő és kimenő izolációs próbát.

## Második egység: kimenő webhookok

A `company_make_connections` táblát csak a szerver olvashatja. A két esemény külön
webhookcímet kap: `new_lead_webhook_url` és `approved_reply_webhook_url`.
`mode=company` esetén kizárólag a cég saját címe használható; hiányzó, letiltott,
hibás rekord vagy adatbázishiba nem válthat vissza közös webhookra.
Az új érdeklődő ilyenkor továbbra is elmentődik, a webhook nem fut le; tartós retry
és üzemeltetői hibajelzés még nincs. Jóváhagyott küldésnél 503 válasz érkezik,
még a draft lefoglalása előtt.

A `202609190001_company_make_connections.sql` migráció a már meglévő cégekhez
explicit `legacy` rekordot készít a pilot folytonossága érdekében. Új céget nem
kapcsol automatikusan közös Make-fiókhoz. A migrációt a kód telepítése előtt kell
alkalmazni. A jelenlegi webhookoknak `https://hook.eu1.make.com/…`, eu2, us1 vagy
us2 címeknek kell lenniük; az ellenőrzést titkok kiírása nélkül kell elvégezni.
Átirányítást nem követünk, a webhookcímet nem szabad naplózni.

Ügyfél bekötése előtt a saját Make-kulcsot és mindkét scenario-t elő kell készíteni,
majd az adott cég rekordját `company` módra és engedélyezettre állítani.
Ügyfél saját Make-fiókjának éles bekötése és a küldési retry még nincs kész.
Gmail-keresés nulla találata önmagában nem bizonyít sikertelen küldést;
azonos Message-ID önmagában nem garantál duplikációmentességet.

## Bizonytalan jóváhagyott küldés

A Make HTTP- vagy hálózati hibája után az üzenet sending állapotban marad;
a szerver nem állítja vissza piszkozatra. A felület zárolja az újraküldést,
és visszaigazolásra várást jelez. Későbbi állapothoz az adatlap frissíthető.
A Make PATCH csak outgoing draft/sending → sending/sent átmenetet és
sent → sent ismétlést enged; a frissítés a korábbi státuszra is szűr.
A meglévő automatikus draft → sent visszajelzés továbbra is működik.
Ez nem teljes Gmail-deduplikáció és nem automatikus hibaegyeztetés.

## Késő visszaigazolás jelzése

A `202609200002_message_sending_started_at.sql` migrációt a hozzá tartozó kód
telepítése előtt kell alkalmazni. A `sending_started_at` mezőt adatbázis-trigger
rögzíti a `sending` állapotba váltáskor. A már `sending` állapotú üzeneteknél a
migráció ideje lesz a figyelmeztetés kezdőpontja, mert a korábbi pontos idő nem ismert.
60 perc elteltével a partner dashboardján, listájában és az adatlapon kiemelt jelzés
jelenik meg. A jelzés nem engedélyez újraküldést és nem minősíti sikertelennek a
küldést; a partner a saját Make-futást és Gmail Elküldött levelek mappát ellenőrzi.
A `202610030003_manual_delivery_resolution.sql` migráció után a partner 60 perc
elteltével rögzítheti, hogy megtalálta az elküldött levelet, vagy mindkét helyen
ellenőrizte és az üzenet biztosan nem ment ki. Az első eredmény lezárja a küldést,
a második igazoltan sikertelen állapotba teszi, ahonnan biztonságosan indítható
új próbálkozás. A rendszer eltárolja, hogy Make-visszahívás vagy kézi ellenőrzés
zárta le az állapotot, valamint kézi rendezésnél a felhasználó azonosítóját. A
felület csak a saját cég üzenetét engedi rendezni, és a döntés előtt nem oldja fel
az újraküldési zárolást.

## Új érdeklődő Make-indításának jelzése

A `202609200003_new_lead_dispatch_status.sql` migrációt a hozzá tartozó kód
telepítése előtt kell alkalmazni. A publikus ajánlatkérés először elmenti az
érdeklődőt `pending` állapottal, majd rögzíti, hogy a Make-webhook HTTP-válasza
elfogadott (`accepted`), a kapcsolat nem volt beállítva (`unconfigured`), vagy az
indítás eredménye bizonytalan (`uncertain`). A régi rekordok mezője üres marad.

Az adatlap csak az `unconfigured` és `uncertain` eseteket, illetve az egy percnél
régebbi `pending` állapotot emeli ki. Egyik sem indít automatikus újrapróbálást.
Az `accepted` csak a webhook fogadását igazolja, a Make-folyamat és az AI-tervezet
sikerét nem. Az esetleges feldolgozási hibák külön státuszkövetést igényelnek.

## Elmaradt AI-választervezet

Az `accepted` állapotú, még nyitott érdeklődőknél az érkezéstől számított 15 perc
után figyelmeztetés jelenik meg, ha nincs kimenő üzenet. A jelzés az adatlapon,
az érdeklődők listájában és a dashboardon is látszik. Bármely kimenő üzenet
(piszkozat, küldés alatt vagy elküldött) megszünteti ezt a jelzést. A régi,
ismeretlen Make-indítású rekordokra nem vonatkozik. Ez a tervezet hiányát
észleli, nem állapítja meg a Make-futás pontos hibáját, és nem indít újra semmit.
