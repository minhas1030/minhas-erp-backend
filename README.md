# Minhas Academy ERP — Backend (Postgres Edition, Free to Deploy)

Ye backend ka **v2** hai — pehle wala JSON file (`db.json`) use karta tha jo redeploy pe delete ho sakti thi. Ab data **asal PostgreSQL database** (Supabase, free) mein save hota hai — **permanent, safe, redeploy se kabhi nahi udta.**

---

## STEP 1 — Free Database Banayen (Supabase)

1. **supabase.com** pe jayen → free account banayen.
2. **New Project** banayen (naam kuch bhi, e.g. `minhas-erp`), ek strong database password set karen — **ise likh lein, baad mein chahiye hoga**.
3. Project ban jane ke baad, left sidebar mein **SQL Editor** kholen.
4. Is folder ki `schema.sql` file kholen, **pura content copy karen**, SQL Editor mein paste karen, aur **Run** dabayen.
   - Ye aapke database mein zaroori tables bana dega (schools, users, records).
5. Ab **Project Settings → Database** mein jayen → **Connection String** section → **URI** tab select karen → "Connection Pooling" wala string copy karen (port `6543` wala, transaction mode).
   - Ye kuch aisa dikhega:
     `postgresql://postgres.xxxxx:[PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres`
   - `[PASSWORD]` ki jagah apna Step 2 wala password daal dein.
   - **Ise save kar lein — yehi aapka `DATABASE_URL` hai.**

---

## STEP 2 — Backend Deploy Karen (Render.com)

1. **github.com** pe free account banayen (agar nahi hai).
2. Is `minhas-erp-backend` folder ki files ek naye GitHub repo mein upload karen.
3. **render.com** pe free account banayen → **New +** → **Web Service** → apna repo connect karen.
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. **Environment Variables** mein ye do add karen:
   - `DATABASE_URL` = Step 1 se mila hua connection string
   - `JWT_SECRET` = koi bhi lamba random string (e.g. `minhas2026-secret-key-xyz-789`)
6. **Create Web Service** dabayen. 2-3 minute mein live URL milega:
   `https://minhas-erp-backend.onrender.com`

Ye URL hi aapka **API base URL** hai — isay `/api` ke sath frontend mein use karen:
`https://minhas-erp-backend.onrender.com/api`

---

## STEP 3 — Test Karen

Browser mein ye URL kholen: `https://your-app.onrender.com/api/health`

Agar ye dikhe:
```json
{"status":"ok","database":"connected"}
```
To sab theek hai — database se connection ho raha hai.

---

## Local test karne ke liye (apne computer pe)

```bash
npm install
cp .env.example .env
# .env mein apna DATABASE_URL aur JWT_SECRET daal dein
npm start
```

---

## Kyun ye pehle se behtar hai

| | Purani version (lowdb) | Ye version (Postgres/Supabase) |
|---|---|---|
| Data redeploy pe | Delete ho sakta tha | Hamesha mehfooz rehta hai |
| Multiple schools ek sath | Slow ho sakta tha | Database isi ke liye bana hai |
| Backup | Manual | Supabase khud automatic backups deta hai |
| Cost | Free | Free (Supabase free tier: 500MB, kaafi schools ke liye kaafi hai) |

---

## Free tier ki limits (honest info)

- **Supabase free tier:** 500MB database storage, 2GB bandwidth/month. Chhoti se medium schools ke liye (jab tak aap thousands of schools na le lein) kaafi hai.
- **Render free tier:** thori der inactive rehne pe "so jata hai", agli request pe 20-30 second mein jaag jata hai. Paid tier ($7/month) lagane se ye khatam ho jata hai — jab revenue aana shuru ho to yahi pehla upgrade hona chahiye.

---

## Ab bhi jo baaki hai (production ke liye zaroori)

1. **Real-world testing** — khud kam az kam 1-2 hafte use karen, apna asal data dalen, dekhen kuch tootay to nahi.
2. **Payment/subscription system** — abhi koi automated billing nahi hai. Shuru mein manual (JazzCash/bank transfer + aap khud access dein) chal sakta hai.
3. **Terms of Service / Privacy Policy** — agar real schools ka data rakh rahe hain, ye legally zaroori hai.
4. **Password reset flow** — abhi nahi hai; agar client password bhool jaye, aap Supabase table mein manually reset karen ge (thoda technical hai, aage automate karna chahiye).
5. **Rate limiting / abuse protection** — chhoti scale pe zaroori nahi, 50+ schools ke baad zaroor add karen.

Ye sab "nice to have future upgrades" hain, **critical data-loss wala masla (jo sabse bara tha) is version mein fix ho chuka hai.**
