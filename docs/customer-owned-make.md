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
a két aktív Make-forgatókönyv beállítása, a webhookok rögzítése és az élő izolációs próba
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
kapcsolatát, a cég egységes esemény-webhookját, a céges Make-kulcsot és a Gmail-kapcsolatot
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

- A teljes ügyfél-onboarding végigpróbálása egy új pilotcéggel.
- Az előkészített blueprintek másik Make-fiókban végzett, teljes ügyfél-onboardinghoz
  kapcsolódó importpróbája.

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

A `202610130002_automation_dispatch_tenant_key.sql` migráció hozzáadja az
auditbejegyzések `company_id` határán belüli egyediségét, és indexeli a cégenkénti
állapotösszesítést, valamint az aktív leadek és kimenő üzenetek állapotlekérdezését.
Az átállás idejére megtartja a korábbi egyediségi kulcsot is,
így a már telepített alkalmazás és az új kiadás egyszerre működőképes. A migráció
újrafuttatható: ha egy korábbi változat eltávolította a régi kulcsot, visszaállítja.
Ezt a hozzá tartozó alkalmazáskód kiadása előtt kell alkalmazni. Miután az új
alkalmazáskód élesben is elérhető, a
`202610150001_drop_legacy_automation_dispatch_key.sql` migráció ellenőrzi a
tenant-kulcs meglétét, majd eltávolítja a korábbi globális egyediségi korlátot.
Ettől az azonos esemény- és entitásazonosító összehasonlítása is kizárólag egy
vállalkozáson belül történik.

A partner felülete a hitelesített `/api/automation-health` végponton kizárólag
összesített működési állapotot kap. A vállalkozást a szerver a belépett, aktív
felhasználó profiljából határozza meg; kérésből érkező `company_id` nem használható.
A válasz nem tartalmaz lead- vagy üzenetazonosítót, címet, levélszöveget, webhookot,
kulcsot vagy nyers hibát. A Dashboard és a Beállítások oldal a rövid ideje futó
folyamatot elkülöníti az elakadástól: új indításnál 1 perc, AI-tervezetnél 15 perc,
levélküldési visszaigazolásnál 60 perc a türelmi idő. Bizonytalan eredménynél itt
sem indul automatikus újraküldés.

### Gmail-küldési visszaigazolás

A `202609270003_message_delivery_receipts.sql` migráció az üzenethez menti a Gmail
modul által visszaadott átlátszatlan üzenetazonosítót, valamint a sikeres vagy
igazoltan sikertelen küldés időpontját. Az azonosító tenanthez kötötten egyedi,
nem kerül a partner böngészőjébe, és nem tartalmaz levélszöveget vagy címzettet.
A Make sikeres státusz-visszahívása opcionálisan `provider_message_id` mezőt küld;
a régi scenario-k e mező nélkül is működnek, így az átállás megszakításmentes.

A választervezet kizárólag a LeadFlow `messages` rekordjában él, amíg a partner
jóvá nem hagyja. A folyamat nem hoz létre külön Gmail-piszkozatot, ezért Gmail
draftazonosítót sem kell tárolni. Ez elkerüli a két, egymástól eltérő
piszkozatverziót, és a LeadFlow marad a szerkesztés egyetlen forrása. A Gmail csak
a jóváhagyott levél elküldésekor vesz részt a folyamatban; az elküldött levél
`provider_message_id` értéke már mentésre kerül.

### Aktív Make-architektúra a pilotban

A Make ingyenes csomagjának két aktív scenario-korlátjához a pilot két folyamata az
alábbi:

1. Az azonnal futó, egységes esemény-scenario ugyanazon webhookon fogadja a
   `lead.created` és az `approved_reply.send` eseményt. A külső Router eseménytípus
   szerint választ ágat; egy futásban csak a megfelelő ág dolgozik.
2. A Delivery Reconciliation scenario 15 percenként ellenőrzi a legalább öt perce
   `sending` állapotú üzeneteket a Gmailben.

