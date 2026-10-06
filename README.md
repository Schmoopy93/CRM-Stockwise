# Stockwise

Web aplikacija za evidenciju zaliha malih radnji i Instagram prodavaca (Next.js App Router + Firebase).

## Pokretanje

```bash
npm install
npm run dev
```

Aplikacija je dostupna na [http://localhost:3000](http://localhost:3000).

## Promenljive okruženja

Napravite `.env.local` u korenu projekta:

| Promenljiva | Obavezna | Namena |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | da | Firebase web konfiguracija |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | za slike | Otpremanje fotografija artikala (unsigned preset) |
| `GEMINI_API_KEY` (opciono `GEMINI_MODEL`) ili `OPENAI_API_KEY` (opciono `OPENAI_MODEL`) | ne | AI asistent i AI predlozi dodatnih polja; Gemini ima prednost ako su oba podešena |

AI ključevi su serverski i ne prefiksiraju se sa `NEXT_PUBLIC_`. Posle izmene promenljivih okruženja ponovo pokrenite razvojni server.

## Predlozi dodatnih polja artikla

Dodatna polja artikla uvek se mogu dodati ručno. Dugme za AI predlog polja i kategorije radi samo kada je podešen jedan od AI ključeva iz tabele iznad; AI prvo bira neku od postojećih kategorija radnje, a novu predlaže samo kada nijedna ne odgovara.

## Uvoz tabela i audit dnevnik

Uvoz artikala prihvata `.csv`, stari Excel `.xls` i `.xlsx` fajlove do 10 MB. Pre uvoza prikazuje pregled i blokira neispravne redove; više redova sa istim SKU-om artikla postaju njegove varijante. CSV separator može biti zarez, tačka-zarez ili tabulator. Ako zaglavlja kolona nisu prepoznata, prijavljeni korisnik može opcionalno da zatraži AI predlog mapiranja. AI-u se šalju samo nazivi kolona, a ne podaci artikala, količine ili cene; predlog se prikazuje u pregledu i ne uvozi se bez korisničke potvrde. Primeri CSV i XLSX šablona mogu se preuzeti sa stranice Uvoz artikala. Audit dnevnik prikazuje kretanja zaliha za poslednjih 90 dana (najviše 500 događaja) i omogućava filter po zaposlenom, tipu, artiklu i periodu.

## Kupci (CRM)

Kupci žive u `shops/{shopId}/customers` i nikad nisu javno čitljivi — kontakt i istoriju kupovine ne treba da vidi niko van prodavnice. Zapis sadrži ime, kontakt (telefon ili @ime), email, belešku i oznake (do 20, do 30 znakova svaka, odvojene zarezom).

Prodaja i porudžbina se vežu za kupca preko polja `customerId`, ne preko imena — ime kupca na prodaji je samo ono što je kazano na kasi i kao ključ spajanja spaja dve osobe istog imena. Zato istorija kupca počinje da se popunjava tek od trenutka kada prodaja ili porudžbina dobije pripisanu vezu:

- na stranicama **Prodaja** i **Porudžbine** odabrana šifra kupca se zapisuje na samu prodaju / porudžbinu,
- na stranici kupca vidi se objedinjena hronologija prodaja i porudžbina sa ukupnom potrošnjom,
- brisanje kupca ne briše prodaje ni porudžbine — one zadržavaju ime i kontakt zapisane na sebi.

Sve prodaje i porudžbine postojeće pre ovog dodatka ostaju bez veze; ne backfill-uju se automatski, jer bi pogrešno imenovanje trajno pripisalo prodaju pogrešnoj osobi.

Porudžbina iz javnog kataloga traži ime, kontakt i cenu svake stavke. Radnja je prvo potvrđuje; pri isporuci se lager skida kroz stock ledger i kreira povezana prodaja u osnovnoj valuti. Delimična isporuka može da se nastavi bez duplog skidanja već obrađenih stavki. Poruke preko WhatsApp-a, Telegram-a i Instagrama su odvojene od submit-a porudžbine i služe za direktan kontakt.

## Google prijava

U Firebase Console otvorite **Authentication → Sign-in method**, omogućite **Google** i dodajte domen aplikacije u **Authentication → Settings → Authorized domains**. Aplikacija koristi Google prijavu za sve naloge. Za kreiranje radnje izaberite **Nova radnja**, unesite naziv radnje i nastavite sa Google nalogom; za postojeću radnju izaberite **Pridruži se**, unesite Shop ID i nastavite sa Google nalogom.

## Firebase bezbednosna pravila i testovi

Repozitorijum sadrži `firestore.rules`, `firestore.indexes.json`, `storage.rules` i `firebase.json`. Pravila ograničavaju čitanje na članove prodavnice, sprečavaju promenu članstva/uloge sa klijenta, štite fotografije, ne dozvoljavaju direktno menjanje lagera mimo stock događaja i sprečavaju brisanje artikla/varijante sa zalihom. Kompozitni indeksi su potrebni za `stockEvents(productId, createdAt desc)`, `sales(customerId, createdAt desc)` i `orders(customerId, createdAt desc)`.

Pokrenite `npm test` (Node.js 22+) za lager unit testove i Firestore/Storage Emulator pravila. Za emulator testove je potrebna Java. Emulator se pokreće pod demo project ID-jem i testovi ne koriste produkcioni Firebase projekat.

Pre deploy-a proverite pravila u Emulator Suite, prijavite se Firebase CLI-jem, izaberite pravi Firebase projekat i deploy-ujte pravila i indekse: `firebase deploy --only firestore,storage --project crm-inventory-22339`. Proverite da CLI cilja isti projekat koji aplikacija koristi u `NEXT_PUBLIC_FIREBASE_PROJECT_ID`; nemojte deploy-ovati demo ID. Ažurirana pravila su potrebna za javnu objavu stanja zaliha i čuvanje svih podataka za dostavu. Ako je artikal sačuvan pre neuspešne objave, nakon deploy-a ponovo sačuvajte artikal ili osvežite katalog iz kontrolne table. Firestore indeks može nekoliko minuta biti u statusu Building; ponovo učitajte aplikaciju kada Firebase Console pokaže da je Ready.
