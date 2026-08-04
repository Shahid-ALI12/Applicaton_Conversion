# License Keygen — Seller Guide

Ye folder **kabhi kisi customer ko na dein** — `keys/private.pem` hi aap ka licensing raaz hai.

## Commands

### Init (pehli dafaa)
```bash
node keygen.mjs init
```
Naya Ed25519 keypair banata hai.

### Code generate
```bash
# Monthly (1 month)
node keygen.mjs code --machine 3EE4-35A6 --months 1

# Yearly (12 months)
node keygen.mjs code --machine 3EE4-35A6 --months 12

# Custom range (45 days)
node keygen.mjs code --machine 3EE4-35A6 --days 45

# Exact date
node keygen.mjs code --machine 3EE4-35A6 --until 2026-12-31
```

## Business Flow
1. Customer ke PC par app expire → lock screen with **Machine ID** (e.g. `3EE4-35A6`)
2. Customer Machine ID WhatsApp karega
3. Aap code banayen: `node keygen.mjs code --machine 3EE4-35A6 --months 1`
4. Code customer ko WhatsApp karein
5. Customer paste → Activate → app unlock!

## Important
- Har code sirf **usi machine** par chalta hai
- Code mein expiry date signed hai — change nahi ho sakti
- Naya customer ko **7 din trial** milta hai
- `keys/private.pem` ka backup zaroor rakhein