Az egységes esemény-scenario-nál az ütemezés `Immediately as data arrives`, az
incomplete execution tárolása pedig bekapcsolt. A korábbi külön Send Approved Reply
scenario a pilot átállás idején inaktív visszaállítási tartalék; aktív helyet nem
foglal. A közvetlen visszahívás Retry hibakezelője kizárólag a LeadFlow PATCH kérést
ismétli, a Gmail-küldést nem.

Az összevont scenario mindkét eseményágának éles pilotpróbája 2026. október 17-én
sikeresen lefutott. Az `approved_reply.send` próbán csak a jóváhagyott válasz ága
indult, a Gmail-küldés és a LeadFlow visszaigazolása is befejeződött. A
`lead.created` próbán csak az új érdeklődő ága futott; a belső értesítés, az
AI-feldolgozás, a biztonsági döntés és az automatikus válasz is sikeresen lezárult.
A státuszegyeztető scenario ugyancsak működő élő próbával rendelkezik, és aktív,
15 perces ütemezéssel fut.

### Automatikus Gmail-státuszegyeztetés

A jóváhagyott válasz webhookja a `delivery_header_name`,
`delivery_header_value` és `delivery_search_query` mezőket is átadja. A Gmail
`Send an email` modulban az első két értéket az `Additional email headers`
név- és értékmezőjébe kell kötni. A technikai `X-LeadFlow-Message-ID` fejléc nem
látható a levélben, és nem tartalmaz személyes adatot.

A tenant saját Make-kulcsával hívható
`GET /api/messages/reconciliation` legfeljebb 50, legalább öt perce `sending`
állapotú üzenetet ad vissza, kizárólag az adott cégből. A válasz csak belső
üzenetazonosítót, indítási időt és Gmail-keresőkifejezést tartalmaz; címzettet és
levéltartalmat nem. A közös üzemeltetői Make-kulcs ezen a végponton tiltott.

Az ügyfélsablon státuszegyeztető scenario-ja 15 percenként lekéri ezt a listát,
majd a kapott `gmail_search_query` értékkel keres a Gmailben. Találat esetén a
meglévő üzenet PATCH végpontját `sent` státusszal és a Gmail üzenetazonosítójával
hívja. Nulla találat nem bizonyít sikertelen küldést: ilyenkor nem módosít
állapotot és nem indít újraküldést. A 60 perces kézi ellenőrzés ezért megmarad a
ritka, valóban bizonytalan esetek biztonsági megoldásaként.

A közvetlen siker-visszahívás HTTP modulján Retry hibakezelő és bekapcsolt
incomplete-execution tárolás szükséges. Így egy átmeneti LeadFlow-hiba csak a
visszahívást ismétli meg, a Gmail-küldő modult nem futtatja újra.

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

Az új ügyfélhez nem kell a két eseményágat kézzel összevonni vagy modulonként
kulcsot cserélni. Exportáld a működő referencia-pilot egységes esemény-scenario-ját
és Delivery Reconciliation scenario-ját, majd futtasd az előkészítőt. Az összes
bemeneti és kimeneti fájlnak a projektmappán kívül kell lennie:

```powershell
node scripts/prepare-company-make-blueprints.mjs pelda-kft `
  "C:\biztonsagos-hely\pelda-kft-make-key.txt" `
  "C:\biztonsagos-hely\leadflow-events-export.blueprint.json" `
  "C:\biztonsagos-hely\delivery-reconciliation-export.blueprint.json" `
  "C:\biztonsagos-hely\pelda-kft-ready"
```

A szkript minden `x-leadflow-secret` fejlécet frissít, és kizárólag új fájlokat
hoz létre; meglévő kimenetet nem ír felül. Eltávolítja a referencia-pilot webhook-
és Gmail-kapcsolatait, a személyhez kötött belső értesítési címet, valamint az árva
designer-modulokat. Hibával leáll, ha rossz típusú blueprintet kap, vagy az
eredményben régi kulcs, fiókkapcsolat vagy e-mail-cím marad.

