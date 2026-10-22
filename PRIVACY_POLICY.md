# Privacy Policy for Miru Manga

**Developer:** Kiel Studio Devs  
**Contact Email:** kielstudio.dev@gmail.com  
**Effective Date:** October 21, 2026  
**Hosted Policy URL:** [https://kielstudio-dev.github.io/miru-manga/privacy.html](https://kielstudio-dev.github.io/miru-manga/privacy.html)

---

## 1. Overview
Miru Manga is committed to reader privacy and transparent data practices. This policy details how our application handles personal data, device storage, third-party services, and user rights in full accordance with Google Play Developer Program Policies.

**Core Privacy Principle:** We do **not** sell, rent, monetize, or broker any user information to third-party advertising brokers or data aggregators. Anonymous reading is supported by default without requiring an account.

---

## 2. Independent Media Reader Legal Architecture
Miru Manga functions purely as an independent media file player and reader engine (similar to VLC, Moon+ Reader, or Google Chrome):
- **Zero Hosted Copyrighted Content:** Miru Manga does not host, upload, or distribute copyrighted manga, manhwa, or comic image files on its own servers.
- **Client-Side Processing:** All imported local comic archives (`.cbz`, `.cbr`, `.zip`) and user-added community extension repositories are processed strictly on the user's private device.
- **Local Sandbox Storage:** Extracted comic pages are temporarily cached within the app's local sandbox and can be cleared by the user at any time in Settings.

---

## 3. Information We Collect
1. **Anonymous / Guest Users (Default):**
   - No name, phone number, or email required.
   - A local random UUID is generated on device to store bookmarks and reading history locally.
2. **Google Sign-In / Account Linking (Optional for Cross-Device Sync):**
   - User email address and display name (via official Google OAuth).
   - Used solely to associate cloud bookmarks and verify Lifetime Pro purchases across devices.
3. **In-App Issue & Feedback Reports:**
   - Feedback category, subject, description, and optional reply email.
   - Basic device diagnostics (Android version, app build version) to help debug broken chapters or crashes.

---

## 4. In-App Purchases & Billing
- Miru Manga offers an optional one-time purchase ("Lifetime Pro").
- All transactions are processed exclusively through **Google Play In-App Billing**.
- Kiel Studio Devs does **not** collect or store credit card numbers, bank accounts, or financial data.
- Only an anonymous verification token is received from Google to activate Pro features (ad-free reading, unlimited offline downloads).

---

## 5. Third-Party Services & SDKs
- **Google Play Services:** Authentication, In-App Billing, and Google Mobile Ads SDK (AdMob) for free-tier users.
- **Supabase:** SOC2-compliant encrypted database used to store cloud-synchronized bookmarks.
- **Expo / EAS Updates:** Over-The-Air application update delivery.

---

## 6. Children's Privacy (COPPA Compliance)
- Miru Manga is not directed to children under 13.
- In accordance with Google Play policies, mature (18+) content is disabled by default and requires explicit age verification in Settings before adult community sources can be accessed.

---

## 7. Data Deletion & User Rights
- **Unlink Account:** Users can sign out at any time in *Settings ➡️ Cloud Backup & Sync*.
- **Export Library:** Users can download an unencrypted JSON backup of their entire library.
- **Permanent Account Deletion:** Send a deletion request to **kielstudio.dev@gmail.com** with the subject *"Data Deletion Request"*. All database records are permanently deleted within 48 hours.

---

## 8. DMCA Safe Harbor Procedure
Miru Manga complies with 17 U.S.C. § 512. To submit a formal DMCA takedown notice, contact our Designated Agent:
- **Designated Agent:** Kiel Studio Devs
- **Email:** kielstudio.dev@gmail.com
- **Notice Requirements:** Identification of work, infringing repository URL, contact info, statement of good faith belief, and signature under penalty of perjury.
