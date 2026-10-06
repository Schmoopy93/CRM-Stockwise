# Stockwise

Stockwise je web aplikacija za upravljanje zalihama, prodajom, kupcima i porudžbinama za male prodavnice i online prodavce. Radnja koristi privatnu kontrolnu tablu za svakodnevni rad, a po želji može da objavi javni katalog proizvoda na posebnom linku.

Aplikacija je napravljena pomoću Next.js App Router-a, React-a, TypeScript-a i Firebase-a. Podaci se čuvaju u Cloud Firestore-u, prijava zaposlenih koristi Firebase Authentication i Google, dok kupci za privatne porudžbine i razgovore koriste prijavu email linkom.

## Sadržaj

- [Mogućnosti](#mogućnosti)
- [Kako se koristi](#kako-se-koristi)
- [Tehnologije i struktura](#tehnologije-i-struktura)
- [Pokretanje lokalno](#pokretanje-lokalno)
- [Podešavanje Firebase-a](#podešavanje-firebase-a)
- [Promenljive okruženja](#promenljive-okruženja)
- [AI funkcije](#ai-funkcije)
- [Testovi i provera](#testovi-i-provera)
- [Bezbednost i objava](#bezbednost-i-objava)
- [Poznate granice funkcionalnosti](#poznate-granice-funkcionalnosti)

## Mogućnosti

### Radnja i zaposleni

- Prijava radnika Google nalogom.
- Kreiranje nove radnje ili pridruživanje postojećoj preko njenog Shop ID-ja.
- Više zaposlenih može da radi u istoj radnji; podaci su odvojeni po radnji.
- Vlasnička uloga upravlja podešavanjima radnje, a članovi koriste dozvoljene operacije u kontrolnoj tabli.
- Svetla i tamna tema, kao i jezik interfejsa: srpski, engleski, nemački, španski, italijanski i ruski.

### Artikli i varijante

- Kreiranje, izmena, pretraga i pregled artikala u tabelarnom ili mrežnom prikazu.
- Kategorije, SKU/šifra artikla, minimalna zaliha, nabavna i prodajna cena i dobavljač.
- Varijante artikla sa zasebnim SKU-om i količinom, npr. veličina, boja ili kombinacija modela i pakovanja.
- Dodatna, prilagodljiva polja za specifične podatke o artiklu.
- Više fotografija po artiklu; slike kataloga se mogu otpremiti preko Cloudinary-ja.
- Skriveni artikli nisu vidljivi kupcima u javnom katalogu. Artikli i varijante sa zalihom ne mogu se obrisati dok je količina veća od nule.
- Upozorenja za nizak nivo zaliha i brza prodaja artikla direktno iz pregleda kontrolne table.

### Prijem robe i upravljanje zalihama

- Unos primljene robe za jednu ili više varijanti.
- Pronalaženje artikla po imenu ili SKU-u i skeniranje bar-koda kamerom uređaja.
- Korekcije zaliha se beleže kao događaji sa vrstom promene, zaposlenim, vremenom, artiklom i varijantom.
- Prodaja i isporuka porudžbine automatski smanjuju zalihu; prijem robe je povećava.
- Promene se sprovode transakciono kako bi se količina, evidencija događaja i javno prikazano stanje uskladili.
- Ako mrežna greška prekine prijem ili isporuku posle uspešno obrađenih stavki, aplikacija prikaže delimičan rezultat i omogućava nastavak bez ponovnog knjiženja već obrađenih stavki.

### Prodaja

- Evidentiranje prodaje sa jednom ili više stavki, varijantama, količinama, cenama i napomenom.
- Kanali prodaje uključuju Instagram, Facebook, fizičku prodavnicu, telefon i ostalo.
- Barkod skener ubrzava izbor artikla.
- Prodaja može da se poveže sa zapisom kupca, tako da se ona prikaže u njegovoj istoriji.
- Prodaje nastale isporukom porudžbine iz kataloga povezane su sa izvornom porudžbinom.
- Prodaje se čuvaju u osnovnoj valuti radnje; promena kursa ili prikazne valute ne menja istorijski iznos naplaćen u trenutku prodaje.

### Porudžbine iz kataloga

- Kupci šalju porudžbinu iz korpe javnog kataloga bez prethodnog pravljenja naloga.
- Forma traži ime i prezime, email, telefon, adresu i grad.
- Sistem proverava da li su artikli i tražene količine i dalje dostupni pre slanja.
- Porudžbina se pojavljuje prodavnici u odeljku **Porudžbine** sa podacima kupca, stavkama, valutom i stanjem obrade.
- Radnja može da potvrdi ili otkaže porudžbinu. Pri isporuci se količine skidaju sa zalihe i kreira se povezana prodaja.
- Isporuka se može nastaviti nakon greške bez duplog skidanja već obrađenih stavki.
- Porudžbina se ne naplaćuje unutar aplikacije; plaćanje i dogovor sa kupcem obavlja prodavnica van Stockwise-a.

### Kupci (CRM)

- Privatni imenik kupaca radnje sadrži ime, kontakt, email, belešku i oznake.
- Oznake olakšavaju grupisanje i filtriranje kupaca.
- Stranica pojedinačnog kupca prikazuje njegov profil i povezanu istoriju prodaja i porudžbina.
- Veza se čuva preko `customerId`, a ne preko imena, jer više kupaca može imati isto ime.
- Postojeće prodaje i porudžbine se ne povezuju automatski sa novim CRM zapisima. Time se izbegava pogrešno pripisivanje istorije.
- Brisanje CRM zapisa ne briše istorijske prodaje ili porudžbine; njihovi zabeleženi podaci ostaju sačuvani.

### Javni katalog i komunikacija

- Svaka radnja može uključiti ili isključiti katalog i podeliti kupcima link oblika `/catalog/{shopId}`.
- Katalog prikazuje artikle koji nisu skriveni, slike, varijante, dostupnost, cenu i prilagođena polja.
- Kupci mogu da pretražuju katalog, filtriraju po kategoriji, sortiraju po nazivu ili ceni i dodaju artikle u korpu.
- Katalog ima sopstveni prikaz korpe i poručivanja, kao i svetlu/tamnu temu usklađenu sa glavnom aplikacijom.
- Prodavnica može podesiti logo i naslovnu sliku kataloga, valutu prikaza i načine kontakta: WhatsApp, Telegram i Instagram.
- Kupac može da započne privatni razgovor sa prodavnicom i pre nego što napravi porudžbinu.
- Sa detalja artikla može da započne razgovor označen izabranim artiklom.
- Kupac se prijavljuje sigurnim email linkom kako bi otvorio svoje porudžbine i razgovore.
- Kupac i prodavnica mogu ukloniti pre-porudžbinski razgovor samo iz svog prikaza. Razgovor i poruke ostaju dostupni drugoj strani.
- Prodavnica može istovremeno otvoriti više razgovora; kupac može da ih otvara i zatvara iz svog naloga.

### Obaveštenja i statistika kataloga

- Kontrolna tabla prikazuje broj novih porudžbina i nepročitanih poruka.
- Nova poruka može prikazati obaveštenje u aplikaciji i otvoriti odgovarajući razgovor direktno iz obaveštenja.
- Browser obaveštenja zavise od dozvole koju korisnik odobri u svom pregledaču.
- Nepročitani status razgovora vezan je za pregledač u kome se poruka čita; nije sistem za push obaveštenja na zatvorenom uređaju.
- Statistika kataloga beleži preglede, klikove ka WhatsApp-u, Telegram-u i Instagram-u, deljenja i porudžbine. Kontrolna tabla prikazuje zbirne pokazatelje i grafike.

### Analitika, uvoz, izvoz i audit

- **Analitika** prikazuje kretanja zaliha, prodaje i statistiku javnog kataloga kroz izabrane periode.
- **Audit dnevnik** prikazuje do 500 događaja zaliha iz poslednjih 90 dana i omogućava filtriranje po zaposlenom, vrsti događaja, artiklu i datumu.
- **Uvoz artikala** prihvata CSV, XLS i XLSX datoteke do 10 MB. Pregled uvoza prikazuje greške pre potvrde; redovi sa istim SKU-om artikla mogu predstavljati njegove varijante.
- CSV separator može biti zarez, tačka-zarez ili tabulator. Uvoz nudi CSV i XLSX šablone.
- Ako zaglavlja nisu prepoznata, opciona AI funkcija može predložiti mapiranje kolona. AI dobija samo nazive kolona, a ne podatke artikala, zalihe ili cene; uvoz se ne izvršava bez potvrde korisnika.
- **Izvoz** omogućava preuzimanje podataka za radnju.

## Kako se koristi

### 1. Kreiranje ili otvaranje radnje

1. Otvorite aplikaciju i izaberite Google prijavu.
2. Izaberite **Nova radnja**, unesite naziv i nastavite, ili izaberite **Pridruži se** i unesite Shop ID postojeće radnje.
3. Podelite Shop ID samo sa osobama koje treba da se pridruže toj radnji.

### 2. Unos artikala i početnog stanja

1. Otvorite **Artikli** i dodajte artikal, njegove osnovne podatke, varijante i cenu.
2. Unesite početnu količinu kroz **Prijem robe** ili uvezite artikle iz CSV/XLS/XLSX datoteke.
3. Postavite minimalnu zalihu da biste lakše uočili artikle koje treba dopuniti.
4. Pratite prijeme, prodaje i korekcije u **Audit dnevniku**.

### 3. Evidentiranje prodaje

1. Otvorite **Prodaja**, izaberite artikle/varijante ili skenirajte bar-kod.
2. Unesite količinu, cenu, kanal prodaje i po želji kupca.
3. Potvrdite prodaju. Količine se ažuriraju kroz evidenciju zaliha.

### 4. Objavljivanje kataloga

1. Na **Pregledu** otvorite podešavanja kataloga.
2. Uključite katalog, dodajte logo/naslovnu sliku i izaberite kanale za kontakt.
3. Podelite javni link radnje kupcima.
4. Kupac dodaje robu u korpu i šalje zahtev za porudžbinu. Radnja nastavlja obradu kroz **Porudžbine**.

### 5. Razgovori i praćenje kupca

- Kupac otvara nalog sa linka poslatog na email kako bi pristupio svojim porudžbinama i privatnim razgovorima.
- Prodavnica otvara razgovore i odgovara iz **Porudžbine → Razgovori sa kupcima**.
- Porudžbine kupca mogu se povezati sa CRM zapisom radi objedinjene istorije.

## Tehnologije i struktura

- **Next.js 16** sa App Router-om i React 19.
- **TypeScript** za aplikacioni kod.
- **Firebase Authentication** za Google prijavu radnje i email-link prijavu kupaca.
- **Cloud Firestore** za artikle, varijante, zalihe, prodaje, kupce, porudžbine, razgovore i statistiku.
- **Firebase Storage** za datoteke kojima pristup kontrolišu Storage pravila.
- **Cloudinary** za fotografije artikala i vizuelno brendiranje kataloga.
- **Recharts** za analitičke grafikone.
- **Firebase Emulator Suite** za testiranje Firestore i Storage pravila.

Važni direktorijumi i fajlovi:

| Putanja | Namena |
| --- | --- |
| `app/login/` | Google prijava, kreiranje radnje i pridruživanje postojećoj |
| `app/dashboard/` | Privatna kontrolna tabla |
| `app/catalog/[shopId]/` | Javni katalog i nalog kupca |
| `app/api/` | Serverske rute za AI funkcije i kurseve |
| `components/` | Zajedničke komponente interfejsa |
| `lib/actions.ts` | Akcije za artikle, zalihe, prodaje i porudžbine |
| `lib/hooks.ts` | Firestore pretplate i učitavanje podataka |
| `lib/i18n/` | Prevodi aplikacije |
| `firestore.rules` | Pravila pristupa Firestore podacima |
| `firestore.indexes.json` | Potrebni Firestore indeksi |
| `storage.rules` | Pravila pristupa Firebase Storage-u |
| `firebase.json` | Podešavanja Firebase-a i emulatora |
| `tests/` | Testovi funkcionalnosti i Firebase pravila |

## Pokretanje lokalno

Potrebni su Node.js (za testove koristite Node.js 22 ili noviji), npm i Java za pokretanje Firebase emulatora.

```bash
npm install
```

Kopirajte `.env.local.example` u `.env.local`, popunite Firebase web konfiguraciju i po potrebi opcione servise. Zatim pokrenite razvojni server:

```bash
npm run dev
```

Aplikacija će biti dostupna na [http://localhost:3000](http://localhost:3000).

Za produkcioni build i lokalno pokretanje izgrađene aplikacije:

```bash
npm run build
npm run start
```

## Podešavanje Firebase-a

### Web aplikacija

1. Kreirajte Firebase projekat i dodajte Web aplikaciju.
2. U **Project settings → Your apps** preuzmite Firebase konfiguraciju i unesite je u `.env.local`.
3. U **Authentication → Sign-in method** omogućite Google prijavu.
4. Dodajte lokalni i produkcioni domen u **Authentication → Settings → Authorized domains**.
5. Omogućite Cloud Firestore i Firebase Storage.
6. Uključite email-link prijavu: **Authentication → Sign-in method → Email/Password → Email link (passwordless sign-in)**.
7. U Cloudinary-ju po želji napravite upload preset za fotografije. Ograničite format i veličinu datoteka prema svojim potrebama.

### Email link za kupce

Firebase šalje link za prijavu kupcu. Kupac koristi istu email adresu kojom je zatražio prijavu, a aplikacija vraća korisnika na nalog kataloga. Predložak email-a može se menjati u **Authentication → Templates → Email link sign-in**. Ostavite Firebase `%LINK%` placeholder u poruci.

### Emulator

`firebase.json` podešava lokalne Firestore, Storage i Authentication portove. Testovi pravila pokreću Firestore i Storage emulatore sa demo projektnim ID-jem; ne koriste produkcioni Firebase projekat.

## Promenljive okruženja

Primer vrednosti nalazi se u `.env.local.example`. Taj fajl sadrži samo placeholder-e; stvarne vrednosti se ne čuvaju u Git-u.

| Promenljiva | Obavezna | Namena |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Da | Firebase Web API ključ |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Da | Firebase Authentication domen |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Da | ID Firebase projekta |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Da | Firebase Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Da | Firebase messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Da | Firebase Web app ID |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Za Cloudinary slike | Cloudinary cloud name |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Za Cloudinary slike | Upload preset za otpremanje slika |
| `GEMINI_API_KEY` | Ne | Omogućava AI funkcije; ima prednost ako je podešen i OpenAI |
| `GEMINI_MODEL` | Ne | Model za Gemini; koristi se podrazumevani model ako nije naveden |
| `OPENAI_API_KEY` | Ne | Rezervni AI provajder ako Gemini ključ nije podešen |
| `OPENAI_MODEL` | Ne | Model za OpenAI |

AI ključevi su serverske tajne. **Nikada ih ne stavljajte u promenljive sa prefiksom `NEXT_PUBLIC_` niti u klijentski kod.** Posle izmene `.env.local` ponovo pokrenite razvojni server.

## AI funkcije

AI je opcioni dodatak; ostatak aplikacije radi i bez AI ključa.

- AI asistent odgovara kroz serversku rutu `/api/ai/assistant`.
- Predlog dodatnih polja artikla koristi `/api/ai/product-fields`.
- Predlog mapiranja zaglavlja prilikom uvoza koristi `/api/ai/import-mapping`.
- Gemini se bira ako je podešen `GEMINI_API_KEY`; OpenAI se koristi kao rezerva kada Gemini nije podešen.
- Bez ključa se koriste lokalni predlošci kategorija, a AI predlozi nisu dostupni.
- AI predlog uvoza koristi samo nazive kolona; korisnik pregleda i potvrđuje predlog pre uvoza.

## Testovi i provera

Pokretanje svih testova:

```bash
npm test
```

Izdvojene komande:

```bash
npm run test:stock
npm run test:import
npm run test:currency
npm run test:ai
npm run test:menu
npm run test:customers
npm run test:orders
npm run test:rules
```

Provera koda:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Za testove Firebase pravila potrebna je Java jer Firebase Emulator Suite pokreće lokalne emulatore. Testovi koriste projekat `demo-inventory-crm` i lokalne emulatore, ne produkcionu bazu.

## Bezbednost i objava

- Firestore i Storage pravila nalaze se u `firestore.rules` i `storage.rules`; klijentski interfejs nije zamena za ta pravila.
- Podaci radnje su odvojeni po `shopId`. Lični podaci kupaca i privatne poruke nisu deo javnog kataloga.
- Kupac može pristupiti samo sopstvenim porudžbinama i razgovorima uz potvrđenu email adresu.
- Količine lagera ne menjaju se proizvoljnim upisom; prijemi, prodaje i isporuke prolaze kroz proverene akcije i evidenciju događaja.
- Firebase Admin privatne ključeve, AI ključeve i druge tajne držite van repozitorijuma. Ne delite ih kroz javne issue-je, screenshot-ove ili klijentski bundle.
- Posle izmene pravila ili indeksa, prvo ih proverite u emulatoru, a zatim ih ciljano objavite na odgovarajući Firebase projekat.

Objava Firebase pravila i indeksa:

```bash
firebase login
firebase projects:list
firebase deploy --only firestore,storage --project <FIREBASE_PROJECT_ID>
```

Zamenite `<FIREBASE_PROJECT_ID>` stvarnim ID-jem projekta na koji objavljujete. Pre potvrde uporedite ga sa `NEXT_PUBLIC_FIREBASE_PROJECT_ID` iz okruženja aplikacije. Nemojte deploy-ovati demo ID koji se koristi za testove. Firestore indeksi mogu zahtevati nekoliko minuta da pređu u stanje **Ready**.

Objavu Next.js aplikacije pokrenite na hostingu koji podržava Next.js i postavite odgovarajuće environment promenljive u podešavanjima tog hostinga. Nemojte stavljati tajne u javno dostupne build artefakte.

## Poznate granice funkcionalnosti

- Stockwise ne obrađuje kartična plaćanja i ne upravlja dostavom; porudžbina je zahtev koji prodavnica dalje obrađuje.
- WhatsApp, Telegram i Instagram kanali otvaraju direktnu komunikaciju ka prodavnici; slanje porudžbine nije isto što i potvrda kupovine preko tih servisa.
- Browser obaveštenja rade samo u podržanom pregledaču i uz odobrenu dozvolu. Push/email obaveštenja kada je aplikacija zatvorena nisu podešena.
- Pre-porudžbinski chat može se sakriti iz prikaza jedne strane, ali se poruke ne brišu trajno.
- AI funkcije zavise od ključa, dostupnosti izabranog provajdera i njegovih uslova korišćenja.
- Uvoz i Firebase Emulator Suite zahtevaju lokalne alate iznad; pogrešan Firebase project ID pri deploy-u može izmeniti pravila drugog projekta, zato ga uvek proverite pre objave.