A megtisztított esemény- és státuszegyeztető blueprint 2026. október 17-én új,
inaktív Make-scenario-ként sikeresen importálható és menthető volt. Az import után
az esemény-scenario azonnali, a státuszegyeztető 15 perces ütemezést tartott meg.
A Make kizárólag a szándékosan eltávolított webhook- és Gmail-kapcsolatokat jelezte
hiányként; referenciafiókhoz tartozó kapcsolat nem került át. Ez a próba ugyanabban
a Make-fiókban, két új scenario-val történt. A másik ügyfélfiókban végzett teljes
onboardingpróba továbbra is szükséges.

Az import után az ügyfél Make-fiókjában új Custom webhookot és saját Gmail-
kapcsolatot kell választani, a `BEALLITANDO_BELSO_ERTESITESI_EMAIL` helyére pedig a
cég értesítési címét kell írni. Az esemény-scenario ütemezése `Immediately as data
arrives`, az incomplete execution tárolása bekapcsolt legyen; a Delivery
Reconciliation 15 percenként fusson. A létrehozott webhook címét mindkét LeadFlow-
webhook mezőbe ugyanazzal az értékkel kell rögzíteni. Végül töröld a kulcsfájlt, az
exportokat és az előkészített blueprinteket.

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

### Vezetett helyi onboarding

A pilotokhoz a különálló parancsok helyett használható az egységes, helyi operátori
folyamat. Hozz létre a projektmappán kívül egy kis manifesztumot; ebbe titok és
webhookcím nem kerülhet:

```json
{
  "companyName": "Példa Kft.",
  "companySlug": "pelda-kft",
  "ownerEmail": "owner@example.com",
  "makeKeyPath": "C:\\biztonsagos-hely\\pelda-kft-make-key.txt",
  "webhookConfigPath": "C:\\biztonsagos-hely\\pelda-kft-webhooks.json"
}
```

Az első futás mindig csak ellenőriz és egyetlen következő lépést ír ki:

```powershell
npm run onboard -- "C:\biztonsagos-hely\pelda-kft-onboarding.json"
```

A `--apply` kizárólag a kijelzett következő konfigurációs lépést hajtja végre. A
Make-kapcsolat engedélyezéséhez külön `--activate` szükséges, miután az egységes
esemény-scenario, a státuszegyeztető scenario,
a Gmail-kapcsolat és a kulcs kézzel ellenőrzött. Élő tesztpontot a rendszer nem
igazol automatikusan; azt a sikeres próba után kell rögzíteni:

```powershell
npm run onboard -- "C:\biztonsagos-hely\pelda-kft-onboarding.json" --apply
npm run onboard -- "C:\biztonsagos-hely\pelda-kft-onboarding.json" --activate
npm run onboard -- "C:\biztonsagos-hely\pelda-kft-onboarding.json" --confirm owner-login
```

Ugyanaz a parancs bármikor újrafuttatható állapotellenőrzésre és a következő lépés
megállapítására. Nem ír ki e-mail-címet, kulcsot vagy webhookcímet. A kulcs- és
webhookfájlt a Make beállítása után törölni kell.

### Webhookok beállítása és engedélyezés

A Make-webhook címe titoknak számít, ezért ne kerüljön parancssorba vagy Gitbe.
Az adatmodell kompatibilitás miatt továbbra is két mezőt vár. Az ingyenes csomaghoz
mindkét mezőben ugyanazt az egységes esemény-webhookot add meg. Hozz létre a
projektmappán kívül egy helyi JSON-fájlt az alábbi mezőkkel:

```json
{
  "newLeadWebhookUrl": "https://hook.eu1.make.com/…azonos…",
  "approvedReplyWebhookUrl": "https://hook.eu1.make.com/…azonos…"
}
```

Az első futás csak ellenőriz. Megköveteli a saját Make-módot, a még letiltott
kapcsolatot, az aktív céges kulcsot és a két mezőben megadott szabályos
Make-webhookot:

```powershell
node --env-file=.env.local scripts/configure-company-make.mjs pelda-kft C:\Users\User\Documents\pelda-webhooks.json
```

