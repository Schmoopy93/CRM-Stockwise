This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Predlozi dodatnih polja artikla

Forma artikla podržava dodatna polja i bez AI konfiguracije, koristeći ugrađene predloške kategorija. Za AI predloge kopirajte `.env.local.example` u `.env.local` i podesite `OPENAI_API_KEY` (po želji i `OPENAI_MODEL`). Taj ključ je serverski i ne treba ga prefiksirati sa `NEXT_PUBLIC_`. Posle izmene promenljivih okruženja ponovo pokrenite razvojni server.

## Uvoz tabela i audit dnevnik

Uvoz artikala prihvata `.csv`, stari Excel `.xls` i `.xlsx` fajlove do 10 MB. Pre uvoza prikazuje pregled i blokira neispravne redove; više redova sa istim SKU-om artikla postaju njegove varijante. CSV separator može biti zarez, tačka-zarez ili tabulator. Primeri CSV i XLSX šablona mogu se preuzeti sa stranice Uvoz artikala. Audit dnevnik prikazuje kretanja zaliha za poslednjih 90 dana (najviše 500 događaja) i omogućava filter po zaposlenom, tipu, artiklu i periodu.

## Google prijava

U Firebase Console otvorite **Authentication → Sign-in method**, omogućite **Google** i dodajte domen aplikacije u **Authentication → Settings → Authorized domains**. Aplikacija koristi Google prijavu za sve naloge. Za kreiranje radnje izaberite **Nova radnja**, unesite naziv radnje i nastavite sa Google nalogom; za postojeću radnju izaberite **Pridruži se**, unesite Shop ID i nastavite sa Google nalogom.

## Firebase bezbednosna pravila i testovi

Repozitorijum sadrži `firestore.rules`, `firestore.indexes.json`, `storage.rules` i `firebase.json`. Pravila ograničavaju čitanje na članove prodavnice, sprečavaju promenu članstva/uloge sa klijenta, štite fotografije, ne dozvoljavaju direktno menjanje lagera mimo stock događaja i sprečavaju brisanje artikla/varijante sa zalihom. Kompozitni indeks za `stockEvents(productId, createdAt desc)` potreban je istoriji promena na stranici artikla.

Pokrenite `npm test` (Node.js 22+) za lager unit testove i Firestore/Storage Emulator pravila. Za emulator testove je potrebna Java. Emulator se pokreće pod demo project ID-jem i testovi ne koriste produkcioni Firebase projekat.

Pre deploy-a proverite pravila u Emulator Suite, prijavite se Firebase CLI-jem, izaberite pravi Firebase projekat i deploy-ujte pravila i indekse: `firebase deploy --only firestore,storage --project crm-inventory-22339`. Proverite da CLI cilja isti projekat koji aplikacija koristi u `NEXT_PUBLIC_FIREBASE_PROJECT_ID`; nemojte deploy-ovati demo ID. Firestore indeks može nekoliko minuta biti u statusu Building; ponovo učitajte aplikaciju kada Firebase Console pokaže da je Ready.
