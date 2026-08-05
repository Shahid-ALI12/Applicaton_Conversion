# License Keygen v2 — Seller Guide

Ye folder **kabhi kisi customer ko na dein** — `keys/private.pem` hi aap ka licensing raaz hai.

## ⚠️ Important — v2 Breaking Change

Naya keygen ab **4 cheezeyn** embed karta hai har code mein:

| Field | Kya hai | Kahan se aata hai |
|-------|---------|-------------------|
| `m` (Machine ID) | Customer ke PC ka unique ID (`XXXX-XXXX`) | Customer bhejta hai |
| `n` (Customer Name) | Login pe dikhne wala naam | Aap enter karte hain |
| `p` (Password) | Admin login password (bcrypt hash) | Aap enter karte hain |
| `e` (Expiry) | License kab tak valid (`YYYY-MM-DD`) | Duration select karte hain |

**Fayda:** Jab customer code activate karega, uske admin user ka naam + password bhi set ho jaayega. Har machine ka apna login. Renewal pe same credentials use karein — naye customer ko `admin/admin123` default yaad rakhne ki zaroorat nahi.

---

## Setup (pehli dafaa)

```bash
cd tools/license-keygen
npm install              # bcryptjs install hoga
node keygen.mjs init     # Ed25519 keypair generate karega
```

`init` ke baad `keys/public.pem` ka content `server/src/services/license.ts` mein
`LICENSE_PUBLIC_KEY_PEM` constant mein paste karein ( agar naya keypair banaya ).
Default keypair pehle se embed hai — sirf tab change karein jab naya keypair banaya.

---

## Code Generate karna

### Option A — Interactive (recommended)

```bash
node keygen.mjs code
```

Aapko ye prompts aayenge:
```
🔹 Machine ID (XXXX-XXXX): 3EE4-35A6
🔹 Customer Name: Ahmad Khan
🔹 Password (min 6 chars): ********
🔹 Duration select karein:
   [1] Monthly  (1 month)
   [2] Quarterly (3 months)
   [3] Yearly   (12 months)
   [4] Custom   (N days)
   [5] Exact date (YYYY-MM-DD)
   Choice [1-5]: 1

✓ Code generate karein? [y/N]: y
```

Phir code print hoga — copy karke customer ko WhatsApp kar dein.

### Option B — CLI (scripting ke liye)

```bash
# Monthly
node keygen.mjs code --machine 3EE4-35A6 --name "Ahmad Khan" --password "secret123" --months 1

# Quarterly (3 months)
node keygen.mjs code --machine 3EE4-35A6 --name "Ahmad Khan" --password "secret123" --months 3

# Yearly (12 months)
node keygen.mjs code --machine 3EE4-35A6 --name "Ahmad Khan" --password "secret123" --months 12

# Custom (45 days)
node keygen.mjs code --machine 3EE4-35A6 --name "Ahmad Khan" --password "secret123" --days 45

# Exact date
node keygen.mjs code --machine 3EE4-35A6 --name "Ahmad Khan" --password "secret123" --until 2026-12-31
```

### Recent codes ki list

```bash
node keygen.mjs list
```

Sab generated codes `codes.log` file mein save hote hain (machine + name + expiry).

---

## Business Flow

### Naya customer

1. Customer app install kare → **7 din trial** start ho jaata hai
2. Trial ke dauran `admin/admin123` se login ho sakta hai
3. Trial khatam hone se pehle customer Machine ID bheje (app ke License page se copy kare)
4. Aap keygen se code banayein: machine + name + password + duration
5. Code customer ko WhatsApp karein
6. Customer License page par code paste kare → Activate
7. **Admin user update ho jaata hai** — ab customer apna naam + password se login karega
8. Trial end hone ke baad bhi license active rehti hai expiry tak

### Renewal (har month / custom range ke baad)

1. License expire → app lock ho jaata hai, License page khulta hai
2. Customer Machine ID confirm kare (same rahega — machine change nahi hui)
3. Aap keygen se naya code banayein — **same naam + same password** use karein
4. Code customer ko bhejein
5. Customer activate kare → license extend ho jaati hai
6. **Login same rahega** (username: `admin`, password: jo aapne diya)

### Password bhool gaye?

1. Aap keygen mein **naya password** daalein
2. Code generate karke customer ko dein
3. Customer activate karega → password update ho jaayega
4. Naye password se login kare

---

## Important

- Har code sirf **usi machine** par chalta hai (Machine ID check)
- Code mein expiry date signed hai — change nahi ho sakti
- Naya customer ko **7 din trial** milta hai (default seeded admin: `admin/admin123`)
- `keys/private.pem` ka backup zaroor rakhein — kho gaya to purane codes verify nahi honge
- `keys/` aur `codes.log` kabhi git mein commit na karein (`.gitignore` mein hain)
- **Ye folder kabhi customer ko na dein**