Az ellenőrzés után a `--stage` kapcsoló elmenti mindkét webhookot, de a kapcsolatot
letiltva hagyja. Így a Make-scenario-k beállíthatók és ellenőrizhetők éles forgalom nélkül:

```powershell
node --env-file=.env.local scripts/configure-company-make.mjs pelda-kft C:\Users\User\Documents\pelda-webhooks.json --stage
```

Csak a kikapcsolt egységes esemény-scenario és a státuszegyeztető scenario
ellenőrzése, valamint az élő próba előkészítése után használd a `--enable` kapcsolót.
Ez atomikusan menti a címeket és engedélyezi a LeadFlow
útválasztását. Már engedélyezett kapcsolatot egyik művelet sem módosít:

```powershell
node --env-file=.env.local scripts/configure-company-make.mjs pelda-kft C:\Users\User\Documents\pelda-webhooks.json --enable
```

Sikeres engedélyezés után töröld a helyi JSON-fájlt. Ezután futtasd újra a csak
olvasó onboarding-ellenőrzőt, majd végezd el a bejövő és kimenő izolációs próbát.

## Második egység: kimenő webhookok

A `company_make_connections` táblát csak a szerver olvashatja. A két eseményhez
külön mező tartozik: `new_lead_webhook_url` és `approved_reply_webhook_url`.
Az ingyenes Make-csomag pilotarchitektúrájában a két mező ugyanazt az egységes
esemény-webhookot tartalmazza; a két mező megőrzése később ismét lehetővé teszi a
folyamatok szétválasztását adatbázis-migráció nélkül.
`mode=company` esetén kizárólag a cég saját címe használható; hiányzó, letiltott,
hibás rekord vagy adatbázishiba nem válthat vissza közös webhookra.
Az új érdeklődő ilyenkor továbbra is elmentődik, a webhook nem fut le. Miután a
kapcsolatot helyreállították, az adatlapról biztonságosan újraindítható a feldolgozás:
a szerver csak az igazoltan `unconfigured` állapotot foglalja le, ezért párhuzamos
kattintás sem indít két webhookot. `uncertain` vagy régi `pending` állapotnál nincs
újraindítás; előbb a Make futását kell ellenőrizni. Jóváhagyott küldésnél 503 válasz
érkezik, még a draft lefoglalása előtt.

A `202609190001_company_make_connections.sql` migráció a már meglévő cégekhez
explicit `legacy` rekordot készít a pilot folytonossága érdekében. Új céget nem
kapcsol automatikusan közös Make-fiókhoz. A migrációt a kód telepítése előtt kell
alkalmazni. A jelenlegi webhookoknak `https://hook.eu1.make.com/…`, eu2, us1 vagy
us2 címeknek kell lenniük; az ellenőrzést titkok kiírása nélkül kell elvégezni.
Átirányítást nem követünk, a webhookcímet nem szabad naplózni.

Ügyfél bekötése előtt a saját Make-kulcsot, az egységes esemény-scenario-t és a
státuszegyeztető scenario-t elő kell készíteni, majd az adott cég rekordját `company`
módra és engedélyezettre állítani. A pilotban a saját Make-fiókos bekötés, a
visszahívási Retry és a Gmail-alapú státuszegyeztetés működő élő próbán átesett.
Gmail-keresés nulla találata önmagában nem bizonyít sikertelen küldést;
azonos Message-ID önmagában nem garantál duplikációmentességet.

## Bizonytalan jóváhagyott küldés

A Make HTTP- vagy hálózati hibája után az üzenet sending állapotban marad;
a szerver nem állítja vissza piszkozatra. A felület zárolja az újraküldést,
és visszaigazolásra várást jelez. Későbbi állapothoz az adatlap frissíthető.
A Make PATCH csak outgoing draft/sending → sending/sent átmenetet és
sent → sent ismétlést enged; a frissítés a korábbi státuszra is szűr.
A meglévő automatikus draft → sent visszajelzés továbbra is működik. A 15 perces
státuszegyeztetés a Gmailben igazolt küldést automatikusan lezárja, de nem teljes
Gmail-deduplikáció: nulla találatnál nem minősít hibásnak és nem küld újra.

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
