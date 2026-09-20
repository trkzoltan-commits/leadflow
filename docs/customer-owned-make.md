# Ügyfél saját Make-fiókkal

Elfogadott modell: központi LeadFlow, ügyfelenként saját Make- és Gmail-fiók.
A partner napi munkáját a LeadFlow-ban végzi. Ez nem jelent GDPR-mentességet.

## Pilot: új cég előkészítése

Az első ügyfeleket az üzemeltető az ügyféllel közösen állítja be. A cég alaprekordjait
titkok nélkül, egy tranzakcióban lehet létrehozni:

```powershell
node scripts/generate-company-onboarding-sql.mjs "Példa Kft." pelda-kft
```

A parancs csak SQL-t ír ki, adatbázist nem módosít. A kimenetet a **megfelelő Supabase
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
- Gmail-piszkozat azonosító, küldési napló és atomikus küldésfoglalás a Make előtt.
- Automatikus státuszegyeztetés és biztonságos retry.
- Tartósan elmaradó küldési visszaigazolás automatikus rendezése.

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
