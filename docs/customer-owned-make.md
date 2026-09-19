# Ügyfél saját Make-fiókkal

Elfogadott modell: központi LeadFlow, ügyfelenként saját Make- és Gmail-fiók.
A partner napi munkáját a LeadFlow-ban végzi. Ez nem jelent GDPR-mentességet.

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

- Cégenkénti kulcskiadás és onboarding.
- Gmail-piszkozat azonosító, küldési napló és atomikus küldésfoglalás a Make előtt.
- Automatikus státuszegyeztetés és biztonságos retry.
- Az eredeti küldési bizonytalanság javítása: a draft-visszaállítás még megvan.

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
