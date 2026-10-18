# Adatmegőrzés és anonimizálás

A céges beállításban megadott megőrzési időnek az ügy lezárásától számított lejárta után a LeadFlow a lezárt ügyek
személyes adatait anonimizálhatja. A riportokhoz szükséges érkezési dátum, státusz,
eredmény és forrás megmarad. A név, elérhetőségek, igényleírás, üzenetek, belső
megjegyzések, AI-szövegek, feladat és felelős eltávolításra kerülnek. Az anonimizált
rekord nem állítható vissza és nem szerkeszthető.

A még aktív, de a határidőnél régebbi ügyeket a rendszer csak jelzi. Ezeket le kell
zárni, vagy dokumentált jogalap alapján tovább kell kezelni; automatikus törlésük
nem történik meg.

Az operátori parancs alapértelmezetten csak ellenőriz, adatot nem módosít:

```powershell
node --env-file=.env.local scripts/enforce-data-retention.mjs ceg-slug
```

Az összesítés ellenőrzése után az anonimizálás külön kapcsolóval indítható:

```powershell
node --env-file=.env.local scripts/enforce-data-retention.mjs ceg-slug --apply
```

A parancs nem ír ki érdeklődői adatot vagy azonosítót. Az első pilotban havonta
egyszer kell futtatni cégenként. Automatikus ütemezés csak a pilot működésének és
az üzemeltetési környezetnek a véglegesítése után kerüljön be.
